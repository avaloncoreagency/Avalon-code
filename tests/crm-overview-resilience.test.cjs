// HARU-001: independent failure handling for CRM KPI and AI-usage panels.
// No network, secrets, live clients, Supabase calls or UI-runtime dependencies.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const src = fs.readFileSync("src/lib/crm/overview-data.ts", "utf8");
const compiled = ts.transpileModule(src, {
  fileName: "overview-data.ts",
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.deepEqual((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
const mod = { exports: {} };
new Function("module", "exports", compiled.outputText)(mod, mod.exports);
const { loadCrmOverview } = mod.exports;

function mockFetch(responses, calls = []) {
  return async (url, options) => {
    const entity = new URL(url, "https://test.example.invalid").searchParams.get("entity");
    calls.push({ entity, signal: options?.signal });
    const entry = responses[entity];
    if (entry instanceof Error) throw entry;
    if (entry?.fail) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => entry };
  };
}
const usage = { rows: [{ provider: "Claude", mode: "manual", amount: 15, unit: "USD" }] };
const metrics = { metrics: { overdue: 3, pending: 7 } };

test("both available: validated figures and manual consumption are retained", async () => {
  const calls = [];
  const data = await loadCrmOverview(mockFetch({ usage, kpis: metrics }, calls));
  assert.deepEqual(data, { usage: usage.rows, overdue: 3, pending: 7, usageError: null, kpiError: null });
  assert.deepEqual(calls.map(c => c.entity).sort(), ["kpis", "usage"]);
});

test("usage service 503 does not blank valid lead follow-up KPIs", async () => {
  const data = await loadCrmOverview(mockFetch({ usage: { fail: true }, kpis: metrics }));
  assert.equal(data.usage, null);
  assert.match(data.usageError, /consumo/);
  assert.deepEqual([data.overdue, data.pending, data.kpiError], [3, 7, null]);
});

test("KPI service 503 does not hide existing manual AI usage", async () => {
  const data = await loadCrmOverview(mockFetch({ usage, kpis: { fail: true } }));
  assert.deepEqual(data.usage, usage.rows);
  assert.equal(data.usageError, null);
  assert.deepEqual([data.overdue, data.pending], [null, null]);
  assert.match(data.kpiError, /métricas/);
});

test("both failed: unknown never becomes invented zero", async () => {
  const data = await loadCrmOverview(mockFetch({ usage: new Error("network"), kpis: { fail: true } }));
  assert.deepEqual([data.usage, data.overdue, data.pending], [null, null, null]);
  assert.ok(data.usageError && data.kpiError);
});

test("malformed success payloads fail independently; valid empty array and zero count remain valid", async () => {
  const invalidUsage = await loadCrmOverview(mockFetch({ usage: { rows: [null] }, kpis: metrics }));
  assert.equal(invalidUsage.usage, null);
  assert.equal(invalidUsage.overdue, 3);
  const invalidKpi = await loadCrmOverview(mockFetch({ usage, kpis: { metrics: { overdue: -1, pending: "0" } } }));
  assert.deepEqual(invalidKpi.usage, usage.rows);
  assert.equal(invalidKpi.overdue, null);
  assert.ok(invalidKpi.kpiError);
  const empty = await loadCrmOverview(mockFetch({ usage: { rows: [] }, kpis: { metrics: { overdue: 0, pending: 0 } } }));
  assert.deepEqual(empty.usage, []);
  assert.deepEqual([empty.overdue, empty.pending, empty.usageError, empty.kpiError], [0, 0, null, null]);
});

test("owner-session fetch cancellation signal is forwarded to both endpoints", async () => {
  const controller = new AbortController();
  const calls = [];
  await loadCrmOverview(mockFetch({ usage, kpis: metrics }, calls), controller.signal);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => c.signal === controller.signal));
});

test("CRM overview renders source-specific error notices instead of global blanking", () => {
  const ui = fs.readFileSync("src/components/crm/overview.tsx", "utf8");
  assert.match(ui, /loadCrmOverview\(fetch, controller\.signal\)/);
  assert.match(ui, /data\?\.usageError/);
  assert.match(ui, /data\.kpiError/);
  assert.doesNotMatch(ui, /setData\(null\)/);
  assert.match(ui, /role="alert"/);
});
