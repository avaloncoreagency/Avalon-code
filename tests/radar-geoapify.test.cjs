const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function compile(path, dependency = {}) {
  const text = fs.readFileSync(path, "utf8");
  const js = ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("require","module","exports","process","fetch","AbortSignal","URL","URLSearchParams",js)(
    name => {
      if (name in dependency) return dependency[name];
      if (name === "server-only") return {};
      if (name === "node:crypto") return require("node:crypto");
      throw new Error("Unexpected module import: " + name);
    },mod,mod.exports,{env:{}},dependency.mockFetch,AbortSignal,URL,URLSearchParams,
  );
  return mod.exports;
}
const radar = compile("src/lib/crm/radar.ts");
const geo = compile("src/lib/crm/radar-geoapify.ts",{"./radar":radar});
const tiles = compile("src/lib/crm/radar-map-tiles.ts");
const quota = compile("src/lib/crm/radar-quota.ts");
// Minimal stand-in for the supabase-js query builder used by searchAndIngest (runs table reads only).
function fakeDb({ runs = [], rpcResult } = {}) {
  const calls = { rpc: [], from: [] };
  const db = {
    calls,
    rpc: async (name, args) => { calls.rpc.push({ name, args }); return { data: rpcResult ?? { run_id: "mock", found: 2, inserted: 2, updated: 0, replayed: false }, error: null }; },
    from: table => {
      calls.from.push(table);
      const q = { filters: [], head: false };
      const api = {
        select: (_cols, opts) => { q.head = !!opts?.head; return api; },
        eq: (col, val) => { q.filters.push(["eq", col, val]); return api; },
        gte: (col, val) => { q.filters.push(["gte", col, val]); return api; },
        maybeSingle: async () => ({ data: runs.find(r => q.filters.every(([, c, v]) => r[c] === v)) ?? null, error: null }),
        then: (resolve) => resolve({ count: runs.length, data: null, error: null }),
      };
      return api;
    },
  };
  return db;
}

const area = {lat:25.7743,lon:-80.1937,radiusM:2000,industries:["dental"],label:"Miami"};
const sample = {
 type:"FeatureCollection",
 features:[
  {type:"Feature",properties:{
    name:"Bright Dentist",place_id:"long-id-of-geoapify-office-0001",
    categories:["healthcare.dentist"],formatted:"1 Brickell Plaza, Miami",
    lat:25.77,lon:-80.19,website:"https://bright.example.invalid",
    contact:{phone:"+1-305-555-0101",email:"info@bright.example.invalid"},
    datasource:{sourcename:"openstreetmap",raw:{osm_type:"n",osm_id:741122}},
   },geometry:{type:"Point",coordinates:[-80.19,25.77]}},
  {type:"Feature",properties:{
    name:"Bright Dentist (duplicated listing)",place_id:"different-geo-id",
    datasource:{raw:{osm_type:"n",osm_id:741122}},
    lat:25.77,lon:-80.19,
   }},
  {type:"Feature",properties:{
    name:"Local Clinic",place_id:"geoapify-very-long-provider-id-0123456789",
    categories:["healthcare.clinic_or_praxis"],city:"Miami",phone:"305 555 5555",
    lat:25.78,lon:-80.20,website:"",datasource:{sourcename:"geoapify"},
   }},
  {type:"Feature",properties:{
    name:"Bad Coordinates",place_id:"geoapify-bad-id-00000000000000",
    lat:200,lon:-80.2,
   }},
  {type:"Feature",properties:{
    name:"",place_id:"geoapify-no-name-0000000000000",
    lat:25,lon:-80,
   }},
 ]
};

