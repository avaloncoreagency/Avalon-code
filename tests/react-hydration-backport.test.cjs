const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { patchSource, MARKER, invalidateStaleBuildCache, CACHE_STAMP } = require("../scripts/patch-react-hydration-replay.cjs");

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
  assert.equal(pkg.scripts.postbuild, "node scripts/verify-react-418-bundle.cjs", "a bundle without the fix fails the build");
});

test("a webpack cache built before the backport is dropped once, so the patched react-dom is really compiled", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "r418-"));
  const webpack = path.join(root, ".next", "cache", "webpack");
  fs.mkdirSync(path.join(webpack, "client-production"), { recursive: true });
  fs.writeFileSync(path.join(webpack, "client-production", "0.pack"), "stale unpatched react-dom");
  fs.mkdirSync(path.join(root, ".next", "cache", "images"), { recursive: true });
  assert.equal(invalidateStaleBuildCache(root, () => {}), true);
  assert.equal(fs.existsSync(webpack), false, "stale webpack cache removed");
  assert.equal(fs.existsSync(path.join(root, ".next", "cache", "images")), true, "other caches untouched");
  assert.ok(fs.existsSync(path.join(root, ".next", "cache", CACHE_STAMP)));
  fs.mkdirSync(webpack, { recursive: true });
  assert.equal(invalidateStaleBuildCache(root, () => {}), false, "after the stamp, later caches are reused");
  assert.equal(fs.existsSync(webpack), true);
  fs.rmSync(root, { recursive: true, force: true });
});

test("post-build verifier rejects an App Router bundle without the fix and accepts the patched shape", () => {
  const { spawnSync } = require("node:child_process");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "r418b-"));
  const chunks = path.join(root, ".next", "static", "chunks");
  fs.mkdirSync(chunks, { recursive: true });
  const base = 'var v="19.2.0-canary-0bdb9206-20250818";function rD(e){var n=Error(i(418,"HTML"))}Minified React error #';
  fs.writeFileSync(path.join(chunks, "react.js"), base + "case 5:al(n);default:o0(t,n)");
  const run = () => spawnSync(process.execPath, [path.join(__dirname, "..", "scripts", "verify-react-418-bundle.cjs")], { cwd: root, encoding: "utf8" });
  assert.equal(run().status, 1);
  fs.writeFileSync(path.join(chunks, "react.js"), base + "case 5:al(n),n===rP&&(rL?(rM(n),5===n.tag&&null!=n.stateNode&&(rN=n.stateNode)):(rM(n),rL=!0));default:o0(t,n)");
  assert.equal(run().status, 0);
  fs.rmSync(root, { recursive: true, force: true });
});
