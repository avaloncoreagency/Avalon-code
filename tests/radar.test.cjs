const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const path = "src/lib/crm/radar.ts";
const mod = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: mod.exports, module: mod, require, URL, Number, Set, Error },
);
const { parseRadarSearch, buildRadarQuery, normalizeRadarResults, radarOpportunity } = mod.exports;
const sample = [
  { type: "node", id: 123, lat: 25.775, lon: -80.192,
    tags: { name: "Example Salon", shop: "hairdresser", "contact:phone": "+1-305-555-0100",
      "addr:street": "Example Street", "addr:housenumber": "12" } },
  { type: "way", id: 88, center: { lat: 25.774, lon: -80.19 },
    tags: { name: "Example Cafe", amenity: "cafe", website: "https://cafe.example.invalid",
      email: "info@cafe.example.invalid" } },
  { type: "node", id: 123, lat: 25.775, lon: -80.192,
    tags: { name: "Example Salon", shop: "hairdresser" } },
  { type: "node", id: 125, lat: 25.774, lon: -80.19,
    tags: { name: "No Coordinates", shop: "hairdresser" } },
  { type: "node", id: 126, lat: 25.771, lon: -80.188,
    tags: { name: "Dangerous", shop: "kiosk", website: "javascript:alert(1)" } },
];
test("radar only accepts configured zones, services and small radii", () => {
  assert.equal(parseRadarSearch("miami", "website", "1500").zone.name, "Miami · Downtown");
  assert.equal(parseRadarSearch("miami", "crm", "2500").service, "crm");
  for (const [zone, service, radius] of [
    ["../../other", "website", "1500"], ["miami", "inject", "800"],
    ["miami", "website", "10000"], ["miami", "website", "0"],
  ]) assert.equal(parseRadarSearch(zone, service, radius), null);
});
test("Overpass QL uses only bounded, named businesses and valid radius", () => {
  const q = buildRadarQuery(25.7743, -80.1937, 1500);
  assert.match(q, /\[out:json\]\[timeout:12\]/);
  assert.match(q, /around:1500,25.7743,-80.1937/);
  assert.match(q, /out center 120/);
  assert.throws(() => buildRadarQuery(999, 0, 1500));
  assert.throws(() => buildRadarQuery(25, 0, 40000));
});
test("website radar uses missing map tags as a review signal, never proof", () => {
  const places = normalizeRadarResults(sample, "website", "Miami");
  assert.equal(places.length, 2);
  assert.equal(places[0].name, "Example Salon");
  assert.equal(places[0].phone, "+1-305-555-0100");
  assert.match(places[0].mapUrl, /^https:\/\/www\.openstreetmap\.org\/node\/123$/);
  assert.match(places[0].opportunity, /no registrado/i);
  assert.match(places[0].opportunity, /confirmar/i);
  assert.equal(places[1].website, "", "never produce a javascript URL");
});
test("other service gaps remain explicitly unverified and emails come from public tags", () => {
  const places = normalizeRadarResults(sample, "receptionist", "Miami");
  const cafe = places.find(p => p.name === "Example Cafe");
  assert.ok(cafe);
  assert.equal(cafe.email, "info@cafe.example.invalid");
  assert.equal(cafe.website, "https://cafe.example.invalid/");
  assert.match(cafe.opportunity, /Verificar por llamada/);
  assert.match(radarOpportunity("crm", true, "salon"), /no permite saber si usa CRM/);
  assert.match(radarOpportunity("ecommerce", true, "shop"), /Comprobar si vende online/);
});
test("radar is owner-gated and reuses CRM's validated pending prospect handoff", () => {
  const route = fs.readFileSync("src/app/admin/workspace/crm/radar/route.ts", "utf8");
  const ui = fs.readFileSync("src/components/crm/radar.tsx", "utf8");
  const crm = fs.readFileSync("src/components/crm/crm.tsx", "utf8");
  assert.match(route, /getOwnerSession/);
  assert.match(route, /if \(!session\) return reply/);
  assert.match(route, /WAIT = 30 \* 1000/);
  assert.match(ui, /entity: "prospects"/);
  assert.match(ui, /status: "pending"/);
  assert.match(ui, /OpenStreetMap/);
  assert.match(ui, /no demuestra que el negocio carezca/);
  assert.match(crm, /<LeadRadar ownerId/);
});
