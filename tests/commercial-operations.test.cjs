const {test}=require("node:test");const assert=require("node:assert/strict");const fs=require("node:fs");const ts=require("typescript");
const load=path=>{const s=fs.readFileSync(path,"utf8");const js=ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function("module","exports",js)(m,m.exports);return m.exports};
const op=load("src/lib/commercial/operations.ts");const knowledge=load("src/lib/commercial/knowledge.ts");const campaigns=load("src/lib/commercial/campaigns.ts");
test("six sales phases are documented without a new pipeline",()=>{
 assert.deepEqual(op.SALES_PHASES.map(p=>p.key),["capture","discovery","proposal","contract","onboarding","delivery"]);
 assert.ok(op.INDUSTRY_DISCOVERY.length>=3);
});
const doc={clientId:"a",sourceId:"document-1",version:1,locale:"es",approval:"approved",approvedBy:"owner",approvedAtMs:100,reviewDueAtMs:2000,allowedProducts:["chatbot"],text:"Approved opening hours."};
test("knowledge cannot cross tenants, products, dates or revocation",()=>{
 assert.equal(knowledge.canUseKnowledge(doc,"a","chatbot",1000).usable,true);
 assert.equal(knowledge.canUseKnowledge(doc,"b","chatbot",1000).reason,"wrong_client");
 assert.equal(knowledge.canUseKnowledge(doc,"a","receptionist",1000).reason,"wrong_product");
 assert.equal(knowledge.canUseKnowledge(doc,"a","chatbot",2000).reason,"expired");
 assert.equal(knowledge.canUseKnowledge({...doc,approval:"revoked"},"a","chatbot",1000).reason,"revoked");
 assert.equal(knowledge.canUseKnowledge({...doc,approval:"draft"},"a","chatbot",1000).reason,"not_approved");
 assert.equal(knowledge.canUseKnowledge({...doc,sourceId:""},"a","chatbot",1000).reason,"invalid");
});
test("AI guide has independent industries and remains detached from providers",()=>{
 assert.equal(knowledge.INDUSTRY_KNOWLEDGE.length,8);
 assert.equal(new Set(knowledge.INDUSTRY_KNOWLEDGE.map(x=>x.key)).size,8);
 assert.doesNotMatch(fs.readFileSync("src/lib/commercial/knowledge.ts","utf8"),/fetch\(|service_role/);
});
const ready={audience:"agency_b2b",approvedCopy:true,consentReviewed:true,budgetApproved:true,destinationVerified:true,contractorLicenseVerified:true,legalReview:true,isolatedB2CBackend:false};
test("campaign readiness remains review-only even if every required flag is checked",()=>{
 assert.deepEqual(campaigns.reviewCampaign(ready),{status:"review_only",reasons:[]});
 assert.equal(campaigns.reviewCampaign({...ready,audience:"contractor_b2c"}).status,"blocked");
 assert.equal(campaigns.reviewCampaign({...ready,budgetApproved:false}).status,"blocked");
 assert.equal(campaigns.CAMPAIGN_BRIEFS.length,2);
});
test("all three commercial guidance pages are owner-only and read-only",()=>{
 for(const kind of ["playbook","knowledge","campaigns"]){
  const p=fs.readFileSync("src/app/admin/workspace/marketing-hub/commercial/"+kind+"/page.tsx","utf8");
  assert.match(p,/await requireOwner\(\)/);
  assert.doesNotMatch(p,/\.insert\(|\.update\(|service_role|publishAd\(/);
 }
});
