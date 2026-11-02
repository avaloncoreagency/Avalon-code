const {test} = require('node:test');
const assert = require('node:assert/strict');
const Ajv = require('ajv');
const b = require('../../scripts/dev-bridge/load.cjs');
const schema = require('../../schemas/dev-bridge/resume-package.schema.json');
const validate = new Ajv().compile(schema);
const {fixture,sha}=require('./fixture.cjs');
const base='b'.repeat(40);
const now=()=>new Date().toISOString();
const verified=data=>({status:'VERIFIED',checked_at:now(),verified_at:now(),data});
test('pagination traverses all pages and rejects incomplete responses',async()=>{
 let calls=0; const api=new b.Api('https://fixture.test','token',async url=>{calls++;assert.match(url,/per_page=100&page=/);return Response.json(calls===1?Array.from({length:100},(_,id)=>({id})):[{id:100}]);});
 assert.equal((await api.pages('/items')).length,101);assert.equal(calls,2);
 const bad=new b.Api('https://fixture.test','token',async()=>Response.json({error:'not array'}));await assert.rejects(()=>bad.pages('/items'),/Unexpected/);
});
test('rate limit backoff, transient failures, timeouts, bounded retries and no response leaks',async()=>{
 let calls=0;const pauses=[];
 const api=new b.Api('https://fixture.test','private-token',async()=>++calls<3?new Response('secret-in-body',{status:429,headers:{'retry-after':'1'}}):Response.json({ok:true}),async ms=>pauses.push(ms));
 assert.deepEqual(await api.get('/items'),{ok:true});assert.deepEqual(pauses,[1000,1000]);
 const denied=new b.Api('https://fixture.test','private-token',async()=>new Response('credential=hide',{status:401}));await assert.rejects(()=>denied.get('/items'),e=>e.message==='Provider HTTP 401');
 const slow=new b.Api('https://fixture.test','',async()=>new Response('',{status:429,headers:{'retry-after':'30'}}));await assert.rejects(()=>slow.get('/items'),/retry next/);
 calls=0;const network=new b.Api('https://fixture.test','',async()=>{calls++;throw Error('secret');},async()=>{});await assert.rejects(()=>network.get('/items'),/network\/timeout/);assert.equal(calls,3);
 await assert.rejects(()=>api.get('//evil.test'),/Invalid/);
});
test('connector failure preserves last known data with stale status, missing credentials are UNKNOWN',async()=>{
 const old=verified({value:1});const next=await b.fact(async()=>{throw Error('unavailable');},old);
 assert.equal(next.status,'STALE');assert.equal(next.verified_at,old.verified_at);assert.deepEqual(next.data,old.data);
 assert.equal((await b.fact(async()=>{throw Error('no access');})).status,'UNKNOWN');
 assert.equal(b.freshness({...old,verified_at:'2000-01-01T00:00:00Z'}).status,'STALE');
 assert.equal(b.freshness({...old,verified_at:null}).status,'STALE');
});
test('partial failures isolated; duplicate and out-of-order events reconcile idempotently',async()=>{
 const seed=fixture(); const adapters={github:async()=>seed.github.data,vercel:async()=>seed.vercel.data,supabase:async()=>{throw Error('unavailable');}};
 const first=await b.sync({repo:'org/repo'},undefined,false,adapters);const second=await b.sync({repo:'org/repo'},first,false,adapters);
 assert.deepEqual(first.events,second.events);assert.equal(second.github.status,'VERIFIED');assert.equal(second.supabase.status,'UNKNOWN');
 seed.vercel.data[0]={...seed.vercel.data[0],state:'BUILDING'};
 const delayed=await b.sync({repo:'org/repo'},second,false,adapters);assert.equal(delayed.vercel.data[0].state,'READY');
 assert.equal(delayed.events.filter(e=>e.id.startsWith('deployment:')).length,1);
 adapters.github=async()=>{throw Error('GitHub down');};const failed=await b.sync({repo:'org/repo'},second,false,adapters);assert.equal(failed.checkpoint.github_since,second.checkpoint.github_since);
});
test('detects CI/deployment failures, divergence, overlaps, migration drift and RLS findings',()=>{
 const s=fixture(),p=s.github.data.pulls[0];p.ci='FAILED';p.behind=2;p.conflict=true;
 s.github.data.pulls.push({...p,number:12,base_branch:'different',files:[...p.files,'supabase/migrations/456_change.sql']});p.files.push('supabase/migrations/456_change.sql');
 s.supabase.data.migrations=['456'];s.supabase.data.rls[0].enabled=false;s.vercel.data[0].state='ERROR';
 const ids=b.findings(s).map(x=>x.id);
 for(const expected of ['ci:11','behind:11','conflict:11','overlap:11:12','base:11:12','migration-conflict:11:12','migration:123','migration:456','rls:memberships','deployment:d1','review:11'])assert.ok(ids.includes(expected),expected);
 assert.equal(b.findings({...s,github:{...s.github,verified_at:'2000-01-01T00:00:00Z'}}).some(f=>f.id==='ci:11'),false,'stale claims cannot be current');
});
test('resume requires unique Issue, linked PR, fresh branch and exact next action',()=>{
 const s=fixture();let pkg=b.resume(s,8,'samuel','org/repo',sha);assert.ok(validate(pkg),JSON.stringify(validate.errors));
 assert.equal(pkg.original_owner,'miguel');assert.equal(pkg.resuming_owner,'samuel');assert.match(pkg.deployment_status,/health UNKNOWN/);
 assert.throws(()=>b.resume(s,9,'samuel','org/repo',sha),/Missing issue/);
 assert.throws(()=>b.resume(s,8,'samuel','org/repo',base),/advanced/);
 s.github.data.issues[0].body='';assert.throws(()=>b.resume(s,8,'samuel','org/repo',sha),/Next action/);
 s.github.data.pulls=[];assert.throws(()=>b.resume(s,8,'samuel','org/repo',sha),/Missing linked/);
 s.github.status='STALE';assert.throws(()=>b.resume(s,8,'samuel','org/repo',sha),/Fresh/);
 pkg={...pkg,head_sha:'invalid'};assert.equal(validate(pkg),false);
 delete pkg.work_item_id;assert.equal(validate(pkg),false);
});
test('ambiguous ownership and multiple linked PRs block unsafe resume',()=>{
 const s=fixture();s.github.data.issues[0].owner=null;assert.throws(()=>b.resume(s,8,'samuel','org/repo',sha),/unique owner/);
 s.github.data.issues[0].owner='miguel';s.github.data.pulls.push({...s.github.data.pulls[0],number:12});assert.throws(()=>b.resume(s,8,'samuel','org/repo',sha),/Multiple PRs/);
});
test('secret/email filtering and exact configured-token redaction',async()=>{
 const text=b.redact('Bearer abc ghi ghp_secret sb_secret_secret token=hidden password:abc user@example.com');
 for(const secret of ['Bearer abc','ghp_secret','sb_secret_secret','hidden','password:abc','user@example.com'])assert.ok(!text.includes(secret),secret);
 const s=fixture();s.github.data.issues[0].title='unusual-opaque-credential';
 const result=await b.sync({repo:'org/repo',githubToken:'unusual-opaque-credential'},undefined,false,{github:async()=>s.github.data,vercel:async()=>[],supabase:async()=>{throw Error('no access');}});
 assert.ok(!JSON.stringify(result).includes('unusual-opaque-credential'));
});
test('Vercel pagination correlates SHA and never mistakes production for preview',async()=>{
 let calls=0;const api={get:async()=>{calls++;return {deployments:[{uid:'d'+calls,url:'safe.vercel.app',target:calls===1?'production':null,state:'READY',created:1,meta:{githubCommitSha:sha,githubCommitRef:'feature/demo'},env:{SECRET:'do-not-copy'}}],pagination:{next:calls===1?100:null}};}};
 const data=await b.vercel({vercelToken:'opaque',vercelProject:'p',vercelTeam:'t'},api);
 assert.deepEqual(data.map(d=>d.environment),['production','preview']);assert.equal(data[0].sha,sha);assert.ok(!JSON.stringify(data).includes('do-not-copy'));
});
test('Supabase adapter only reads metadata with hardcoded SELECT, not Auth or customer records',async()=>{
 const calls=[];const api={get:async(path,body)=>{calls.push({path,body});if(path.endsWith('/database/query'))return [{metadata:{migrations:['123'],rls:[{table:'membership',enabled:true}]}}];if(path.endsWith('/functions'))return [];return {lints:[{name:'warning',metadata:{credential:'excluded'}}]};}};
 const data=await b.supabase({supabaseToken:'opaque',supabaseRef:'a'.repeat(20)},api);
 assert.equal(data.advisors[0],'warning');assert.ok(!JSON.stringify(data).includes('excluded'));
 const query=calls.find(c=>c.body).body;assert.equal(query.read_only,true);assert.match(query.query,/^select /i);assert.doesNotMatch(query.query,/auth\.users|insert |update |delete /i);
});
test('GitHub adapter correlates Issues/PR/files/CI and ignores older incremental Issue updates',async()=>{
 const s=fixture();const calls=[];
 const api={pages:async path=>{calls.push(path);if(path.includes('/issues?'))return [{number:8,title:'old',updated_at:'2000-01-01T00:00:00Z',labels:[{name:'owner:samuel'}]}];if(path.includes('/pulls?'))return [{number:11}];if(path.endsWith('/files'))return [{filename:'test.ts'}];if(path.endsWith('/reviews'))return [{state:'APPROVED'}];return [];},get:async path=>{
 if(path.endsWith('/pulls/11'))return {head:{sha,ref:'feature/demo'},base:{sha:base,ref:'main'},body:'Refs #8',mergeable:null};
 if(path.includes('check-runs'))return {total_count:1,check_runs:[{conclusion:'failure'}]};if(path.includes('/status?'))return {total_count:0,state:'pending'};if(path.includes('/compare/'))return {ahead_by:1};if(path.includes('/git/trees/'))return {tree:[{path:'supabase/migrations/123_initial.sql'}]};throw Error('Unhandled '+path);
 }};
 const data=await b.github({repo:'org/repo',githubToken:'opaque'},now(),s.github.data,api);
 assert.equal(data.issues[0].owner,'miguel');assert.equal(data.issues[0].title,'Demo');assert.equal(data.pulls[0].ci,'FAILED');assert.deepEqual(data.pulls[0].issues,[8]);assert.equal(data.pulls[0].behind,1);assert.deepEqual(data.migrations,['123']);
});
