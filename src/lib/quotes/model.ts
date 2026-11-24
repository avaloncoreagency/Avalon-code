import { authorDisplayName } from "../identity/owners";
/**
 * Avalon Quoting Studio — pure domain model (no I/O, no imports).
 *
 * Two strictly separated payloads exist for every quote revision:
 *   - QuoteContent: what the prospect may read. It is the ONLY input the PDF renderer accepts.
 *   - QuoteInternal: Avalon's costs, margins and confidential notes. Stored apart, never rendered.
 * Amounts are handled as integer cents; prices are entered by an owner, never invented or defaulted.
 */

export type Lang = "es" | "en";
export type BillingModel = "fixed" | "monthly" | "commission" | "hybrid";
export type LineKind = "one_time" | "monthly";
export type CommissionBase = "gross_revenue" | "gross_profit" | "other";
export type Settlement = "weekly" | "biweekly" | "monthly" | "quarterly";

export const QUOTE_STATUSES = ["draft", "internal_review", "approved", "sent", "accepted", "rejected", "expired", "superseded"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const BILLING_MODELS: BillingModel[] = ["fixed", "monthly", "commission", "hybrid"];
export const SETTLEMENTS: Settlement[] = ["weekly", "biweekly", "monthly", "quarterly"];

/** Mirrors crm_private.quote_transition_allowed() in the database (the database is the authority). */
export const QUOTE_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ["internal_review", "superseded"],
  internal_review: ["approved", "draft", "superseded"],
  approved: ["sent", "draft", "superseded"],
  sent: ["accepted", "rejected", "expired", "superseded"],
  accepted: [],
  rejected: [],
  expired: [],
  superseded: [],
};
/** Transitions that need a written note (how it was sent, who accepted and with what evidence...). */
export const NOTE_REQUIRED: readonly QuoteStatus[] = ["sent", "accepted", "rejected", "superseded"];
/** Only revisions in these states can be edited; anything after "sent" needs a new quote. */
export const REVISABLE: readonly QuoteStatus[] = ["draft", "internal_review", "approved"];

export type QuoteLine = {
  /** crm_service_catalog.code when picked from the catalog; null for an approved custom concept. */
  code: string | null;
  name: string;
  description: string;
  kind: LineKind;
  qty: number;
  /** Decimal string with up to two decimals ("1500" or "1500.00"). */
  unitPrice: string;
};

/** What the percentage pays for. Optional for backward compatibility: older quotes are read as revenue_share. */
export type VariableKind = "revenue_share" | "sale_commission" | "outcome_commission";
export const VARIABLE_KINDS: VariableKind[] = ["revenue_share", "sale_commission", "outcome_commission"];

export type QuoteCommission = {
  /** "to_negotiate" = no percentage agreed yet. It can be presented, never accepted. */
  status: "proposed" | "to_negotiate";
  kind?: VariableKind;
  /** Date the agreement starts counting (YYYY-MM-DD); settlements cannot start earlier. Defaults to the sale date. */
  effectiveDate?: string;
  /** Duration of the agreement in months (1–120); empty = until terminated per contract. */
  durationMonths?: number | null;
  pct: string;
  base: CommissionBase;
  baseNote: string;
  trigger: string;
  attributionWindowDays: number | null;
  evidence: string;
  settlement: Settlement;
  exclusions: string;
  refunds: string;
  expiry: string;
};

export type QuoteContent = {
  schemaVersion: 1;
  lang: Lang;
  currency: "USD";
  title: string;
  issueDate: string;
  validUntil: string;
  client: { company: string; contact: string; email: string; phone: string; address: string };
  issuer: { name: string; email: string; phone: string };
  seller: string;
  objectives: string;
  problem: string;
  solution: string;
  scope: string;
  deliverables: string;
  exclusions: string;
  dependencies: string;
  timeline: string;
  support: string;
  terms: string;
  notes: string;
  /** Advertising/platform spend paid by the client to third parties. Never Avalon revenue. */
  thirdPartyCosts: string;
  model: BillingModel;
  lines: QuoteLine[];
  commission: QuoteCommission | null;
};

export type QuoteInternal = { directCosts: string; marginNote: string; confidential: string };

export type QuoteTotals = { oneTimeCents: number; monthlyCents: number; lines: number };

const MAX_TEXT = 4000;
const MAX_SHORT = 200;
const MAX_LINES = 30;
const MONEY = /^\d{1,9}(\.\d{1,2})?$/;
const PCT = /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "1500.5" -> 150050. Throws on anything that is not a non-negative amount with at most two decimals. */
export function toCents(value: string): number {
  const v = value.trim();
  if (!MONEY.test(v)) throw new RangeError("invalid_amount");
  const [whole, frac = ""] = v.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}
