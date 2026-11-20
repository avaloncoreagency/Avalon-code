const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { patchSource, MARKER } = require("../scripts/patch-react-hydration-replay.cjs");

// Minimal copy of the vendored React 19.2.0-canary-0bdb9206-20250818 shape (production build).
const INTERNALS = "var hydrationParentFiber = null, nextHydratableInstance = null, isHydrating = !1;\nfunction popToNextHostParent(fiber) {}\n";
const BUGGY = INTERNALS + `function replaySuspendedUnitOfWork(unitOfWork) {
  var next = unitOfWork;
  var current = next.alternate;
  switch (next.tag) {
    case 5:
      resetHooksOnUnwind(next);
    default:
      unwindInterruptedWork(current, next),
        (next = workInProgress =
          resetWorkInProgress(next, entangledRenderLanes)),
        (next = beginWork(current, next, entangledRenderLanes));
  }
}
function throwAndUnwindWorkLoop() {}
`;

test("backport inserts the upstream cursor reset in the host-component replay branch, once", () => {
  const first = patchSource(BUGGY, "fixture");
  assert.equal(first.status, "patched");
  const replay = first.source.slice(first.source.indexOf("function replaySuspendedUnitOfWork"), first.source.indexOf("function throwAndUnwindWorkLoop"));
  assert.ok(replay.includes(MARKER));
  assert.match(replay, /next === hydrationParentFiber &&/);
  assert.match(replay, /\(nextHydratableInstance = next\.stateNode\)/);
  assert.match(replay, /popToNextHostParent\(next\), \(isHydrating = !0\)/);
  // The reset runs before unwindInterruptedWork + beginWork re-claim the host element.
  assert.ok(replay.indexOf(MARKER) < replay.indexOf("unwindInterruptedWork(current, next)"));
  assert.ok(first.source.endsWith("function throwAndUnwindWorkLoop() {}\n"), "code after the function is untouched");
  const again = patchSource(first.source, "fixture");
  assert.equal(again.status, "already");
  assert.equal(again.source, first.source);
});

test("a React build that already contains the upstream fix is left alone", () => {
  const upstream = BUGGY.replace("resetHooksOnUnwind(next);", "resetHooksOnUnwind(next);\n      var fiber = next;\n      fiber === hydrationParentFiber && (nextHydratableInstance = fiber.stateNode);");
  const result = patchSource(upstream, "fixture");
  assert.equal(result.status, "fixed-upstream");
  assert.equal(result.source, upstream);
});

test("an unknown React shape fails loudly instead of diverging silently", () => {
  assert.throws(() => patchSource("function other() {}", "fixture"), /replaySuspendedUnitOfWork not found/);
  assert.throws(() => patchSource(BUGGY.replace("case 5:", "case 6:"), "fixture"), /host-component replay branch not found/);
  assert.throws(() => patchSource(BUGGY.replace("function popToNextHostParent", "function renamed"), "fixture"), /popToNextHostParent/);
});

test("the installed Next.js React client build carries the fix (postinstall/prebuild ran)", () => {
  const nextDir = path.dirname(require.resolve("next/package.json"));
  const file = path.join(nextDir, "dist/compiled/react-dom/cjs/react-dom-client.production.js");
  const source = fs.readFileSync(file, "utf8");
  const start = source.indexOf("function replaySuspendedUnitOfWork(");
  const body = source.slice(start, source.indexOf("\nfunction ", start + 10));
  assert.ok(body.includes(MARKER) || /fiber === hydrationParentFiber/.test(body),
    "run `node scripts/patch-react-hydration-replay.cjs` (npm postinstall) — the replay hydration fix is missing");
});

test("package scripts apply the backport before every build and after every install", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  assert.equal(pkg.scripts.prebuild, "node scripts/patch-react-hydration-replay.cjs");
  assert.equal(pkg.scripts.postinstall, "node scripts/patch-react-hydration-replay.cjs");
});
