const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const radarSource = fs.readFileSync("src/lib/crm/radar.ts","utf8");
function load(file, dependencies, env, fetcher) {
 const js=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 new Function("require","exports","process","fetch","AbortSignal","URLSearchParams",js)(
  name=>name==="server-only"?{}:name==="node:crypto"?require(name):dependencies[name]??(()=>{throw Error("Unexpected import: "+name)})(),
  exports,{env},fetcher,AbortSignal,URLSearchParams);
 return exports;
}
test("Geoapify failures never ingest, retry, or leak credentials",async()=>{
 const radar=load("src/lib/crm/radar.ts",{}, {},()=>{throw Error("no network")});
 const geo=load("src/lib/crm/radar-geoapify.ts",{"./radar":radar},{},()=>{throw Error("no network")});
 const key="syntheticKey1234567890";
 const area={lat:25.77,lon:-80.19,radiusM:2000,industries:["dental"],label:"Synthetic"};
 for(const status of [401,403,429,503]){
  let calls=0, writes=0;
  const search=load("src/lib/crm/radar-search.ts",{"./radar":radar,"./radar-geoapify":geo},
   {VERCEL_ENV:"production",AVALON_GEOAPIFY_PLACES_KEY:key},
   async()=>{calls++;return{ok:false,status,headers:{get:()=>null}}});
  const result=await search.searchAndIngest({rpc:async()=>{writes++;throw Error("unexpected write")}},area,"synthetic");
  assert.equal(result.ok,false);assert.equal(result.status,503);
  assert.equal(calls,1);assert.equal(writes,0);
  assert.ok(!JSON.stringify(result).includes(key));
 }
 let calls=0;
 const missing=load("src/lib/crm/radar-search.ts",{"./radar":radar,"./radar-geoapify":geo},
  {VERCEL_ENV:"production"},async()=>{calls++;throw Error("unexpected fetch")});
 const result=await missing.searchAndIngest({rpc:async()=>{throw Error("unexpected write")}},area,"synthetic");
 assert.equal(result.ok,false);assert.equal(result.blocked,"provider");assert.equal(calls,0);
});
