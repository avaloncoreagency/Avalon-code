/**
 * Core Engine data contract (migration 20261117100000_crm_core_engine.sql). Pure types, request builders and error
 * mapping shared by server actions and the UI. No I/O here; see core-engine-server.ts for the RPC calls.
 *
 * Money rules (never mixed): contracted (crm_sales.total) · invoiced (crm_invoices issued) · collected (non-reversed
 * crm_payments) · collected_verified · expenses (crm_client_costs) · commissions agreed/accrued/paid · cash profit.
 */

export type OfferStatus = "draft" | "approved" | "retired";
export type CommissionKind = "none" | "sale_pct" | "referral_pct" | "fixed";
export type PaymentStatus = "recorded" | "verified" | "reversed";
export type CommissionStatus = "agreed" | "accrued" | "paid" | "cancelled";

export type CatalogOffer = {
  code: string; name: string; active: boolean; billing_type: "one_time" | "monthly" | "annual";
  suggested_price: string | null; monthly_price: string | null; direct_cost: string | null; target_margin_pct: string | null;
  deliverables: string; exclusions: string; estimated_days: number | null; payment_terms: string;
  offer_status: OfferStatus; offer_version: number; offer_approved_by: string | null; offer_approved_at: string | null;
  commission_kind: CommissionKind; commission_value: string | null;
};

export type InvoiceRequest = { sale_id: string; number: string; amount: string; issued_on?: string; due_on?: string; note?: string; attachment_id?: string };
export type CommissionRequest = {
  sale_id: string; kind: "sale" | "referral"; basis: string;
  beneficiary_id?: string; beneficiary_name?: string; rate_pct?: string; fixed_amount?: string;
};

export type LedgerCurrency = {
  currency: string; contracted: string; recurring_monthly: string; invoiced: string; collected: string; collected_verified: string;
  expenses: string; commissions_agreed: string; commissions_accrued: string; commissions_paid: string; profit: string; outstanding: string;
};
export type ClientLedger = { client_id: string; source: "sql_aggregate"; complete: true; currencies: LedgerCurrency[]; as_of: string };

const MONEY = /^\d{1,13}(\.\d{1,2})?$/;
const PCT = /^\d{1,3}(\.\d{1,2})?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Built<T> = { ok: true; value: T } | { ok: false; error: string };

/** Normalizes "1.234,50" / "1,234.50" / " 1200 " to "1234.50"-style decimals without floating point. */
export function normalizeMoney(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  let s = String(raw).trim().replace(/[\s$€]/g, "");
  // "1.234" or "1,234" alone is ambiguous (thousands or decimals?): rejected rather than guessed.
  if (/^\d{1,3}[.,]\d{3}$/.test(s)) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  return MONEY.test(s) && Number(s) > 0 ? s : null;
}

export function buildInvoiceRequest(input: Record<string, unknown>): Built<InvoiceRequest> {
  const sale_id = String(input.sale_id ?? "");
  if (!UUID.test(sale_id)) return { ok: false, error: "Venta inválida." };
  const number = String(input.number ?? "").trim();
  if (number.length < 1 || number.length > 60) return { ok: false, error: "Indica el número de la factura (máx. 60 caracteres)." };
  const amount = normalizeMoney(input.amount);
  if (!amount) return { ok: false, error: "Importe inválido: usa un número positivo con hasta 2 decimales." };
  const out: InvoiceRequest = { sale_id, number, amount };
  for (const k of ["issued_on", "due_on"] as const) {
    const v = String(input[k] ?? "").trim();
    if (v) { if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, error: "Fecha inválida (AAAA-MM-DD)." }; out[k] = v; }
  }
  const note = String(input.note ?? "").trim(); if (note) out.note = note.slice(0, 1000);
  const att = String(input.attachment_id ?? "").trim();
  if (att) { if (!UUID.test(att)) return { ok: false, error: "Documento inválido." }; out.attachment_id = att; }
  return { ok: true, value: out };
}

export function buildCommissionRequest(input: Record<string, unknown>): Built<CommissionRequest> {
  const sale_id = String(input.sale_id ?? "");
  if (!UUID.test(sale_id)) return { ok: false, error: "Venta inválida." };
  const kind = input.kind === "sale" || input.kind === "referral" ? input.kind : null;
  if (!kind) return { ok: false, error: "Tipo de comisión inválido." };
  const basis = String(input.basis ?? "").trim();
  if (basis.length < 10) return { ok: false, error: "Indica el acuerdo escrito que respalda la comisión (mín. 10 caracteres)." };
  const ben = String(input.beneficiary_id ?? "").trim(), name = String(input.beneficiary_name ?? "").trim();
  if (Boolean(ben) === Boolean(name)) return { ok: false, error: "Elige un propietario o escribe el nombre del referente (solo uno)." };
  if (ben && !UUID.test(ben)) return { ok: false, error: "Beneficiario inválido." };
  const rate = String(input.rate_pct ?? "").trim().replace(",", "."), fixed = normalizeMoney(input.fixed_amount ?? "");
  if (Boolean(rate) === Boolean(fixed)) return { ok: false, error: "Indica un porcentaje o un importe fijo (solo uno)." };
  if (rate && (!PCT.test(rate) || Number(rate) <= 0 || Number(rate) > 100)) return { ok: false, error: "Porcentaje inválido (0–100)." };
  const out: CommissionRequest = { sale_id, kind, basis: basis.slice(0, 2000) };
  if (ben) out.beneficiary_id = ben; else out.beneficiary_name = name.slice(0, 160);
  if (rate) out.rate_pct = rate; else out.fixed_amount = fixed!;
  return { ok: true, value: out };
}

