// KENJI #98: a second-page RLS denial must not certify a financial subtotal.
// Synthetic-only contract for HARU's client-finance helper; no remote I/O.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

test("KENJI: denied second ledger page leaves 100/200-row profit unverified", async () => {
  const path = "src/lib/sales/client-finance.ts";
  assert.ok(fs.existsSync(path), "HARU helper must be integrated before this contract can pass");
  const js = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(js, { module: mod, exports: mod.exports, Number, String, Array, Set, Map, Math });
  const { loadAllRows, summarizeClientFinance } = mod.exports;
  const salesRows = Array.from({ length: 101 }, (_, i) => ({
    id: "s" + i, currency: "USD", status: "confirmed", total: "100.00",
    recurring_monthly: "0.00", crm_payments: [{ amount: "100.00" }],
  }));
  const costRows = Array.from({ length: 201 }, (_, i) => ({
    id: "c" + i, currency: "USD", amount: "10.00",
  }));
  const deniedAfterFirst = (rows, cap) => async (from, to) => from >= cap
    ? { data: null, error: { code: "42501", message: "permission denied" }, count: null }
    : { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null, count: rows.length };
  const sales = await loadAllRows(deniedAfterFirst(salesRows, 100));
  const costs = await loadAllRows(deniedAfterFirst(costRows, 200));
  assert.equal(sales.rows.length, 100);
  assert.equal(costs.rows.length, 200);
  assert.equal(sales.failed, true);
  assert.equal(costs.failed, true);
  assert.equal(sales.complete, false);
  assert.equal(costs.complete, false);
  const summary = summarizeClientFinance({ sales, costs });
  assert.equal(summary.complete, false);
  assert.ok(summary.issues.includes("sales_failed"));
  assert.ok(summary.issues.includes("costs_failed"));
  assert.equal(summary.currencies.length, 1);
  assert.equal(summary.currencies[0].subtotalProfitCents, 800000);
  assert.equal(summary.currencies[0].profitCents, null,
    "USD 8,000 from first pages is not a verified profitability total");
});
