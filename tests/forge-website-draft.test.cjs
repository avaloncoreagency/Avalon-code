const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function loadTs(file, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(file,"utf8"), {
    fileName:file,reportDiagnostics:true,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  });
  assert.deepEqual((output.diagnostics||[]).filter(d => d.category === ts.DiagnosticCategory.Error),[]);
  const mod={exports:{}};
  new Function("require","module","exports",output.outputText)((id)=>id in mocks?mocks[id]:require(id),mod,mod.exports);
  return mod.exports;
}
const d=loadTs("src/lib/os/website-local-draft.ts");
const domain=loadTs("src/lib/os/domain.ts");
const exporters=loadTs("src/lib/os/exporters.ts",{"./domain":domain});
const owner1="00000000-0000-4000-8000-000000000001";
const owner2="00000000-0000-4000-8000-000000000002";
const project="00000000-0000-4000-8000-000000000010";
const page="00000000-0000-4000-8000-000000000011";
const time=Date.parse("2026-11-10T12:00:00Z");
const FIELDS=["heading","body"];

test("draft isolation: owner, project, page and form all affect the key",()=>{
 const a=d.websiteDraftKey(owner1,project,page,"block-0");
 const unique=[
   d.websiteDraftKey(owner2,project,page,"block-0"),
   d.websiteDraftKey(owner1,"00000000-0000-4000-8000-000000000012",page,"block-0"),
   d.websiteDraftKey(owner1,project,"00000000-0000-4000-8000-000000000013","block-0"),
   d.websiteDraftKey(owner1,project,page,"meta"),
   d.websiteDraftKey(owner1,project,page,"block-1"),
 ];
 assert.equal(new Set([a,...unique]).size,6);
 assert.throws(()=>d.websiteDraftKey("not-an-owner",project,page,"meta"),/invalid_draft_scope/);
 assert.throws(()=>d.websiteDraftKey(owner1,project,page,"../secret"),/invalid_draft_scope/);
});

test("typing + navigation: a valid local copy restores text only when the stored version is unchanged",()=>{
 const baseline={heading:"Inicio",body:"Texto anterior"};
 const edit={heading:"Sitio de servicios",body:"Texto nuevo de ejemplo"};
 const snap=d.makeWebsiteDraft(1,baseline,edit,time);
 assert.ok(snap);
 const restored=d.parseWebsiteDraft(JSON.stringify(snap),time+100);
 assert.deepEqual(restored,snap);
 assert.equal(d.reconcileWebsiteDraft(restored,1,baseline,FIELDS),"restore");
 assert.equal(restored.values.body,edit.body);
});

test("successful server save + reopen: confirmed content clears the backup and exports the saved site",()=>{
 const initial={heading:"Inicio",body:"Original"};
 const edited={heading:"Sitio comercial",body:"Página real & segura"};
 const snap=d.makeWebsiteDraft(1,initial,edited,time);
 // Synthetic server-equivalent: existing actions validate and save under an
 // optimistic version guard. A new read confirms the persisted block content.
 const valid=domain.validateBlock({type:"text",...edited});
 assert.equal(valid.ok,true);
 const reopened={...valid.value};
 assert.equal(d.reconcileWebsiteDraft(snap,2,reopened,FIELDS),"confirmed");
 const html=exporters.pageToHtml({title:"Sitio ficticio",blocks:[reopened]},"es");
 assert.match(html,/Sitio comercial/);
 assert.match(html,/P[aá]gina real &amp; segura/);
 assert.doesNotMatch(html,/Página real & segura/);
});

test("conflicting remote edit preserves the unsaved copy instead of silently overwriting it",()=>{
 const baseline={heading:"Antes",body:"Hola"};
 const pending={heading:"Mi borrador",body:"Edición no guardada"};
 const snap=d.makeWebsiteDraft(5,baseline,pending,time);
 assert.equal(d.reconcileWebsiteDraft(snap,6,{heading:"Edición remota",body:"Hola"},FIELDS),"conflict");
 assert.equal(d.reconcileWebsiteDraft(snap,5,{heading:"Mutación externa",body:"Hola"},FIELDS),"conflict");
 assert.equal(d.reconcileWebsiteDraft(snap,5,baseline,["heading"]),"conflict",
   "a moved/replaced block must not auto-apply a different field set");
 assert.equal(snap.values.heading,"Mi borrador");
});

test("normalization allows a confirmed save with trimmed fields and cleaned feature lines",()=>{
 const baseline={heading:"Lista",items:"Primero\nSegundo"};
 const pending={heading:" Nueva lista  ",items:" Primera línea  \n\n Segunda línea "};
 const snap=d.makeWebsiteDraft(1,baseline,pending,time);
 assert.equal(d.reconcileWebsiteDraft(snap,2,{heading:"Nueva lista",items:"Primera línea\nSegunda línea"},["heading","items"]),"confirmed");
});

test("expired, future, malformed, oversized and unsafe local data are ignored",()=>{
 const baseline={heading:"x",body:"y"};
 const draft=d.makeWebsiteDraft(1,baseline,{heading:"a",body:"b"},time);
 assert.equal(d.parseWebsiteDraft(JSON.stringify(draft),time+d.WEBSITE_DRAFT_TTL_MS+1),null);
 assert.equal(d.parseWebsiteDraft(JSON.stringify(draft),time-120001),null);
 assert.equal(d.parseWebsiteDraft("{invalid",time),null);
 assert.equal(d.parseWebsiteDraft("x".repeat(25000),time),null);
 assert.equal(d.parseWebsiteDraft(JSON.stringify({...draft,values:{password:"secret"}}),time),null);
 assert.equal(d.parseWebsiteDraft(JSON.stringify({...draft,values:{heading:"a"}}),time),null);
 assert.equal(d.makeWebsiteDraft(1,{heading:"a"},{heading:"a",body:"b"},time),null);
 assert.equal(d.makeWebsiteDraft(1,{body:"x".repeat(11001)},{body:"y"},time),null);
});

test("existing owner-only versioned actions, Preview and HTML export remain authoritative",()=>{
 const editor=fs.readFileSync("src/app/admin/workspace/website-designer/[id]/pages/[pageId]/page.tsx","utf8");
 const actions=fs.readFileSync("src/app/admin/workspace/website-designer/actions.ts","utf8");
 const preview=fs.readFileSync("src/app/admin/workspace/website-designer/[id]/pages/[pageId]/preview/page.tsx","utf8");
 const exportRoute=fs.readFileSync("src/app/admin/workspace/website-designer/[id]/pages/[pageId]/export/route.ts","utf8");
 const guard=fs.readFileSync("src/components/os/website-draft-guard.tsx","utf8");
 assert.match(editor,/WebsiteDraftGuard/);
 assert.match(editor,/scope="meta"/);
 assert.match(editor,/scope=\{`block-\$\{index\}`\}/);
 assert.match(editor,/ownerId=\{user.id\}/);
 assert.match(actions,/await ownerForAction\(\)/);
 assert.match(actions,/\.eq\("version", ctx.version\)/);
 assert.match(preview,/await requireOwner\(\)/);
 assert.match(exportRoute,/await getOwnerSession\(\)/);
 assert.match(guard,/sessionStorage/);
 assert.match(guard,/const olderKey/);
 assert.match(guard,/reconcileWebsiteDraft/);
 assert.doesNotMatch(guard,/localStorage|service_role|fetch\(/);
 assert.doesNotMatch(guard,/dangerouslySetInnerHTML/);
});
