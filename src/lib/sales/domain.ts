/**
 * Sales domain: pure parsing/validation shared by server actions and tests.
 * The database recomputes every total and re-validates every field; this layer
 * exists to give clear errors early and to build a minimal, typed RPC payload.
 */
import type { Lang } from "@/lib/i18n";

export const MAX_LINES = 20; // Matches crm_confirm_sale DB cap; shared with Sales form.
export const MAX_CONTACTS = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AMOUNT = /^[0-9]{1,13}(\.[0-9]{1,2})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SaleLineInput = { service_code: string; unit_price?: string; quantity?: string; discount?: string; description?: string; assignee_id?: string; start_on?: string };
export type ContactInput = { full_name: string; email?: string; phone?: string; role?: string };
export type NewClientInput = { legal_name: string; trade_name?: string; website?: string; industry?: string; country?: string; location?: string; source?: string; notes?: string };
export type SaleRequest = {
  idempotency_key: string; client_id?: string; lead_id?: string; new_client?: NewClientInput; contacts: ContactInput[];
  sold_on?: string; currency: string; billing_mode: BillingMode; discount?: string; tax_rate?: string; upfront_amount?: string;
  seller_id?: string; contract_status: "pending_signature" | "signed"; notes?: string; lines: SaleLineInput[];
};
export const BILLING_MODES = ["one_time", "installments", "monthly", "mixed"] as const;
export type BillingMode = typeof BILLING_MODES[number];

export class SaleInputError extends Error {
  constructor(public code: SaleErrorCode) { super(code); }
}

type Source = { get(name: string): unknown };
const str = (form: Source, name: string, max: number) => {
  const value = form.get(name);
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > max) throw new SaleInputError("sale_too_long");
  return text;
};
const optional = <T extends Record<string, string | undefined>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as T;
const amount = (value: string) => {
  if (value && !AMOUNT.test(value)) throw new SaleInputError("sale_invalid_amount");
  return value || undefined;
};
const uuid = (value: string, code: SaleErrorCode) => {
  if (value && !UUID.test(value)) throw new SaleInputError(code);
  return value || undefined;
};
const day = (value: string) => {
  if (!value) return undefined;
  if (!DAY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new SaleInputError("sale_invalid_date");
  }
  return value;
};

/** Build the confirm-sale RPC payload from the sale form. Throws SaleInputError. */
export function parseSaleForm(form: Source): SaleRequest {
  const idempotency_key = str(form, "idempotency_key", 36);
  if (!UUID.test(idempotency_key)) throw new SaleInputError("sale_invalid_key");
  const mode = str(form, "client_mode", 10);
  if (mode !== "existing" && mode !== "new") throw new SaleInputError("sale_client_required");

  const request: SaleRequest = {
    idempotency_key, contacts: [], lines: [],
    currency: (str(form, "currency", 3) || "USD").toUpperCase(),
    billing_mode: "mixed", contract_status: str(form, "contract_status", 20) === "signed" ? "signed" : "pending_signature",
  };
  if (!/^[A-Z]{3}$/.test(request.currency)) throw new SaleInputError("sale_invalid_currency");
  const billing = str(form, "billing_mode", 20) || "mixed";
  if (!(BILLING_MODES as readonly string[]).includes(billing)) throw new SaleInputError("sale_invalid");
  request.billing_mode = billing as BillingMode;

  const lead = uuid(str(form, "lead_id", 36), "sale_lead_missing");
  if (lead) request.lead_id = lead;
  if (mode === "existing") {
    const client = uuid(str(form, "client_id", 36), "sale_client_missing");
    if (!client) throw new SaleInputError("sale_client_missing");
    request.client_id = client;
  } else {
    const legal_name = str(form, "legal_name", 200);
    if (!legal_name) throw new SaleInputError("sale_client_required");
    const website = str(form, "website", 500);
    if (website) {
      let url: URL;
      try { url = new URL(website); } catch { throw new SaleInputError("sale_invalid_website"); }
      if (url.protocol !== "https:" || url.username || url.password) throw new SaleInputError("sale_invalid_website");
    }
    request.new_client = optional({
      legal_name, website, trade_name: str(form, "trade_name", 200), industry: str(form, "industry", 120),
      country: str(form, "country", 80), location: str(form, "location", 200), source: str(form, "source", 200), notes: str(form, "client_notes", 4000),
    });
  }

  for (let i = 0; i < MAX_CONTACTS; i++) {
    const full_name = str(form, `contact_${i}_name`, 160);
    const email = str(form, `contact_${i}_email`, 254).toLowerCase();
    const phone = str(form, `contact_${i}_phone`, 40);
    const role = str(form, `contact_${i}_role`, 120);
    if (!full_name) {
      if (email || phone || role) throw new SaleInputError("sale_contact_name");
      continue;
    }
    if (email && !EMAIL.test(email)) throw new SaleInputError("sale_invalid_email");
    request.contacts.push(optional({ full_name, email, phone, role }));
  }

  for (let i = 0; i < MAX_LINES; i++) {
    const service_code = str(form, `line_${i}_service`, 50);
    const unit_price = amount(str(form, `line_${i}_price`, 16));
    const description = str(form, `line_${i}_description`, 2000);
    if (!service_code) {
      if (unit_price || description) throw new SaleInputError("sale_invalid_service");
      continue;
    }
    if (!/^[a-z][a-z0-9-]{1,49}$/.test(service_code)) throw new SaleInputError("sale_invalid_service");
    const quantity = amount(str(form, `line_${i}_qty`, 9));
    if (quantity !== undefined && Number(quantity) <= 0) throw new SaleInputError("sale_invalid_amount");
    request.lines.push(optional({
      service_code, unit_price, quantity, description, discount: amount(str(form, `line_${i}_discount`, 16)),
      assignee_id: uuid(str(form, `line_${i}_assignee`, 36), "sale_invalid_member"), start_on: day(str(form, `line_${i}_start`, 10)),
    }));
  }
  if (!request.lines.length) throw new SaleInputError("sale_invalid_lines");

  const extras = optional({
    sold_on: day(str(form, "sold_on", 10)), discount: amount(str(form, "discount", 16)), tax_rate: amount(str(form, "tax_rate", 6)),
    upfront_amount: amount(str(form, "upfront_amount", 16)), seller_id: uuid(str(form, "seller_id", 36), "sale_invalid_member"), notes: str(form, "notes", 4000),
  });
  if (extras.tax_rate && Number(extras.tax_rate) > 100) throw new SaleInputError("sale_invalid_amount");
  return { ...request, ...extras };
}

