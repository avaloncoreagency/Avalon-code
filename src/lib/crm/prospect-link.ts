/**
 * Duplicate handling when an approved prospect enters the pipeline.
 *
 * crm_convert_prospect (Codex-owned SQL) inserts a new lead and raises a raw unique violation (23505) when the
 * same e-mail — or, without e-mail, the same company + contact — already exists as an open lead. Until the SQL
 * itself links to the existing lead (contract filed on Issue #23), the app explains the conflict and offers an
 * explicit, human-confirmed link. The duplicate is always recomputed on the server: a client can never choose
 * which lead a prospect gets linked to.
 *
 * The matching rule mirrors the unique indexes on crm_leads (lower(trim(...)), non-archived).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type DuplicateLead = { id: string; company: string; stage_id: string };
type ProspectKey = { email?: string | null; company: string; contact?: string | null };

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
/** Escape LIKE wildcards so ilike behaves as case-insensitive equality; the result is re-checked in code. */
const likeEscape = (v: string) => v.replace(/[\\%_]/g, m => "\\" + m);

export async function findDuplicateLead(db: SupabaseClient, p: ProspectKey): Promise<DuplicateLead | null> {
  const email = norm(p.email);
  // PostgREST rewrites "*" into a wildcard and offers no escape for it: do not guess for such addresses.
  if (email.includes("*") || norm(p.company).includes("*") || norm(p.contact).includes("*")) return null;
  let query = db.from("crm_leads").select("id,company,contact,email,stage_id").eq("archived", false);
  query = email
    ? query.ilike("email", likeEscape(email))
    : query.is("email", null).ilike("company", likeEscape(norm(p.company))).ilike("contact", likeEscape(norm(p.contact)));
  const { data, error } = await query.limit(10);
  if (error || !data) return null;
  const hit = (data as { id: string; company: string; contact: string | null; email: string | null; stage_id: string }[]).find(r =>
    email ? norm(r.email) === email : norm(r.company) === norm(p.company) && norm(r.contact) === norm(p.contact));
  return hit ? { id: hit.id, company: hit.company, stage_id: hit.stage_id } : null;
}

/** 409 body for "this business is already in the pipeline", or null when no duplicate can be identified. */
export async function duplicateConflict(db: SupabaseClient, prospectId: string) {
  const { data: p } = await db.from("crm_prospects").select("company,contact,email").eq("id", prospectId).maybeSingle();
  if (!p) return null;
  const lead = await findDuplicateLead(db, p);
  if (!lead) return null;
  return {
    status: 409 as const,
    body: {
      error: `Este negocio ya está en el pipeline como «${lead.company}». Ábrelo o vincula el prospecto a ese lead para no duplicarlo.`,
      code: "lead_exists" as const,
      lead,
    },
  };
}

export type LinkOutcome = { ok: true; leadId: string } | { ok: false; status: number; error: string };

/** Human-confirmed: marks an APPROVED prospect as converted pointing at the lead that already exists. */
export async function linkProspectToExistingLead(db: SupabaseClient, prospectId: string): Promise<LinkOutcome> {
  const { data: p, error } = await db.from("crm_prospects")
    .select("id,company,contact,email,status,lead_id,version").eq("id", prospectId).maybeSingle();
  if (error || !p) return { ok: false, status: 404, error: "Prospecto no encontrado." };
  if (p.status === "converted" && p.lead_id) return { ok: true, leadId: p.lead_id };
  if (p.status !== "approved") return { ok: false, status: 409, error: "Aprueba el prospecto antes de vincularlo al pipeline." };
  const lead = await findDuplicateLead(db, p);
  if (!lead) return { ok: false, status: 409, error: "No hay un lead duplicado al que vincular. Usa «Pasar al pipeline»." };
  const { data: done, error: updateError } = await db.from("crm_prospects")
    .update({ status: "converted", lead_id: lead.id })
    .eq("id", p.id).eq("status", "approved").eq("version", p.version).select("id").maybeSingle();
  if (updateError) return { ok: false, status: 400, error: "No se pudo vincular el prospecto." };
  if (!done) return { ok: false, status: 409, error: "El prospecto cambió mientras tanto. Recarga e inténtalo de nuevo." };
  return { ok: true, leadId: lead.id };
}