/** Database error codes raised by the Core Engine RPCs → owner-facing Spanish message. Unknown → generic, never raw SQL. */
const MESSAGES: Record<string, string> = {
  crm_forbidden: "Solo Miguel o Samuel pueden hacer esto.",
  finance_forbidden: "Tu usuario no tiene acceso a las finanzas de clientes.",
  offer_requires_price: "Fija un precio antes de aprobar la oferta.",
  offer_approval_requires_owner: "Solo un propietario puede aprobar la oferta.",
  invoice_invalid_amount: "Importe inválido.",
  invoice_invalid_sale: "La venta no existe o está cancelada.",
  invoice_currency_mismatch: "La factura debe estar en la moneda de la venta.",
  invoice_number_taken: "Ese número de factura ya existe para otra venta o importe.",
  invoice_exceeds_sale_total: "La facturación superaría el valor contratado.",
  invoice_document_other_client: "El documento pertenece a otro cliente.",
  invoice_has_payments: "La factura tiene pagos registrados; revierte el pago primero.",
  void_reason_required: "Indica el motivo de la anulación.",
  payment_invalid_sale: "La venta no existe o está cancelada.",
  payment_currency_mismatch: "El pago debe estar en la moneda de la venta.",
  payment_exceeds_total: "El pago superaría el valor contratado.",
  payment_invalid_invoice: "La factura no corresponde a esta venta o está anulada.",
  payment_evidence_required: "Indica la evidencia (extracto, recibo) para verificar el pago.",
  payment_reversed: "El pago ya fue revertido.",
  reversal_reason_required: "Indica el motivo de la reversión.",
  commission_invalid_sale: "La venta no existe o está cancelada.",
  commission_invalid_value: "Valor de comisión inválido.",
  commission_rate_or_fixed: "Indica un porcentaje o un importe fijo (solo uno).",
  commission_unknown_beneficiary: "El beneficiario no es miembro de Avalon.",
  commission_zero: "La comisión resultante es cero.",
  commission_requires_verified_payment: "La comisión se devenga cuando hay un pago verificado de esa venta.",
  commission_payout_reference_required: "Indica la referencia del pago de la comisión.",
  commission_invalid_transition: "Ese cambio de estado no está permitido.",
  cancel_reason_required: "Indica el motivo de la cancelación.",
  project_client_locked: "El proyecto ya pertenece a otro cliente.",
  client_not_found: "Cliente no encontrado.",
};

export function coreEngineMessage(error: { message?: string; code?: string; details?: string } | null | undefined, lang: "es" | "en" = "es"): string {
  if (lang === "en") return coreEngineEnglish(error);
  const exact = Object.values(MESSAGES).find(message => message === error?.message);
  if (exact) return exact;
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`;
  if (/crm_payments_sale_reference_unique/.test(text)) return "Esa referencia de pago ya está registrada en esta venta.";
  if (/crm_commissions_one_open/.test(text)) return "Ya existe una comisión abierta para ese beneficiario en esta venta.";
  for (const [code, message] of Object.entries(MESSAGES)) if (new RegExp(`\\b${code}\\b`).test(text)) return message;
  if (error?.code === "42501") return MESSAGES.crm_forbidden;
  return "No se pudo completar la operación. Inténtalo de nuevo; no se registró nada a medias.";
}


function coreEngineEnglish(error: { message?: string; code?: string; details?: string } | null | undefined) {
  const spanish = coreEngineMessage(error);
  const translations: Record<string, string> = {
    [MESSAGES.crm_forbidden]: "Only an authorized owner can perform this action.",
    [MESSAGES.finance_forbidden]: "Your account does not have access to client finances.",
    [MESSAGES.offer_requires_price]: "Set a price before approving the offer.",
    [MESSAGES.invoice_exceeds_sale_total]: "Invoicing would exceed the contracted total.",
    [MESSAGES.invoice_number_taken]: "This invoice number is already used for another sale or amount.",
    [MESSAGES.invoice_has_payments]: "Reverse the recorded payments before voiding this invoice.",
    [MESSAGES.commission_requires_verified_payment]: "A verified payment is required before accruing this commission.",
    [MESSAGES.payment_evidence_required]: "Provide evidence, such as a receipt reference, to verify this payment.",
    [MESSAGES.commission_invalid_transition]: "This status transition is not allowed.",
    [MESSAGES.commission_payout_reference_required]: "Enter the reference of the commission payment already made.",
  };
  return translations[spanish] ?? "The operation could not be completed. Review the required fields, permissions and current record, then retry.";
}
