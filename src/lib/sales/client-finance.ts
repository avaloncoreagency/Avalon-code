/**
 * Client 360° finance: pure, side-effect-free contract.
 *
 * Why it exists: the dossier read sales with .limit(100) and expenses with .limit(200) and then showed
 * "collected − expenses" as the client's profitability. A client with 101 sales or 201 expenses silently got a
 * subtotal presented as the full result. Rules enforced here:
 *  1. Rows are read in pages until the EXACT server count is reached (never trusting a page size).
 *  2. A figure is "complete" only if every source was fully read without error. Otherwise profit is null and the
 *     partial subtotal is exposed under its own name, so a UI cannot mistake it for the total.
 *  3. Arithmetic is done in integer cents (0.1 + 0.2 must be 0.30).
 *  4. Only confirmed sales count, like the dashboard RPC crm_sales_metrics (status = 'confirmed').
 *  5. Currencies are never mixed or converted.
 *  6. Nothing is estimated: no rows → "empty", not zero profit.
 */

export type MoneyLike = string | number | null | undefined;
export type FinanceSale = {
  id: string; currency: string; total: MoneyLike; recurring_monthly: MoneyLike;
  status?: string | null; contract_status?: string | null; crm_payments?: { amount: MoneyLike }[] | null;
};
export type FinanceCost = { id: string; currency: string; amount: MoneyLike };

export const FINANCE_PAGE_SIZE = 500;
/** Hard ceiling (10,000 rows per source). Reaching it is reported as partial, never silently cut. */
export const FINANCE_MAX_PAGES = 20;

export type PageResult<T> = { data: T[] | null; error?: unknown; count?: number | null };
export type Loaded<T> = {
  rows: T[]; complete: boolean; failed: boolean;
  /** Exact number of rows the server says exist, when it said so. */
  total: number | null;
};

/**
 * Reads every page of a query. `fetchPage(from, to)` must apply `.range(from, to)` and request an exact count.
 * The next page always starts at rows.length, so a server-side max-rows cap smaller than our page size cannot
 * make us skip rows or conclude early.
 */
export async function loadAllRows<T>(fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<Loaded<T>> {
  const rows: T[] = [];
  let total: number | null = null;
  for (let page = 0; page < FINANCE_MAX_PAGES; page++) {
    const from = rows.length;
    let result: PageResult<T>;
    try { result = await fetchPage(from, from + FINANCE_PAGE_SIZE - 1); } catch { return { rows, complete: false, failed: true, total }; }
    if (result.error || !Array.isArray(result.data)) return { rows, complete: false, failed: true, total };
    if (typeof result.count === "number") total = result.count;
    rows.push(...result.data);
    if (total !== null) {
      if (rows.length >= total) return { rows, complete: true, failed: false, total };
      if (result.data.length === 0) return { rows, complete: false, failed: false, total }; // server stopped early
    } else if (result.data.length < FINANCE_PAGE_SIZE) {
      return { rows, complete: true, failed: false, total: rows.length }; // no count available: a short page is the end
    }
  }
  return { rows, complete: false, failed: false, total };
}

export const emptyLoaded = <T,>(): Loaded<T> => ({ rows: [], complete: true, failed: false, total: 0 });

export type FinanceIssue = "sales_partial" | "costs_partial" | "sales_failed" | "costs_failed" | "invalid_amount" | "amount_overflow";
export type CurrencyFinance = {
  currency: string; sales: number; costs: number;
  contractedCents: number; collectedCents: number; recurringCents: number; expensesCents: number;
  /** Confirmed sales whose contract was cancelled: still counted (like the dashboard) but disclosed. */
  cancelledContracts: number;
  /** collected − expenses. NULL unless every source was read completely and every amount was valid. */
  profitCents: number | null;
  /** collected − expenses over the rows actually read. Always labelled "subtotal" by callers when !complete. */
  subtotalProfitCents: number;
};
export type FinanceSummary = {
  currencies: CurrencyFinance[]; complete: boolean; empty: boolean; issues: FinanceIssue[];
  salesRead: number; salesTotal: number | null; costsRead: number; costsTotal: number | null;
};

const AMOUNT = /^-?\d{1,15}(\.\d{1,2})?$/;
/** Exact cents from a numeric(15,2) string (or finite number); null when it is not a valid amount. */
export function toCents(value: MoneyLike): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!AMOUNT.test(text)) return null;
  const negative = text.startsWith("-");
  const [whole, frac = ""] = text.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -cents : cents;
}

