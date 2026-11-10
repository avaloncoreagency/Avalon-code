const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
function load(file,mocks={}){
 const js=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};new Function("require","module","exports",js)((id)=>id in mocks?mocks[id]:require(id),m,m.exports);return m.exports;
}
const domain=load("src/lib/os/domain.ts");
const t=load("src/lib/os/website-templates.ts",{"./domain":domain});
const exporter=load("src/lib/os/exporters.ts",{"./domain":domain});
test("all starting templates are valid content in EN and ES, without external or customer identities",()=>{
 assert.deepEqual(t.WEBSITE_PAGE_TEMPLATE_KEYS,["blank","services","portfolio"]);
 for(const lang of ["en","es"]){
  for(const name of t.WEBSITE_PAGE_TEMPLATE_KEYS){
   const blocks=t.websitePageTemplate(name,lang);
   const result=domain.validateBlocks(blocks);
   assert.equal(result.ok,true,lang+":"+name);
   assert.ok(blocks.length>=1 && blocks.length<=domain.MAX_BLOCKS);
   assert.equal(blocks.some(b=>JSON.stringify(b).includes("https://")) , false);
   const html=exporter.pageToHtml({title:"Synthetic",blocks},lang);
   assert.match(html,/<html lang=/);
   assert.ok(html.includes("<section"));
  }
 }
 assert.equal(t.websitePageTemplate("evil","es"),null);
});
test("template copies are isolated between unrelated projects",()=>{
 const a=t.websitePageTemplate("services","en");
 const b=t.websitePageTemplate("services","en");
 assert.ok(a && b);
 a[0].heading="Customer A editing";
 if(a[1].type==="features") a[1].items.push("New item");
 assert.notEqual(a[0].heading,b[0].heading);
 assert.equal(b[1].type==="features" && b[1].items.includes("New item"),false);
});
test("Website Designer continues using the existing project/pages model and owner action",()=>{
 const actions=fs.readFileSync("src/app/admin/workspace/website-designer/actions.ts","utf8");
 const listing=fs.readFileSync("src/app/admin/workspace/website-designer/[id]/page.tsx","utf8");
 assert.match(actions,/websitePageTemplate\(templateName, await getLang\(\)\)/);
 assert.match(actions,/const validated = validateBlocks\(preset\)/);
 assert.match(actions,/blocks: validated.value/);
 assert.match(actions,/await ownerForAction\(\)/);
 assert.match(listing,/name="template"/);
 assert.match(listing,/WEBSITE_PAGE_TEMPLATE_KEYS/);
});
