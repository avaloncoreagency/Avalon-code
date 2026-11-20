#!/usr/bin/env node
/**
 * Post-build guard: the shipped client bundle must contain the replay hydration-cursor reset
 * (see scripts/patch-react-hydration-replay.cjs). Fails the build if a stale cache or a different
 * react-dom slipped an unpatched copy into .next/static.
 */
const fs = require("node:fs");
const path = require("node:path");
const dir = path.join(process.cwd(), ".next", "static", "chunks");
// Minified shape of: fiber === hydrationParentFiber && (... 5 === fiber.tag && null != fiber.stateNode && (nextHydratableInstance = fiber.stateNode))
const FIXED = /5===([A-Za-z_$][\w$]*)\.tag&&null!=\1\.stateNode&&\([A-Za-z_$][\w$]*=\1\.stateNode\)/;
function scan(folder) {
  const out = [];
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) out.push(...scan(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}
if (!fs.existsSync(dir)) { console.error("[react-418-bundle] .next/static/chunks not found: run next build first"); process.exit(1); }
const files = scan(dir);
// Only the App Router client (Next's vendored canary react-dom, the one that hydrates every Avalon page). The
// separate "framework" chunk is the Pages Router fallback (node_modules react-dom) used only by Next's legacy error page.
const reactDom = files.filter(f => { const s = fs.readFileSync(f, "utf8"); return s.includes("Minified React error #") && /19\.\d+\.\d+-canary-/.test(s) && s.includes("(418,"); });
const fixed = reactDom.filter(f => FIXED.test(fs.readFileSync(f, "utf8")));
if (!reactDom.length) { console.error("[react-418-bundle] react-dom client chunk not found"); process.exit(1); }
if (fixed.length !== reactDom.length) {
  console.error(`[react-418-bundle] UNPATCHED react-dom in ${reactDom.map(f => path.relative(process.cwd(), f)).join(", ")}. Delete .next/cache and rebuild.`);
  process.exit(1);
}
console.log(`[react-418-bundle] replay hydration fix present in ${fixed.map(f => path.basename(f)).join(", ")}`);
