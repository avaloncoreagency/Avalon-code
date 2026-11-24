// Builds supabase/templates/invite.html from src/lib/comms/email.ts (single source of truth). Run: node scripts/email/build-auth-templates.cjs [--check]
const fs = require("fs"), path = require("path"), ts = require("typescript");
const cache = new Map();
function load(file) {
  const abs = path.resolve(file); if (cache.has(abs)) return cache.get(abs).exports;
  const mod = { exports: {} }; cache.set(abs, mod);
  const out = ts.transpileModule(fs.readFileSync(abs, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function("module", "exports", "require", out)(mod, mod.exports, spec => spec.startsWith("@/") ? load(path.join("src", spec.slice(2)) + ".ts") : spec.startsWith(".") ? load(path.join(path.dirname(abs), spec) + ".ts") : require(spec));
  return mod.exports;
}
const email = load("src/lib/comms/email.ts");
const html = email.supabaseInviteTemplate();
const target = "supabase/templates/invite.html";
if (process.argv.includes("--check")) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (current !== html) { console.error(`${target} is out of date: run node scripts/email/build-auth-templates.cjs`); process.exit(1); }
  console.log(`${target} up to date`);
} else { fs.writeFileSync(target, html); console.log(`wrote ${target} (${html.length} bytes)`); }