test("free Geoapify uses bounded whitelist categories and radius, never default global scans",()=>{
 assert.equal(geo.validGeoapifyKey("c3da27885e3573e09e550d044bc55e22"),true);
 assert.equal(geo.validGeoapifyKey(""),false);
 assert.equal(geo.validGeoapifyKey("https://x.example.com?a=b"),false);
 assert.deepEqual(geo.geoapifyCategories(["dental"]),["healthcare.dentist"]);
 assert.ok(geo.geoapifyCategories([]).includes("commercial"));
 const request=geo.geoapifyPlacesRequest(area,500);
 assert.deepEqual(request.filter,{type:"circle",lon:area.lon,lat:area.lat,radius:area.radiusM});
 assert.equal(request.limit,60);
 assert.ok(request.categories.includes("healthcare.dentist"));
 assert.throws(()=>geo.geoapifyPlacesRequest({...area,radiusM:6000}),/geoapify_area_invalid/);
});
test("free Geoapify normalization preserves original OSM IDs and never invents contact, stars or websites",()=>{
 const output=geo.normalizeGeoapifyPlaces(sample);
 assert.equal(output.length,2);
 assert.equal(output[0].source_ref,"osm:node/741122");
 assert.equal(output[0].source_kind,"osm");
 assert.equal(output[0].email,"info@bright.example.invalid");
 assert.equal(output[0].website,"https://bright.example.invalid/");
 assert.match(output[0].license,/Geoapify/);
 assert.match(output[1].source_ref,/^geoapify:[0-9a-f]{64}$/);
 assert.equal(output[1].website,"");
 assert.equal(output[1].email,"");
 assert.equal(output[1].source_kind,"licensed");
 assert.equal(Object.hasOwn(output[0],"stars"),false);
 assert.equal(geo.normalizeGeoapifyPlaces({features:null}).length,0);
});
test("free dark tile requires a restricted public key, never points at blocked OSM servers",()=>{
 assert.equal(tiles.geoapifyFreeTileUrl(""),null);
 assert.equal(tiles.geoapifyFreeTileUrl("not a key"),null);
 assert.equal(tiles.geoapifyFreeTileUrl("c3da27885e3573e09e550d044bc55e22"),
  "https://maps.geoapify.com/v1/tile/dark-matter/{z}/{x}/{y}.png?apiKey=c3da27885e3573e09e550d044bc55e22");
 assert.match(tiles.GEOAPIFY_FREE_TILE_ATTRIBUTION,/Geoapify/);
 assert.match(tiles.GEOAPIFY_FREE_TILE_ATTRIBUTION,/OpenMapTiles/);
 assert.match(tiles.GEOAPIFY_FREE_TILE_ATTRIBUTION,/OpenStreetMap/);
 assert.equal(tiles.resolveRadarMapTiles("https://tile.openstreetmap.org/{z}/{x}/{y}.png"),null);
});
test("server-only Geoapify provider never needs community Overpass in production",()=>{
 const js=ts.transpileModule(fs.readFileSync("src/lib/crm/radar-search.ts","utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
 }).outputText;
 const exports={};
 const env={VERCEL_ENV:"production",AVALON_GEOAPIFY_PLACES_KEY:"c3da27885e3573e09e550d044bc55e22"};
 new Function("require","exports","process",js)(
  name=> name==="server-only"?{} : name==="./radar"?radar : name==="./radar-geoapify"?geo : name==="./radar-quota"?quota :
    (()=>{throw Error("Unexpected "+name)})(),
  exports,{env},
 );
 assert.equal(exports.radarEndpoint().provider,"geoapify");
 assert.equal(exports.radarEndpoint().licensed,true);
 delete env.AVALON_GEOAPIFY_PLACES_KEY;
 assert.match(exports.radarEndpoint().error,/Radar sin Geoapify configurado/);
});
test("live endpoint path sends a key ONLY server-side, limits results, persists pending real places",async()=>{
 const js=ts.transpileModule(fs.readFileSync("src/lib/crm/radar-search.ts","utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
 }).outputText;
 let request, ingested;
 const deps={
  mockFetch:async(url,opts)=>{
   request={url,opts};
   return {ok:true,status:200,headers:{get:()=>null},json:async()=>sample};
  },
 };
 const output=compile("src/lib/crm/radar-search.ts",{
  "./radar":radar, "./radar-geoapify":geo, "./radar-quota":quota,
  mockFetch:deps.mockFetch,
 });
 // The explicitly non-production default still supports bounded community
 // Overpass for development; production without a key is blocked in the prior test.
 assert.match(output.radarEndpoint().error,/Radar sin Geoapify/);
 const env={VERCEL_ENV:"production",AVALON_GEOAPIFY_PLACES_KEY:"c3da27885e3573e09e550d044bc55e22"};
 const exports={};
 new Function("require","exports","process","fetch","AbortSignal","URLSearchParams",js)(
  name=>name==="server-only"?{} : name==="./radar"?radar : name==="./radar-geoapify"?geo: name==="./radar-quota"?quota:
    (()=>{throw Error("Unexpected "+name)})(),
  exports,{env},deps.mockFetch,AbortSignal,URLSearchParams,
 );
 const db=fakeDb();
 const result=await exports.searchAndIngest(db,area,"manual:test-0001");
 ingested=db.calls.rpc[0];
 assert.equal(result.ok,true);
 assert.equal(request.url,"https://api.geoapify.com/v2/places");
 assert.equal(request.opts.headers["x-api-key"],env.AVALON_GEOAPIFY_PLACES_KEY);
 assert.ok(!request.url.includes(env.AVALON_GEOAPIFY_PLACES_KEY));
 assert.equal(JSON.parse(request.opts.body).limit,60);
 assert.equal(ingested.name,"crm_radar_ingest");
 assert.equal(ingested.args.places.length,2);
 assert.equal(ingested.args.places[0].source_ref,"osm:node/741122");
 assert.ok(!JSON.stringify(result).includes(env.AVALON_GEOAPIFY_PLACES_KEY));
});

