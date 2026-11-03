const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const src = fs.readFileSync("src/lib/office/scene-camera.ts", "utf8");
const compiled = ts.transpileModule(src, {
  fileName: "scene-camera.ts", reportDiagnostics: true,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
assert.deepEqual((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
const mod = { exports: {} };
new Function("require", "module", "exports", compiled.outputText)(require, mod, mod.exports);
const m = mod.exports;
const bounds = { minX: -450, minY: -250, width: 1100, height: 650 };

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} should equal ${b}`);

test("zoom keeps finger anchor stable inside world bounds", () => {
  const prev = { x: 0.73, y: 0.37 };
  const before = m.officeViewport(m.INITIAL_CAMERA, bounds);
  const world = [before.x + prev.x * before.width, before.y + prev.y * before.height];
  const afterCamera = m.zoomOfficeAt(m.INITIAL_CAMERA, bounds, 2.4, prev);
  const after = m.officeViewport(afterCamera, bounds);
  near(after.x + prev.x * after.width, world[0]);
  near(after.y + prev.y * after.height, world[1]);
});

test("pinch can initiate at zoom 1 and track moving fingers", () => {
  const start = { x: 0.50, y: 0.52 };
  const end = { x: 0.56, y: 0.48 };
  const result = m.zoomOfficeAt(m.INITIAL_CAMERA, bounds, 1.8, start, end);
  const prior = m.officeViewport(m.INITIAL_CAMERA, bounds);
  const next = m.officeViewport(result, bounds);
  near(prior.x + start.x * prior.width, next.x + end.x * next.width);
  near(prior.y + start.y * prior.height, next.y + end.y * next.height);
  assert.equal(result.zoom, 1.8);
});

test("zoom and pan are clamped, including NaN and extreme distances", () => {
  const camera = m.clampOfficeCamera({ zoom: 99, panX: 99999, panY: -99999 }, bounds);
  assert.equal(camera.zoom, m.OFFICE_MAX_ZOOM);
  assert.ok(Number.isFinite(camera.panX));
  assert.ok(Number.isFinite(camera.panY));
  assert.ok(m.officeViewport(camera, bounds).x >= bounds.minX);
  assert.ok(m.officeViewport(camera, bounds).y >= bounds.minY);
  assert.equal(m.zoomOfficeAt(camera, bounds, -100).zoom, m.OFFICE_MIN_ZOOM);
  assert.deepEqual(m.clampOfficeCamera({ zoom: NaN, panX: NaN, panY: NaN }, bounds), m.INITIAL_CAMERA);
  assert.deepEqual(m.panOfficeBy(m.INITIAL_CAMERA, bounds, 500, 500), m.INITIAL_CAMERA);
});

test("pointer anchor accounts for SVG meet letterboxing, not just width", () => {
  const r = { left: 100, top: 60, width: 1100, height: 1100 };
  const center = m.officePointerAnchor(650, 610, r, m.INITIAL_CAMERA, bounds);
  near(center.x, 0.5);
  near(center.y, 0.5);
  const beyond = m.officePointerAnchor(-100, -100, r, m.INITIAL_CAMERA, bounds);
  assert.deepEqual(beyond, { x: 0, y: 0 });
});

test("office scene implements two-pointer pinch, resets and touch navigation without fake agent activity", () => {
  const office = fs.readFileSync("src/components/office/iso-office.tsx", "utf8");
  const css = fs.readFileSync("src/components/office/iso-office.module.css", "utf8");
  assert.match(office, /onPointerDown=/);
  assert.match(office, /onPointerMove=/);
  assert.match(office, /onPointerCancel=/);
  assert.match(office, /activePointers\.current/);
  assert.match(office, /zoomOfficeAt\(/);
  assert.match(office, /officePointerAnchor\(/);
  assert.match(office, /aria-label=.*Cámara/);
  assert.match(css, /touch-action:\s*none/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
