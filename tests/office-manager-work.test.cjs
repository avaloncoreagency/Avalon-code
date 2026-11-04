const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const source = fs.readFileSync("src/lib/office/manager-work.ts", "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const obj = { exports: {} };
new Function("module", "exports", transpiled.outputText)(obj, obj.exports);
const { MANAGER_JOBS, isManagerCode, executeManagerCheck } = obj.exports;

const now = new Date("2026-11-03T15:00:00Z");
const codes = ["ren", "shin", "haru", "sora", "kenji"];

test("every configured manager executes bounded real-count specs and records evidence", async () => {
  const calls = [];
  for (const manager of codes) {
    const result = await executeManagerCheck(manager, async spec => {
      calls.push({ manager, table: spec.table, filters: spec.filters });
      return spec.key === "owners" ? 2 : spec.key === "blocked" ? 3 : 1;
    }, now);
    assert.equal(result.status, "completed");
    assert.equal(result.manager, manager);
    assert.equal(result.source, "owner_rls_database");
    assert.equal(result.observedAt, now.toISOString());
    assert.ok(result.metrics.length >= 2);
    assert.ok(result.metrics.every(m => Number.isSafeInteger(m.count)));
    assert.ok(result.nextAction.length >= 20);
    assert.match(result.note, /No es un agente IA conectado/);
    assert.ok(result.metrics.every(m => m.count >= 0));
  }
  assert.equal(calls.length, Object.values(MANAGER_JOBS).reduce((n, j) => n + j.specs.length, 0));
  assert.ok(calls.every(c => c.filters.length <= 2));
});

test("overdue query uses real runtime clock, not a stale hard-coded timestamp", async () => {
  const observed = [];
  await executeManagerCheck("kenji", async q => {
    observed.push(q);
    return 0;
  }, now);
  assert.equal(observed[1].filters.find(f => f.column === "due_at").value, now.toISOString());
  assert.deepEqual(observed[1].filters.find(f => f.column === "status").value, ["todo", "in_progress", "blocked"]);
});

test("missing permissions, query failure and partial counts never fabricate completed work", async () => {
  for (const manager of codes) {
    const failed = await executeManagerCheck(manager, async spec => {
      if (spec.key === MANAGER_JOBS[manager].specs[0].key) return 2;
      throw new Error("database error with sensitive details");
    }, now);
    assert.equal(failed.status, "unavailable");
    assert.deepEqual(failed.metrics, []);
    assert.ok(!JSON.stringify(failed).includes("sensitive details"));
  }
  const invalid = await executeManagerCheck("ren", async () => -1, now);
  assert.equal(invalid.status, "unavailable");
  assert.deepEqual(invalid.metrics, []);
});

test("do not accept arbitrary manager IDs or malformed system clock", async () => {
  assert.equal(isManagerCode("__proto__"), false);
  assert.equal(isManagerCode("hacker"), false);
  assert.equal(isManagerCode("ren"), true);
  await assert.rejects(() => executeManagerCheck("hacker", async () => 1), /invalid_manager/);
  await assert.rejects(() => executeManagerCheck("ren", async () => 1, new Date("invalid")), /invalid_now/);
});

test("checks do not mutate CRM records, use a model or assert scheduled execution", () => {
  const api = fs.readFileSync("src/app/admin/workspace/crm/office/manager-work/api/route.ts", "utf8");
  assert.match(api, /getOwnerSession\(\)/);
  assert.match(api, /if \(!session\) return reply\(\{ error: "No autorizado" \}, 403\)/);
  assert.match(api, /origin !== request\.nextUrl\.origin/);
  assert.match(api, /head: true/);
  assert.doesNotMatch(api, /\.insert\(|\.update\(|\.delete\(|service_role|SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(source, /fetch\(|setInterval\(|service_role|SUPABASE_SECRET_KEY/);
});
