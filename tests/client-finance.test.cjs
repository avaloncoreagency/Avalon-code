// Client 360° finance contract (HARU, issue #98 T1). Pure functions + synthetic rows: no DB, network or secrets.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const js = ts.transpileModule(fs.readFileSync("src/lib/sales/client-finance.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", js)(mod, mod.exports);
const { loadAllRows, summarizeClientFinance, financeNotice, toCents, emptyLoaded, FINANCE_PAGE_SIZE, FINANCE_MAX_PAGES } = mod.exports;

const sales = n => Array.from({ length: n }, (_, i) => ({ id: "s" + i, currency: "USD", total: "100.00", recurring_monthly: "0.00", status: "confirmed", contract_status: "signed", crm_payments: [{ amount: "100.00" }] }));
const costs = n => Array.from({ length: n }, (_, i) => ({ id: "c" + i, currency: "USD", amount: "10.00" }));

/** PostgREST-like paged source. `cap` simulates the server's max-rows being SMALLER than our page size. */
function source(rows, { cap = Infinity, count = true, failAtCall = null } = {}) {
  const calls = [];
  const fetchPage = async (from, to) => {
    calls.push([from, to]);
    if (failAtCall !== null && calls.length === failAtCall) return { data: null, error: { message: "boom" } };
    const data = rows.slice(from, Math.min(to + 1, from + cap));
    return { data, error: null, count: count ? rows.length : null };
  };
  return { fetchPage, calls };
}
const read = async (rows, opts) => loadAllRows(source(rows, opts).fetchPage);
const money = c => (c / 100).toFixed(2);

test("toCents is exact and rejects anything that is not an amount", () => {
  assert.equal(toCents("100.00"), 10000);
  assert.equal(toCents("0.30"), 30);
  assert.equal(toCents("-12.5"), -1250);
  assert.equal(toCents(0.1 + 0.2), 30, "float noise is rounded away");
  for (const bad of ["", "abc", "1,5", "1e3", "12.345", null, undefined, NaN, {}]) assert.equal(toCents(bad), null, String(bad));
});

test("101 sales and 201 expenses: every row is read and profit is the TRUE total (8,090.00), never 8,000.00", async () => {
  const s = await read(sales(101)), c = await read(costs(201));
  assert.equal(s.rows.length, 101); assert.equal(c.rows.length, 201);
  assert.deepEqual([s.complete, c.complete], [true, true]);
  const summary = summarizeClientFinance({ sales: s, costs: c });
  assert.equal(summary.complete, true);
  const usd = summary.currencies[0];
  assert.equal(money(usd.collectedCents), "10100.00");
  assert.equal(money(usd.expensesCents), "2010.00");
  assert.equal(money(usd.profitCents), "8090.00");
  assert.notEqual(money(usd.profitCents), "8000.00", "the truncated 100 x 100 - 200 x 10 result");
  assert.equal(financeNotice(summary, "es"), null);
});

test("a server whose max-rows is smaller than our page still yields every row (next page starts at rows.length)", async () => {
  const src = source(sales(101), { cap: 100 });
  const loaded = await loadAllRows(src.fetchPage);
  assert.equal(loaded.rows.length, 101);
  assert.equal(loaded.complete, true);
  assert.deepEqual(src.calls.map(([from]) => from), [0, 100], "second request starts at 100, not at the page size");
  assert.ok(new Set(loaded.rows.map(r => r.id)).size === 101, "no row skipped or duplicated");
});

test("without a server count a full page keeps reading and a short page ends the read", async () => {
  const exactlyOnePage = await read(costs(FINANCE_PAGE_SIZE), { count: false });
  assert.equal(exactlyOnePage.rows.length, FINANCE_PAGE_SIZE);
  assert.equal(exactlyOnePage.complete, true, "the follow-up page is empty, which proves the end");
  const more = await read(costs(FINANCE_PAGE_SIZE + 1), { count: false });
  assert.equal(more.rows.length, FINANCE_PAGE_SIZE + 1);
  assert.equal(more.complete, true);
});

test("a failed page is reported as failed: no profit, only a labelled subtotal", async () => {
  const s = await read(sales(101)), c = await loadAllRows(source(costs(201), { failAtCall: 1 }).fetchPage);
  assert.equal(c.failed, true); assert.equal(c.complete, false);
  const summary = summarizeClientFinance({ sales: s, costs: c });
  assert.equal(summary.complete, false);
  assert.ok(summary.issues.includes("costs_failed"));
  assert.equal(summary.currencies[0].profitCents, null, "never a profit from partial data");
  assert.equal(money(summary.currencies[0].subtotalProfitCents), "10100.00", "the subtotal exists but is a different field");
  assert.match(financeNotice(summary, "es"), /No se pudieron leer los gastos.*no se calcula.*subtotal/);
  assert.match(financeNotice(summary, "en"), /Expenses could not be read.*not calculated.*subtotal/);
});

