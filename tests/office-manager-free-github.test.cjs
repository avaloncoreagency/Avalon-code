const { test }=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const worker=require("../scripts/office-manager-free-github.cjs");

const marker=worker.MARKER;
const pulls=[
 {number:70,state:"open",draft:true,title:"test auth owners"},
 {number:78,state:"open",draft:true,title:"CRM ventas cliente"},
 {number:73,state:"open",draft:true,title:"Sales Copilot AI"},
 {number:65,state:"open",draft:false,title:"Radar Geoapify"},
];
const issues=[{number:98,state:"open"},{number:108,state:"open"},
 {number:102,state:"open",pull_request:{url:"example"}}];
const runs=[
 {id:101,conclusion:"success",status:"completed"},
 {id:102,conclusion:"failure",status:"completed"},
 {id:103,conclusion:null,status:"in_progress"},
];
const recorded={number:108,title:worker.TITLE,body:marker+"\ninitial"};
const when=new Date("2026-11-03T20:00:00Z");

test("five managers produce honest, bounded GitHub work evidence and concrete links",()=>{
 const result=worker.buildsReport({pulls,issues,runs},when,87654);
 assert.equal(result.schema_version,1);
 assert.equal(result.source,"github_actions_public_repo");
 assert.equal(result.observed_at,when.toISOString());
 assert.equal(result.run_id,"87654");
 assert.deepEqual(Object.keys(result.managers),["ren","shin","haru","sora","kenji"]);
 assert.ok(Object.values(result.managers).every(x=>x.status==="completed"));
 assert.equal(result.managers.ren.metrics[0].count,4);
 assert.equal(result.managers.ren.metrics[1].count,3);
 assert.equal(result.managers.shin.metrics[0].count,1);
 assert.equal(result.managers.sora.metrics[0].count,2);
 assert.equal(result.managers.kenji.metrics[1].count,1);
 assert.match(result.managers.kenji.nextAction,/102/);
 assert.ok(!JSON.stringify(result).includes("secret"));
 assert.match(result.note,/no ejecución autónoma de código/);
});
test("untrusted GitHub results, invalid clock and missing arrays fail closed",()=>{
 assert.throws(()=>worker.buildsReport({pulls:null,issues,runs},when,1));
 assert.throws(()=>worker.buildsReport({pulls,issues,runs},new Date("invalid"),1));
 assert.deepEqual(worker.CODES,["ren","shin","haru","sora","kenji"]);
});
function fakeGithub(captured, override={}){
 return async (url,opts)=>{
   captured.push({url,opts});
   const method=opts.method||"GET";
   let body;
   if(url.includes("/pulls?"))body=pulls;
   else if(url.includes("/issues?"))body=issues;
   else if(url.includes("/actions/runs?"))body={workflow_runs:runs};
   else if(url.includes("/issues/108") && method==="PATCH")body={ok:true};
   else if(url.includes("/issues/108"))body=override.ledger ?? recorded;
   else return {ok:false,status:404,json:async()=>({})};
   return {ok:true,status:200,json:async()=>body};
 };
}
test("uses only GitHub REST with repository-scoped token and updates ONE known issue",async()=>{
 const calls=[];const token="synthetic-bot-token-not-real";
 const result=await worker.runFreeOffice({token,runId:87654,now:when,fetcher:fakeGithub(calls)});
 assert.equal(result.checked_managers,5);
 assert.equal(result.issue,108);
 assert.equal(calls.length,5);
 assert.ok(calls.every(x=>x.url.startsWith("https://api.github.com/repos/avaloncoreagency/Avalon-code/")));
 assert.ok(calls.every(x=>x.opts.redirect==="error" && x.opts.headers.authorization==="Bearer "+token));
 const writes=calls.filter(x=>x.opts.method==="PATCH");
 assert.equal(writes.length,1);
 assert.equal(writes[0].url,"https://api.github.com/repos/avaloncoreagency/Avalon-code/issues/108");
 const parsed=JSON.parse(writes[0].opts.body);
 assert.ok(parsed.body.startsWith(marker));
 assert.equal((parsed.body.match(/<!-- AVALON_OFFICE_GITHUB_FREE_V1 -->/g)||[]).length,1);
 assert.ok(!JSON.stringify(result).includes(token));
});
test("does not overwrite modified/hijacked issue or issue with mismatched title",async()=>{
 for (const ledger of [
  {...recorded,body:"not managed by agent"},
  {...recorded,title:"Unrelated issue"},
  {...recorded,number:99},
 ]) {
  const calls=[];
  await assert.rejects(()=>worker.runFreeOffice({
   token:"synthetic-bot-token-not-real",now:when,fetcher:fakeGithub(calls,{ledger})
  }),/ledger_issue_mismatch/);
  assert.equal(calls.filter(x=>x.opts.method==="PATCH").length,0);
 }
});
test("GitHub API outage cannot produce a false success, and token is never logged in report",async()=>{
 await assert.rejects(()=>worker.runFreeOffice({
  token:"synthetic-bot-token-not-real",now:when,
  fetcher:async()=>({ok:false,status:401})
 }),/github_request_failed/);
 const report=worker.buildsReport({pulls,issues,runs},when,"abc-99");
 assert.equal(report.run_id,"99");
 assert.ok(!worker.issueDocument(report).includes("synthetic-bot-token"));
});
test("no new environment, Supabase privileges or paid providers in free workflow",()=>{
 const workflow=fs.readFileSync(".github/workflows/office-managers-free.yml","utf8");
 assert.match(workflow,/schedule:/);
 assert.match(workflow,/issues: write/);
 assert.match(workflow,/contents: read/);
 assert.doesNotMatch(workflow,/service_role|SUPABASE|openai|claude|vercel/i);
 assert.ok(!workflow.includes("secrets."));
 assert.ok(workflow.includes("node --test tests/office-manager-free-github.test.cjs"));
});
