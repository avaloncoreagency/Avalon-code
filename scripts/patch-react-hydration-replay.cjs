#!/usr/bin/env node
/**
 * Backport of an upstream React fix into the React build that Next.js 15.5 vendors
 * (next/dist/compiled/react-dom*, React 19.2.0-canary-0bdb9206-20250818).
 *
 * Bug (React #418 "HTML", intermittent): during concurrent hydration React claims a host element (e.g. <nav>) and moves
 * its hydration cursor to that element's first child. If one of the element's children is a Flight element that is
 * still blocked on a client module (a lazy wrapper), reconciling the children suspends ON THE HOST FIBER. When the
 * module resolves, replaySuspendedUnitOfWork() re-runs beginWork() for that host fiber without restoring the cursor,
 * so React tries to claim <nav> while pointing at its first <a> and throws #418, then client-renders the whole root.
 * Whether the module is ready in time depends on script timing, which is why the error appeared on random pages
 * (/admin/workspace/products/[id], /crm/clients/[id], /crm/leads, /crm/sales, /crm/hunter) about 1 run in 4.
 *
 * Upstream React (as vendored by Next 16.4, React 19.3.0-canary-278794d7-20261002) fixed replaySuspendedUnitOfWork
 * by resetting the hydration cursor to the host fiber's own DOM node before replaying. This script inserts exactly
 * that code. It is idempotent, touches only the four react-dom client builds, and fails loudly if the vendored code
 * no longer has the expected shape (e.g. after a Next upgrade) so the backport can be removed instead of silently
 * diverging. Evidence and procedure: docs/recovery/REACT_418_ROOT_CAUSE.md.
 */
const fs = require("node:fs");
const path = require("node:path");

const MARKER = "/* avalon-backport: react replay hydration cursor */";
const FILES = [
  "react-dom-client.production.js",
  "react-dom-client.development.js",
  "react-dom-profiling.profiling.js",
  "react-dom-profiling.development.js",
];

function nextDir(root) {
  try { return path.dirname(require.resolve("next/package.json", { paths: [root] })); } catch { return null; }
}

/** Returns { status: "patched" | "already" | "fixed-upstream", source }. Throws when the shape is unknown. */
function patchSource(source, label = "react-dom") {
  if (source.includes(MARKER)) return { status: "already", source };
  const start = source.indexOf("function replaySuspendedUnitOfWork(");
  if (start < 0) throw new Error(`${label}: replaySuspendedUnitOfWork not found`);
  const end = source.indexOf("\nfunction ", start + 10);
  const body = source.slice(start, end < 0 ? undefined : end);
  if (/fiber === hydrationParentFiber/.test(body)) return { status: "fixed-upstream", source };
  for (const name of ["hydrationParentFiber", "isHydrating", "nextHydratableInstance", "function popToNextHostParent("])
    if (!source.includes(name)) throw new Error(`${label}: expected React internal "${name}" not found`);
  const hostCase = /case 5:\s*\n(\s*)resetHooksOnUnwind\((\w+)\);/;
  const match = body.match(hostCase);
  if (!match) throw new Error(`${label}: host-component replay branch not found`);
  const [whole, indent, fiberVar] = match;
  const fix =
    `${whole}\n${indent}${MARKER}\n` +
    `${indent}${fiberVar} === hydrationParentFiber &&\n` +
    `${indent}  (isHydrating\n` +
    `${indent}    ? (popToNextHostParent(${fiberVar}),\n` +
    `${indent}      5 === ${fiberVar}.tag &&\n` +
    `${indent}        null != ${fiberVar}.stateNode &&\n` +
    `${indent}        (nextHydratableInstance = ${fiberVar}.stateNode))\n` +
    `${indent}    : (popToNextHostParent(${fiberVar}), (isHydrating = !0)));`;
  const patchedBody = body.replace(whole, fix);
  return { status: "patched", source: source.slice(0, start) + patchedBody + (end < 0 ? "" : source.slice(end)) };
}

function run(root = process.cwd(), log = console.log) {
  const dir = nextDir(root);
  if (!dir) { log("[react-418-backport] next is not installed; nothing to patch."); return []; }
  const results = [];
  for (const flavour of ["react-dom", "react-dom-experimental"]) {
    for (const file of FILES) {
      const target = path.join(dir, "dist", "compiled", flavour, "cjs", file);
      // One descriptor for read and write: no window between checking the file and changing it.
      let fd;
      try { fd = fs.openSync(target, "r+"); } catch (error) { if (error && error.code === "ENOENT") continue; throw error; }
      try {
        const { status, source } = patchSource(fs.readFileSync(fd, "utf8"), `${flavour}/${file}`);
        if (status === "patched") { fs.ftruncateSync(fd, 0); fs.writeSync(fd, source, 0, "utf8"); }
        results.push({ file: `${flavour}/${file}`, status });
      } finally { fs.closeSync(fd); }
    }
  }
  if (!results.some(r => r.file.startsWith("react-dom/react-dom-client.production")))
    throw new Error("[react-418-backport] next/dist/compiled/react-dom client build not found");
  log(`[react-418-backport] ${results.map(r => `${r.file}: ${r.status}`).join("; ")}`);
  invalidateStaleBuildCache(root, log);
  return results;
}

/**
 * Webpack treats node_modules as immutable (cache keyed by package version), so a persistent build cache created
 * before this backport keeps serving the UNPATCHED react-dom even though the file on disk is fixed. Vercel and local
 * builds restore .next/cache, so drop the webpack cache once, then remember that it was rebuilt with the backport.
 */
const CACHE_STAMP = "avalon-react-418-backport-v1";
function invalidateStaleBuildCache(root, log) {
  const cache = path.join(root, ".next", "cache");
  const stamp = path.join(cache, CACHE_STAMP);
  fs.mkdirSync(cache, { recursive: true });
  // Atomic create ("wx"): only the first build after the backport claims the stamp and drops the old cache.
  try { fs.writeFileSync(stamp, "react-dom replay hydration cursor backport applied\n", { flag: "wx" }); }
  catch (error) { if (error && error.code === "EEXIST") return false; throw error; }
  fs.rmSync(path.join(cache, "webpack"), { recursive: true, force: true });
  log("[react-418-backport] dropped any .next/cache/webpack built before the backport");
  return true;
}

module.exports = { patchSource, run, MARKER, invalidateStaleBuildCache, CACHE_STAMP };

if (require.main === module) {
  try { run(); } catch (error) { console.error(String(error && error.message || error)); process.exit(1); }
}
