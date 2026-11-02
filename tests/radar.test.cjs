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
const loadRadar = () => mod.exports;
const sample = [
  { type: "node", id: 123, lat: 25.775, lon: -80.192,
    tags: { name: "Example Salon", shop: "hairdresser", "contact:phone": "+1-305-555-0100",
      "addr:street": "Example Street", "addr:housenumber": "12" } },
  { type: "way", id: 88, center: { lat: 25.774, lon: -80.19 },
    tags: { name: "Example Cafe", amenity: "cafe", website: "https://cafe.example.invalid",
      email: "info@cafe.example.invalid" } },
  { type: "node", id: 123, lat: 25.775, lon: -80.192,
    tags: { name: "Example Salon", shop: "hairdresser" } },
  { type: "node", id: 125,
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
test("radar is owner-gated, never rewards missing data and keeps human approval before the pipeline", () => {
  const read = f => fs.readFileSync(f, "utf8");
  const area = read("src/app/admin/workspace/crm/radar/area/route.ts");
  const places = read("src/app/admin/workspace/crm/radar/places/route.ts");
  const geo = read("src/app/admin/workspace/crm/radar/geocode/route.ts");
  const ui = read("src/components/crm/titan-radar.tsx");
  const crm = read("src/components/crm/crm.tsx");
  for (const route of [area, places, geo]) { assert.match(route, /getOwnerSession\(\)/); assert.match(route, /if \(!session\) return reply/); }
  assert.match(area, /30_000/, "per-owner brake for the community server");
  assert.match(area, /VERCEL_ENV === "production" && !configured/, "no community Overpass for production prospecting");
  assert.match(area, /crm_radar_ingest/);
  assert.doesNotMatch(area, /status: "approved"|crm_convert_prospect/, "search never approves or converts");
  assert.match(places, /crm_convert_prospect/, "pipeline transfer reuses the audited conversion");
  assert.match(places, /origin !== request\.nextUrl\.origin/, "cross-origin POST rejected");
  assert.match(geo, /1100/, "geocoder spaced per Nominatim policy");
  assert.match(ui, /No registrada en la fuente \(no significa que no tenga\)/);
  assert.match(ui, /OpenStreetMap/);
  assert.match(ui, /prefers-reduced-motion/);
  assert.match(ui, /SHAPE_LABEL/, "status shown by shape and text, not color only");
  assert.match(crm, /<TitanRadar onChanged/);
});

test("free area: any coordinate, configurable radius in mi/km, honest provider limits and safe query", () => {
  const r = loadRadar();
  const P = o => ({ get: k => (k in o ? o[k] : null) });
  const ok = r.parseRadarArea(P({ lat: "28.5383", lon: "-81.3792", radius: "3", unit: "mi", industries: "dental,restaurants,bogus" }), false);
  assert.equal(ok.radiusM, 4828);
  assert.deepEqual([...ok.industries], ["dental", "restaurants"]);
  assert.match(r.parseRadarArea(P({ lat: "28.5", lon: "-81.3", radius: "25", unit: "mi" }), false).error, /5 km/, "public server stays small");
  assert.equal(r.parseRadarArea(P({ lat: "28.5", lon: "-81.3", radius: "50", unit: "mi" }), true).radiusM, 80467, "50 mi with a licensed endpoint");
  assert.match(r.parseRadarArea(P({ lat: "28.5", lon: "-81.3", radius: "51", unit: "mi" }), true).error, /50 millas/);
  assert.match(r.parseRadarArea(P({ lat: "95", lon: "0", radius: "1" }), false).error, /punto válido/);
  const q = r.buildAreaQuery({ lat: 28.5, lon: -81.3, radiusM: 4828, industries: ["dental"], label: "" });
  assert.match(q, /around:4828,28\.5,-81\.3/);
  assert.match(q, /"amenity"="dentist"/);
  assert.doesNotMatch(r.buildAreaQuery({ lat: 1, lon: 1, radiusM: 500, industries: [], label: '"];out;' }), /out;"\]/, "labels never reach the query");
  const rows = r.toIngest([{ type: "node", id: 7, lat: 25.7, lon: -80.2, tags: { name: "Sintético", amenity: "dentist", phone: "+1 305 555 0101" } }, { type: "node", id: 7, lat: 1, lon: 1, tags: { name: "dup" } }, { type: "node", id: 8, tags: { name: "sin coordenadas" } }], "Miami");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_ref, "osm:node/7");
  assert.equal(rows[0].website, "", "no website tag stays empty, never asserted missing");
  assert.equal(r.tierStyle(null).label, "Sin calificar");
  assert.equal(r.tierStyle(5).color, "#39ff88");
  assert.equal(r.tierStyle(1).color, "#f43f5e");
});