export function centsToString(cents: number): string {
  return Math.floor(cents / 100) + "." + String(cents % 100).padStart(2, "0");
}
export function formatUsd(cents: number, lang: Lang = "en"): string {
  const s = (cents / 100).toLocaleString(lang === "es" ? "en-US" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return "$" + s;
}

export function quoteTotals(content: Pick<QuoteContent, "lines">): QuoteTotals {
  let oneTimeCents = 0, monthlyCents = 0;
  for (const line of content.lines) {
    const amount = toCents(line.unitPrice) * line.qty;
    if (line.kind === "monthly") monthlyCents += amount; else oneTimeCents += amount;
  }
  return { oneTimeCents, monthlyCents, lines: content.lines.length };
}

const realDate = (v: string) => DATE.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

/** Returns field keys that are wrong. An empty list means the revision can be saved. */
export function validateQuote(c: QuoteContent): string[] {
  const errors: string[] = [];
  const text = (k: string, v: unknown, max = MAX_TEXT) => { if (typeof v !== "string" || v.length > max) errors.push(k); };
  if (c.schemaVersion !== 1) errors.push("schemaVersion");
  if (c.lang !== "es" && c.lang !== "en") errors.push("lang");
  if (c.currency !== "USD") errors.push("currency");
  if (typeof c.title !== "string" || !c.title.trim() || c.title.length > MAX_SHORT) errors.push("title");
  if (!realDate(c.issueDate)) errors.push("issueDate");
  if (!realDate(c.validUntil) || (realDate(c.issueDate) && c.validUntil < c.issueDate)) errors.push("validUntil");
  if (!c.client || typeof c.client.company !== "string" || !c.client.company.trim() || c.client.company.length > MAX_SHORT) errors.push("client.company");
  for (const k of ["contact", "phone", "address"] as const) text("client." + k, c.client?.[k], MAX_SHORT);
  if (c.client?.email && !EMAIL.test(c.client.email)) errors.push("client.email");
  if (!c.issuer || typeof c.issuer.name !== "string" || !c.issuer.name.trim() || c.issuer.name.length > MAX_SHORT) errors.push("issuer.name");
  if (c.issuer?.email && !EMAIL.test(c.issuer.email)) errors.push("issuer.email");
  text("issuer.phone", c.issuer?.phone, MAX_SHORT);
  text("seller", c.seller, MAX_SHORT);
  for (const k of ["objectives", "problem", "solution", "scope", "deliverables", "exclusions", "dependencies", "timeline", "support", "terms", "notes", "thirdPartyCosts"] as const) text(k, c[k]);
  if (typeof c.solution !== "string" || !c.solution.trim()) errors.push("solution");
  if (!BILLING_MODELS.includes(c.model)) errors.push("model");

  if (!Array.isArray(c.lines) || c.lines.length > MAX_LINES) errors.push("lines");
  const lines = Array.isArray(c.lines) ? c.lines : [];
  lines.forEach((l, i) => {
    if (!l || typeof l.name !== "string" || !l.name.trim() || l.name.length > MAX_SHORT) errors.push(`lines.${i}.name`);
    if (typeof l?.description !== "string" || l.description.length > 1000) errors.push(`lines.${i}.description`);
    if (l?.code !== null && (typeof l?.code !== "string" || !/^[a-z][a-z0-9-]{1,49}$/.test(l.code))) errors.push(`lines.${i}.code`);
    if (l?.kind !== "one_time" && l?.kind !== "monthly") errors.push(`lines.${i}.kind`);
    if (!Number.isInteger(l?.qty) || l.qty < 1 || l.qty > 999) errors.push(`lines.${i}.qty`);
    if (typeof l?.unitPrice !== "string" || !MONEY.test(l.unitPrice.trim())) errors.push(`lines.${i}.unitPrice`);
  });
  const oneTime = lines.some(l => l?.kind === "one_time");
  const monthly = lines.some(l => l?.kind === "monthly");

  const cm = c.commission;
  if (cm) {
    if (cm.status !== "proposed" && cm.status !== "to_negotiate") errors.push("commission.status");
    if (cm.status === "proposed" && (typeof cm.pct !== "string" || !PCT.test(cm.pct.trim()) || Number(cm.pct) <= 0)) errors.push("commission.pct");
    if (cm.status === "to_negotiate" && cm.pct !== "") errors.push("commission.pct");
    if (!["gross_revenue", "gross_profit", "other"].includes(cm.base)) errors.push("commission.base");
    if (cm.base === "other" && !cm.baseNote?.trim()) errors.push("commission.baseNote");
    if (typeof cm.trigger !== "string" || !cm.trigger.trim()) errors.push("commission.trigger");
    if (typeof cm.evidence !== "string" || !cm.evidence.trim()) errors.push("commission.evidence");
    if (cm.attributionWindowDays !== null && (!Number.isInteger(cm.attributionWindowDays) || cm.attributionWindowDays < 1 || cm.attributionWindowDays > 730)) errors.push("commission.attributionWindowDays");
    if (!SETTLEMENTS.includes(cm.settlement)) errors.push("commission.settlement");
    if (cm.kind !== undefined && !VARIABLE_KINDS.includes(cm.kind)) errors.push("commission.kind");
    if (cm.effectiveDate !== undefined && cm.effectiveDate !== "" && !DATE.test(cm.effectiveDate)) errors.push("commission.effectiveDate");
    if (cm.durationMonths !== undefined && cm.durationMonths !== null && (!Number.isInteger(cm.durationMonths) || cm.durationMonths < 1 || cm.durationMonths > 120)) errors.push("commission.durationMonths");
    for (const k of ["baseNote", "exclusions", "refunds", "expiry"] as const) if (typeof cm[k] !== "string" || cm[k].length > 2000) errors.push("commission." + k);
  }

  // Each billing model has a precise shape so a PDF can never mix up what is being charged.
  if (c.model === "fixed" && (!oneTime || monthly || cm)) errors.push("model.fixed");
  if (c.model === "monthly" && (!monthly || cm)) errors.push("model.monthly");
  if (c.model === "commission" && !cm) errors.push("model.commission");
  if (c.model === "hybrid" && [oneTime, monthly, !!cm].filter(Boolean).length < 2) errors.push("model.hybrid");
  if (!errors.some(e => e.startsWith("lines.")) && lines.length) {
    const t = quoteTotals({ lines });
    if (t.oneTimeCents + t.monthlyCents === 0 && !cm) errors.push("lines.zero");
  }
  return [...new Set(errors)];
}

export function validateInternal(i: QuoteInternal): string[] {
  const errors: string[] = [];
  for (const k of ["directCosts", "marginNote", "confidential"] as const)
    if (typeof i?.[k] !== "string" || i[k].length > MAX_TEXT) errors.push("internal." + k);
  return errors;
}

/** Stable JSON (sorted keys) so the SHA-256 stored with a revision can be re-verified byte for byte. */
export function canonicalQuote(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalQuote).join(",") + "]";
  if (value && typeof value === "object")
    return "{" + Object.keys(value as Record<string, unknown>).sort()
      .map(k => JSON.stringify(k) + ":" + canonicalQuote((value as Record<string, unknown>)[k])).join(",") + "}";
  return JSON.stringify(value);
}

