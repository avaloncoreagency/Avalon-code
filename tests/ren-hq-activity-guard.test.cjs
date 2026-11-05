// REN 0352-A: pure HTTP snapshot guard, no WebGL, network, data writes or secrets.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const file = readFileSync("src/components/office/hq-activity-guard.ts", "utf8");
const js = ts.transpileModule(file, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const mod = { exports: {} };
new Function("module", "exports", js)(mod, mod.exports);
const { parseHqActivity } = mod.exports;
const keys = ["ren", "shin", "haru", "sora", "kenji"];
const row = key => ({ manager_key: key, run_id: null, status: "idle",
  task_title: "Sin ejecución", started_at: null, finished_at: null,
  result_summary: "", evidence_refs: [], error_code: null, updated_at: null });
const valid = () => ({ managers: keys.map(row), meta: {
  kill_switch: false, automatic_enabled: false, executor_kind: "deterministic",
}});

test("verified five-manager activity is accepted without inventing executions", () => {
  const snapshot = valid();
  assert.equal(parseHqActivity(snapshot), snapshot);
  const running = valid();
  running.managers[0] = { ...row("ren"), status: "running", run_id: "synthetic-run",
    started_at: "2026-11-05T20:00:00Z" };
  assert.equal(parseHqActivity(running), running);
});

test("malformed 200 responses fail closed; no false zero-running or glowing station", () => {
  const duplicate = valid(); duplicate.managers[4] = row("ren");
  const partial = valid(); partial.managers.pop();
  const missingMeta = valid(); delete missingMeta.meta.automatic_enabled;
  const stringSwitch = valid(); stringSwitch.meta.kill_switch = "false";
  const bogusStatus = valid(); bogusStatus.managers[0].status = "executing";
  const fakeRunning = valid(); fakeRunning.managers[0].status = "running";
  const missingStart = valid(); missingStart.managers[0].status = "running"; missingStart.managers[0].run_id = "synthetic-run";
  const invalidDate = valid(); invalidDate.managers[0].status = "running"; invalidDate.managers[0].run_id = "synthetic-run"; invalidDate.managers[0].started_at = "no date";
  const noEvidence = valid(); noEvidence.managers[0].evidence_refs = null;
  for (const sample of [null, [], {}, { managers: [] }, duplicate, partial, missingMeta,
    stringSwitch, bogusStatus, fakeRunning, missingStart, invalidDate, noEvidence]) {
    assert.equal(parseHqActivity(sample), null);
  }
});

test("HQ discards untrusted payload before updating state or parent directory", () => {
  const hq = readFileSync("src/components/office/hq-3d.tsx", "utf8");
  assert.match(hq, /const next = parseHqActivity\(await r\.json\(\)\);/);
  assert.match(hq, /if \(!next\) throw new Error\("invalid_hq_activity"\)/);
  assert.ok(hq.indexOf('if (!next) throw new Error("invalid_hq_activity")') < hq.indexOf('setActivity(next)'));
  assert.match(hq, /setActivity\(null\); setActivityError\(true\); activityListener\.current\?\.\(null\)/);
});