// ── Quota and replay protection (defect found 2026-11-03: a repeated run key still queried the provider) ──
function loadSearch(env, mockFetch) {
 const js=ts.transpileModule(fs.readFileSync("src/lib/crm/radar-search.ts","utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
 }).outputText;
 const exports={};
 new Function("require","exports","process","fetch","AbortSignal","URLSearchParams",js)(
  name=>name==="server-only"?{} : name==="./radar"?radar : name==="./radar-geoapify"?geo : name==="./radar-quota"?quota :
    (()=>{throw Error("Unexpected "+name)})(),
  exports,{env},mockFetch,AbortSignal,URLSearchParams,
 );
 return exports;
}
const KEY = "c3da27885e3573e09e550d044bc55e22";
const okFetch = () => { const f = async () => { f.calls++; return { ok:true, status:200, headers:{get:()=>null}, json:async()=>sample }; }; f.calls = 0; return f; };

test("quota helpers: limit parsing, UTC day start and honest upper-bound credits", () => {
 assert.equal(quota.dailySearchLimit(undefined), 100);
 assert.equal(quota.dailySearchLimit("40"), 40);
 for (const bad of ["0", "501", "-3", "1e3", "abc", "", "  ", "12.5"]) assert.equal(quota.dailySearchLimit(bad), 100, bad);
 assert.equal(quota.utcDayStartIso(Date.parse("2026-11-03T23:59:59Z")), "2026-11-03T00:00:00.000Z");
 const q = quota.quotaState(30, 100);
 assert.deepEqual({ ...q }, { searchesToday: 30, limit: 100, remaining: 70, blocked: false, maxCreditsUsed: 90, sharedDailyCredits: 3000 });
 assert.equal(quota.quotaState(100, 100).blocked, true);
 assert.equal(quota.quotaState(250, 100).remaining, 0);
 assert.match(quota.quotaMessage(quota.quotaState(100, 100)), /100 de 100 búsquedas hoy/);
});

