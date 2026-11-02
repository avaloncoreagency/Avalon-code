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
  name=> name==="server-only"?{} : name==="./radar"?radar : name==="./radar-geoapify"?geo :
    (()=>{throw Error("Unexpected "+name)})(),
  exports,{env},
 );
 assert.equal(exports.radarEndpoint().provider,"geoapify");
 assert.equal(exports.radarEndpoint().licensed,true);
 delete env.AVALON_GEOAPIFY_PLACES_KEY;
 assert.match(exports.radarEndpoint().error,/Radar sin proveedor/);
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
  "./radar":radar, "./radar-geoapify":geo,
  mockFetch:deps.mockFetch,
 });
 // compile() uses an isolated empty env; the endpoint cannot be used until a key
 // is configured. This is a deliberate no-credentials/no-provider safety gate.
 assert.equal(output.radarEndpoint().error!==undefined,true);
 const env={VERCEL_ENV:"production",AVALON_GEOAPIFY_PLACES_KEY:"c3da27885e3573e09e550d044bc55e22"};
 const exports={};
 new Function("require","exports","process","fetch","AbortSignal","URLSearchParams",js)(
  name=>name==="server-only"?{} : name==="./radar"?radar : name==="./radar-geoapify"?geo:
    (()=>{throw Error("Unexpected "+name)})(),
  exports,{env},deps.mockFetch,AbortSignal,URLSearchParams,
 );
 const db={rpc:async(name,args)=>{ingested={name,args};return{data:{run_id:"mock",found:2,inserted:2,updated:0,replayed:false},error:null};}};
 const result=await exports.searchAndIngest(db,area,"manual:test-0001");
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
