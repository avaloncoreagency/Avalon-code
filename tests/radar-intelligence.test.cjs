const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const file = "src/lib/crm/radar-intelligence.ts";
const source = fs.readFileSync(file, "utf8");
const transpiled = ts.transpileModule(source, {
  fileName: file, reportDiagnostics: true,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
assert.deepEqual((transpiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
const moduleObject = { exports: {} };
new Function("module", "exports", "require", transpiled.outputText)(
  moduleObject, moduleObject.exports, require
);
const { buildRadarIntelligence, formatRadarBriefForCopy } = moduleObject.exports;

const profile = (extra = {}) => ({
  company: "Blue Harbor Dental", category: "dentist", phone: "+1 305 555 0100",
  website: "https://blueharbordental.example.org", contact: "",
  stars: 2, stars_override: null,
  stars_reasons: ["Precalificación automática: web y teléfono"],
  confidence: "low", status: "pending", do_not_contact: false,
  needs: [], ...extra,
});
const report = (extra = {}) => ({
  status: "complete", website: "https://blueharbordental.example.org/",
  researched_at: "2026-11-04T08:00:00.000Z", pages: [],
  signals: [{ code: "booking_link", label: "Enlace de reservas",
    outcome: "observed", detail: "Link observado",
    source_url: "https://blueharbordental.example.org/",
    confidence: "medium", checked_at: "2026-11-04T08:00:00.000Z" }],
  warnings: [], confidence: "medium", identity_matched: true,
  unverified: ["CRM interno", "Recepcionista IA"], suggested_needs: [], ...extra,
});

test("preliminary listing recommends research but cannot enter pipeline", () => {
  const result = buildRadarIntelligence(profile(), null);
  assert.equal(result.classification, "preliminary");
  assert.equal(result.promoteReady, false);
  assert.ok(result.nextAction.includes("web oficial"));
  assert.ok(result.questions.some(x => x.includes("seguimiento")));
  assert.match(result.disclaimer, /no es una IA generativa/);
});

test("blocked site does not create commercial-needs claims", () => {
  const result = buildRadarIntelligence(profile(), report({
    status: "blocked", identity_matched: false,
    signals: [], warnings: ["robots.txt restringido"], confidence: "none",
  }));
  assert.equal(result.classification, "researching");
  assert.equal(result.promoteReady, false);
  assert.match(result.headline, /restringida/);
});

test("verified identity produces grounded and cited observations", () => {
  const result = buildRadarIntelligence(profile(), report());
  assert.equal(result.classification, "review");
  assert.ok(result.facts.some(x => x.title === "Reservas en línea" &&
    x.source_url === "https://blueharbordental.example.org/"));
  assert.ok(result.questions.some(x => /reservas/.test(x)));
  assert.equal(result.promoteReady, false);
});

test("unmatched website asks to confirm ownership first", () => {
  const result = buildRadarIntelligence(profile(), report({ identity_matched: false }));
  assert.equal(result.classification, "researching");
  assert.match(result.nextAction, /Confirmar el dominio oficial/);
});

test("verified three-star opportunity can be transferred with one click", () => {
  const result = buildRadarIntelligence(profile({
    stars: 3, stars_reasons: ["1 necesidad verificada"],
    needs: [{ service: "website", state: "verified_missing", confidence: "high",
      evidence_url: "https://blueharbordental.example.org/audit",
      note: "El propietario verificó una necesidad concreta de actualización del sitio web." }],
  }), report());
  assert.equal(result.classification, "qualified");
  assert.equal(result.promoteReady, true);
  assert.ok(result.facts.some(x => x.title.includes("Sitio web")));
});

test("manual scores do not bypass DNC or already converted state", () => {
  const p = profile({ stars_override: 4 });
  assert.equal(buildRadarIntelligence(p, null).promoteReady, true);
  assert.equal(buildRadarIntelligence({ ...p, do_not_contact: true }, null).promoteReady, false);
  assert.equal(buildRadarIntelligence({ ...p, status: "rejected" }, null).promoteReady, false);
  assert.equal(buildRadarIntelligence({ ...p, status: "converted" }, null).classification, "pipeline");
});

test("copyable brief includes score, cited facts, next step and limitation", () => {
  const p = profile();
  const text = formatRadarBriefForCopy(p, buildRadarIntelligence(p, report()));
  assert.match(text, /Blue Harbor Dental/);
  assert.match(text, /Calificación: 2/);
  assert.match(text, /Siguiente acción:/);
  assert.match(text, /no es una IA generativa/);
  assert.ok(text.length <= 4400);
});

test("UI offers a connected real conversion, not an inert button", () => {
  const ui = fs.readFileSync("src/components/crm/radar-research-panel.tsx", "utf8");
  const titan = fs.readFileSync("src/components/crm/titan-radar.tsx", "utf8");
  assert.match(ui, /onClick=\{onPromote\}/);
  assert.match(ui, /navigator\.clipboard\.writeText/);
  assert.match(titan, /op: "qualify"/);
});
