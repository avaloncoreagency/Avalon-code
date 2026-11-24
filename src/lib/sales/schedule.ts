/**
 * Sales Pro payment schedule (pure). Money is handled in integer CENTS end to end: no floating-point sums.
 * The database (crm_sale_schedule_set, payment_guard, crm_sale_receivables) is authoritative; these helpers only
 * propose a schedule from the agreed plan (#323), validate it before submission and present per-installment state.
 */
import { installmentSchedule, type SalePaymentTerms } from "./payment-terms";

export const INSTALLMENT_KINDS = ["deposit", "installment", "balance", "milestone", "recurring"] as const;
export type InstallmentKind = typeof INSTALLMENT_KINDS[number];
export type ScheduleItem = { kind: InstallmentKind; due_on: string; amount: string; label: string };
export type InstallmentRow = { id: string; seq: number; kind: string; label: string; due_on: string; amount: string; status: string };
export type PaymentRow = { id: string; amount: string; status?: string | null; installment_id?: string | null; received_on: string };
export type Receivable = { total: string; recorded: string; verified: string; refunded: string; net_collected: string; balance: string;
  overdue: string; next_due: string | null; installments: number; open_chargebacks: number };

const DECIMAL = /^[0-9]{1,13}(\.[0-9]{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_ITEMS = 60;

/** Strict decimal string (or a finite number with ≤2 decimals) → integer cents; null when not exact money. */
export function toCents(value: string | number): number | null {
  const text = typeof value === "number" ? (Number.isFinite(value) ? value.toFixed(2) : "") : value.trim();
  if (!DECIMAL.test(text)) return null;
  const [int, frac = ""] = text.split(".");
  return Number(int) * 100 + Number((frac + "00").slice(0, 2));
}
export const fromCents = (cents: number) => `${cents < 0 ? "-" : ""}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;

const realDate = (d: string) => DATE.test(d) && new Date(d + "T00:00:00Z").toISOString().slice(0, 10) === d;
export function addDays(date: string, days: number) {
  return new Date(Date.parse(date + "T00:00:00Z") + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Propose a schedule from the agreed plan recorded with the sale. Always sums exactly to the contracted total.
 * Returns [] when the plan needs a human decision (to agree / milestones): the editor then starts empty.
 */
export function proposeSchedule(input: { total: string; upfront: string; soldOn: string; terms: SalePaymentTerms | null }): ScheduleItem[] {
  const total = toCents(input.total), upfront = toCents(input.upfront) ?? 0;
  if (total === null || total <= 0 || !realDate(input.soldOn) || upfront > total) return [];
  const t = input.terms;
  const net = t?.netDays ?? 0;
  const due = (days: number) => addDays(input.soldOn, Math.max(0, days));
  const deposit: ScheduleItem[] = upfront > 0 ? [{ kind: "deposit", due_on: input.soldOn, amount: fromCents(upfront), label: "" }] : [];
  if (!t || t.schedule === "to_agree" || t.schedule === "milestones") return [];
  if (t.schedule === "full") return [{ kind: "balance", due_on: due(net), amount: fromCents(total), label: "" }];
  if (t.schedule === "subscription") return [{ kind: "recurring", due_on: due(net), amount: fromCents(total), label: "" }];
  const rest = (label: string): ScheduleItem[] =>
    [...deposit, { kind: "balance" as const, due_on: due(net || 30), amount: fromCents(total - upfront), label }].filter(i => toCents(i.amount)! > 0);
  if (t.schedule === "external_financing") return rest(t.externalProvider.slice(0, 200));
  if (t.schedule === "deposit_balance") return rest("");
  // installments: #323's indicative split, converted to cents and re-balanced so the sum is exact.
  const rows = installmentSchedule(Number(fromCents(total)), Number(fromCents(upfront)), t) ?? [];
  if (!rows.length) return [];
  const cents = rows.map(r => Math.round(r.amount * 100));
  cents[cents.length - 1] += (total - upfront) - cents.reduce((a, b) => a + b, 0);
  return [...deposit, ...rows.map((r, i) => ({ kind: "installment" as const, due_on: r.dueOn < input.soldOn ? input.soldOn : r.dueOn, amount: fromCents(cents[i]), label: "" }))];
}

export type ScheduleError = "schedule_empty" | "schedule_too_long" | "schedule_invalid" | "schedule_invalid_date" | "schedule_invalid_amount" | "schedule_total_mismatch";
/** Mirrors the database rules so the editor can explain problems before submitting. `lockedCents` = funded installments kept. */
export function validateSchedule(items: ScheduleItem[], totalCents: number, soldOn: string, lockedCents = 0): ScheduleError | null {
  if (!items.length && lockedCents === 0) return "schedule_empty";
  if (items.length > MAX_ITEMS) return "schedule_too_long";
  let sum = 0;
  for (const i of items) {
    if (!(INSTALLMENT_KINDS as readonly string[]).includes(i.kind) || i.label.length > 200) return "schedule_invalid";
    if (!realDate(i.due_on) || i.due_on < soldOn) return "schedule_invalid_date";
    const c = toCents(i.amount);
    if (c === null || c <= 0) return "schedule_invalid_amount";
    sum += c;
  }
  return sum + lockedCents === totalCents ? null : "schedule_total_mismatch";
}

export type InstallmentState = InstallmentRow & { allocatedCents: number; coveredCents: number; remainingCents: number;
  state: "paid" | "partial" | "overdue" | "due" | "cancelled"; funded: boolean };
/**
 * Same coverage rule as the crm_sale_receivables view: receipts allocated to an installment count for it first; receipts
 * without an installment cover the remaining gaps in due-date order. Reversed receipts never count.
 */
export function installmentStates(rows: InstallmentRow[], payments: PaymentRow[], today: string): InstallmentState[] {
  const live = payments.filter(p => p.status !== "reversed");
  let pool = live.filter(p => !p.installment_id).reduce((s, p) => s + (toCents(p.amount) ?? 0), 0);
  const sorted = [...rows].sort((a, b) => a.due_on.localeCompare(b.due_on) || a.seq - b.seq);
  return sorted.map(r => {
    const amount = toCents(r.amount) ?? 0;
    const allocated = live.filter(p => p.installment_id === r.id).reduce((s, p) => s + (toCents(p.amount) ?? 0), 0);
    if (r.status !== "scheduled") return { ...r, allocatedCents: allocated, coveredCents: 0, remainingCents: 0, state: "cancelled" as const, funded: allocated > 0 };
    const fromPool = Math.min(pool, Math.max(amount - allocated, 0));
    pool -= fromPool;
    const covered = Math.min(amount, allocated + fromPool), remaining = amount - covered;
    const state = remaining === 0 ? "paid" : r.due_on < today ? "overdue" : covered > 0 ? "partial" : "due";
    return { ...r, allocatedCents: allocated, coveredCents: covered, remainingCents: remaining, state, funded: allocated > 0 };
  });
}

export type PaymentStatus = "unpaid" | "partially_paid" | "paid" | "overdue" | "refunded" | "disputed";
/** One commercial-facing payment status per sale, derived from the receivables view. Disputes win, then refunds. */
export function paymentStatus(r: Pick<Receivable, "recorded" | "refunded" | "net_collected" | "balance" | "overdue" | "open_chargebacks">): PaymentStatus {
  const recorded = toCents(r.recorded) ?? 0, refunded = toCents(r.refunded) ?? 0, net = toCents(r.net_collected) ?? 0;
  const balance = Number(r.balance), overdue = Number(r.overdue);
  if (r.open_chargebacks > 0) return "disputed";
  if (recorded > 0 && refunded > 0 && net <= 0) return "refunded";
  if (balance <= 0) return "paid";
  if (overdue > 0) return "overdue";
  return net > 0 ? "partially_paid" : "unpaid";
}
