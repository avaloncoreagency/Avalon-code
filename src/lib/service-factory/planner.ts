/**
 * Avalon internal Solution Planner: strict form parsing and estimates.
 * Calculations are advisory, in USD, grouped by billing cadence.
 * A blank price/cost/hourly rate stays UNKNOWN — it is never treated as zero.
 * No client-side provider/API call, payment, external notification or sale.
 */
export type BillingCycle = 'one_time' | 'monthly' | 'annual';
export type PlanFormLine = { service_id: string; quantity: number; unit_price: string | null };
export type PlanInput = {
  idempotency_key: string;
  client_id?: string;
  title: string; industry: string; problem: string; objective: string;
  assumptions: string; currency: 'USD'; hourly_rate: string | null;
  contingency_percent: string; lines: PlanFormLine[];
};
export type PlanInputError = 'missing' | 'invalid' | 'amount' | 'duplicate' | 'too_long' | 'lines';
export class InvalidPlan extends Error {
  constructor(public code: PlanInputError) { super(code); }
}
type FormLike = { get(key: string): unknown };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
const DECIMAL = /^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$/;

function field(form: FormLike, key: string, limit: number, required = false) {
  const value = form.get(key);
  const s = typeof value === 'string' ? value.trim() : '';
  if (s.length > limit || CONTROLS.test(s)) throw new InvalidPlan('too_long');
  if (required && !s) throw new InvalidPlan('missing');
  return s;
}
function moneyInput(v: string, max: number, empty: boolean) {
  if (!v && empty) return null;
  if (!DECIMAL.test(v) || Number(v) > max) throw new InvalidPlan('amount');
  return v;
}
export function parseSolutionPlanForm(form: FormLike): PlanInput {
  const idempotency_key = field(form, 'idempotency_key', 36, true);
  if (!UUID.test(idempotency_key)) throw new InvalidPlan('invalid');
  const client_id = field(form, 'client_id', 36);
  if (client_id && !UUID.test(client_id)) throw new InvalidPlan('invalid');
  const title = field(form, 'title', 160, true);
  if (title.length < 3) throw new InvalidPlan('missing');
  const rate = field(form, 'hourly_rate', 20);
  const contingency = field(form, 'contingency_percent', 20) || '0';
  moneyInput(contingency, 40, false);
  if (rate) moneyInput(rate, 100000, false);
  const lines: PlanFormLine[] = [];
  const used = new Set<string>();
  for (let i = 0; i < 5; i++) {
    const service_id = field(form, `line_${i}_service`, 36);
    const quantity = field(form, `line_${i}_quantity`, 2);
    const unit_price = field(form, `line_${i}_price`, 20);
    if (!service_id) {
      // Empty slots may still carry their default quantity of 1.
      if (unit_price || (quantity && quantity !== '1')) throw new InvalidPlan('lines');
      continue;
    }
    if (!UUID.test(service_id)) throw new InvalidPlan('invalid');
    if (used.has(service_id)) throw new InvalidPlan('duplicate');
    used.add(service_id);
    if (!/^(10|[1-9])$/.test(quantity)) throw new InvalidPlan('lines');
    lines.push({ service_id, quantity: Number(quantity), unit_price: moneyInput(unit_price, 100000000, true) });
  }
  if (!lines.length) throw new InvalidPlan('lines');
  return {
    idempotency_key, ...(client_id ? { client_id } : {}),
    title,
    industry: field(form, 'industry', 120),
    problem: field(form, 'problem', 2000),
    objective: field(form, 'objective', 2000),
    assumptions: field(form, 'assumptions', 3000),
    currency: 'USD',
    hourly_rate: rate || null,
    contingency_percent: contingency,
    lines,
  };
}

export type EstimateLine = {
  billing_type: BillingCycle; quantity: number;
  unit_price: string | null; direct_cost: string | null;
  estimated_hours: string | null;
};
export type BillingEstimate = {
  billing_type: BillingCycle; services: number;
  revenueCents: number | null; directCostCents: number | null;
  laborCents: number | null; totalCostCents: number | null;
  marginCents: number | null; marginPercent: number | null;
};
const toCents = (text: string | null): number | null => {
  if (text === null || !/^\d+(\.\d{1,2})?$/.test(String(text))) return null;
  const [whole, fraction = ''] = String(text).split('.');
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(n) ? n : null;
};
/** Computes separate one-time/monthly/annual estimates; cannot sum unlike billing periods. */
export function estimateByCadence(lines: EstimateLine[], hourlyRate: string | null, contingencyPercent: string) {
  const result: BillingEstimate[] = [];
  for (const cadence of ['one_time', 'monthly', 'annual'] as const) {
    const rows = lines.filter(x => x.billing_type === cadence);
    if (!rows.length) continue;
    const laborRate = toCents(hourlyRate);
    const percent = toCents(contingencyPercent);
    let revenue = 0, directCost = 0, labor = 0;
    let priced = true, costed = true, hoursKnown = laborRate !== null;
    for (const row of rows) {
      if (!Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 10)
        throw new Error('Invalid estimate quantity');
      const price = toCents(row.unit_price), cost = toCents(row.direct_cost);
      const hours = toCents(row.estimated_hours);
      if (price === null) priced = false; else revenue += price * row.quantity;
      if (cost === null) costed = false; else directCost += cost * row.quantity;
      if (hours === null || laborRate === null) hoursKnown = false;
      else labor += Math.round(hours * laborRate * row.quantity / 100);
    }
    const totalCostCents = costed && hoursKnown && percent !== null
      ? directCost + labor + Math.round((directCost + labor) * percent / 10000)
      : null;
    const marginCents = priced && totalCostCents !== null ? revenue - totalCostCents : null;
    result.push({
      billing_type: cadence, services: rows.length,
      revenueCents: priced ? revenue : null,
      directCostCents: costed ? directCost : null,
      laborCents: hoursKnown ? labor : null,
      totalCostCents, marginCents,
      marginPercent: marginCents !== null && revenue > 0
        ? Math.round(marginCents / revenue * 1000) / 10 : null,
    });
  }
  return result;
}
export function showUsd(cents: number | null, lang: 'es' | 'en') {
  return cents === null ? (lang === 'es' ? 'Sin datos' : 'Unknown')
    : new Intl.NumberFormat(lang === 'es' ? 'es-US' : 'en-US',
        { style: 'currency', currency: 'USD' }).format(cents / 100);
}
