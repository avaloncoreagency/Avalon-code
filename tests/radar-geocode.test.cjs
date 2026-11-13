const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const js = ts.transpileModule(fs.readFileSync("src/lib/crm/radar-geocode.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", js)(mod, mod.exports);
const g = mod.exports;

test("radar geocode: coordinates resolve locally, no provider call", () => {
  assert.deepEqual(g.parseCoordinates("25.7743, -80.1937"), { label: "25.7743, -80.1937", lat: 25.7743, lon: -80.1937 });
  assert.deepEqual(g.parseCoordinates("40.4168 -3.7038").lat, 40.4168);
  assert.equal(g.parseCoordinates("91, 10"), null);
  assert.equal(g.parseCoordinates("10, 181"), null);
  assert.equal(g.parseCoordinates("Miami"), null);
  assert.equal(g.classifyQuery("25.77,-80.19"), "coordinates");
});

test("radar geocode: postcodes, addresses and places are told apart", () => {
  for (const zip of ["33101", "33101-1234", "28013", "SW1A 1AA", "K1A 0B1"]) assert.equal(g.classifyQuery(zip), "postcode", zip);
  for (const a of ["100 Las Olas Blvd, Fort Lauderdale", "Calle Mayor 5, Madrid"]) assert.equal(g.classifyQuery(a), "address", a);
  for (const p of ["Miami", "Ciudad de México", "Doral FL"]) assert.equal(g.classifyQuery(p), "place", p);
  assert.equal(g.normalizeQuery("  Miami   Beach  "), "Miami Beach");
});

test("radar geocode: postcode queries use the provider's postcode mode", () => {
  assert.deepEqual(g.providerParams("geoapify", "postcode", "33101"), { text: "33101", format: "json", limit: "5", lang: "es", type: "postcode" });
  assert.equal(g.providerParams("geoapify", "place", "Miami").type, undefined);
  assert.deepEqual(g.providerParams("nominatim", "postcode", "33101"), { postalcode: "33101", format: "jsonv2", limit: "5", addressdetails: "0" });
  assert.equal(g.providerParams("nominatim", "address", "1 Main St").q, "1 Main St");
});

test("radar geocode: empty answers are never cached; entries expire", () => {
  assert.equal(g.shouldCache([]), false);
  assert.equal(g.shouldCache([{ label: "Miami", lat: 25.7, lon: -80.1 }]), true);
  const now = Date.now();
  assert.equal(g.cacheFresh({ at: now - 1000 }, now), true);
  assert.equal(g.cacheFresh({ at: now - g.GEOCODE_CACHE_TTL_MS - 1 }, now), false);
  assert.equal(g.cacheFresh(undefined, now), false);
  assert.notEqual(g.geocodeCacheKey("postcode", "33101"), g.geocodeCacheKey("place", "33101"));
  assert.equal(g.classifyQuery("33311"), "postcode");
  assert.equal(g.classifyQuery("33009"), "postcode");
  assert.notEqual(g.geocodeCacheKey("postcode", "33311"), g.geocodeCacheKey("postcode", "33009"),
    "switching Florida ZIP codes must never reuse the prior geocode cache entry");
});

test("radar routes: search scoped by run_id, history route, kind persisted", () => {
  const places = fs.readFileSync("src/app/admin/workspace/crm/radar/places/route.ts", "utf8");
  assert.match(places, /crm_radar_run_places!inner/);
  assert.match(places, /UUID\.test\(run\)/);
  const area = fs.readFileSync("src/app/admin/workspace/crm/radar/area/route.ts", "utf8");
  assert.match(area, /RADAR_QUERY_KINDS/);
  const runs = fs.readFileSync("src/app/admin/workspace/crm/radar/runs/route.ts", "utf8");
  assert.match(runs, /getOwnerSession/);
  assert.doesNotMatch(runs, /service_role/i);
  const ui = fs.readFileSync("src/components/crm/titan-radar.tsx", "utf8");
  assert.match(ui, /setRunFilter\(runId\)/);
  assert.doesNotMatch(ui, /setView\("all"\); setOnlyZone\(true\);\s*await load\(\)/, "no stale-closure reload after a search");
});