/** Preview only (the database is authoritative). Integer cents avoid float drift. */
export function previewTotals(lines: { quantity?: string; unit_price?: string; discount?: string; billing?: string }[], discount = "0", taxRate = "0") {
  const cents = (v?: string) => Math.round(Number(v || 0) * 100);
  let subtotal = 0, recurring = 0;
  for (const line of lines) {
    const total = Math.round(Number(line.quantity || 1) * cents(line.unit_price)) - cents(line.discount);
    subtotal += total;
    if (line.billing === "monthly") recurring += total;
  }
  const taxable = subtotal - cents(discount);
  const tax = Math.round(taxable * Number(taxRate || 0) / 100);
  return { subtotal: subtotal / 100, tax: tax / 100, total: (taxable + tax) / 100, recurring: recurring / 100 };
}

export const SALE_ERRORS = {
  sale_invalid: ["Datos de venta no válidos.", "Invalid sale data."],
  invoice_nothing_to_bill: ["Esta venta ya está facturada por completo (o su importe depende de una liquidación verificada). Descarga la factura existente.", "This sale is already fully invoiced (or its amount depends on a verified settlement). Download the existing invoice."],
  invoice_issue_failed: ["No se pudo emitir la factura. No se creó nada; inténtalo de nuevo.", "The invoice could not be issued. Nothing was created; try again."],
  sale_invalid_key: ["El formulario caducó. Recarga la página y vuelve a confirmar.", "The form expired. Reload and confirm again."],
  sale_invalid_lines: ["Añade al menos un servicio vendido.", "Add at least one sold service."],
  sale_invalid_service: ["Selecciona un servicio activo del catálogo para cada línea.", "Choose an active catalog service for every line."],
  sale_missing_price: ["Indica el precio de cada servicio (el catálogo no tiene precio sugerido).", "Enter a price for every service (no suggested catalog price)."],
  sale_invalid_amount: ["Importe no válido: usa números con hasta 2 decimales.", "Invalid amount: use numbers with up to 2 decimals."],
  sale_invalid_discount: ["El descuento no puede superar el importe.", "The discount cannot exceed the amount."],
  sale_invalid_upfront: ["El pago inicial no puede superar el total.", "The upfront payment cannot exceed the total."],
  sale_invalid_payment_terms: ["Revisa el método y calendario de pago. Para cuotas selecciona facturación por plazos; para suscripción elige mensual o mixta. No se guardó nada.", "Review the payment method and schedule. Installments require installment billing; subscriptions require monthly or mixed billing. Nothing was saved."],
  sale_invalid_quote: ["La cotización de origen no está aceptada o no corresponde a esta oportunidad. No se registró ninguna venta.", "The source quote is not accepted or does not match this opportunity. No sale was recorded."],
  sale_invalid_member: ["El responsable debe ser un propietario autorizado.", "The assignee must be an authorized owner."],
  sale_invalid_date: ["Fecha no válida.", "Invalid date."],
  sale_invalid_currency: ["Moneda no válida (código ISO de 3 letras).", "Invalid currency (3-letter ISO code)."],
  sale_invalid_email: ["Correo de contacto no válido.", "Invalid contact e-mail."],
  sale_invalid_website: ["La web del cliente debe empezar por https://.", "The client website must start with https://."],
  sale_contact_name: ["Cada contacto necesita un nombre.", "Every contact needs a name."],
  sale_too_long: ["Algún campo supera la longitud permitida.", "A field is too long."],
  sale_client_required: ["Selecciona un cliente existente o completa el nombre del cliente nuevo.", "Pick an existing client or enter the new client's name."],
  sale_client_missing: ["El cliente seleccionado no existe o está archivado.", "The selected client does not exist or is archived."],
  sale_contract_required: ["Esta venta cierra el lead como Ganado: primero registra y verifica el contrato firmado en la ficha del lead (pestaña Contrato).", "This sale closes the lead as Won: first record and verify the signed contract on the lead (Contract tab)."],
  sale_client_exists: ["Ese cliente ya existe. Selecciónalo como cliente existente para no duplicarlo.", "That client already exists. Select it as an existing client to avoid a duplicate."],
  sale_lead_missing: ["La oportunidad de origen no existe o está archivada.", "The source opportunity does not exist or is archived."],
  sale_lead_other_client: ["Esa oportunidad pertenece a otra empresa. Una venta solo puede cerrar la oportunidad vinculada al cliente seleccionado.", "That opportunity belongs to another company. A sale can only close the opportunity linked to the selected client."],
  crm_forbidden: ["No tienes permiso para registrar ventas.", "You are not allowed to record sales."],
  payment_exceeds_total: ["El cobro supera el total pendiente de la venta.", "The payment exceeds the sale's outstanding total."],
  payment_exceeds_installment: ["El cobro supera lo pendiente de esa cuota. Regístralo sin cuota o reparte el importe.", "The payment exceeds what is left on that installment. Record it without an installment or split it."],
  payment_invalid_installment: ["Esa cuota no pertenece a esta venta o ya no está vigente.", "That installment is not part of this sale or is no longer live."],
  payment_has_refunds: ["Este pago tiene reembolsos o contracargos: no se puede revertir como error de captura.", "This payment has refunds or chargebacks: it cannot be reversed as a capture error."],
  finance_forbidden: ["Necesitas acceso financiero para gestionar calendarios, reembolsos y contracargos.", "You need finance access to manage schedules, refunds and chargebacks."],
  schedule_total_mismatch: ["El calendario debe sumar exactamente el total de la venta (incluidas las cuotas ya cobradas).", "The schedule must add up exactly to the sale total (including installments already paid)."],
  schedule_invalid_date: ["Cada vencimiento debe ser una fecha real, no anterior a la fecha de venta.", "Every due date must be a real date, not before the sale date."],
  schedule_invalid_amount: ["Cada cuota debe ser un importe positivo con hasta 2 decimales.", "Every installment must be a positive amount with up to 2 decimals."],
  schedule_invalid: ["El calendario no es válido.", "The schedule is not valid."],
  schedule_invalid_sale: ["Solo las ventas confirmadas tienen calendario de pagos.", "Only confirmed sales have a payment schedule."],
  schedule_reason_required: ["Indica el motivo del cambio de calendario (mín. 5 caracteres).", "Give a reason for changing the schedule (min. 5 characters)."],
  schedule_version_conflict: ["Otra persona cambió el calendario antes. Recarga y revisa.", "Someone changed the schedule first. Reload and review."],
  refund_requires_verified_payment: ["Solo se reembolsa dinero verificado. Si el cobro fue un error de captura, revierte el registro.", "Only verified money can be refunded. If the receipt was a capture error, reverse it instead."],
  refund_exceeds_payment: ["Los reembolsos y contracargos no pueden superar el importe del pago.", "Refunds and chargebacks cannot exceed the payment amount."],
  refund_invalid_amount: ["Importe de reembolso no válido.", "Invalid refund amount."],
  refund_invalid: ["Datos de reembolso no válidos (motivo de 5 a 500 caracteres; fecha no anterior al cobro).", "Invalid refund data (reason 5–500 characters; date not before the receipt)."],
  refund_idempotency_conflict: ["Ese envío ya se registró con otros datos. Recarga la página.", "That submission was already recorded with different data. Reload the page."],
  chargeback_invalid: ["Indica el resultado y una nota (mín. 5 caracteres).", "Give the outcome and a note (min. 5 characters)."],
  chargeback_not_open: ["Ese contracargo ya está resuelto.", "That chargeback is already resolved."],
  settlement_invalid: ["Datos de liquidación no válidos.", "Invalid settlement data."],
  settlement_invalid_amount: ["La base elegible debe ser positiva y mayor que las exclusiones.", "The eligible base must be positive and above the exclusions."],
  settlement_invalid_period: ["Periodo no válido: no puede empezar antes de la vigencia del acuerdo.", "Invalid period: it cannot start before the agreement is effective."],
  settlement_period_overlap: ["Ese periodo ya tiene una liquidación vigente.", "That period already has a live settlement."],
  settlement_evidence_required: ["Indica la evidencia (reporte, conciliación…).", "Give the evidence (report, reconciliation…)."],
  settlement_reason_required: ["Indica el motivo de la anulación (mín. 5 caracteres).", "Give the reason for voiding (min. 5 characters)."],
  settlement_has_payments: ["Hay cobros que dependen de esta liquidación: no puede anularse.", "Receipts depend on this settlement: it cannot be voided."],
  settlement_invalid_transition: ["Ese cambio de estado no está permitido.", "That status change is not allowed."],
  settlement_no_variable_terms: ["Esta venta no tiene acuerdo variable.", "This sale has no variable agreement."],
  payment_currency_mismatch: ["La moneda del cobro debe coincidir con la de la venta.", "The payment currency must match the sale."],
  payment_invalid_sale: ["La venta no admite cobros.", "This sale cannot receive payments."],
  duplicate: ["Ya existe un registro con ese identificador (por ejemplo, el mismo correo).", "A record with that identifier already exists (for example, the same e-mail)."],
  conflict: ["Otra persona guardó cambios antes. Recarga y vuelve a intentarlo.", "Someone saved changes first. Reload and try again."],
  schema_pending: ["La migración de ventas (20261102170000) aún no está aplicada en este entorno.", "The sales migration (20261102170000) is not applied in this environment yet."],
  unavailable: ["Servicio no disponible. Tus datos no se guardaron; inténtalo de nuevo.", "Service unavailable. Nothing was saved; try again."],
} as const satisfies Record<string, readonly [string, string]>;
export type SaleErrorCode = keyof typeof SALE_ERRORS;
export const isSaleError = (v: unknown): v is SaleErrorCode => typeof v === "string" && Object.hasOwn(SALE_ERRORS, v);
export const saleErrorText = (lang: Lang, code: string) => SALE_ERRORS[isSaleError(code) ? code : "unavailable"][lang === "es" ? 0 : 1];

