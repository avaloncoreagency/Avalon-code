const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

const source = fs.readFileSync("src/lib/crm/radar-map-tiles.ts", "utf8");
const exported = {};
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: exported, URL },
);
const { resolveRadarMapTiles } = exported;

test("radar with no approved basemap uses the grid, not the blocked OSM community endpoint", () => {
  assert.equal(resolveRadarMapTiles(undefined), null);
  assert.equal(resolveRadarMapTiles(""), null);
  assert.equal(resolveRadarMapTiles("https://tile.openstreetmap.org/{z}/{x}/{y}.png"), null);
  assert.equal(resolveRadarMapTiles("https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"), null);
  assert.equal(resolveRadarMapTiles("https://anything.tile.openstreetmap.org/{z}/{x}/{y}.png"), null);
  assert.equal(resolveRadarMapTiles("https://tile.openstreetmap.org./{z}/{x}/{y}.png"), null);
});

test("basemap requires HTTPS, coordinate placeholders, and no embedded credentials", () => {
  const approved = "https://maps.example.invalid/tiles/{z}/{x}/{y}.png";
  assert.equal(resolveRadarMapTiles(approved), approved);
  assert.equal(resolveRadarMapTiles("  " + approved + "  "), approved);
  assert.equal(resolveRadarMapTiles("http://maps.example.invalid/{z}/{x}/{y}.png"), null);
  assert.equal(resolveRadarMapTiles("https://maps.example.invalid/tiles/{z}/{x}.png"), null);
  assert.equal(resolveRadarMapTiles("https://user:secret@maps.example.invalid/{z}/{x}/{y}.png"), null);
  assert.equal(resolveRadarMapTiles("not a URL/{z}/{x}/{y}"), null);
});

test("Leaflet recovers from tile errors and re-renders markers after initialization", () => {
  const ui = fs.readFileSync("src/components/crm/titan-radar.tsx", "utf8");
  const css = fs.readFileSync("src/components/crm/titan.module.css", "utf8");
  assert.match(ui, /referrerPolicy: "strict-origin-when-cross-origin"/);
  assert.match(ui, /tiles\.on\("tileerror"/);
  assert.match(ui, /setTileStatus\("failed"\)/);
  assert.match(ui, /setMapRevision\(n => n \+ 1\)/);
  assert.match(ui, /Ver la zona en OpenStreetMap/);
  assert.doesNotMatch(ui, /tileLayer\(process\.env\.NEXT_PUBLIC_AVALON_MAP_TILES\s*\|\|/);
  assert.match(css, /\.mapNotice/);
  assert.match(ui, /permissionsPolicy\?\.allowsFeature\("geolocation"\)/);
  assert.match(ui, /timeout: 12000/);
  assert.match(ui, /No se autorizó el acceso a tu ubicación/);
});


test("radar handles offline and stale requests without inventing business data", () => {
  const ui = fs.readFileSync("src/components/crm/titan-radar.tsx", "utf8");
  assert.match(ui, /const placesLoadRevision = useRef\(0\)/);
  assert.match(ui, /revision !== placesLoadRevision\.current/);
  assert.match(ui, /No se pudo conectar al servidor del radar/);
  assert.match(ui, /No se pudieron cargar las campañas/);
  assert.match(ui, /No se pudo buscar la ciudad/);
  assert.match(ui, /setPlaces\(body\.places \?\? \[\]\)/);
  assert.doesNotMatch(ui, /setPlaces\(\[\{.*example/i, "never synthesize placeholder businesses");
});
