import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * OPS-002: the canonical signature evidence is a crm_contracts row in «verified_signed» on the client's origin
 * opportunity (signer, evidence and owner verification are enforced there). A draft, a PDF or a draft↔contract link
 * is never treated as a signature. Returns the verified contract and, when linked, the exact signed agreement id.
 */
export async function verifiedAgreement(db: SupabaseClient, clientId: string): Promise<{ contractId: string; agreementDraftId: string | null } | null> {
  const c = await db.from("crm_clients").select("origin_lead_id").eq("id", clientId).maybeSingle();
  const lead = (c.data as { origin_lead_id: string | null } | null)?.origin_lead_id;
  if (c.error || !lead) return null;
  const r = await db.from("crm_contracts").select("id,agreement_draft_id").eq("lead_id", lead).eq("status", "verified_signed")
    .order("verified_at", { ascending: false }).limit(1).maybeSingle();
  const row = r.data as { id: string; agreement_draft_id: string | null } | null;
  return r.error || !row ? null : { contractId: row.id, agreementDraftId: row.agreement_draft_id };
}
