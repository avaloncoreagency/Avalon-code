#!/usr/bin/env node
/**
 * Static audit of SECURITY DEFINER functions declared in supabase/migrations.
 * Takes the LAST definition of each public function (migrations replay in order) and classifies its access gate:
 *   owner  – calls crm_private.is_owner()/os_private.is_owner() (or a helper that requires an owner)
 *   token  – authenticated by a hashed bearer token (Project Bridge / Code Exchange)
 *   public – intentionally anonymous, listed in PUBLIC_ALLOWLIST with its justification
 *   self   – only returns/acts on rows of auth.uid() (e.g. directories limited to members)
 * Anything else is reported as UNGATED. Used by tests/definer-gates.test.cjs; no database connection needed.
 */
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "..", "supabase", "migrations");
const PUBLIC_ALLOWLIST = {
  crm_public_inquiry: "website quote form; validated, rate-limited, consent required",
  crm_growth_funnel_submit: "published funnel form; consent version required",
  crm_growth_funnel_view: "returns only a published funnel's public fields",
  crm_ai_public_control: "returns only the global AI on/off flag",
  os_bridge_api_open_import: "Project Bridge API; requires hashed per-project token",
  os_bridge_api_import_status: "Project Bridge API; requires hashed per-project token",
};

function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

function parse() {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith(".sql")).sort();
  const defs = new Map(); // name -> {file, definer, safeSearchPath, body}
  const grants = new Map(); // name -> {anon:boolean, authenticated:boolean}
  const re = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*(?:returns[\s\S]*?)?\s+as\s+(\$[a-z_]*\$)([\s\S]*?)\3/gi;
  for (const f of files) {
    const sql = stripComments(fs.readFileSync(path.join(DIR, f), "utf8"));
    let m;
    while ((m = re.exec(sql))) {
      const header = sql.slice(m.index, m.index + m[0].length - m[4].length - 2 * m[3].length);
      defs.set(m[1], { file: f, definer: /security\s+definer/i.test(header), safeSearchPath: /\bset\s+search_path\s*(?:=|to)\s*(?:''|"")/i.test(header), body: m[4] });
      // A fresh CREATE (not OR REPLACE) of a dropped function starts without explicit grants; OR REPLACE keeps them.
      if (!/or\s+replace/i.test(header)) grants.delete(m[1]);
    }
    // One statement may list several functions: grant execute on function public.a(x), public.b(y) to anon, authenticated;
    const g = /(grant|revoke)\s+(?:all(?:\s+privileges)?|execute)\s+on\s+function\s+([\s\S]*?)\s+(to|from)\s+([a-z_,\s]+?)\s*;/gi;
    while ((m = g.exec(sql))) {
      const names = [...m[2].matchAll(/public\.([a-z0-9_]+)\s*\(/gi)].map(x => x[1]);
      const roles = m[4].split(",").map(r => r.trim());
      const on = m[1].toLowerCase() === "grant";
      for (const n of names) {
        const cur = grants.get(n) || { anon: false, authenticated: false };
        for (const r of roles) {
          if (r === "anon") cur.anon = on;
          if (r === "authenticated") cur.authenticated = on;
          // "revoke ... from public" removes only the implicit PUBLIC grant; explicit anon/authenticated grants survive.
        }
        grants.set(n, cur);
      }
    }
  }
  return { defs, grants };
}

function classify(name, body) {
  if (PUBLIC_ALLOWLIST[name]) return "public";
  if (/(crm_private|os_private)\.(is_owner|require_owner|require_module)\s*\(/i.test(body)) return "owner";
  if (/token_sha256|token_hash/i.test(body) && /os_private\.(acx_token|bridge_token_guard)|token_sha256\s*=|sha256/i.test(body)) return "token";
  if (/agency_memberships/i.test(body) && /auth\.uid\(\)/i.test(body)) return "self";
  return "ungated";
}

function audit() {
  const { defs, grants } = parse();
  const rows = [];
  for (const [name, d] of defs) {
    if (!d.definer) continue;
    const g = grants.get(name) || { anon: false, authenticated: false };
    if (!g.anon && !g.authenticated) continue;
    rows.push({ name, file: d.file, anon: g.anon, authenticated: g.authenticated, safeSearchPath: d.safeSearchPath, gate: classify(name, d.body), dynamicSql: /\bexecute\s+(format|')/i.test(d.body) });
  }
  return rows.sort((a, b) => a.gate.localeCompare(b.gate) || a.name.localeCompare(b.name));
}

module.exports = { audit, PUBLIC_ALLOWLIST };
if (require.main === module) {
  const rows = audit();
  for (const r of rows) console.log([r.gate.padEnd(7), r.anon ? "anon" : "    ", r.authenticated ? "auth" : "    ", r.dynamicSql ? "DYN" : "   ", r.name, r.file].join("  "));
  console.log(`\n${rows.length} executable SECURITY DEFINER functions; ungated: ${rows.filter(r => r.gate === "ungated").length}`);
}
