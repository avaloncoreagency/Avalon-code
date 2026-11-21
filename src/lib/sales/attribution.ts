/**
 * Commission receivable lifecycle (money owed TO Avalon under a verified revenue-share agreement).
 * Mirrors supabase/migrations/20261121181000_crm_attribution_lifecycle.sql — the database is the guard; this module
 * only decides which buttons to show and how to label states. It never treats customer revenue as Avalon revenue.
 *
 * Three different amounts, never mixed:
 *  - Avalon's own services (crm_sales): what the client pays Avalon for websites, CRM, marketing…
 *  - Customer job closed by the client (gross_collected): the client's revenue, NOT Avalon's.
 *  - Avalon's commission (commission_due): owed to Avalon only once eligible; cash only once `paid`.
 * Payouts BY Avalon to sellers/referrers live in crm_commissions and are a separate ledger.
 */
export const ATTRIBUTION_STATES = [
  "reported", "client_paid_verified", "attribution_verified", "eligible", "verified", "invoiced", "paid", "disputed", "void",
] as const;
export type AttributionState = (typeof ATTRIBUTION_STATES)[number];

export const ATTRIBUTION_LABEL: Record<AttributionState, readonly [string, string]> = {
  reported: ["Resultado reportado", "Result reported"],
  client_paid_verified: ["Cobro del cliente verificado", "Customer payment verified"],
  attribution_verified: ["Atribución verificada", "Attribution verified"],
  eligible: ["Comisión exigible", "Commission eligible"],
  verified: ["Comisión exigible (registro anterior)", "Commission eligible (legacy record)"],
  invoiced: ["Facturada a la empresa", "Invoiced to the business"],
  paid: ["Cobrada por Avalon", "Collected by Avalon"],
  disputed: ["En disputa", "Disputed"],
  void: ["Anulada", "Voided"],
};

/** The forward step from each state and what evidence it needs (ES/EN). */
const NEXT: Partial<Record<AttributionState, { to: AttributionState; es: string; en: string; evidence: readonly [string, string] }>> = {
  reported: { to: "client_paid_verified", es: "Verificar cobro del cliente", en: "Verify customer payment", evidence: ["Recibo o referencia del cobro del cliente", "Customer receipt or payment reference"] },
  client_paid_verified: { to: "attribution_verified", es: "Verificar atribución", en: "Verify attribution", evidence: ["Evidencia de origen (formulario, llamada, tracking)", "Source evidence (form, call, tracking)"] },
  attribution_verified: { to: "eligible", es: "Marcar comisión exigible", en: "Mark commission eligible", evidence: ["Cláusula o versión del acuerdo aplicada", "Agreement clause or version applied"] },
  eligible: { to: "invoiced", es: "Registrar factura emitida", en: "Record issued invoice", evidence: ["Número de factura de Avalon", "Avalon invoice number"] },
  verified: { to: "invoiced", es: "Registrar factura emitida", en: "Record issued invoice", evidence: ["Número de factura de Avalon", "Avalon invoice number"] },
  invoiced: { to: "paid", es: "Confirmar cobro de Avalon", en: "Confirm Avalon was paid", evidence: ["Referencia de transferencia recibida", "Received transfer reference"] },
};

export type AttributionAction = { to: AttributionState; es: string; en: string; evidence: readonly [string, string]; tone: "primary" | "normal" | "danger" };

/** Allowed owner actions for a row. `disputedFrom` is required to offer the dispute resolution. */
export function attributionActions(status: string, disputedFrom?: string | null): AttributionAction[] {
  if (!isAttributionState(status) || status === "paid" || status === "void") return [];
  const out: AttributionAction[] = [];
  if (status === "disputed") {
    if (disputedFrom && isAttributionState(disputedFrom)) {
      out.push({ to: disputedFrom, es: "Resolver disputa (volver al paso anterior)", en: "Resolve dispute (back to previous step)", evidence: ["Cómo se resolvió", "How it was resolved"], tone: "primary" });
    }
  } else {
    const next = NEXT[status];
    if (next) out.push({ ...next, tone: "primary" });
    out.push({ to: "disputed", es: "Abrir disputa", en: "Open dispute", evidence: ["Motivo de la disputa (mín. 5)", "Dispute reason (min. 5)"], tone: "normal" });
  }
  out.push({ to: "void", es: "Anular (explicar motivo)", en: "Void (give reason)", evidence: ["Motivo de anulación (mín. 5)", "Void reason (min. 5)"], tone: "danger" });
  return out;
}

export function isAttributionState(v: unknown): v is AttributionState {
  return typeof v === "string" && (ATTRIBUTION_STATES as readonly string[]).includes(v);
}

/**
 * Same arithmetic as the generated column: round((gross - excluded) * rate / 100, 2), in integer cents so that
 * $10,000.00 at 5% is exactly $500.00. Returns null for invalid input (shown as N/D, never guessed).
 */
export function commissionDueCents(gross: string, excluded: string, ratePct: string): number | null {
  const money = /^\d{1,12}(\.\d{1,2})?$/, rate = /^\d{1,3}(\.\d{1,2})?$/;
  if (!money.test(gross) || !money.test(excluded) || !rate.test(ratePct)) return null;
  const g = Math.round(Number(gross) * 100), x = Math.round(Number(excluded) * 100), r = Math.round(Number(ratePct) * 100);
  if (g <= 0 || x < 0 || x >= g || r <= 0 || r > 10000) return null;
  // (cents * basis points) / 10000, half away from zero like PostgreSQL round() on numeric.
  return Math.round(((g - x) * r) / 10000);
}
