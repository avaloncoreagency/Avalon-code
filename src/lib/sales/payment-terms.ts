/**
 * Contracted payment preferences, not collected money and not a lending engine.
 * Versioned data is carried in crm_sales.notes until a separately reviewed
 * migration can normalize it. No bank/card details, APR or automatic charges.
 */
export const SALE_PAYMENT_METHODS = [
  "bank_transfer", "ach", "card", "cash", "check", "wire", "zelle", "paypal", "payment_link", "other",
] as const;
export const SALE_PAYMENT_SCHEDULES = [
  "full", "deposit_balance", "milestones", "installments", "subscription", "external_financing",
] as const;
export const SALE_PAYMENT_FREQUENCIES = ["weekly", "biweekly", "monthly"] as const;
export type SalePaymentMethod = typeof SALE_PAYMENT_METHODS[number];
export type SalePaymentSchedule = typeof SALE_PAYMENT_SCHEDULES[number];
export type SalePaymentFrequency = typeof SALE_PAYMENT_FREQUENCIES[number];

export type SalePaymentTerms = {
  version: 1;
  method: SalePaymentMethod;
  schedule: SalePaymentSchedule;
  installments: number;
  frequency: SalePaymentFrequency;
  firstDue: string;
  netDays: number;
  milestones: string;
  externalProvider: string;
  notes: string;
};

export const DEFAULT_SALE_PAYMENT_TERMS: SalePaymentTerms = {
  version: 1, method: "bank_transfer", schedule: "full", installments: 3,
  frequency: "monthly", firstDue: "", netDays: 0, milestones: "",
  externalProvider: "", notes: "",
};

export const SALE_TERMS_MARKER = "\n\n[AVALON_SALE_PAYMENT_TERMS_V1]\n";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const included = (items: readonly string[], value: unknown): value is string =>
  typeof value === "string" && items.includes(value);
const clean = (value: unknown, max: number): string => {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw Error("sale_invalid_payment_terms");
  return value.trim();
};
const actualDate = (value: string) => DATE.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z"))
  && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;

/** Strictly reject tampered client JSON, unexpected fields and incomplete financing proposals. */
export function validateSalePaymentTerms(value: unknown): SalePaymentTerms {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("sale_invalid_payment_terms");
  const o = value as Record<string, unknown>;
  const allowed = new Set(["version", "method", "schedule", "installments", "frequency", "firstDue", "netDays", "milestones", "externalProvider", "notes"]);
  if (Object.keys(o).some(k => !allowed.has(k)) || o.version !== 1
    || !included(SALE_PAYMENT_METHODS, o.method) || !included(SALE_PAYMENT_SCHEDULES, o.schedule)
    || !included(SALE_PAYMENT_FREQUENCIES, o.frequency)
    || typeof o.installments !== "number" || !Number.isInteger(o.installments) || o.installments < 2 || o.installments > 36
    || typeof o.netDays !== "number" || !Number.isInteger(o.netDays) || o.netDays < 0 || o.netDays > 365)
    throw Error("sale_invalid_payment_terms");
  const firstDue = clean(o.firstDue, 10);
  const milestones = clean(o.milestones, 700);
  const externalProvider = clean(o.externalProvider, 120);
  const notes = clean(o.notes, 700);
  if (firstDue && !actualDate(firstDue)) throw Error("sale_invalid_payment_terms");
  if (o.schedule === "installments" && !firstDue) throw Error("sale_invalid_payment_terms");
  if (o.schedule === "milestones" && milestones.length < 8) throw Error("sale_invalid_payment_terms");
  // Third-party financing is ONLY a pending, external proposal. No lending or payments are activated here.
  if (o.schedule === "external_financing" && !externalProvider) throw Error("sale_invalid_payment_terms");
  return {
    version: 1, method: o.method as SalePaymentMethod, schedule: o.schedule as SalePaymentSchedule,
    installments: o.installments as number, frequency: o.frequency as SalePaymentFrequency,
    firstDue, netDays: o.netDays as number, milestones, externalProvider, notes,
  };
}

export function encodeSalePaymentTerms(terms: SalePaymentTerms): string {
  return JSON.stringify(validateSalePaymentTerms(terms));
}

/** Preserve the existing RPC signature and old sales; never overwrite internal notes. */
export function attachSalePaymentTerms(notes: string, terms: SalePaymentTerms): string {
  if (notes.includes(SALE_TERMS_MARKER)) throw Error("sale_invalid_payment_terms");
  const result = notes.trim() + SALE_TERMS_MARKER + encodeSalePaymentTerms(terms);
  if (result.length > 4000) throw Error("sale_too_long");
  return result;
}

/** A legacy record or malformed historical suffix is displayed untouched. */
export function readSalePaymentTerms(notes: string | null | undefined): {
  notes: string; terms: SalePaymentTerms | null;
} {
  const text = notes ?? "";
  const at = text.lastIndexOf(SALE_TERMS_MARKER);
  if (at === -1) return { notes: text, terms: null };
  try {
    const terms = validateSalePaymentTerms(JSON.parse(text.slice(at + SALE_TERMS_MARKER.length)));
    return { notes: text.slice(0, at).trim(), terms };
  } catch {
    return { notes: text, terms: null };
  }
}

export const salePaymentMethodLabel = (method: SalePaymentMethod, lang: "es" | "en") => ({
  bank_transfer: ["Transferencia bancaria", "Bank transfer"], ach: ["ACH", "ACH"],
  card: ["Tarjeta", "Card"], cash: ["Efectivo", "Cash"], check: ["Cheque", "Check"],
  wire: ["Transferencia wire", "Wire transfer"], zelle: ["Zelle (registrado manualmente)", "Zelle (manual receipt)"], paypal: ["PayPal (registrado manualmente)", "PayPal (manual receipt)"], payment_link: ["Enlace de pago", "Payment link"],
  other: ["Otro (acordar)", "Other (to be agreed)"],
})[method][lang === "es" ? 0 : 1];

export const salePaymentScheduleLabel = (schedule: SalePaymentSchedule, lang: "es" | "en") => ({
  full: ["Pago completo", "Pay in full"], deposit_balance: ["Anticipo y saldo", "Deposit and balance"],
  milestones: ["Pagos por hitos", "Milestone payments"], installments: ["Cuotas sin interés (propuesta)", "Interest-free installments (proposal)"],
  subscription: ["Mensualidades", "Subscription / recurring"], external_financing: ["Financiación externa pendiente", "External financing pending"],
})[schedule][lang === "es" ? 0 : 1];

/** Preview is illustrative only; the contracted total and payments remain database-authoritative. */
export function installmentPreview(total: number, upfront: number, count: number): {
  remaining: number; regular: number; final: number;
} | null {
  if (!Number.isFinite(total) || !Number.isFinite(upfront) || total < 0 || upfront < 0
    || upfront > total || !Number.isInteger(count) || count < 2 || count > 36) return null;
  const remainingCents = Math.round(total * 100) - Math.round(upfront * 100);
  const base = Math.floor(remainingCents / count);
  return { remaining: remainingCents / 100, regular: base / 100,
    final: (remainingCents - base * (count - 1)) / 100 };
}

/** Existing crm_payments.method DB enum remains unchanged; channel is retained in reference. */
export function paymentChannelToStoredMethod(channel: SalePaymentMethod): "transfer" | "card" | "cash" | "other" {
  if (["bank_transfer", "ach", "wire", "zelle"].includes(channel)) return "transfer";
  if (channel === "card") return "card";
  if (channel === "cash") return "cash";
  return "other";
}