/** Map a PostgREST/PostgreSQL error to a known code, never echoing raw DB text. */
export function saleErrorCode(error: { code?: string; message?: string } | null | undefined): SaleErrorCode {
  const message = error?.message ?? "";
  const known = message.match(/\b(sale_[a-z_]+|payment_[a-z_]+|schedule_[a-z_]+|refund_[a-z_]+|chargeback_[a-z_]+|settlement_[a-z_]+|finance_forbidden|crm_forbidden)\b/)?.[1];
  if (known && isSaleError(known)) return known;
  if (message.includes("won_requires_verified_contract")) return "sale_contract_required";
  if (error?.code === "PGRST202" || error?.code === "PGRST205" || error?.code === "42P01" || error?.code === "42883") return "schema_pending";
  if (error?.code === "42501") return "crm_forbidden";
  if (error?.code === "23505") return "sale_client_exists";
  if (error?.code && ["23514", "22023", "22P02", "23502", "23503", "22001"].includes(error.code)) return "sale_invalid";
  return "unavailable";
}

export type ConfirmResult = { sale_id: string; sale_number: string; client_id: string; replayed: boolean; work_orders: number; projects: number; tasks: number };
export function readConfirmResult(value: unknown): ConfirmResult | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (typeof r.sale_id !== "string" || !UUID.test(r.sale_id) || typeof r.client_id !== "string" || !UUID.test(r.client_id) || typeof r.sale_number !== "string") return null;
  return { sale_id: r.sale_id, client_id: r.client_id, sale_number: r.sale_number, replayed: r.replayed === true,
    work_orders: Number(r.work_orders) || 0, projects: Number(r.projects) || 0, tasks: Number(r.tasks) || 0 };
}

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const WORK_ORDER_STATUSES = ["open", "in_progress", "blocked", "delivered", "cancelled"] as const;
/** Manual receipt channels (DB enum, 20261123150000). No processor is connected: these document money received. */
export const PAYMENT_METHODS = ["transfer", "ach", "wire", "zelle", "check", "card", "cash", "paypal", "payment_link", "financing_external", "other"] as const;

