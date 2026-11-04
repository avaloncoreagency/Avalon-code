#!/usr/bin/env node
// Read-only GitHub PR handoff preflight. Does not assign ownership, merge,
// comment or grant access. Missing metadata produces warnings, not fake proof.
const fs=require("node:fs");
const ISSUE_REF=/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?)\s+#\d+(?:\s*(?:,|and|&)\s*#\d+)*/gi;
const OWNER_LABELS=new Set(["owner:miguel","owner:samuel"]);
const SHARED=/^(?:supabase\/migrations\/|src\/lib\/(?:auth|supabase)\/|src\/components\/suite\/|\.github\/|src\/app\/admin\/password)/;
function linkedIssues(body){
 return [...new Set([...String(body||"").matchAll(ISSUE_REF)].flatMap(m=>[...m[0].matchAll(/#(\d+)/g)].map(id=>Number(id[1]))))
 ].filter(n=>Number.isSafeInteger(n)&&n>0).slice(0,8);
}
function assess(pr,issues,files){
 const warnings=[],links=linkedIssues(pr?.body);
 let owner=null,issueNumber=null,nextAction=null;
 if(links.length===0)warnings.push("missing_linked_issue");
 if(links.length>1)warnings.push("multiple_linked_issues");
 if(links.length===1){
  const issue=issues.find(x=>Number(x.number)===links[0]);
  issueNumber=links[0];
  if(!issue||issue.state!=="open"||issue.pull_request)warnings.push("issue_unavailable_or_closed");
  else{
   const labels=(issue.labels||[]).map(x=>typeof x==="string"?x:String(x.name||""));
   const owners=labels.filter(label=>OWNER_LABELS.has(label));
   if(owners.length!==1)warnings.push("missing_or_ambiguous_owner_label");
   else owner=owners[0].slice(6);
   nextAction=String(issue.body||"").match(/^Next action:\s*(.+)$/mi)?.[1]?.trim()||null;
   if(!nextAction)warnings.push("missing_next_action");
  }
 }
 if(!/^[a-f0-9]{40}$/.test(pr?.head?.sha||""))warnings.push("missing_exact_head_sha");
 const needsSharedReview=files.some(x=>SHARED.test(x.filename||""));
 if(needsSharedReview)warnings.push("shared_surface_review_needed");
 if(files.length>=100)warnings.push("file_list_may_be_incomplete");
 return {
  status:warnings.some(w=>w!=="shared_surface_review_needed")?"NEEDS_HANDOFF":"METADATA_READY",
  owner,issue:issueNumber,
  exact_sha:pr?.head?.sha||"UNKNOWN",
  next_action_recorded:!!nextAction,
  shared_surface_review:needsSharedReview,
  warnings,
  reminder:"Reported metadata is not proof of tests, acceptance or deployment.",
 };
}
function safeRepo(input){if(!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(input||""))throw Error("Invalid repository");return input;}
async function fetchResource(url,token){
 const response=await fetch(url,{headers:{
  Accept:"application/vnd.github+json",
  "X-GitHub-Api-Version":"2022-11-28",
  ...(token?{Authorization:"Bearer "+token}:{}),
 },signal:AbortSignal.timeout(10000),redirect:"error"});
 if(!response.ok)throw Error("GitHub provider HTTP "+response.status);
 return response.json();
}
async function run(){
 const eventPath=process.env.GITHUB_EVENT_PATH;
 if(!eventPath||!fs.existsSync(eventPath))throw Error("GitHub PR event required");
 const event=JSON.parse(fs.readFileSync(eventPath,"utf8"));
 const pr=event.pull_request;
 if(!pr||!Number.isSafeInteger(pr.number))throw Error("GitHub PR metadata missing");
 const repo=safeRepo(process.env.GITHUB_REPOSITORY);
 const token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN;
 if(!token)throw Error("Scoped GitHub read token missing");
 const issueNumbers=linkedIssues(pr.body);
 const source=`https://api.github.com/repos/${repo}`;
 const issues=await Promise.all(issueNumbers.map(async n=>{
  try{return await fetchResource(source+`/issues/${n}`,token);}
  catch{return {number:n,state:"unknown",labels:[],body:""};}
 }));
 const files=await fetchResource(source+`/pulls/${pr.number}/files?per_page=100`,token);
 if(!Array.isArray(files))throw Error("Unexpected PR files");
 const result=assess(pr,issues,files);
 const lines=[
   "### Avalon Dev Bridge · PR handoff preflight",
   "",
   `PR #${pr.number} · ${result.status}`,
   `Owner (explicit Issue label only): ${result.owner||"UNKNOWN"}`,
   `Issue: ${result.issue??"UNKNOWN"}`,
   `Source SHA: ${result.exact_sha}`,
   `Next action recorded: ${result.next_action_recorded?"YES":"NO"}`,
   `Shared/security surface review: ${result.shared_surface_review?"REQUIRED":"no shared path detected"}`,
   `Warnings: ${result.warnings.join(", ")||"none"}`,
   "",
   "This is advisory only. No branch, permission, customer record or Issue was modified.",
 ];
 // GitHub-sourced values are untrusted: they are printed to the job log only, never written to files.
 console.log(lines.join("\n"));
 console.log(JSON.stringify({
  pr:pr.number,status:result.status,owner:result.owner,issue:result.issue,
  head_sha:result.exact_sha,warning_codes:result.warnings,
 }));
}
if(require.main===module)run().catch(e=>{
 console.error("Dev Bridge preflight unavailable: "+String(e.message).slice(0,100));
 process.exitCode=1;
});
module.exports={linkedIssues,assess};
