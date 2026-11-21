// HARU 0352-C — UI-only regression. The test NEVER calls Supabase/GitHub/AI.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
const src=fs.readFileSync("src/lib/office/manager-operations-ui.ts","utf8");
const transpiled=ts.transpileModule(src,{
 fileName:"manager-operations-ui.ts",reportDiagnostics:true,
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
});
assert.deepEqual((transpiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error),[]);
const mod={exports:{}};
new Function("module","exports",transpiled.outputText)(mod,mod.exports);
const {readActivity,parseLedgerComments,orderStage,readPublicOrders,activityLabel,MANAGER_KEYS}=mod.exports;

const engines=MANAGER_KEYS.map((key,i)=>({
 manager_key:key,run_id:i===0?"00000000-0000-4000-8000-000000000011":null,
 status:i===0?"running":"idle",task_title:i===0?"Comprobar el repositorio":null,
 started_at:i===0?"2026-11-05T12:00:00Z":null,finished_at:null,
 result_summary:"",evidence_refs:[],error_code:null,updated_at:i===0?"2026-11-05T12:00:00Z":null
}));
const feed={managers:engines,meta:{executor_kind:"deterministic",kill_switch:false,
 automatic_enabled:false,freshness_hours:24,generated_at:"2026-11-05T12:00:00Z"}};

test("owner-only engine contract: exactly the five canonical managers and real run IDs",()=>{
 const parsed=readActivity(feed);
 assert.ok(parsed);
 assert.equal(parsed.managers.length,5);
 assert.equal(parsed.managers[0].status,"running");
 assert.equal(parsed.managers[1].run_id,null);
 assert.equal(activityLabel("idle",false),"Sin actividad verificada");
 assert.notEqual(activityLabel("completed",false),"Trabajando");
});

test("missing, reordered or malformed backend data must fail closed",()=>{
 assert.equal(readActivity({meta:feed.meta,managers:engines.slice(0,4)}),null);
 assert.equal(readActivity({...feed,managers:[engines[1],engines[0],...engines.slice(2)]}),null);
 assert.equal(readActivity({...feed,meta:{...feed.meta,executor_kind:"llm"}}),null);
 assert.equal(readActivity({...feed,managers:[{...engines[0],status:"verified"},...engines.slice(1)]}),null);
 assert.equal(readActivity({...feed,managers:[{...engines[0],evidence_refs:[{type:"foo"}]},...engines.slice(1)]}),null);
});

const exampleBody=[
 "### Avalon OS — rutina de managers",
 "Ejecución: https://github.com/avaloncoreagency/Avalon-code/actions/runs/41946286672 · commit `cd7add1` · coste de inferencia: **$0**",
 "| Manager | Capacidad | Estado | Resultado | Evidencia ejecutada | IA |",
 "|---|---|---|---|---|---|",
 "| HARU | crm_contract_check | succeeded | 13 etapas y 35/35 pruebas | ✅ `node --test tests/crm.test.cjs`<br>✅ `PGlite: crm_stages` | groq:openai/gpt-oss-20b |",
 "| REN | operations_coordination | succeeded | Revisó PRs existentes | ✅ `gh api pulls` | groq:openai/gpt-oss-120b |",
].join("\n");
const bot={id:6646780486,user:{login:"github-actions[bot]"},created_at:"2026-11-05T13:00:00Z",body:exampleBody};
test("published GitHub Actions reports expose actual check, model and RUN-level cost",()=>{
 const rows=parseLedgerComments([bot]);
 assert.equal(rows.length,2);
 const haru=rows.find(r=>r.manager==="haru");
 assert.ok(haru);
 assert.equal(haru.runId,"41946286672");
 assert.equal(haru.action,"crm_contract_check");
 assert.equal(haru.runCostUSD,0);
 assert.equal(haru.provider,"groq:openai/gpt-oss-20b");
 assert.deepEqual(haru.evidence,["node --test tests/crm.test.cjs","PGlite: crm_stages"]);
 assert.equal(haru.publishedAt,"2026-11-05T13:00:00Z");
});

