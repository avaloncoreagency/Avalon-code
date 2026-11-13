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
  generated_at: new Date().toISOString(),
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

test("old, future or missing server timestamps cannot light the HQ from a replayed HTTP 200", () => {
  const now = Date.parse("2026-11-05T23:00:00.000Z");
  const fresh = valid(); fresh.meta.generated_at = new Date(now).toISOString();
  assert.equal(parseHqActivity(fresh, now), fresh);
  const expired = valid(); expired.meta.generated_at = new Date(now - 120_001).toISOString();
  const future = valid(); future.meta.generated_at = new Date(now + 120_001).toISOString();
  const missing = valid(); delete missing.meta.generated_at;
  const invalid = valid(); invalid.meta.generated_at = "not-a-date";
  for (const sample of [expired, future, missing, invalid]) {
    assert.equal(parseHqActivity(sample, now), null);
  }
  assert.equal(parseHqActivity(fresh, Number.NaN), null, "invalid device clock fails closed");
});

test("non-idle states require a recorded run, and completed requires completion time", () => {
  const now = Date.parse("2026-11-05T23:00:00.000Z");
  const snapshot = valid();
  snapshot.meta.generated_at = new Date(now).toISOString();
  snapshot.managers[0] = { ...row("ren"), status: "completed", run_id: "synthetic-run",
    started_at: new Date(now - 60_000).toISOString(),
    finished_at: new Date(now - 30_000).toISOString() };
  assert.equal(parseHqActivity(snapshot, now), snapshot, "completed execution with evidence accepted");

  for (const status of ["queued", "running", "completed", "failed", "blocked", "stale"]) {
    const noRun = structuredClone(snapshot);
    noRun.managers[0].status = status;
    noRun.managers[0].run_id = null;
    assert.equal(parseHqActivity(noRun, now), null, status + " without run ID rejected");
  }
  const blankRun = structuredClone(snapshot);
  blankRun.managers[0].run_id = "  ";
  const noFinish = structuredClone(snapshot);
  noFinish.managers[0].finished_at = null;
  const invalidFinish = structuredClone(snapshot);
  invalidFinish.managers[0].finished_at = "not-a-date";
  const fakeIdle = structuredClone(snapshot);
  fakeIdle.managers[0].status = "idle";
  for (const sample of [blankRun, noFinish, invalidFinish, fakeIdle]) {
    assert.equal(parseHqActivity(sample, now), null, "unverifiable execution rejected");
  }
});

test("HQ rejects temporally impossible run events despite a fresh HTTP 200", () => {
  const now = Date.parse("2026-11-05T23:00:00.000Z");
  const base = valid();
  base.meta.generated_at = new Date(now).toISOString();
  base.managers[0] = { ...row("ren"), status: "completed", run_id: "synthetic-run",
    started_at: new Date(now - 60_000).toISOString(),
    finished_at: new Date(now - 10_000).toISOString() };
  assert.equal(parseHqActivity(base, now), base, "plausible completed run remains visible");

  const futureStart = structuredClone(base);
  futureStart.managers[0].started_at = new Date(now + 120_001).toISOString();
  const futureFinish = structuredClone(base);
  futureFinish.managers[0].finished_at = new Date(now + 120_001).toISOString();
  const reversed = structuredClone(base);
  reversed.managers[0].finished_at = new Date(now - 61_000).toISOString();
  const invalidQueuedTime = structuredClone(base);
  invalidQueuedTime.managers[0] = { ...row("ren"), status: "queued",
    run_id: "synthetic-run", started_at: "not-a-date" };
  for (const sample of [futureStart, futureFinish, reversed, invalidQueuedTime]) {
    assert.equal(parseHqActivity(sample, now), null, "impossible manager timeline rejected");
  }
  const skewAllowed = structuredClone(base);
  skewAllowed.managers[0].finished_at = new Date(now + 120_000).toISOString();
  assert.equal(parseHqActivity(skewAllowed, now), skewAllowed,
    "up to two minutes of server timestamp skew tolerated");
});