const LABELS: Record<string, [string, string]> = {
  todo: ["Pendiente", "To do"], in_progress: ["En curso", "In progress"], blocked: ["Bloqueada", "Blocked"], done: ["Hecha", "Done"], cancelled: ["Cancelada", "Cancelled"],
  low: ["Baja", "Low"], normal: ["Normal", "Normal"], high: ["Alta", "High"], urgent: ["Urgente", "Urgent"],
  open: ["Abierta", "Open"], delivered: ["Entregada", "Delivered"],
  one_time: ["Pago único", "One-time"], monthly: ["Mensual", "Monthly"], annual: ["Anual", "Annual"], installments: ["Plazos", "Installments"], mixed: ["Mixta", "Mixed"],
  pending_signature: ["Pendiente de firma", "Pending signature"], signed: ["Firmado", "Signed"],
  not_started: ["Sin iniciar", "Not started"], confirmed: ["Confirmada", "Confirmed"],
  transfer: ["Transferencia", "Transfer"], card: ["Tarjeta", "Card"], cash: ["Efectivo", "Cash"], other: ["Otro", "Other"],
  ach: ["ACH", "ACH"], wire: ["Wire", "Wire"], zelle: ["Zelle", "Zelle"], check: ["Cheque", "Check"], paypal: ["PayPal", "PayPal"],
  payment_link: ["Enlace de pago", "Payment link"], financing_external: ["Financiamiento externo (desembolso)", "External financing (disbursement)"],
  deposit: ["Anticipo", "Deposit"], installment: ["Cuota", "Installment"], balance: ["Saldo", "Balance"], milestone: ["Hito", "Milestone"], recurring: ["Recurrente", "Recurring"],
  pending: ["Pendiente de verificar", "Pending verification"], scheduled: ["Programada", "Scheduled"], paid: ["Pagada", "Paid"], partial: ["Pago parcial", "Partially paid"], overdue: ["Vencida", "Overdue"], due: ["Por vencer", "Upcoming"],
  unpaid: ["Sin pagos", "Unpaid"], partially_paid: ["Pago parcial", "Partially paid"], refunded: ["Reembolsada", "Refunded"], disputed: ["En disputa", "Disputed"],
  refund: ["Reembolso", "Refund"], chargeback: ["Contracargo", "Chargeback"], won: ["Ganado", "Won"], lost: ["Perdido", "Lost"],
  recorded: ["Registrado", "Recorded"], verified: ["Verificado", "Verified"], reversed: ["Revertido", "Reversed"],
  none: ["Única", "One-off"], active: ["Activo", "Active"], inactive: ["Inactivo", "Inactive"], archived: ["Archivado", "Archived"],
};
export const label = (lang: Lang, key: string) => LABELS[key]?.[lang === "es" ? 0 : 1] ?? key;
export const tone = (key: string) =>
  ["done", "delivered", "signed", "active", "paid", "verified", "won"].includes(key) ? "ok" : ["blocked", "urgent", "overdue", "disputed", "lost", "chargeback"].includes(key) ? "danger"
    : ["in_progress", "high"].includes(key) ? "info" : ["cancelled", "archived", "low"].includes(key) ? "neutral" : "warn";

export function money(lang: Lang, value: number | string | null | undefined, currency = "USD") {
  const n = Number(value ?? 0);
  try { return new Intl.NumberFormat(lang === "es" ? "es-US" : "en-US", { style: "currency", currency }).format(n); }
  catch { return `${currency} ${n.toFixed(2)}`; }
}