test("no fabricated provider, dates or cost when the source does not say",()=>{
 const srcBody=exampleBody.replace(" · coste de inferencia: **$0**","").replace("groq:openai/gpt-oss-20b","")
  .replace("groq:openai/gpt-oss-120b","");
 const rows=parseLedgerComments([{...bot,id:6646780487,body:srcBody}]);
 assert.equal(rows.length,2);
 assert.equal(rows[0].runCostUSD,null);
 assert.equal(rows[0].provider,null);
});

test("public ledger must come from workflow bot and exact repository's run URL",()=>{
 assert.equal(parseLedgerComments([{...bot,user:{login:"impostor"}}]).length,0);
 assert.equal(parseLedgerComments([{...bot,body:exampleBody.replace("avaloncoreagency/Avalon-code","another/repo")}]).length,0);
 assert.equal(parseLedgerComments([{...bot,created_at:"invalid"}]).length,0);
 assert.equal(parseLedgerComments([null]).length,0);
});

test("order labels separate owner approval, implementation, diagnosed and verified",()=>{
 assert.equal(orderStage(["avalon:task"]),"requested");
 assert.equal(orderStage(["avalon:task","avalon:in-progress"]),"running");
 assert.equal(orderStage(["avalon:task","avalon:verified"]),"verified");
 assert.equal(orderStage(["avalon:task","avalon:diagnosed"]),"diagnosed");
 assert.equal(orderStage(["avalon:task","avalon:implemented"]),"implemented");
 assert.equal(orderStage(["avalon:task","avalon:needs-implementation"]),"implementation");
 assert.equal(orderStage(["avalon:task","avalon:needs-owner","avalon:in-progress"]),"owner");
});

test("public issues are linked only when labeled as a task; no guessed manager identity",()=>{
 const issue=(number,extra=[])=>({number,title:"Orden de prueba",updated_at:"2026-11-05T11:00:00Z",
   labels:[{name:"avalon:task"},...extra.map(name=>({name}))]});
 const result=readPublicOrders([issue(139,["avalon:needs-implementation"]),
   issue(136,["avalon:needs-owner"]),issue(140,["avalon:diagnosed","manager:sora"]),
   {number:999,title:"Other",updated_at:null,labels:[{name:"unrelated"}]},
   {...issue(777),pull_request:{url:"something"}}]);
 assert.equal(result.length,3);
 assert.equal(result[0].manager,null);
 assert.equal(result[0].stage,"implementation");
 assert.equal(result[1].stage,"owner");
 assert.equal(result[2].manager,"sora");
 assert.equal(result[2].url,"https://github.com/avaloncoreagency/Avalon-code/issues/140");
});

test("operational panel is owner-only, mobile-aware and read-only for REN",()=>{
 const route=fs.readFileSync("src/app/admin/workspace/crm/office/manager-work/operations/page.tsx","utf8");
 const ui=fs.readFileSync("src/components/office/manager-operations.tsx","utf8");
 const css=fs.readFileSync("src/components/office/manager-operations.module.css","utf8");
 const discoverable=fs.readFileSync("src/components/office/manager-activity-panel.tsx","utf8");
 assert.match(route,/await requireOwner\(\)/);
 assert.match(ui,/readActivity\(/);
 assert.match(ui,/parseLedgerComments\(/);
 assert.match(ui,/readPublicOrders\(/);
 assert.match(ui,/disabled aria-disabled="true"/);
 assert.doesNotMatch(ui,/manager-run|crm_agent_set_kill_switch|service_role/);
 assert.doesNotMatch(ui,/dangerouslySetInnerHTML/);
 assert.match(css,/@media \(max-width:420px\)/);
 assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
 assert.match(discoverable,/manager-work\/operations/);
});
