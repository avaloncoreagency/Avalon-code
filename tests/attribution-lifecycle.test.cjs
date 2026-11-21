// Pure checks for src/lib/sales/attribution.ts (mirrors the SQL lifecycle; the database is the guard).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const src = fs.readFileSync("src/lib/sales/attribution.ts", "utf8");
const m = { exports: {} };
new Function("module", "exports", "require", ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(m, m.exports, require);
const { commissionDueCents, attributionActions, ATTRIBUTION_STATES } = m.exports;

test("commission arithmetic matches the generated column in exact cents", () => {
  assert.equal(commissionDueCents("10000.00", "0", "5"), 50000, "$10,000 at 5% = $500.00");
  assert.equal(commissionDueCents("1000.00", "200.00", "5"), 4000, "exclusions reduce the base");
  assert.equal(commissionDueCents("100.00", "20.00", "15"), 1200);
  assert.equal(commissionDueCents("0.33", "0", "50"), 17, "half away from zero, like PostgreSQL round()");
  for (const bad of [["0", "0", "5"], ["100", "100", "5"], ["100", "0", "0"], ["abc", "0", "5"], ["100", "0", "101"]]) {
    assert.equal(commissionDueCents(...bad), null, `invalid → N/D (${bad})`);
  }
});

test("UI actions follow the SQL lifecycle and never offer skipping, reopening paid or voiding paid", () => {
  const next = s => attributionActions(s).map(a => a.to);
  assert.deepEqual(next("reported"), ["client_paid_verified", "disputed", "void"]);
  assert.deepEqual(next("client_paid_verified"), ["attribution_verified", "disputed", "void"]);
  assert.deepEqual(next("attribution_verified"), ["eligible", "disputed", "void"]);
  assert.deepEqual(next("eligible"), ["invoiced", "disputed", "void"]);
  assert.deepEqual(next("verified"), ["invoiced", "disputed", "void"], "legacy rows continue");
  assert.deepEqual(next("invoiced"), ["paid", "disputed", "void"]);
  assert.deepEqual(next("paid"), []);
  assert.deepEqual(next("void"), []);
  assert.deepEqual(attributionActions("disputed", "eligible").map(a => a.to), ["eligible", "void"]);
  const sql = fs.readFileSync("supabase/migrations/20261121181000_crm_attribution_lifecycle.sql", "utf8");
  for (const state of ATTRIBUTION_STATES) assert.match(sql, new RegExp(`'${state}'`), `${state} exists in the database constraint`);
});

test("results page uses the versioned lifecycle RPC and labels customer revenue as not Avalon revenue", () => {
  const action = fs.readFileSync("src/app/admin/workspace/crm/clients/[id]/results/actions.ts", "utf8");
  const page = fs.readFileSync("src/app/admin/workspace/crm/clients/[id]/results/page.tsx", "utf8");
  assert.match(action, /crm_attribution_advance/);
  assert.match(action, /p_expected_version:version/);
  assert.match(action, /\.eq\("client_id",client\)/, "no cross-client transition");
  assert.match(page, /no es ingreso de Avalon/);
  assert.match(page, /name="version"/);
});
