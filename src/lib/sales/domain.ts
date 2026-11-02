/**
 * Sales domain: pure parsing/validation shared by server actions and tests.
 * The database recomputes every total and re-validates every field; this layer
 * exists to give clear errors early and to build a minimal, typed RPC payload.
 */
import type { Lang } from "@/lib/i18n";

export const MAX_LINES = 6;
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
  sale_invalid_key: ["El formulario caducó. Recarga la página y vuelve a confirmar.", "The form expired. Reload and confirm again."],
  sale_invalid_lines: ["Añade al menos un servicio vendido.", "Add at least one sold service."],
  sale_invalid_service: ["Selecciona un servicio activo del catálogo para cada línea.", "Choose an active catalog service for every line."],
  sale_missing_price: ["Indica el precio de cada servicio (el catálogo no tiene precio sugerido).", "Enter a price for every service (no suggested catalog price)."],
  sale_invalid_amount: ["Importe no válido: usa números con hasta 2 decimales.", "Invalid amount: use numbers with up to 2 decimals."],
  sale_invalid_discount: ["El descuento no puede superar el importe.", "The discount cannot exceed the amount."],
  sale_invalid_upfront: ["El pago inicial no puede superar el total.", "The upfront payment cannot exceed the total."],
  sale_invalid_member: ["El responsable debe ser un propietario autorizado.", "The assignee must be an authorized owner."],
  sale_invalid_date: ["Fecha no válida.", "Invalid date."],
  sale_invalid_currency: ["Moneda no válida (código ISO de 3 letras).", "Invalid currency (3-letter ISO code)."],
  sale_invalid_email: ["Correo de contacto no válido.", "Invalid contact e-mail."],
  sale_invalid_website: ["La web del cliente debe empezar por https://.", "The client website must start with https://."],
  sale_contact_name: ["Cada contacto necesita un nombre.", "Every contact needs a name."],
  sale_too_long: ["Algún campo supera la longitud permitida.", "A field is too long."],
  sale_client_required: ["Selecciona un cliente existente o completa el nombre del cliente nuevo.", "Pick an existing client or enter the new client's name."],
  sale_client_missing: ["El cliente seleccionado no existe o está archivado.", "The selected client does not exist or is archived."],
  sale_client_exists: ["Ese cliente ya existe. Selecciónalo como cliente existente para no duplicarlo.", "That client already exists. Select it as an existing client to avoid a duplicate."],
  sale_lead_missing: ["La oportunidad de origen no existe o está archivada.", "The source opportunity does not exist or is archived."],
  crm_forbidden: ["No tienes permiso para registrar ventas.", "You are not allowed to record sales."],
  payment_exceeds_total: ["El cobro supera el total pendiente de la venta.", "The payment exceeds the sale's outstanding total."],
  payment_currency_mismatch: ["La moneda del cobro debe coincidir con la de la venta.", "The payment currency must match the sale."],
  payment_invalid_sale: ["La venta no admite cobros.", "This sale cannot receive payments."],
  payment_stripe_invoice_active: ["Esta venta ya tiene una factura Stripe pendiente. Resuélvela o anúlala en Stripe antes de registrar otro cobro.", "This sale has an outstanding Stripe invoice. Resolve or void it in Stripe before recording another payment."],
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
  const known = message.match(/\b(sale_[a-z_]+|payment_[a-z_]+|crm_forbidden)\b/)?.[1];
  if (known && isSaleError(known)) return known;
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
export const PAYMENT_METHODS = ["transfer", "card", "cash", "other"] as const;

const LABELS: Record<string, [string, string]> = {
  todo: ["Pendiente", "To do"], in_progress: ["En curso", "In progress"], blocked: ["Bloqueada", "Blocked"], done: ["Hecha", "Done"], cancelled: ["Cancelada", "Cancelled"],
  low: ["Baja", "Low"], normal: ["Normal", "Normal"], high: ["Alta", "High"], urgent: ["Urgente", "Urgent"],
  open: ["Abierta", "Open"], delivered: ["Entregada", "Delivered"],
  one_time: ["Pago único", "One-time"], monthly: ["Mensual", "Monthly"], annual: ["Anual", "Annual"], installments: ["Plazos", "Installments"], mixed: ["Mixta", "Mixed"],
  pending_signature: ["Pendiente de firma", "Pending signature"], signed: ["Firmado", "Signed"],
  not_started: ["Sin iniciar", "Not started"], confirmed: ["Confirmada", "Confirmed"],
  transfer: ["Transferencia", "Transfer"], card: ["Tarjeta", "Card"], cash: ["Efectivo", "Cash"], other: ["Otro", "Other"],
  none: ["Única", "One-off"], active: ["Activo", "Active"], inactive: ["Inactivo", "Inactive"], archived: ["Archivado", "Archived"],
};
export const label = (lang: Lang, key: string) => LABELS[key]?.[lang === "es" ? 0 : 1] ?? key;
export const tone = (key: string) =>
  ["done", "delivered", "signed", "active"].includes(key) ? "ok" : ["blocked", "urgent"].includes(key) ? "danger"
    : ["in_progress", "high"].includes(key) ? "info" : ["cancelled", "archived", "low"].includes(key) ? "neutral" : "warn";

export function money(lang: Lang, value: number | string | null | undefined, currency = "USD") {
  const n = Number(value ?? 0);
  try { return new Intl.NumberFormat(lang === "es" ? "es-US" : "en-US", { style: "currency", currency }).format(n); }
  catch { return `${currency} ${n.toFixed(2)}`; }
}