test("a run key that already exists is replayed WITHOUT querying the provider", async () => {
 const f = okFetch();
 const search = loadSearch({ VERCEL_ENV: "production", AVALON_GEOAPIFY_PLACES_KEY: KEY }, f);
 const db = fakeDb({ runs: [{ id: "run-1", idempotency_key: "campaign:abc:2026-11-03T14", found: 7, inserted: 5, updated: 2 }] });
 const out = await search.searchAndIngest(db, area, "campaign:abc:2026-11-03T14", "abc", 60);
 assert.equal(out.ok, true);
 assert.deepEqual({ ...out.run }, { run_id: "run-1", found: 7, inserted: 5, updated: 2, replayed: true });
 assert.equal(f.calls, 0, "no provider call, no credits spent");
 assert.equal(db.calls.rpc.length, 0, "nothing re-ingested");
});

test("a new run key queries the provider exactly once and persists it", async () => {
 const f = okFetch();
 const search = loadSearch({ VERCEL_ENV: "production", AVALON_GEOAPIFY_PLACES_KEY: KEY }, f);
 const db = fakeDb({ runs: [] });
 const out = await search.searchAndIngest(db, area, "manual:fresh-0001");
 assert.equal(out.ok, true);
 assert.equal(f.calls, 1);
 assert.equal(db.calls.rpc.length, 1);
});

test("the daily cap blocks BEFORE spending credits and says why", async () => {
 const f = okFetch();
 const search = loadSearch({ VERCEL_ENV: "production", AVALON_GEOAPIFY_PLACES_KEY: KEY, AVALON_RADAR_DAILY_SEARCH_LIMIT: "2" }, f);
 const db = fakeDb({ runs: [{ id: "a", idempotency_key: "k1" }, { id: "b", idempotency_key: "k2" }] });
 const out = await search.searchAndIngest(db, area, "manual:over-quota-1");
 assert.equal(out.ok, false);
 assert.equal(out.status, 429);
 assert.equal(out.blocked, "quota");
 assert.match(out.error, /2 de 2 búsquedas hoy/);
 assert.match(out.error, /00:00 UTC/);
 assert.equal(f.calls, 0, "provider untouched once the cap is reached");
 assert.ok(!out.error.includes(KEY));
});

test("quota is not applied to the community/licensed Overpass endpoint and is null when the table is unavailable", async () => {
 const f = okFetch();
 const search = loadSearch({ VERCEL_ENV: "production", AVALON_RADAR_OVERPASS_URL: "https://overpass.example.invalid/api" }, f);
 const db = fakeDb({ runs: Array.from({ length: 500 }, (_, i) => ({ id: String(i), idempotency_key: "k" + i })) });
 const out = await search.searchAndIngest(db, { ...area }, "manual:overpass-0001");
 assert.equal(out.ok, true);
 const broken = { from: () => { const api = { select: () => api, gte: () => api, then: r => r({ count: null, error: { code: "42P01" } }) }; return api; } };
 const geoSearch = loadSearch({ AVALON_GEOAPIFY_PLACES_KEY: KEY }, f);
 assert.equal(await geoSearch.radarQuota(broken), null, "never invents a figure when the data is unavailable");
});

test("campaign and area routes surface the quota and release the 30 s brake on blocked searches", () => {
 const areaRoute = fs.readFileSync("src/app/admin/workspace/crm/radar/area/route.ts", "utf8");
 assert.match(areaRoute, /if \(out\.blocked\) lastByOwner\.delete\(session\.userId\)/);
 assert.match(areaRoute, /quota: await radarQuota\(session\.supabase\)/);
 assert.doesNotMatch(areaRoute, /servidor de datos abiertos/, "message must not blame the open-data server when Geoapify is the provider");
 const campaigns = fs.readFileSync("src/app/admin/workspace/crm/radar/campaigns/route.ts", "utf8");
 assert.match(campaigns, /radarQuota\(session\.supabase\)/);
 const ui = fs.readFileSync("src/components/crm/titan-radar.tsx", "utf8");
 assert.match(ui, /data-testid="radar-quota"/);
 assert.match(ui, /estimación máxima/);
});

