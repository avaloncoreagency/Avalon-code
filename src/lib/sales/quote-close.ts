/**
 * "Cerrar venta" readiness (pure). Mirrors crm_quote_close_sale so the person sees every blocker BEFORE pressing the
 * button. The database re-checks everything; this only explains. No prices or percentages are ever derived here.
 */
import type { QuoteContent, VariableKind } from "@/lib/quotes/model";

export type CatalogEntry = { code: string; billing_type: string; active: boolean };
export type CloseBlocker =
  | { code: "quote_not_accepted" }
  | { code: "contract_not_verified" }
  | { code: "quote_needs_service_line" }
  | { code: "quote_line_not_in_catalog"; line: string }
  | { code: "quote_line_kind_mismatch"; line: string }
  | { code: "quote_commission_to_negotiate" }
  | { code: "quote_variable_terms_incomplete"; missing: VariableField[] };

/** Essential terms of a variable agreement that are NEVER inferred: an empty field blocks the close until a new
 * revision states it and the client accepts that revision. Mirrors crm_quote_close_sale. */
export type VariableField = "kind" | "effectiveDate" | "durationMonths" | "exclusions" | "refunds" | "evidence" | "trigger";
export function missingVariableTerms(cm: NonNullable<QuoteContent["commission"]>): VariableField[] {
  const out: VariableField[] = [];
  if (!cm.kind) out.push("kind");
  if (!cm.effectiveDate) out.push("effectiveDate");
  if (!cm.durationMonths) out.push("durationMonths");
  const text = (v: string | undefined) => (v ?? "").trim().length >= 3;
  if (!text(cm.exclusions)) out.push("exclusions");
  if (!text(cm.refunds)) out.push("refunds");
  if (!text(cm.evidence)) out.push("evidence");
  if (!text(cm.trigger)) out.push("trigger");
  return out;
}
export const VARIABLE_FIELD_LABEL: Record<VariableField, [string, string]> = {
  kind: ["Tipo de acuerdo (participación, comisión por venta o por resultado)", "Agreement type (revenue share, per-sale or outcome commission)"],
  effectiveDate: ["Fecha de inicio del acuerdo", "Agreement start date"],
  durationMonths: ["Duración del contrato en meses (distinta de la ventana de atribución)", "Contract duration in months (not the attribution window)"],
  exclusions: ["Qué se excluye de la base (impuestos, propinas, descuentos, gastos de procesamiento…)", "What is excluded from the base (taxes, tips, discounts, processing fees…)"],
  refunds: ["Cómo se tratan devoluciones y contracargos", "How refunds and chargebacks are treated"],
  evidence: ["Cómo se verifican los ingresos", "How revenue is verified"],
  trigger: ["Qué hecho genera el derecho al porcentaje", "What event earns the percentage"],
};

export type CloseSummary = {
  model: QuoteContent["model"];
  oneTimeCents: number;
  monthlyCents: number;
  variable: null | { kind: VariableKind; pct: string; base: string; baseNote: string; trigger: string; evidence: string; settlement: string;
    exclusions: string; refunds: string; expiry: string; effectiveDate: string; durationMonths: number | null; windowDays: number | null };
  blockers: CloseBlocker[];
};

const cents = (v: string) => { const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(v.trim()); return m ? Number(m[1]) * 100 + Number(((m[2] ?? "") + "00").slice(0, 2)) : 0; };

export function closeSummary(c: QuoteContent, opts: { status: string; contractVerified: boolean; catalog: CatalogEntry[] }): CloseSummary {
  const blockers: CloseBlocker[] = [];
  if (opts.status !== "accepted") blockers.push({ code: "quote_not_accepted" });
  if (!opts.contractVerified) blockers.push({ code: "contract_not_verified" });
  if (c.lines.length === 0) blockers.push({ code: "quote_needs_service_line" });
  let oneTimeCents = 0, monthlyCents = 0;
  for (const l of c.lines) {
    const amount = cents(l.unitPrice) * l.qty;
    if (l.kind === "monthly") monthlyCents += amount; else oneTimeCents += amount;
    const svc = l.code ? opts.catalog.find(x => x.code === l.code && x.active) : undefined;
    if (!svc) blockers.push({ code: "quote_line_not_in_catalog", line: l.name });
    else if (svc.billing_type !== l.kind) blockers.push({ code: "quote_line_kind_mismatch", line: l.name });
  }
  const cm = c.commission;
  if (cm && cm.status !== "proposed") blockers.push({ code: "quote_commission_to_negotiate" });
  else if (cm) { const missing = missingVariableTerms(cm); if (missing.length) blockers.push({ code: "quote_variable_terms_incomplete", missing }); }
  return {
    model: c.model, oneTimeCents, monthlyCents, blockers,
    variable: cm && cm.status === "proposed" ? {
      kind: cm.kind ?? "revenue_share", pct: cm.pct, base: cm.base, baseNote: cm.baseNote, trigger: cm.trigger, evidence: cm.evidence,
      settlement: cm.settlement, exclusions: cm.exclusions, refunds: cm.refunds, expiry: cm.expiry, effectiveDate: cm.effectiveDate ?? "",
      durationMonths: cm.durationMonths ?? null, windowDays: cm.attributionWindowDays,
    } : null,
  };
}

export const VARIABLE_KIND_LABEL: Record<VariableKind, [string, string]> = {
  revenue_share: ["Participación en ingresos", "Revenue share"],
  sale_commission: ["Comisión por venta", "Commission per sale"],
  outcome_commission: ["Comisión por resultado", "Outcome commission"],
};
export const BASE_LABEL: Record<string, [string, string]> = {
  gross_revenue: ["Ingresos brutos atribuibles cobrados", "Attributable gross revenue collected"],
  gross_profit: ["Utilidad bruta atribuible", "Attributable gross profit"],
  other: ["Otra base (ver nota)", "Other base (see note)"],
};
export const CLOSE_BLOCKER_TEXT: Record<CloseBlocker["code"], [string, string]> = {
  quote_not_accepted: ["La cotización aún no está aceptada.", "The quote is not accepted yet."],
  contract_not_verified: ["Falta un contrato firmado y verificado para esta oportunidad.", "A signed, verified contract for this opportunity is missing."],
  quote_needs_service_line: ["Añade el servicio al que aplica el acuerdo (puede ir a $0 si se cobra solo por porcentaje).", "Add the service the agreement applies to (it can be $0 when billed only by percentage)."],
  quote_line_not_in_catalog: ["Concepto sin servicio activo del catálogo: no se puede operar ni entregar.", "Item without an active catalog service: it cannot be operated or delivered."],
  quote_line_kind_mismatch: ["El tipo de cobro del concepto no coincide con el del catálogo.", "The item's billing type differs from the catalog."],
  quote_commission_to_negotiate: ["El porcentaje sigue por acordar.", "The percentage is still to be agreed."],
  quote_variable_terms_incomplete: ["Faltan condiciones esenciales del acuerdo variable. Edita la cotización (se crea una revisión nueva), envíala y registra la aceptación de esa revisión:", "Essential variable-agreement terms are missing. Edit the quote (a new revision is created), send it and record the acceptance of that revision:"],
};
