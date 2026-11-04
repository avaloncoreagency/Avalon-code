const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const js = ts.transpileModule(fs.readFileSync("src/lib/crm/usage-units.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", js)(mod, mod.exports);
const { canonicalUnit, latestPerUnit, COMMON_UNITS } = mod.exports;

test("units: spelling variants collapse to one canonical unit; unknown units stay verbatim", () => {
  for (const [raw, unit] of [["Tokens", "tokens"], [" token ", "tokens"], ["credits", "créditos"], ["Créditos", "créditos"], ["credito", "créditos"],
    ["Generations", "generaciones"], ["generación", "generaciones"], ["usd", "USD"], ["US$", "USD"], ["dólares", "USD"], ["$", "USD"],
    ["% cuota", "% de cuota"], ["Quota", "% de cuota"], ["mensajes", "mensajes"], ["Messages", "mensajes"]])
    assert.equal(canonicalUnit(raw), unit, String(raw));
  assert.equal(canonicalUnit("horas de GPU"), "horas de GPU");
  assert.equal(canonicalUnit(undefined), "");
  assert.deepEqual([...COMMON_UNITS], ["tokens", "créditos", "generaciones", "USD", "% de cuota", "mensajes"]);
});

test("units are never converted or estimated into each other", () => {
  const src = fs.readFileSync("src/lib/crm/usage-units.ts", "utf8");
  assert.doesNotMatch(src, /rate|price|precio|\* ?0\.|convert\(/i);
});

test("a tool measured in several units shows the latest record of EACH unit", () => {
  const rows = [
    { id: "1", unit: "tokens", period_end: "2026-11-30", created_at: "2026-11-02" },
    { id: "2", unit: "Tokens", period_end: "2026-12-31", created_at: "2026-11-03" },
    { id: "3", unit: "credits", period_end: "2026-11-30", created_at: "2026-11-01" },
    { id: "4", unit: "USD", period_end: "2026-10-31", created_at: "2026-10-01" },
  ];
  const out = latestPerUnit(rows);
  assert.deepEqual(out.map(r => r.id), ["2", "3", "4"], "newest tokens record wins; credits and USD are kept");
  assert.equal(latestPerUnit(rows, 2).length, 2);
  assert.deepEqual(latestPerUnit([]), []);
});

test("the overview and the validator both use the canonical unit and keep 'Sin datos' for empty tools", () => {
  const overview = fs.readFileSync("src/components/crm/overview.tsx", "utf8");
  assert.match(overview, /latestPerUnit\(rows\)/);
  assert.match(overview, /Estado: Sin datos/);
  assert.match(overview, /Unidades habituales/);
  assert.match(fs.readFileSync("src/lib/crm/domain.ts", "utf8"), /unit: canonicalUnit\(text\(input\.unit, "Unidad", 50, true\)\)/);
});