// ── Visible provider states (issue #98 priority 3): each failure says what happened and never invents data ──
const failing = (response) => { const f = async () => { f.calls++; if (response instanceof Error) throw response; return response; }; f.calls = 0; return f; };
const named = (name, message = name) => Object.assign(new Error(message), { name });
const search = (fetchImpl, env = { VERCEL_ENV: "production", AVALON_GEOAPIFY_PLACES_KEY: KEY }) => loadSearch(env, fetchImpl);

test("provider not configured: a clear 'provider' block, no call is attempted", async () => {
  const f = failing(named("Error"));
  const out = await search(f, { VERCEL_ENV: "production" }).searchAndIngest(fakeDb(), area, "manual:no-provider-1");
  assert.equal(out.ok, false); assert.equal(out.status, 503); assert.equal(out.blocked, "provider");
  assert.match(out.error, /Radar sin Geoapify configurado/);
  assert.equal(f.calls, 0);
});

test("403 and 401 say the key was rejected, 429 says the quota was hit; neither retries nor leaks the key", async () => {
  for (const status of [401, 403]) {
    const f = failing({ ok: false, status, headers: { get: () => null }, json: async () => ({}) });
    const out = await search(f).searchAndIngest(fakeDb(), area, "manual:forbidden-" + status);
    assert.equal(out.ok, false); assert.equal(out.status, 503);
    assert.match(out.error, /rechazó la clave \(401\/403\)/);
    assert.ok(!out.error.includes(KEY));
    assert.equal(f.calls, 1, "exactly one attempt, never an automatic retry");
  }
  const f429 = failing({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) });
  const limited = await search(f429).searchAndIngest(fakeDb(), area, "manual:limited-1");
  assert.match(limited.error, /limitó las consultas \(429\).*No se realizan reintentos automáticos/);
  assert.equal(f429.calls, 1);
});

test("other upstream errors report the status; nothing is persisted", async () => {
  const f = failing({ ok: false, status: 502, headers: { get: () => null }, json: async () => ({}) });
  const db = fakeDb();
  const out = await search(f).searchAndIngest(db, area, "manual:upstream-1");
  assert.match(out.error, /El proveedor respondió 502\. No se muestran resultados inventados/);
  assert.equal(db.calls.rpc.length, 0, "no businesses saved");
});

test("timeout, network failure and malformed answer are three different visible states", async () => {
  const dbs = [fakeDb(), fakeDb(), fakeDb()];
  const timeout = await search(failing(named("TimeoutError", "The operation was aborted due to timeout"))).searchAndIngest(dbs[0], area, "manual:timeout-1");
  assert.equal(timeout.status, 504);
  assert.match(timeout.error, /no respondió a tiempo \(12 s\).*No se reintenta automáticamente/);
  const aborted = await search(failing(named("AbortError"))).searchAndIngest(fakeDb(), area, "manual:aborted-1");
  assert.equal(aborted.status, 504);
  const network = await search(failing(new TypeError("fetch failed"))).searchAndIngest(dbs[1], area, "manual:network-1");
  assert.equal(network.status, 503);
  assert.match(network.error, /No se pudo conectar con el proveedor de búsqueda \(red\)/);
  const badJson = await search(failing({ ok: true, status: 200, headers: { get: () => null }, json: async () => { throw new SyntaxError("Unexpected token <"); } })).searchAndIngest(dbs[2], area, "manual:badjson-1");
  assert.equal(badJson.status, 502);
  assert.match(badJson.error, /respuesta que no se pudo interpretar.*No se guardó nada/);
  assert.notEqual(timeout.error, network.error);
  assert.notEqual(network.error, badJson.error);
  for (const db of dbs) assert.equal(db.calls.rpc.length, 0, "a failed call persists nothing");
  for (const out of [timeout, network, badJson]) assert.ok(!out.error.includes(KEY));
});

test("providerFailure labels the licensed/community timeout with its own limit", () => {
  const seconds = (n) => search(failing(named("Error"))).providerFailure(named("TimeoutError"), n).error;
  assert.match(seconds(65), /\(65 s\)/);
  assert.match(seconds(16), /\(16 s\)/);
});
