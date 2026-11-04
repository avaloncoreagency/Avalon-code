#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const Ajv = require('ajv');
const bridge = require('./load.cjs');
const root = path.resolve('.dev-bridge');
const command = process.argv[2] ?? 'status';
const args = process.argv.slice(3);
const option = name => { const i=args.indexOf('--'+name); return i<0?undefined:args[i+1]; };
const readonly = args.includes('--read-only');
const read = file => fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):undefined;
const snapshotPath=path.join(root,'snapshot.json');
function atomic(file,data){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n',{mode:0o600});fs.renameSync(temp,file);}
const validateSnapshot = new Ajv({allErrors:true}).compile(require('../../schemas/dev-bridge/snapshot.schema.json'));
const validate = new Ajv({allErrors:true}).compile(require('../../schemas/dev-bridge/resume-package.schema.json'));
function valid(pkg){if(!validate(pkg))throw Error('Invalid resume package: '+JSON.stringify(validate.errors));return pkg;}
function summary(s){return {at:s.at,sources:Object.fromEntries(['github','vercel','supabase'].map(k=>[k,bridge.freshness(s[k]).status])),health:s.findings.length?'ATTENTION':'UNKNOWN (application not probed)',findings:s.findings};}
async function main(){
 const c=bridge.config();let s=read(snapshotPath);
 if(command==='doctor'){console.log(JSON.stringify({repository:c.repo,github:!!c.githubToken,vercel:!!(c.vercelToken&&c.vercelProject&&c.vercelTeam),supabase:!!(c.supabaseToken&&c.supabaseRef),note:'Presence is not authorization; run bridge:sync for live verification.'},null,2));return;}
 if(command==='sync'){
   fs.mkdirSync(root,{recursive:true,mode:0o700});const lock=path.join(root,'sync.lock');
   let fd;try{fd=fs.openSync(lock,'wx',0o600);}catch{throw Error('Synchronization lock exists; inspect active process before removing it');}
   try{s=await bridge.sync(c,s,args.includes('--full'));if(!readonly)atomic(snapshotPath,s);console.log(JSON.stringify(summary(s),null,2));}finally{fs.closeSync(fd);fs.unlinkSync(lock);}return;
 }
 if(command==='brief'){
   // A start-of-session brief must be based on a NEW remote GitHub read.
   // Without a token, cached state may be shown via status, never as verified
   // collaboration instructions for an agent to act upon.
   if(!c.githubToken) {
     // Existing gh CLI auth can be used in Codex/Claude without exposing a
     // personal token in any prompt, file, log, URL or process argument.
     // This fallback only applies to the read-only agent briefing command.
     try {
       const token=cp.execFileSync('gh',['auth','token'],{
         encoding:'utf8',timeout:4000,maxBuffer:4096,stdio:['ignore','pipe','ignore'],
       }).trim();
       if(token.length>=20) c.githubToken=token;
     } catch { /* No configured gh CLI identity; fail closed below. */ }
   }
   if(!c.githubToken)throw Error('Live GitHub authorization needed: use an existing gh auth login or scoped GH_TOKEN. Do not paste secrets into prompts.');
   s=await bridge.sync(c,s,false);
   if(bridge.freshness(s.github).status!=='VERIFIED')throw Error('GitHub is UNKNOWN or STALE; no safe team brief can be generated.');
   if(!readonly)atomic(snapshotPath,s);
   const g=s.github.data;
   const view=bridge.collaboration(g);
   const pick=p=>({pr:p.number,branch:p.branch,sha:p.head_sha,ci:p.ci,
      files:p.files.slice(0,20),url:p.url,updated_at:p.updated_at??'UNKNOWN'});
   const ownerItems=owner=>view.assigned[owner].slice(0,12).map(({pr,issue,next_action})=>({
     ...pick(pr),issue:issue.number,module:issue.module,next_action:next_action??'NOT_REPORTED',
     claim:'Issue label verified; next action is reported, not independently tested'
   }));
   const brief={schema_version:1,at:s.at,github_verified_at:s.github.verified_at,
     repository:c.repo,main_sha:g.branches.find(b=>b.name==='main')?.sha??'UNKNOWN',
     collaboration:{miguel:ownerItems('miguel'),samuel:ownerItems('samuel'),
       unassigned:view.unassigned.slice(0,16).map(pick),
       unassigned_total:view.unassigned.length,
       potential_overlaps:view.overlaps,overlap_total:view.overlap_total,
       creative_bridge_prs:view.creative.slice(0,12).map(pick)},
     safety:['Do not assign ownership by commit author, branch name or model.',
       'Do not edit another active branch or merge automatically.',
       'Use a separate worktree, verify exact remote SHA and CI.',
       'Higgsfield reference_only is not imported code/media or approved client delivery.',
       'No live app E2E or production deployment is claimed by this brief.']};
   console.log(JSON.stringify(brief,null,2));return;
 }
 if(!s)throw Error('No snapshot. Run npm run bridge:sync (missing providers become UNKNOWN).');
 if(command==='status'||command==='report'){console.log(JSON.stringify(summary(s),null,2));return;}
 if(command==='check'){
   if(!validateSnapshot(s))throw Error('Snapshot schema invalid');
   if(s.schema_version!==1||!Array.isArray(s.events)||new Set(s.events.map(e=>e.id)).size!==s.events.length)throw Error('Invalid snapshot');
   for(const f of fs.existsSync(path.join(root,'handoffs'))?fs.readdirSync(path.join(root,'handoffs')):[])valid(read(path.join(root,'handoffs',f)));
   console.log('Snapshot consistency and package schemas valid. Provider freshness: '+JSON.stringify(summary(s).sources));return;
 }
 if(!['resume','handoff'].includes(command))throw Error('Unknown bridge command');
 const issue=Number(option('issue')), owner=option('as');if(!Number.isSafeInteger(issue)||issue<=0||!['miguel','samuel'].includes(owner))throw Error('Use --issue NUMBER --as miguel|samuel');
 // Always re-fetch before generating packages; unavailable GitHub prevents resume.
 s=await bridge.sync(c,s,false);
 const pr=s.github.data?.pulls.find(p=>p.issues.includes(issue));if(!pr)throw Error('Issue must be linked from an open PR using Refs? Use Closes/Fixes #N in PR body.');
 const api=new bridge.Api('https://api.github.com',c.githubToken??'');
 const ref=await api.get(`/repos/${c.repo}/branches/${encodeURIComponent(pr.branch)}`);
 const pkg=bridge.resume(s,issue,owner,c.repo,ref.commit.sha);
 const dirty=cp.execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim();
 if(dirty)pkg.safety_warnings.push('Local worktree is dirty: use a separate git worktree; do not overwrite files.');
 const state=option('state')??'Draft';
 if(!['Draft','Ready','Accepted','In progress','Completed','Superseded','Blocked'].includes(state))throw Error('Invalid handoff state');
 if(state==='Ready'&&pkg.test_results!=='PASSED')throw Error('Ready requires passing CI');
 if(state==='Accepted'&&!args.includes('--accept'))throw Error('Acceptance requires explicit --accept by the resuming owner');
 if(state==='Completed')throw Error('Completion must be recorded with acceptance evidence in the canonical Issue; package generation alone cannot complete work');
 pkg.status=state;valid(pkg);
 const destination=path.join(root,command==='handoff'?'handoffs':'resume',`${issue}-${owner}.json`);
 const existing=read(destination);if(existing&&existing.head_sha!==pkg.head_sha&&!args.includes('--regenerate'))throw Error('Source commit changed; use --regenerate after reviewing new work');
 if(args.includes('--publish')){
   if(readonly)throw Error('Cannot publish in read-only mode');
   if(command!=='handoff')throw Error('Only handoff publishes to GitHub');
   // No private URLs, bodies or tokens in the canonical handoff comment.
   const marker=`<!-- avalon-handoff:${issue}:${pkg.head_sha}:${owner}:${state} -->`;
   const comments=await api.pages(`/repos/${c.repo}/issues/${issue}/comments`);
   if(!comments.some(x=>String(x.body).includes(marker)))await api.get(`/repos/${c.repo}/issues/${issue}/comments`,{body:`${marker}\nHandoff ${state} (explicit CLI report by ${owner})\nBranch: ${pkg.branch}\nCommit: ${pkg.head_sha}\nNext action: ${bridge.redact(pkg.next_action)}\nVerified: ${pkg.last_verified_at}\nTests: ${pkg.test_results}\nBlockers: ${pkg.blockers.length}; inspect private resume package.\nNo acceptance is implied unless explicitly recorded.`});
 }
 if(!readonly){atomic(destination,pkg);atomic(snapshotPath,s);}
 console.log(JSON.stringify(pkg,null,2));
}
main().catch(error=>{console.error(bridge.redact(error.message));process.exitCode=1;});
