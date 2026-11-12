const {test}=require("node:test");const assert=require("node:assert/strict");const fs=require("node:fs");const ts=require("typescript");
const load=(path,requireFn)=>{const js=ts.transpileModule(fs.readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function("module","exports","require",js)(m,m.exports,requireFn);return m.exports;};
const routing=load("src/lib/commercial/routing.ts",require);
const life=load("src/lib/commercial/b2c-lifecycle.ts",id=>{if(id==="./routing")return routing;throw Error("unexpected dependency: "+id)});
const p={campaignId:"synthetic-hvac",version:1,contractorId:"a",enabled:true,signedContractVerified:true,licenseVerified:true,capacityAvailable:true,allowedZips:["33311"],effectiveFromMs:0,effectiveUntilMs:null};
const r={zip:"33311",displayedContractorId:"a",consentedContractorId:"a",displayedPolicyVersion:1,consentGiven:true,receivedAtMs:5};
test("B2C lifecycle cannot open without required policy and consent",()=>{
 assert.equal(life.openB2cCase("request-0001","consent-v1",p,{...r,consentGiven:false}).ok,false);
 assert.equal(life.openB2cCase("request-0001","consent-v1",{...p,contractorId:"b"},r).ok,false);
});
test("B2C lifecycle snapshots destination and disclosure, does not create a sale or commission",()=>{
 const out=life.openB2cCase("request-0001","consent-v1",p,r);
 assert.equal(out.ok,true);
 assert.equal(out.value.contractorId,"a");
 assert.equal(out.value.policyVersion,1);
 assert.equal(out.value.status,"routed");
 assert.equal(out.value.revision,1);
 assert.equal(out.value.events.length,0);
});
test("B2C lifecycle enforces valid ordered transitions and optimistic concurrency",()=>{
 const start=life.openB2cCase("request-0001","consent-v1",p,r).value;
 const event={eventId:"event-0001",nextStatus:"acknowledged",actorId:"owner-1",timestampMs:12};
 const a=life.applyB2cEvent(start,1,event);
 assert.equal(a.ok,true);
 assert.equal(a.value.status,"acknowledged");
 assert.equal(a.value.revision,2);
 assert.equal(life.applyB2cEvent(a.value,1,{...event,eventId:"event-0002"}).error,"version_conflict");
 assert.equal(life.applyB2cEvent(a.value,2,{...event,eventId:"event-0003",nextStatus:"won"}).error,"invalid_transition");
 const replay=life.applyB2cEvent(a.value,1,event);
 assert.equal(replay.ok,true);assert.equal(replay.replayed,true);
 assert.equal(life.applyB2cEvent(a.value,2,{...event,nextStatus:"contacted"}).error,"idempotency_conflict");
 assert.equal(a.value.contractorId,"a");
});
test("B2C lifecycle terminal lost/won cases cannot restart",()=>{
 const start=life.openB2cCase("request-0001","consent-v1",p,r).value;
 const lost=life.applyB2cEvent(start,1,{eventId:"event-0001",nextStatus:"lost",actorId:"owner-1",timestampMs:12}).value;
 assert.equal(life.applyB2cEvent(lost,2,{eventId:"event-0002",nextStatus:"contacted",actorId:"owner-1",timestampMs:13}).error,"invalid_transition");
});
test("B2C simulation page is private, nonpersistent and separate from agency funnel RPC",()=>{
 const page=fs.readFileSync("src/app/admin/workspace/marketing-hub/commercial/router/page.tsx","utf8");
 const client=fs.readFileSync("src/app/admin/workspace/marketing-hub/commercial/router/router-preview.tsx","utf8");
 assert.match(page,/await requireOwner\(\)/);
 assert.match(client,/evaluateContractorRoute/);
 assert.doesNotMatch(page+client,/\.insert\(|\.update\(|fetch\(|crm_growth_funnel_submit|service_role/);
});