test("reaching the safety ceiling is partial, never silently truncated", async () => {
  const huge = Array.from({ length: FINANCE_PAGE_SIZE * FINANCE_MAX_PAGES + 7 }, (_, i) => ({ id: "c" + i, currency: "USD", amount: "1.00" }));
  const loaded = await read(huge);
  assert.equal(loaded.complete, false);
  assert.equal(loaded.rows.length, FINANCE_PAGE_SIZE * FINANCE_MAX_PAGES);
  const summary = summarizeClientFinance({ sales: emptyLoaded(), costs: loaded });
  assert.equal(summary.complete, false);
  assert.match(financeNotice(summary, "es"), /Se leyeron 10000 de 10007 gastos/);
  assert.equal(summary.currencies[0].profitCents, null);
});

test("the legacy truncation is detectable: 100 of 101 sales and 200 of 201 expenses are reported as partial", () => {
  const truncated = { rows: sales(100), complete: false, failed: false, total: 101 };
  const truncatedCosts = { rows: costs(200), complete: false, failed: false, total: 201 };
  const summary = summarizeClientFinance({ sales: truncated, costs: truncatedCosts });
  assert.equal(summary.complete, false);
  assert.deepEqual([...summary.issues].sort(), ["costs_partial", "sales_partial"]);
  assert.equal(summary.currencies[0].profitCents, null);
  assert.equal(money(summary.currencies[0].subtotalProfitCents), "8000.00", "this is the subtotal that used to be shown as profit");
  assert.match(financeNotice(summary, "es"), /Se leyeron 100 de 101 ventas\. Se leyeron 200 de 201 gastos\./);
});

test("empty states are honest: no rows is 'empty', not a zero profit", () => {
  const summary = summarizeClientFinance({ sales: emptyLoaded(), costs: emptyLoaded() });
  assert.equal(summary.empty, true); assert.equal(summary.complete, true);
  assert.deepEqual(summary.currencies, []);
  assert.equal(financeNotice(summary, "es"), null);
});

test("expenses without sales are a complete negative result; adjustments (negative expenses) reduce expenses", () => {
  const onlyCosts = summarizeClientFinance({ sales: emptyLoaded(), costs: { rows: [{ id: "a", currency: "USD", amount: "250.00" }, { id: "b", currency: "USD", amount: "-50.00" }], complete: true, failed: false, total: 2 } });
  const usd = onlyCosts.currencies[0];
  assert.equal(money(usd.expensesCents), "200.00");
  assert.equal(money(usd.profitCents), "-200.00");
  assert.equal(usd.sales, 0);
});

test("cancelled sales do not count (same rule as crm_sales_metrics); cancelled contracts are disclosed", () => {
  const rows = [...sales(2), { id: "x", currency: "USD", total: "999.00", recurring_monthly: "50.00", status: "cancelled", contract_status: "cancelled", crm_payments: [{ amount: "999.00" }] },
    { id: "y", currency: "USD", total: "100.00", recurring_monthly: "0.00", status: "confirmed", contract_status: "cancelled", crm_payments: [] }];
  const summary = summarizeClientFinance({ sales: { rows, complete: true, failed: false, total: 4 }, costs: emptyLoaded() });
  const usd = summary.currencies[0];
  assert.equal(usd.sales, 3, "the status = cancelled sale is excluded");
  assert.equal(money(usd.contractedCents), "300.00");
  assert.equal(money(usd.collectedCents), "200.00");
  assert.equal(usd.cancelledContracts, 1, "a confirmed sale with a cancelled contract is counted but disclosed");
});

test("currencies are never mixed or converted", () => {
  const rows = [{ id: "1", currency: "USD", total: "100.00", recurring_monthly: "0", crm_payments: [{ amount: "100.00" }] }, { id: "2", currency: "eur", total: "80.00", recurring_monthly: "0", crm_payments: [{ amount: "40.00" }] }];
  const summary = summarizeClientFinance({ sales: { rows, complete: true, failed: false, total: 2 }, costs: { rows: [{ id: "c", currency: "EUR", amount: "10.00" }], complete: true, failed: false, total: 1 } });
  assert.deepEqual(summary.currencies.map(c => c.currency), ["EUR", "USD"]);
  assert.equal(money(summary.currencies[0].profitCents), "30.00");
  assert.equal(money(summary.currencies[1].profitCents), "100.00");
});

test("exact cents: ten payments of 0.10 are 1.00, and an unreadable amount blocks the profit", () => {
  const payments = Array.from({ length: 10 }, () => ({ amount: "0.10" }));
  const ok = summarizeClientFinance({ sales: { rows: [{ id: "1", currency: "USD", total: "1.00", recurring_monthly: "0", crm_payments: payments }], complete: true, failed: false, total: 1 }, costs: emptyLoaded() });
  assert.equal(ok.currencies[0].collectedCents, 100);
  const bad = summarizeClientFinance({ sales: { rows: [{ id: "1", currency: "USD", total: "abc", recurring_monthly: "0", crm_payments: [] }], complete: true, failed: false, total: 1 }, costs: emptyLoaded() });
  assert.ok(bad.issues.includes("invalid_amount"));
  assert.equal(bad.currencies[0].profitCents, null);
  assert.match(financeNotice(bad, "es"), /importes que no se pueden interpretar/);
});

test("the helper is pure: no I/O, secrets or randomness", () => {
  const src = fs.readFileSync("src/lib/sales/client-finance.ts", "utf8");
  assert.doesNotMatch(src, /process\.env|fetch\(|Math\.random|Date\.now|from "node:|supabase/i);
});
