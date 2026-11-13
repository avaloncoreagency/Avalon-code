const {test}=require("node:test");const assert=require("node:assert/strict");const fs=require("node:fs");const ts=require("typescript");
const load=p=>{const js=ts.transpileModule(fs.readFileSync(p,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function("module","exports",js)(m,m.exports);return m.exports};
const {evaluateContractorRoute}=load("src/lib/commercial/routing.ts");
const {estimateCommission,estimateSetup}=load("src/lib/commercial/finance.ts");
const {costPerLead,conversionRate}=load("src/lib/commercial/metrics.ts");
const p={campaignId:"test",version:2,contractorId:"a",enabled:true,signedContractVerified:true,licenseVerified:true,capacityAvailable:true,allowedZips:["33311"],effectiveFromMs:100,effectiveUntilMs:300};
const r={zip:"33311",displayedContractorId:"a",consentedContractorId:"a",displayedPolicyVersion:2,consentGiven:true,receivedAtMs:200};
const hold=(p1,r1,reason)=>{const result=evaluateContractorRoute(p1,r1);assert.equal(result.status,"hold");assert.equal(result.contractorId,null);assert.ok(result.reasons.includes(reason))};
test("router: existing lead disclosure version mismatch blocks reroute",()=>hold({...p,version:3},r,"stale_disclosure"));
test("router: consent for different contractor blocks",()=>hold(p,{...r,consentedContractorId:"b"},"destination_mismatch"));
test("router: shown different contractor blocks",()=>hold(p,{...r,displayedContractorId:"b"},"destination_mismatch"));
test("router: missing license blocks",()=>hold({...p,licenseVerified:false},r,"license_not_verified"));
test("router: no signed contract blocks",()=>hold({...p,signedContractVerified:false},r,"contract_not_verified"));
test("router: capacity unavailable blocks",()=>hold({...p,capacityAvailable:false},r,"capacity_unavailable"));
test("router: unknown ZIP blocks",()=>hold(p,{...r,zip:"33009"},"out_of_service_area"));
test("router: policy outside time window blocks",()=>hold(p,{...r,receivedAtMs:300},"policy_not_effective"));
test("router: invalid version blocks",()=>hold({...p,version:0},r,"invalid_policy"));
test("commission: excluded amount equal to collected leaves zero fee",()=>{
 const result=estimateCommission({collectedAmount:"100.00",excludedAmount:"100",ratePercent:"5",signedTerms:true,eligibleAttribution:true,collectionVerified:true,legalReviewApproved:true});
 assert.equal(result.status,"eligible");assert.equal(result.estimatedCents,0);
});
test("commission: incomplete evidence stays pending with individual reasons",()=>{
 const result=estimateCommission({collectedAmount:"500.00",excludedAmount:"0",ratePercent:"10",signedTerms:true,eligibleAttribution:false,collectionVerified:false,legalReviewApproved:false});
 assert.equal(result.status,"pending");assert.equal(result.eligibleCents,null);assert.deepEqual(result.reasons,["attribution_not_verified","collection_not_verified","legal_review_pending"]);
});
test("money: 0.1 + 0.2 style input uses exact cent representation",()=>{
 const r=estimateSetup({setupPrice:"0.30",laborHours:"0",hourlyRate:"0",externalCosts:"0.10",contingency:"0.20",targetMargin:"40"});
 assert.equal(r.status,"ready");assert.equal(r.costCents,30);assert.equal(r.profitCents,0);
});
test("KPIs: spend zero with verified leads is valid zero; no leads is N/A",()=>{
 assert.deepEqual(costPerLead({status:"verified",cents:0},{status:"verified",value:10}),{status:"verified",value:0});
 assert.deepEqual(costPerLead({status:"verified",cents:100},{status:"verified",value:0}),{status:"n_a"});
});
test("KPIs: exact conversion values and invalid negative counts",()=>{
 assert.deepEqual(conversionRate({status:"verified",value:3},{status:"verified",value:12}),{status:"verified",value:25});
 assert.deepEqual(conversionRate({status:"verified",value:-1},{status:"verified",value:12}),{status:"n_a"});
});
