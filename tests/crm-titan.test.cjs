// CRM TITAN pure helpers: duplicate candidate arguments, SQL finance aggregate → FinanceSummary, Radar failure codes.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(file) {
  const js = ts.transpileModule(fs.readFileSync(path.resolve(file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", js)(require, mod, mod.exports);
  return mod.exports;
}
const D = load("src/lib/crm/intel/duplicates.ts");
const F = load("src/lib/sales/client-finance.ts");

test("duplicate candidate args: normalized phone, e-mail, business domain (free mail ignored), raw name", () => {
  assert.deepEqual(D.duplicateCandidateArgs({ company: "Brisa Fría, LLC", phone: "+1 (954) 555-0101", email: " Ops@Brisa.example ", website: "" }),
    { p_phone: "9545550101", p_email: "ops@brisa.example", p_domain: "brisa.example", p_name: "Brisa Fría, LLC" });
  assert.equal(D.duplicateCandidateArgs({ company: "X", phone: "", email: "ana@gmail.com", website: "" }).p_domain, "", "free mail is not a business domain");
  assert.equal(D.duplicateCandidateArgs({ company: "X", phone: "", email: null, website: "www.shop.example/path" }).p_domain, "shop.example");
});

const agg = (currencies, extra = {}) => ({ client_id: "c", complete: true, source: "sql_aggregate", sales_confirmed: 104, sales_cancelled: 1, costs: 203, as_of: "", currencies, ...extra });
const row = (currency, collected, expenses, more = {}) => ({ currency, sales: 1, costs: 1, contracted: collected, collected, recurring_monthly: "0", expenses, profit: "0", cancelled_contracts: 0, ...more });

test("finance aggregate → summary: exact cents per currency, never mixed", () => {
  const s = F.summaryFromAggregate(agg([row("usd", "3370.37", "223.11"), row("EUR", "50.05", "-10.00")]));
  assert.equal(s.complete, true);
  assert.deepEqual(s.currencies.map(c => [c.currency, c.profitCents]), [["EUR", 6005], ["USD", 314726]]);
  assert.deepEqual([s.salesRead, s.salesTotal, s.costsRead, s.costsTotal], [104, 104, 203, 203]);
  assert.equal(F.financeNotice(s, "es"), null);
});

test("finance aggregate: an amount that cannot be represented exactly makes profit null (subtotal, never a guess)", () => {
  const bad = F.summaryFromAggregate(agg([row("USD", "not-a-number", "1.00")]));
  assert.equal(bad.complete, false);
  assert.equal(bad.currencies[0].profitCents, null);
  assert.ok(bad.issues.includes("invalid_amount"));
  assert.match(F.financeNotice(bad, "es"), /subtotal/);
  const huge = F.summaryFromAggregate(agg([row("USD", "999999999999999.99", "0")]));
  assert.ok(huge.issues.includes("amount_overflow") && huge.currencies[0].profitCents === null);
  const partial = F.summaryFromAggregate(agg([row("USD", "1.00", "0")], { complete: false }));
  assert.equal(partial.complete, false);
  assert.equal(F.summaryFromAggregate(agg([], { sales_confirmed: 0, costs: 0 })).empty, true, "no rows → empty, not zero profit");
});

test("radar failure codes are fixed values, never the provider's message", () => {
  const src = fs.readFileSync("src/lib/crm/radar-search.ts", "utf8");
  const codes = [...src.matchAll(/"(provider_[a-z_]+|ingest_failed)"/g)].map(m => m[1]);
  const sql = fs.readFileSync("supabase/migrations/20261112090000_crm_titan_backend.sql", "utf8");
  for (const c of new Set(codes)) assert.ok(sql.includes(`'${c}'`), `${c} is accepted by crm_radar_record_failure`);
  assert.doesNotMatch(src, /record_failure[^;]*(res\.statusText|await res\.text|cause\.message)/, "raw provider text is never stored");
});

test("finance authorization is a database capability, not an e-mail comparison", () => {
  const server = fs.readFileSync("src/lib/sales/client-finance-server.ts", "utf8");
  assert.match(server, /crm_my_capabilities/);
  assert.doesNotMatch(server, /@gmail\.com|user\.email/);
});
