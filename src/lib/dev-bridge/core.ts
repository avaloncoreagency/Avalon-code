/* Server-side provider adapters. Never import from client components. */
export type Owner = 'miguel' | 'samuel';
export type Fact<T> = { status: 'VERIFIED' | 'UNKNOWN' | 'STALE'; checked_at: string; verified_at: string | null; data: T | null; error?: string };
export type Issue = { id: string; number: number; title: string; owner: Owner | null; module: string; state: string; labels: string[]; url: string; updated_at: string; body: string; handoff?:{state:string;sha:string;at:string;url:string} };
export type Pull = { number: number; title: string; branch: string; base_branch: string; base_sha: string; head_sha: string; url: string; files: string[]; ci: string; reviews: string[]; conflict: boolean | null; behind: number; issues: number[]; updated_at?: string };
export type Github = { issues: Issue[]; pulls: Pull[]; branches: {name:string;sha:string}[]; commits: {sha:string;date:string;author:string;url:string}[]; migrations: string[] };
export type Deployment = { id:string;sha:string;branch:string;environment:string;state:string;url:string;created:number };
export type Database = { ref:string; status:string; migrations:string[]; rls:{table:string;enabled:boolean}[]; advisors:string[]; functions:{name:string;status:string}[] };
export type Snapshot = { schema_version:1; at:string; github:Fact<Github>; vercel:Fact<Deployment[]>; supabase:Fact<Database>; findings:{id:string;severity:string;claim:'VERIFIED'|'INFERRED';message:string}[]; events:{id:string;at:string}[]; checkpoint:{github_since:string|null} };
export type Config = { repo:string; githubToken?:string; vercelToken?:string; vercelProject?:string; vercelTeam?:string; supabaseToken?:string; supabaseRef?:string };
const sleep = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));
export function redact(s:string) { return s.replace(/((?:password|secret|token|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]').replace(/(?:Bearer\s+\S+|(?:gh[pousr]_|sb_secret_|sb_publishable_|sbp_)[\w.-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)/gi, '[REDACTED]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[EMAIL]'); }
export class Api {
  constructor(private root:string, private token:string, private transport:typeof fetch=fetch, private pause=sleep) {}
  async get(path:string, body?:object):Promise<unknown> {
    if (!path.startsWith('/') || path.startsWith('//')) throw Error('Invalid API path');
    for(let attempt=0;attempt<3;attempt++) {
      let response:Response;
      try { response=await this.transport(this.root+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${this.token}`,Accept:'application/json','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000),redirect:'error'}); }
      catch { if(attempt===2) throw Error('Provider network/timeout failure'); await this.pause(200*2**attempt); continue; }
      if(response.ok) return response.json();
      if((response.status===429 || response.status>=500 || (response.status===403 && response.headers.get('x-ratelimit-remaining')==='0')) && attempt<2) {
        const retry=Number(response.headers.get('retry-after') ?? 0)*1000;
        if(retry>10000) throw Error('Provider rate limit; retry next synchronization');
        await this.pause(Math.max(retry,200*2**attempt));continue;
      }
      throw Error(`Provider HTTP ${response.status}`);
    }
    throw Error('Provider unavailable');
  }
  async pages(path:string):Promise<Record<string, unknown>[]> {
    const all:Record<string,unknown>[]=[];
    for(let page=1;page<=30;page++) {
      const data=await this.get(`${path}${path.includes('?')?'&':'?'}per_page=100&page=${page}`) as Record<string,unknown>[];
      if(!Array.isArray(data)) throw Error('Unexpected paginated response');
      all.push(...data); if(data.length<100)return all;
    }
    throw Error('Pagination bound exceeded; snapshot incomplete');
  }
}
type Row=Record<string,unknown>;
const row=(v:unknown):Row => v && typeof v==='object' ? v as Row : {};
const str=(v:unknown) => typeof v==='string'?v:'';
export async function github(config:Config, since?:string, previous?:Github, api=new Api('https://api.github.com',config.githubToken??'')):Promise<Github> {
  if(!config.githubToken)throw Error('GitHub connection unavailable');
  if(!/^[\w.-]+\/[\w.-]+$/.test(config.repo))throw Error('Invalid repository');
  const base=`/repos/${config.repo}`;
  const [issueRows,prs,branchRows,commitRows]=await Promise.all([api.pages(base+'/issues?state=all'+(since?'&since='+encodeURIComponent(since):'')),api.pages(base+'/pulls?state=open'),api.pages(base+'/branches'),api.pages(base+'/commits?sha='+encodeURIComponent(process.env.BRIDGE_CODE_REF??'main')+(since?'&since='+encodeURIComponent(since):''))]);
  const issueMap=new Map((previous?.issues??[]).map(i=>[i.number,i]));
  for(const i of issueRows.filter(i=>!i.pull_request)) {
    if(Date.parse(issueMap.get(Number(i.number))?.updated_at??'')>Date.parse(str(i.updated_at)))continue;
    const labels=(i.labels as unknown[]??[]).map(l=>str(row(l).name));
    const owners=labels.filter(l=>l==='owner:miguel'||l==='owner:samuel');
    issueMap.set(Number(i.number),{id:`github:${config.repo}#${i.number}`,number:Number(i.number),title:redact(str(i.title)),owner:owners.length===1?owners[0].slice(6) as Owner:null,module:labels.find(l=>l.startsWith('module:'))?.slice(7)??'UNKNOWN',state:labels.find(l=>l.startsWith('status:'))?.slice(7)??'UNKNOWN',labels,url:str(i.html_url),updated_at:str(i.updated_at),body:redact(str(i.body))});
  }
  // Comments remain canonical; only retain the latest structured handoff envelope.
  for(const i of issueMap.values()) {
    if(!i.owner || !issueRows.some(r=>Number(r.number)===i.number))continue;
    const comments=await api.pages(base+`/issues/${i.number}/comments`);
    for(const comment of comments) {
      const match=str(comment.body).match(/<!-- avalon-handoff:\d+:([a-f0-9]{40}):(miguel|samuel):([^>]+) -->/);
      if(match && (!i.handoff || str(comment.created_at)>i.handoff.at))i.handoff={state:redact(match[3]),sha:match[1],at:str(comment.created_at),url:str(comment.html_url)};
    }
  }
  const pulls:Pull[]=[];
  // With many simultaneous Codex/Claude PRs, bounded batches avoid a very slow
  // serial scan while limiting secondary API rate pressure. No partial snapshot:
  // a failed detail still leaves the whole GitHub provider UNKNOWN/STALE.
  const inspectPull = async (p:Row):Promise<Pull> => {
    const n=Number(p.number);
    const detail=row(await api.get(base+`/pulls/${n}`));
    const head=row(detail.head), baseRef=row(detail.base), sha=str(head.sha);
    const [files,checks,reviews,comparison,prCommits]=await Promise.all([api.pages(base+`/pulls/${n}/files`),api.get(base+`/commits/${sha}/check-runs?per_page=100`),api.pages(base+`/pulls/${n}/reviews`),api.get(base+`/compare/${encodeURIComponent(str(head.ref))}...${encodeURIComponent(str(baseRef.ref))}`),api.pages(base+`/pulls/${n}/commits`)]);
    commitRows.push(...prCommits);
    const checkData=row(checks);
    const allChecks=(checkData.check_runs??[]) as Row[];
    // Vercel deployment statuses are not GitHub Actions test outcomes. A
    // Preview deliberately blocked from production Supabase must not be
    // reported as a failed unit/integration suite.
    const runs=allChecks.filter(r=>str(row(r.app).slug).toLowerCase()!=='vercel' && !/^vercel(?:\s|$)/i.test(str(r.name)));
    const total=Number(checkData.total_count);
    const ci=!Number.isFinite(total)||total>100||!runs.length?'UNKNOWN'
      :runs.some(r=>['failure','cancelled','timed_out','action_required'].includes(str(r.conclusion)))?'FAILED'
      :runs.every(r=>['success','skipped','neutral'].includes(str(r.conclusion)))?'PASSED':'PENDING';
    return {number:n,title:redact(str(detail.title)),branch:str(head.ref),base_branch:str(baseRef.ref),base_sha:str(baseRef.sha),head_sha:sha,url:str(detail.html_url),files:files.map(f=>str(f.filename)),ci,reviews:reviews.map(r=>str(r.state)),conflict:detail.mergeable===null?null:detail.mergeable===false,behind:Number(row(comparison).ahead_by??0),issues:[...str(detail.body).matchAll(/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?)\s+#(\d+)/gi)].map(m=>Number(m[1])),updated_at:str(detail.updated_at)};
  };
  for(let index=0;index<prs.length;index+=3) {
    const batch=await Promise.all(prs.slice(index,index+3).map(p=>inspectPull(p)));
    pulls.push(...batch);
  }
  const tree=row(await api.get(base+'/git/trees/'+encodeURIComponent(process.env.BRIDGE_CODE_REF??'main')+'?recursive=1'));
  if(tree.truncated)throw Error('Repository tree truncated');
  return {issues:[...issueMap.values()].sort((a,b)=>a.number-b.number),pulls,branches:branchRows.map(b=>({name:str(b.name),sha:str(row(b.commit).sha)})),commits:[...new Map([...(previous?.commits??[]).map(c=>[c.sha,c] as const),...commitRows.map(c=>({sha:str(c.sha),date:str(row(row(c.commit).author).date),author:redact(str(row(row(c.commit).author).name)),url:str(c.html_url)})).map(c=>[c.sha,c] as const)]).values()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,2000),migrations:((tree.tree??[]) as Row[]).map(t=>str(t.path)).filter(p=>/^supabase\/migrations\/\d+.*\.sql$/.test(p)).map(p=>p.split('/').pop()!.split('_')[0])};
}
export async function vercel(c:Config,api=new Api('https://api.vercel.com',c.vercelToken??'')):Promise<Deployment[]> {
  if(!c.vercelToken||!c.vercelProject||!c.vercelTeam)throw Error('Vercel connection unavailable');
  let until='';const all:Deployment[]=[];
  for(let page=0;page<30;page++) {
    const d=row(await api.get(`/v6/deployments?projectId=${encodeURIComponent(c.vercelProject)}&teamId=${encodeURIComponent(c.vercelTeam)}&limit=100${until}`));
    for(const item of (d.deployments??[]) as Row[]){const m=row(item.meta);all.push({id:str(item.uid??item.id),sha:str(m.githubCommitSha),branch:str(m.githubCommitRef),environment:item.target==='production'?'production':'preview',state:str(item.state??item.readyState)||'UNKNOWN',url:/^[a-z0-9.-]+$/i.test(str(item.url))?'https://'+str(item.url):'',created:Number(item.created??item.createdAt)});}
    const next=row(d.pagination).next;if(!next)return all;until='&until='+encodeURIComponent(String(next));
  }throw Error('Vercel pagination bound exceeded');
}
export async function supabase(c:Config,api=new Api('https://api.supabase.com',c.supabaseToken??'')):Promise<Database> {
  if(!c.supabaseToken||!c.supabaseRef)throw Error('Supabase metadata connection unavailable');
  if(!/^[a-z]{20}$/.test(c.supabaseRef))throw Error('Invalid project reference');
  const p=`/v1/projects/${c.supabaseRef}`;
  const query="select json_build_object('migrations',(select coalesce(json_agg(version order by version),'[]') from supabase_migrations.schema_migrations),'rls',(select coalesce(json_agg(json_build_object('table',c.relname,'enabled',c.relrowsecurity)),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r')) as metadata";
  const [meta,functions,advisors]=await Promise.all([api.get(p+'/database/query',{query,read_only:true}),api.get(p+'/functions'),api.get(p+'/advisors/security')]);
  const db=row(row((meta as unknown[])[0]).metadata);
  if(!Array.isArray(db.migrations)||!Array.isArray(db.rls))throw Error('Supabase metadata response unavailable');
  return {ref:c.supabaseRef,status:'metadata reachable; health UNKNOWN',migrations:db.migrations as string[],rls:db.rls as Database['rls'],functions:(functions as Row[]).map(f=>({name:str(f.slug),status:str(f.status)})),advisors:((row(advisors).lints??[]) as Row[]).map(a=>redact(str(a.name)))};
}
export async function fact<T>(fetcher:()=>Promise<T>, old?:Fact<T>, now=new Date().toISOString()):Promise<Fact<T>> {
  try{return {status:'VERIFIED',checked_at:now,verified_at:now,data:await fetcher()};}catch(error){return {status:old?.data?'STALE':'UNKNOWN',checked_at:now,verified_at:old?.verified_at??null,data:old?.data??null,error:error instanceof Error?redact(error.message):'Unavailable'};}
}
export function freshness<T>(f:Fact<T>,now=Date.now()):Fact<T>{return f.status==='VERIFIED'&&(!Number.isFinite(Date.parse(f.verified_at??''))||now-Date.parse(f.verified_at??'')>7*3600000)?{...f,status:'STALE'}:f;}
export function findings(input:Pick<Snapshot,'github'|'vercel'|'supabase'>):Snapshot['findings'] {
  const s={github:freshness(input.github),vercel:freshness(input.vercel),supabase:freshness(input.supabase)};
  const out:Snapshot['findings']=[];
  const add=(id:string,message:string,claim:'VERIFIED'|'INFERRED'='VERIFIED')=>out.push({id,severity:'warning',claim,message});
  for(const name of ['github','vercel','supabase'] as const)if(freshness<unknown>(s[name]).status!=='VERIFIED')add('source:'+name,`${name}: UNKNOWN or stale telemetry`);
  if(s.github.status==='VERIFIED'&&s.github.data){const g=s.github.data;
    for(const p of g.pulls){if(p.ci==='FAILED')add('ci:'+p.number,`PR #${p.number}: failed CI`);if(p.conflict)add('conflict:'+p.number,`PR #${p.number}: confirmed merge conflict`);if(p.behind)add('behind:'+p.number,`PR #${p.number}: base advanced; inspect divergence`);if(!p.issues.length)add('issue:'+p.number,`PR #${p.number}: no linked work item`);
      if(p.files.some(f=>/^(src\/lib\/auth|src\/lib\/supabase|src\/components\/suite|src\/app\/page|src\/app\/globals|\.env|\.github)|types/.test(f))&&!p.reviews.includes('APPROVED'))add('review:'+p.number,`PR #${p.number}: shared/security/public surface needs review`);
    }
    for(let a=0;a<g.pulls.length;a++)for(let b=a+1;b<g.pulls.length;b++){const x=g.pulls[a],y=g.pulls[b];const overlap=x.files.filter(f=>y.files.includes(f));if(overlap.some(f=>f.startsWith('supabase/migrations/')))add(`migration-conflict:${x.number}:${y.number}`,`Potential migration conflict #${x.number}/#${y.number}; never resolve automatically`,'INFERRED');if(overlap.length)add(`overlap:${x.number}:${y.number}`,`Potential conflict #${x.number}/#${y.number}: ${overlap.join(', ')}`,'INFERRED');if(x.base_branch!==y.base_branch)add(`base:${x.number}:${y.number}`,`Different integration bases #${x.number}/#${y.number}; manual compatibility review`,'INFERRED');}
    for(const i of g.issues){if(!i.owner)add('owner:'+i.number,`Issue #${i.number}: owner UNKNOWN`);if(i.state==='in-progress'&&Date.now()-Date.parse(i.updated_at)>7*86400000)add('stale:'+i.number,`Issue #${i.number}: no update for seven days`,'INFERRED');}
  }
  if(s.vercel.status==='VERIFIED')for(const d of s.vercel.data??[])if(d.state==='ERROR'||d.state==='CANCELED')add('deployment:'+d.id,`${d.environment} deployment ${d.id}: ${d.state}; application health UNKNOWN`);
  if(s.github.status==='VERIFIED'&&s.supabase.status==='VERIFIED'&&s.supabase.data){const db=s.supabase.data;const code=s.github.data?.migrations??[];for(const m of new Set([...code,...db.migrations]))if(code.includes(m)!==db.migrations.includes(m))add('migration:'+m,`Migration drift ${m} on ${db.ref}; do not apply automatically`);for(const r of db.rls)if(!r.enabled)add('rls:'+r.table,`RLS disabled: ${r.table}`);for(const a of db.advisors)add('advisor:'+a,a);}
  return out.sort((a,b)=>a.id.localeCompare(b.id));
}
export async function sync(c:Config,old?:Snapshot,full=false, adapters={github,vercel,supabase}):Promise<Snapshot>{
  const now=new Date().toISOString();
  const [g,v,s]=await Promise.all([fact(()=>adapters.github(c,full?undefined:old?.checkpoint.github_since?new Date(Date.parse(old.checkpoint.github_since)-60000).toISOString():undefined,full?undefined:old?.github.data??undefined),old?.github,now),fact(()=>adapters.vercel(c),old?.vercel,now),fact(()=>adapters.supabase(c),old?.supabase,now)]);
  // Ignore a delayed nonterminal response after an immutable deployment reached a terminal state.
  if(v.status==='VERIFIED' && old?.vercel.data)v.data=(v.data??[]).map(d=>{const prior=old.vercel.data!.find(x=>x.id===d.id);return prior && ['READY','ERROR','CANCELED'].includes(prior.state) && !['READY','ERROR','CANCELED'].includes(d.state)?prior:d;});
  if(v.data)v.data=[...new Map(v.data.map(d=>[d.id,d])).values()];
  const events=new Map((old?.events??[]).map(e=>[e.id,e]));
  for(const issue of g.data?.issues??[])events.set(`issue:${issue.number}:${issue.updated_at}`,{id:`issue:${issue.number}:${issue.updated_at}`,at:issue.updated_at});
  for(const commit of g.data?.commits??[])events.set('commit:'+commit.sha,{id:'commit:'+commit.sha,at:commit.date});
  for(const d of v.data??[])events.set('deployment:'+d.id+':'+d.state,{id:'deployment:'+d.id+':'+d.state,at:new Date(d.created).toISOString()});
  const state:Snapshot={schema_version:1,at:now,github:g,vercel:v,supabase:s,findings:[],events:[...events.values()].sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id)).slice(-2000),checkpoint:{github_since:g.status==='VERIFIED'?now:old?.checkpoint.github_since??null}};
  state.findings=findings(state);
  // Filter known configured credentials even if a provider echoes one in free text.
  let safe=JSON.stringify(state);for(const token of [c.githubToken,c.vercelToken,c.supabaseToken])if(token)safe=safe.split(token).join('[REDACTED]');
  return JSON.parse(safe) as Snapshot;
}
export type Resume = {schema_version:1;work_item_id:string;project:string;module:string;original_owner:Owner;resuming_owner:Owner;repository:string;branch:string;base_sha:string;head_sha:string;pull_request:number;status:string;last_verified_at:string;verification_sources:string[];completed_work:string[];pending_work:string[];blockers:string[];changed_files:string[];test_results:string;deployment_status:string;database_dependencies:string[];next_action:string;safety_warnings:string[];claims:{status:string;description:string}[];required_commands:string[]};
export function resume(s:Snapshot, issueNumber:number, owner:Owner, repository:string, currentHead:string):Resume {
  if(freshness(s.github).status!=='VERIFIED')throw Error('Fresh GitHub verification required');
  const i=s.github.data?.issues.find(i=>i.number===issueNumber);if(!i||!i.owner)throw Error('Missing issue or unique owner');
  const linked=s.github.data?.pulls.filter(p=>p.issues.includes(issueNumber))??[];if(linked.length>1)throw Error('Multiple PRs linked; split work items before resuming');
  const p=linked[0];if(!p)throw Error('Missing linked PR');if(!/^[a-f0-9]{40}$/.test(currentHead)||p.head_sha!==currentHead)throw Error('Head advanced; regenerate handoff');
  const next=i.body.match(/^Next action:\s*(.+)$/mi)?.[1];if(!next)throw Error('Missing exact Next action in Issue');
  const deployments=freshness(s.vercel).status==='VERIFIED'?(s.vercel.data??[]).filter(d=>d.sha===p.head_sha):[];
  return {required_commands:['git fetch origin','git status --porcelain',`git worktree add -b resume/${owner}/issue-${issueNumber} ../avalon-resume-${issueNumber} ${p.head_sha}`,'npm ci','npm run bridge:check','npm run bridge:test'],schema_version:1,work_item_id:i.id,project:'Avalon Core Agency',module:i.module,original_owner:i.owner,resuming_owner:owner,repository,branch:p.branch,base_sha:p.base_sha,head_sha:p.head_sha,pull_request:p.number,status:'Draft',last_verified_at:s.github.verified_at!,verification_sources:[i.url,p.url],completed_work:[],pending_work:[next],blockers:s.findings.map(f=>f.message),changed_files:p.files,test_results:p.ci,deployment_status:deployments.map(d=>`${d.environment}: ${d.state}; application health UNKNOWN`).join('; ')||'UNKNOWN',database_dependencies:s.supabase.status==='VERIFIED'?(s.supabase.data?.migrations??[]):['UNKNOWN'],next_action:next,safety_warnings:['Check local git status --porcelain before checkout. Remote dashboard cannot inspect your worktree.',`Create an isolated branch from ${p.head_sha}. Never overwrite ${p.branch}.`,'Issue ownership does not imply acceptance.',...(p.behind?['Branch base advanced; review divergence.']:[]),...(p.conflict?['Confirmed conflict; no automatic merge.']:[]),...(i.state==='in-progress'?['Original owner may be active; coordinate through Issue before shared changes.']:[])],claims:[{status:'VERIFIED',description:'Branch and CI metadata; not proof of application correctness'},{status:'REPORTED',description:'Next action comes from the Issue'}]};
}

export type CollaborationTask = { pr:Pull; issue:Issue; next_action:string|null };
export type PRFileOverlap = { left:number; right:number; files:string[] };
export type CollaborationView = {
  assigned:Record<Owner,CollaborationTask[]>;
  unassigned:Pull[];
  overlaps:PRFileOverlap[];
  overlap_total:number;
  creative:Pull[];
  total:number;
};
/**
 * Read-only coordination from canonical Issue labels and exact PR diffs.
 * Never infer Miguel/Samuel from a branch, commit author, AI provider or title.
 * Many legacy Issues are unlabeled: they must remain VISIBLE but unassigned.
 */
export function collaboration(g:Github|null):CollaborationView {
  const assigned:Record<Owner,CollaborationTask[]>={miguel:[],samuel:[]};
  const unassigned:Pull[]=[];
  const overlaps:PRFileOverlap[]=[];
  let overlap_total=0;
  if(!g)return {assigned,unassigned,overlaps,overlap_total,creative:[],total:0};
  const latest=[...g.pulls].sort((a,b)=>
    (Date.parse(b.updated_at??'')||0)-(Date.parse(a.updated_at??'')||0)||b.number-a.number);
  const issues=new Map(g.issues.map(i=>[i.number,i]));
  for(const pr of latest) {
    const linked=pr.issues.map(n=>issues.get(n));
    // Unknown, incomplete, or contradictory ownership never becomes verified.
    const owner=linked.length&&linked.every(i=>i?.owner&&i.owner===linked[0]?.owner)
      ?linked[0]!.owner:null;
    if(!owner) {unassigned.push(pr);continue;}
    const issue=linked[0]!;
    const next=issue.body.match(/^Next action:\s*(.+)$/mi)?.[1]?.trim()??null;
    assigned[owner].push({pr,issue,next_action:next});
  }
  for(let i=0;i<latest.length;i++)for(let j=i+1;j<latest.length;j++){
    const left=latest[i],right=latest[j];
    const rightFiles=new Set(right.files);
    const shared=left.files.filter(f=>rightFiles.has(f));
    if(!shared.length)continue;
    overlap_total++;
    if(overlaps.length<12)overlaps.push({left:left.number,right:right.number,files:shared.slice(0,8)});
  }
  const creative=latest.filter(pr=>/(?:higgsfield|creative[-_ ]bridge|creative[-_ ]delivery)/i.test(pr.title)
    ||pr.files.some(f=>/(?:higgsfield|creative-bridge|creative-delivery)/i.test(f)));
  return {assigned,unassigned,overlaps,overlap_total,creative,total:latest.length};
}
export function config():Config{return {repo:process.env.BRIDGE_REPOSITORY??'avaloncoreagency/Avalon-code',githubToken:process.env.BRIDGE_GITHUB_TOKEN??process.env.GH_TOKEN??process.env.GITHUB_TOKEN,vercelToken:process.env.BRIDGE_VERCEL_TOKEN,vercelProject:process.env.BRIDGE_VERCEL_PROJECT,vercelTeam:process.env.BRIDGE_VERCEL_TEAM,supabaseToken:process.env.BRIDGE_SUPABASE_TOKEN,supabaseRef:process.env.BRIDGE_SUPABASE_REF};}