export function summarizeClientFinance(input: { sales: Loaded<FinanceSale>; costs: Loaded<FinanceCost> }): FinanceSummary {
  const { sales, costs } = input;
  const issues = new Set<FinanceIssue>();
  if (sales.failed) issues.add("sales_failed"); else if (!sales.complete) issues.add("sales_partial");
  if (costs.failed) issues.add("costs_failed"); else if (!costs.complete) issues.add("costs_partial");

  const by = new Map<string, CurrencyFinance>();
  const row = (currency: string) => {
    const key = String(currency || "").toUpperCase();
    let v = by.get(key);
    if (!v) by.set(key, v = { currency: key, sales: 0, costs: 0, contractedCents: 0, collectedCents: 0, recurringCents: 0, expensesCents: 0, cancelledContracts: 0, profitCents: null, subtotalProfitCents: 0 });
    return v;
  };
  const cents = (value: MoneyLike) => { const c = toCents(value); if (c === null) issues.add("invalid_amount"); return c ?? 0; };

  for (const sale of sales.rows) {
    if (sale.status === "cancelled") continue; // mirrors crm_sales_metrics (status = 'confirmed')
    const v = row(sale.currency);
    v.sales += 1;
    v.contractedCents += cents(sale.total);
    v.recurringCents += cents(sale.recurring_monthly);
    for (const payment of sale.crm_payments ?? []) v.collectedCents += cents(payment.amount);
    if (sale.contract_status === "cancelled") v.cancelledContracts += 1;
  }
  for (const cost of costs.rows) { const v = row(cost.currency); v.costs += 1; v.expensesCents += cents(cost.amount); }

  const list = [...by.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  for (const v of list) {
    for (const n of [v.contractedCents, v.collectedCents, v.recurringCents, v.expensesCents]) if (!Number.isSafeInteger(n)) issues.add("amount_overflow");
    v.subtotalProfitCents = v.collectedCents - v.expensesCents;
  }
  const complete = issues.size === 0;
  for (const v of list) v.profitCents = complete ? v.subtotalProfitCents : null;
  return {
    currencies: list, complete, empty: list.length === 0 && complete, issues: [...issues],
    salesRead: sales.rows.length, salesTotal: sales.total, costsRead: costs.rows.length, costsTotal: costs.total,
  };
}

/** Honest, bilingual explanation shown whenever the figures are not complete. Null when they are. */
export function financeNotice(summary: FinanceSummary, lang: "es" | "en"): string | null {
  if (summary.complete) return null;
  const es = lang === "es";
  const parts: string[] = [];
  const count = (read: number, total: number | null) => (total !== null ? `${read} ${es ? "de" : "of"} ${total}` : String(read));
  if (summary.issues.includes("sales_failed")) parts.push(es ? "No se pudieron leer las ventas." : "Sales could not be read.");
  else if (summary.issues.includes("sales_partial")) parts.push(es ? `Se leyeron ${count(summary.salesRead, summary.salesTotal)} ventas.` : `Read ${count(summary.salesRead, summary.salesTotal)} sales.`);
  if (summary.issues.includes("costs_failed")) parts.push(es ? "No se pudieron leer los gastos." : "Expenses could not be read.");
  else if (summary.issues.includes("costs_partial")) parts.push(es ? `Se leyeron ${count(summary.costsRead, summary.costsTotal)} gastos.` : `Read ${count(summary.costsRead, summary.costsTotal)} expenses.`);
  if (summary.issues.includes("invalid_amount") || summary.issues.includes("amount_overflow"))
    parts.push(es ? "Hay importes que no se pueden interpretar con seguridad." : "Some amounts cannot be interpreted safely.");
  parts.push(es ? "La rentabilidad no se calcula hasta tener los datos completos; lo mostrado es un subtotal." : "Profitability is not calculated until the data is complete; what is shown is a subtotal.");
  return parts.join(" ");
}