/** Strips anything that is not part of the client-facing contract of QuoteContent. */
export function clientSafe(c: QuoteContent): QuoteContent {
  return {
    schemaVersion: 1, lang: c.lang, currency: "USD", title: c.title.trim(), issueDate: c.issueDate, validUntil: c.validUntil,
    client: { company: c.client.company.trim(), contact: c.client.contact.trim(), email: c.client.email.trim(), phone: c.client.phone.trim(), address: c.client.address.trim() },
    issuer: { name: c.issuer.name.trim(), email: c.issuer.email.trim(), phone: c.issuer.phone.trim() },
    seller: authorDisplayName(c.seller, ""), objectives: c.objectives.trim(), problem: c.problem.trim(), solution: c.solution.trim(),
    scope: c.scope.trim(), deliverables: c.deliverables.trim(), exclusions: c.exclusions.trim(), dependencies: c.dependencies.trim(),
    timeline: c.timeline.trim(), support: c.support.trim(), terms: c.terms.trim(), notes: c.notes.trim(), thirdPartyCosts: c.thirdPartyCosts.trim(),
    model: c.model,
    lines: c.lines.map(l => ({ code: l.code, name: l.name.trim(), description: l.description.trim(), kind: l.kind, qty: l.qty, unitPrice: centsToString(toCents(l.unitPrice)) })),
    commission: c.commission ? {
      status: c.commission.status, pct: c.commission.status === "proposed" ? c.commission.pct.trim() : "",
      ...(c.commission.kind ? { kind: c.commission.kind } : {}),
      ...(c.commission.effectiveDate ? { effectiveDate: c.commission.effectiveDate } : {}),
      ...(c.commission.durationMonths ? { durationMonths: c.commission.durationMonths } : {}),
      base: c.commission.base, baseNote: c.commission.baseNote.trim(), trigger: c.commission.trigger.trim(),
      attributionWindowDays: c.commission.attributionWindowDays, evidence: c.commission.evidence.trim(),
      settlement: c.commission.settlement, exclusions: c.commission.exclusions.trim(), refunds: c.commission.refunds.trim(),
      expiry: c.commission.expiry.trim(),
    } : null,
  };
}

