// HQ executive metrics never publish a capped read as a 7-day total (KENJI #47 / #132).
// Synthetic rows only: no server, browser, Supabase or client data. The route is transpiled and run with an injected
// query builder that honours .limit() and can answer an exact head COUNT, like PostgREST does.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const ROUTE = "src/app/admin/workspace/crm/office/executive/route.ts";
const MANAGERS = ["ren", "shin", "haru", "sora", "kenji"];
const run = (i, status = "completed") => ({
  id: String(i), manager_key: MANAGERS[i % 5], task_title: "Synthetic run " + i, status, trigger: i % 2 ? "schedule" : "manual",
  created_at: new Date(Date.UTC(2026, 10, 5, 10, 0, 0) - i * 1000).toISOString(), finished_at: null, error_code: null, evidence_refs: [{ type: "synthetic" }],
});

async function call(sources, { counts = true } = {}) {
  const calls = [];
  const builder = (table, rows) => {
    let data = rows, head = false, count = null;
    const q = {
      select(_cols, opts) { if (opts?.head) { head = true; count = counts ? rows.length : undefined; } calls.push({ table, head }); return q; },
      gte: () => q, eq: () => q, order: () => q,
      limit(n) { calls.at(-1).limit = n; data = data.slice(0, n); return q; },
      maybeSingle: async () => ({ data, error: null }),
      then(ok, ko) { return Promise.resolve(head ? { data: null, count, error: null } : { data, error: null }).then(ok, ko); },
    };
    return q;
  };
  const supabase = { from(table) { assert.ok(Object.hasOwn(sources, table), "unexpected source " + table); return builder(table, sources[table]); } };
  const js = ts.transpileModule(fs.readFileSync(ROUTE, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  const req = name => {
    if (name === "next/server") return { NextResponse: { json: (body, o = {}) => ({ body, status: o.status || 200 }) } };
    if (name === "@/lib/auth/session") return { getOwnerSession: async () => ({ supabase }) };
    throw new Error("unexpected dependency " + name);
  };
  vm.runInNewContext(js, { module: mod, exports: mod.exports, require: req, Date, Promise, Number, Object, Array });
  const res = await mod.exports.GET();
  // Plain JSON, as the browser receives it (also avoids cross-realm prototype mismatches in deepEqual).
  return { status: res.status, body: JSON.parse(JSON.stringify(res.body)), calls };
}
const base = rows => ({ crm_agent_runs: rows, crm_agent_missions: [], crm_agent_settings: { kill_switch: false, automatic_enabled: true }, crm_ai_usage: [] });

test("exactly 500 runs: complete, totals are real, no extra COUNT query", async () => {
  const r = await call(base(Array.from({ length: 500 }, (_, i) => run(i))));
  assert.equal(r.status, 200);
  assert.equal(r.body.runs.complete, true);
  assert.equal(r.body.data_complete, true);
  assert.equal(r.body.runs.received, 500);
  assert.equal(r.body.runs.completed, 500);
  assert.equal(r.body.runs.scheduled, 250);
  assert.equal(r.body.by_manager.ren.total, 100);
  assert.equal(r.body.runs.sample, undefined);
  assert.equal(r.calls.find(c => c.table === "crm_agent_runs").limit, 501, "one extra row is read to detect the cap");
  assert.ok(!r.calls.some(c => c.head), "no COUNT when the read was complete");
});

test("1,234 runs: received is the exact COUNT; per-status totals are null; the newest 500 are a labelled sample", async () => {
  const rows = Array.from({ length: 1234 }, (_, i) => run(i, i < 3 ? "failed" : "completed"));
  const r = await call(base(rows));
  const { runs } = r.body;
  assert.equal(r.body.data_complete, false);
  assert.equal(runs.complete, false);
  assert.equal(runs.partial, true);
  assert.equal(runs.received, 1234, "exact head COUNT, not the 500-row sample");
  for (const k of ["pending", "active", "completed", "completed_with_evidence", "failed_or_blocked", "scheduled"]) assert.equal(runs[k], null, k + " must not be a sample posing as a total");
  assert.equal(runs.sample.size, 500);
  assert.equal(runs.sample.failed_or_blocked, 3);
  assert.equal(runs.sample.completed, 497);
  assert.deepEqual(r.body.by_manager.ren, { total: null, completed: null, failed: null });
  assert.equal(r.body.by_manager_sample.ren.total, 100);
  assert.equal(r.body.recent.length, 8, "newest-first lists stay valid");
  assert.equal(r.body.errors.length, 3);
});

test("capped and the COUNT is unavailable: received is null (Sin datos), never 500", async () => {
  const r = await call(base(Array.from({ length: 501 }, (_, i) => run(i))), { counts: false });
  assert.equal(r.body.runs.received, null);
  assert.equal(r.body.runs.partial, true);
});

test("missions over the cap: exact COUNT total, completed unknown", async () => {
  const sources = base([run(1)]);
  sources.crm_agent_missions = Array.from({ length: 260 }, (_, i) => ({ id: String(i), status: "completed", created_at: "2026-11-05T10:00:00.000Z" }));
  const r = await call(sources);
  assert.deepEqual(r.body.missions, { total: 260, completed: null, complete: false });
  assert.equal(r.body.data_complete, false);
  assert.equal(r.body.runs.complete, true);
});
