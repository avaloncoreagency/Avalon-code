const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const view = fs.readFileSync("src/components/crm/titan-radar.tsx", "utf8");
const styles = fs.readFileSync("src/components/crm/titan.module.css", "utf8");

test("star-rating guide covers 5 to 1 and unverified leads", () => {
  const tiers = [...view.matchAll(/\{ stars: (5|4|3|2|1|null), rule:/g)]
    .map(match => match[1]);
  assert.deepEqual(tiers, ["5", "4", "3", "2", "1", "null"]);
  assert.match(view, /Cómo calificar leads con estrellas/);
  assert.match(view, /Necesidades por servicio/);
  assert.match(view, /NO prueba que el negocio carezca de ellos/);
  assert.match(view, /Las estrellas miden oportunidad/);
  assert.match(view, /Ver escala de estrellas para este lead/);
});

test("sonar animation is decorative, pausable and capped for mobile", () => {
  assert.match(view, /sweep && <div className=\{s\.radarFx\}/);
  assert.match(view, /const live = sweep && animatedMarkers < 14/);
  assert.match(view, /BARRIDO VISUAL/);
  assert.match(view, /Pausar animación/);
  assert.match(styles, /\.radarFx\s*\{[^}]*pointer-events:none;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.radarFx\s*\{ display:none; \}/);
  assert.match(styles, /\.markerLive::after\s*\{[^}]*animation:/);
});

test("Lead Hunter JSX parses after the UI-only changes", () => {
  const transpiled = ts.transpileModule(view, {
    fileName: "src/components/crm/titan-radar.tsx",
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const errors = (transpiled.diagnostics || [])
    .filter(d => d.category === ts.DiagnosticCategory.Error)
    .map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
  assert.deepEqual(errors, []);
});