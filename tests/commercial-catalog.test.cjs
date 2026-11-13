const {test}=require("node:test");const assert=require("node:assert/strict");const fs=require("node:fs");const ts=require("typescript");
const src=fs.readFileSync("src/lib/commercial/catalog.ts","utf8");
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};new Function("module","exports",js)(mod,mod.exports);
const {OFFERS,commercialProposal}=mod.exports;
test("six unique bilingual service proposals, no duplicate SKU records",()=>{
 assert.deepEqual(OFFERS.map(x=>x.id),["website","ecommerce","crm","chatbot","receptionist","growth"]);
 for(const x of OFFERS){assert.equal(x.name.length,2);assert.ok(x.starter.length&&x.growth.length);
 for(const t of ["starter","growth"]){const p=commercialProposal(x,t);assert.equal(p.status,"unapproved_proposal");assert.ok(p.setupUsd>0&&p.monthlyUsd>0);}
 }
 assert.doesNotMatch(src,/\.insert\(|service_role|fetch\(/);
});
test("private catalog is read-only, owner protected and never approves rates",()=>{
 const page=fs.readFileSync("src/app/admin/workspace/marketing-hub/commercial/catalog/page.tsx","utf8");
 assert.match(page,/await requireOwner\(\)/);assert.match(page,/approval pending/);
 assert.doesNotMatch(page,/\.insert\(|\.update\(|service_role|approveService/);
});
