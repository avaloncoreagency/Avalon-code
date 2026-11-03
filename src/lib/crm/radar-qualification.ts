import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Qualifying a real business is a deliberate owner action, not a consequence
 * of importing a map record or opening the page.
 *
 * The DB calculates evidence-based stars after crm_prospect_needs changes.
 * Once an owner confirms a non-null rating, this reuses the existing audited,
 * row-locked and idempotent crm_convert_prospect RPC to create the pipeline
 * card at its default "Nuevo lead" stage. No privileged service key is used.
 */
type QualifiedProspect = {
  id: string;
  source_ref: string | null;
  status: string;
  do_not_contact: boolean;
  stars: number | null;
  stars_override: number | null;
  stars_reasons?: string[];
  lead_id: string | null;
};

export type RadarQualification =
  | { kind: "unrated"; stars: null }
  | { kind: "blocked"; stars: number | null; status: number; message: string }
  | { kind: "pipeline"; stars: number; leadId: string; created: boolean; linkWarning: boolean }
  | { kind: "failed"; stars: number | null; status: number; code: "duplicate" | "database"; message: string };

const validStars = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5;

export async function qualifyRadarProspect(db: SupabaseClient, id: string): Promise<RadarQualification> {
  const { data, error: readError } = await db.from("crm_prospects")
    .select("id,source_ref,status,do_not_contact,stars,stars_override,stars_reasons,lead_id")
    .eq("id", id).maybeSingle();
  if (readError) return { kind: "failed", stars: null, status: 503, code: "database", message: "No se pudo verificar la calificación." };
  const p = data as QualifiedProspect | null;
  if (!p || !p.source_ref) return { kind: "blocked", stars: null, status: 404, message: "Negocio del radar no encontrado." };

  const effectiveStars = p.stars_override ?? p.stars;
  const stars = validStars(effectiveStars) ? effectiveStars : null;
  if (p.do_not_contact || p.status === "rejected")
    return { kind: "blocked", stars, status: 409, message: "No contactar o descartado: no se crea un lead en el pipeline." };
  if (p.status === "converted") {
    if (!p.lead_id || !stars)
      return { kind: "failed", stars, status: 503, code: "database", message: "La conversión existente necesita revisión." };
    return { kind: "pipeline", stars, leadId: p.lead_id, created: false, linkWarning: false };
  }
  if (stars === null) return { kind: "unrated", stars: null };
  // A map-provider directory entry is NOT a verified sales opportunity.
  // Preliminary 1-2 star business profiles must never be promoted merely
  // because an owner clicked the regular qualification button.
  if (p.stars_override == null && p.stars_reasons?.some(reason =>
      reason.startsWith("Precalificación automática:")))
    return { kind: "unrated", stars: null };
  if (!["pending", "approved"].includes(p.status))
    return { kind: "blocked", stars, status: 409, message: "El negocio no puede pasar al pipeline en su estado actual." };

  // Existing RPC requires approved. This is now the SAME owner-initiated
  // "Calificar y crear tarjeta" action; there is no second approval click.
  if (p.status === "pending") {
    const { data: approved, error: approvalError } = await db.from("crm_prospects")
      .update({ status: "approved", research_status: "qualified" })
      .eq("id", id).eq("status", "pending").eq("do_not_contact", false)
      .select("id").maybeSingle();
    if (approvalError || !approved)
      return { kind: "failed", stars, status: 409, code: "database", message: "No se pudo confirmar la calificación. Comprueba el estado del negocio." };
  }

  const { data: leadId, error: conversionError } = await db.rpc("crm_convert_prospect", { prospect_id: id });
  if (conversionError) {
    const duplicate = conversionError.code === "23505";
    return { kind: "failed", stars, status: duplicate ? 409 : 503,
      code: duplicate ? "duplicate" : "database",
      message: duplicate
        ? "Calificación guardada, pero ya existe un lead con esos datos. Revisa el pipeline para evitar duplicados; no se creó otra tarjeta."
        : "Calificación guardada, pero no se pudo crear la tarjeta. Puedes reintentar desde el radar." };
  }
  if (typeof leadId !== "string" || !leadId)
    return { kind: "failed", stars, status: 503, code: "database", message: "La conversión no devolvió un identificador de lead." };

  // Record provenance in the already-existing crm_leads.prospect_id field.
  // A failed optional link must never cause a second conversion on retry.
  const { error: linkError } = await db.from("crm_leads")
    .update({ prospect_id: id }).eq("id", leadId);
  return { kind: "pipeline", stars, leadId, created: true, linkWarning: !!linkError };
}
