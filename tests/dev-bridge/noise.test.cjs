const {test} = require("node:test");
const assert = require("node:assert/strict");
const bridge = require("../../scripts/dev-bridge/load.cjs");
const {fixture} = require("./fixture.cjs");

test("large historical PR queues summarize advisory overlaps without hiding real failures", () => {
  const state = fixture();
  const template = state.github.data.pulls[0];
  state.github.data.issues = [];
  state.github.data.pulls = Array.from({length: 30}, (_, index) => ({
    ...template,
    number: 200 + index,
    title: "Legacy draft " + index,
    files: ["src/components/shared.tsx"],
    issues: [],
    ci: index === 0 ? "FAILED" : "UNKNOWN",
    conflict: index === 1,
    behind: 0,
    base_branch: index % 2 ? "main" : "feature/base",
  }));
  state.vercel.data = Array.from({length: 20}, (_, index) => ({
    ...state.vercel.data[0],
    id: "historic-" + index,
    state: "ERROR",
  }));
  const findings = bridge.findings(state);
  const ids = findings.map(f => f.id);
  assert.ok(ids.includes("ci:200"), "confirmed CI failure must remain visible");
  assert.ok(ids.includes("conflict:201"), "confirmed merge conflict must remain visible");
  assert.ok(ids.includes("overlaps:summary"), "pairwise path overlaps are summarized");
  assert.ok(ids.includes("bases:summary"), "different bases are summarized");
  assert.ok(ids.includes("issues:unlinked"), "missing Issue links are summarized");
  assert.ok(ids.includes("deployments:failures"), "old deployment errors are summarized");
  assert.ok(!ids.some(id => id.startsWith("overlap:")), "avoid hundreds of duplicated pair alerts");
  assert.ok(findings.length < 20, "large queue should not flood the dashboard");
});

test("owner dashboard explains evidence and never presents public mode as a safe handoff", () => {
  const fs = require("node:fs");
  const page = fs.readFileSync("src/app/admin/dev-bridge/page.tsx", "utf8");
  for (const phrase of ["Cómo usar Dev Bridge", "STALE", "UNKNOWN", "owner:miguel", "owner:samuel", "Next action:", "npm run bridge:doctor"]) {
    assert.ok(page.includes(phrase), "Missing operator guidance: " + phrase);
  }
  assert.match(page, /no permite handoff seguro/);
  assert.match(page, /ninguna acción de este panel fusiona código/i);
});