export function isQuoteContent(v: unknown): v is QuoteContent {
  if (!v || typeof v !== "object") return false;
  try { return validateQuote(v as QuoteContent).length === 0; } catch { return false; }
}

export function canTransition(from: QuoteStatus, to: QuoteStatus) {
  return QUOTE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Avalon standard for EVERY variable agreement (percentage, revenue share, commission, hybrid): these terms are
 * never inferred. A proposal missing any of them cannot be approved, sent, accepted or closed (DB-enforced). */
export type VariableField = "kind" | "effectiveDate" | "durationMonths" | "exclusions" | "refunds" | "evidence" | "trigger";
export function missingVariableTerms(cm: NonNullable<QuoteContent["commission"]>): VariableField[] {
  const out: VariableField[] = [];
  const text = (v: string | undefined) => (v ?? "").trim().length >= 3;
  if (!cm.kind) out.push("kind");
  if (!cm.effectiveDate) out.push("effectiveDate");
  if (!cm.durationMonths) out.push("durationMonths");
  if (!text(cm.exclusions)) out.push("exclusions");
  if (!text(cm.refunds)) out.push("refunds");
  if (!text(cm.evidence)) out.push("evidence");
  if (!text(cm.trigger)) out.push("trigger");
  return out;
}

/** Same rules as the database: a commission still to be negotiated, or a proposed variable agreement missing
 * essential terms, cannot be approved, sent or accepted. */
export function acceptanceBlockers(c: QuoteContent): string[] {
  const out: string[] = [];
  if (c.commission?.status === "to_negotiate") out.push("commission_to_negotiate");
  else if (c.commission && missingVariableTerms(c.commission).length) out.push("variable_terms_incomplete");
  return out;
}

/** Safe, consistent download name: Avalon-Quote-Q-2026-0001-v2.pdf */
export function quoteFileName(number: string, version: number) {
  return "Avalon-Quote-" + number.replace(/[^A-Za-z0-9-]/g, "") + "-v" + version + ".pdf";
}

/** Contract Studio fields prefilled from an accepted revision (reviewable before generation; never auto-signed). */
export function contractPrefill(c: QuoteContent, quoteNumber: string, version: number) {
  const t = quoteTotals(c);
  const cm = c.commission;
  const commission = cm && cm.status === "proposed"
    ? `${cm.pct}% of ${cm.base === "other" ? cm.baseNote : cm.base === "gross_revenue" ? "attributable gross revenue actually collected" : "attributable gross profit"}; earned when: ${cm.trigger}; evidence: ${cm.evidence}; settlement: ${cm.settlement}` +
      (cm.attributionWindowDays ? `; attribution window: ${cm.attributionWindowDays} days` : "") +
      (cm.exclusions ? `; exclusions: ${cm.exclusions}` : "") + (cm.refunds ? `; refunds/chargebacks: ${cm.refunds}` : "") +
      (cm.expiry ? `; ends: ${cm.expiry}` : "")
    : "None.";
  return {
    scope: [c.solution, c.scope].filter(Boolean).join("\n\n"),
    exclusions: c.exclusions,
    deliverables: c.deliverables || c.lines.map(l => `${l.name}${l.description ? ": " + l.description : ""}`).join("\n"),
    milestones: [c.timeline, c.dependencies ? "Client dependencies: " + c.dependencies : ""].filter(Boolean).join("\n"),
    setupFee: centsToString(t.oneTimeCents),
    monthlyFee: centsToString(t.monthlyCents),
    adSpend: c.thirdPartyCosts || "Paid directly by client unless a signed budget authorizes otherwise.",
    commission,
    specialTerms: `Based on accepted quote ${quoteNumber} v${version}.` + (c.terms ? " " + c.terms : ""),
    clientEmail: c.client.email,
    clientAddress: c.client.address,
    services: [...new Set(c.lines.map(l => l.code).filter((x): x is string => !!x))],
  };
}
