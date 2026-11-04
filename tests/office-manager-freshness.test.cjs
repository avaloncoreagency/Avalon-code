const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const src = fs.readFileSync("src/lib/office/manager-freshness.ts", "utf8");
const js = ts.transpileModule(src, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const mod = { exports: {} };
new Function("module", "exports", js)(mod, mod.exports);
const { managerStatusAt } = mod.exports;
const now = Date.parse("2026-11-04T12:00:00.000Z");
const run = mins => ({
  display_status: "completed",
  started_at: new Date(now - mins * 60000).toISOString(),
  finished_at: new Date(now - mins * 60000).toISOString(),
});

test("a real completed GitHub check remains fresh through minute 90", () => {
  assert.equal(managerStatusAt(run(89), now), "completed");
  assert.equal(managerStatusAt(run(90), now), "completed");
});
test("completed check turns stale after 90 minutes without any further API request", () => {
  assert.equal(managerStatusAt(run(91), now), "stale");
  const check = run(1);
  assert.equal(managerStatusAt(check, now), "completed");
  assert.equal(managerStatusAt(check, now + 91 * 60000), "stale");
});
test("missing, malformed and future reports never appear as completed", () => {
  assert.equal(managerStatusAt(undefined, now), "not_run");
  assert.equal(managerStatusAt({ ...run(1), finished_at: "invalid" }, now), "stale");
  assert.equal(managerStatusAt({ ...run(1), finished_at: new Date(now + 130000).toISOString() }, now), "stale");
  assert.equal(managerStatusAt(run(1), NaN), "stale");
});
test("the client never invents work when the server marks a manager stale or failed", () => {
  for (const status of ["stale", "failed", "stalled", "not_run", "running"]) {
    assert.equal(managerStatusAt({ ...run(1), display_status: status }, now), status);
  }
});
