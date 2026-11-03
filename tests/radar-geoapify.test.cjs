const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync("src/lib/crm/radar-geoapify.ts", "utf8");
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: mod, exports: mod.exports, URL, Number, Set, Error });
const { buildGeoapifyRequest, geoapifyCategories, normalizeGeoapifyPlaces, GEOAPIFY_PLACES_LIMIT } = mod.exports;
const area = { lat: 25.774, lon: -80.19, radiusM: 5000, industries: ["restaurants", "dental"], label: "Miami" };

test("Geoapify search maps allowed industries to real categories and caps chargeable results", () => {
  const query = buildGeoapifyRequest(area, 1000);
  assert.deepEqual(Array.from(query.categories), ["catering", "healthcare.dentist"]);
  assert.equal(query.limit, 40);
  assert.equal(GEOAPIFY_PLACES_LIMIT, 40);
  assert.deepEqual(JSON.parse(JSON.stringify(query.filter)), { type: "circle", lon: -80.19, lat: 25.774, radius: 5000 });
  assert.equal(buildGeoapifyRequest(area, 9).limit, 9);
  assert.ok(geoapifyCategories([]).length > 2);
  assert.throws(() => buildGeoapifyRequest({ ...area, radiusM: 90000 }));
  assert.throws(() => buildGeoapifyRequest({ ...area, lat: 500 }));
});
test("Geoapify OSM records preserve attribution and OSM identity for dedupe", () => {
  const item = {
    type: "Feature",
    properties: {
      name: "Example Dental Clinic", place_id: "0123456789abcdef0123456789abcdef",
      lat: 25.77, lon: -80.19, formatted: "Example Street, Miami",
      categories: ["healthcare", "healthcare.dentist"],
      website: "https://example.invalid", phone: "+1-305-555-0140",
      datasource: { sourcename: "openstreetmap", raw: { osm_type: "n", osm_id: 123, email: "hello@example.invalid" } },
    },
    geometry: { type: "Point", coordinates: [-80.19, 25.77] },
  };
  const result = normalizeGeoapifyPlaces({ features: [item, item] }, "Miami");
  assert.equal(result.length, 1);
  const record = result[0];
  assert.equal(record.source_ref, "osm:node/123");
  assert.equal(record.name, "Example Dental Clinic");
  assert.equal(record.website, "https://example.invalid/");
  assert.equal(record.phone, "+1-305-555-0140");
  assert.equal(record.email, "hello@example.invalid");
  assert.equal(record.source_kind, "osm");
  assert.match(record.license, /ODbL/);
  assert.match(record.license, /Geoapify/);
  assert.equal(record.stars, undefined, "provider never invents opportunity scores");
});
test("Geoapify rejects non-OSM or invalid data and never assumes a business lacks a website", () => {
  const basic = {
    type: "Feature",
    properties: {
      name: "Example Cafe", place_id: "abcdef0123456789abcdef0123456789",
      lat: 25.7, lon: -80.1, categories: ["catering.cafe"],
      datasource: { sourcename: "openstreetmap", raw: {} },
    },
  };
  const wrongSource = { ...basic, properties: { ...basic.properties, datasource: { sourcename: "unknown", raw: {} } } };
  const invalid = { ...basic, properties: { ...basic.properties, name: "", place_id: "bad" } };
  const rows = normalizeGeoapifyPlaces({ features: [basic, wrongSource, invalid] }, "Miami");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_ref, "geoapify:abcdef0123456789abcdef0123456789");
  assert.equal(rows[0].website, "");
  assert.equal(rows[0].email, "");
  assert.equal(rows[0].location, "Miami");
  assert.equal(normalizeGeoapifyPlaces({ error: "quota" }, "Miami").length, 0);
});
test("Geoapify provider is explicit, server-only, owner gated and uses the existing ingest RPC", () => {
  const search = fs.readFileSync("src/lib/crm/radar-search.ts", "utf8");
  const areaRoute = fs.readFileSync("src/app/admin/workspace/crm/radar/area/route.ts", "utf8");
  const geoRoute = fs.readFileSync("src/app/admin/workspace/crm/radar/geocode/route.ts", "utf8");
  assert.match(search, /AVALON_RADAR_PROVIDER/);
  assert.match(search, /GEOAPIFY_API_KEY/);
  assert.match(search, /"x-api-key": key/);
  assert.match(search, /normalizeGeoapifyPlaces/);
  assert.match(search, /crm_radar_ingest/);
  assert.match(search, /VERCEL_ENV === "production"/);
  assert.doesNotMatch(search + geoRoute, /NEXT_PUBLIC_GEOAPIFY_API_KEY|service_role|SERVICE_ROLE/);
  assert.match(areaRoute, /getOwnerSession\(\)/);
  assert.match(areaRoute, /if \(!session\) return reply/);
  assert.match(areaRoute, /30_000/);
  assert.match(geoRoute, /getOwnerSession\(\)/);
  assert.match(geoRoute, /new URL\("https:\/\/api.geoapify.com\/v1\/geocode\/search"\)/);
});
