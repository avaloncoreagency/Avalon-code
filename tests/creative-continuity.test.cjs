const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const cp=require('node:child_process');
const load=require('../scripts/creative-bridge/continuity-loader.cjs');const c=load('src/lib/creative-bridge/continuity.ts');const v=load('src/lib/creative-bridge/visual.ts');
const sha='a'.repeat(40),uuid='00000000-0000-4000-8000-000000000001';
function fixture(module='website'){return {schema_version:1,task_id:'github:avaloncoreagency/Avalon-code#87',project_ref:'synthetic-project',owner:'miguel',agent:'codex',branch:'feature/synthetic',head_sha:sha,ci:'PASSED',next_action:'Review synthetic Preview',delivery:{schema_version:1,provider:'higgsfield',module,source_ref:'synthetic-project',company_name:'Synthetic Dental',existing_lead_id:null,product_name:'Synthetic demo',description:'Not a sale',project_url:'https://demo.example.invalid',repository_url:''},assets:[{id:'hero',kind:'image',alt:'Synthetic hero',state:'pending',job_ref:null,storage_ref:null,sha256:null,reduced_motion_ref:null}],events:[],receipt:null,history:[]};}
module.exports={fixture};
test('strict manifest validation, unassigned planning and failing CI never invent a CRM lead',()=>{
 const m=fixture();assert.equal(c.registrationPlan(m).status,'ready_for_authorized_submission');m.delivery=null;assert.equal(c.registrationPlan(m).status,'unassigned');m.delivery=fixture().delivery;m.ci='FAILED';assert.equal(c.registrationPlan(m).status,'blocked');assert.throws(()=>c.manifest({...m,owner:'attacker'}));assert.throws(()=>c.manifest({...m,head_sha:'bad'}));assert.throws(()=>c.manifest({...m,sales_confirmed:true}));
});
test('both agents resume exact committed work; stale/conflicting events do not overwrite',()=>{
 for(const [from,to] of [['codex','claude'],['claude','codex']]){const m=fixture();m.agent=from;const next=c.handoff(m,to,sha,'Run acceptance');assert.equal(next.agent,to);assert.equal(next.history[0].sha,sha);assert.equal(m.agent,from);assert.throws(()=>c.handoff(m,to,'b'.repeat(40),'Review'));}
 const event={id:'e1',source_sha:sha,kind:'checkpoint',agent:'codex',next_action:'Verify'};const m=c.reconcile(fixture(),event);assert.deepEqual(c.reconcile(m,event),m);assert.deepEqual(c.reconcile(m,{next_action:'Verify',agent:'codex',kind:'checkpoint',source_sha:sha,id:'e1'}),m);assert.throws(()=>c.reconcile(m,{...event,next_action:'overwrite'}));assert.throws(()=>c.reconcile(m,{...event,id:'e2',source_sha:'b'.repeat(40)}));assert.throws(()=>c.reconcile(m,{...event,id:'e2',agent:'claude'}));assert.equal(c.overlaps(fixture(),{...fixture(),task_id:'github:avaloncoreagency/Avalon-code#23'},['ui'],['ui']),true);
});
test('asset lifecycle needs durable references, rejects temporary URLs and preserves failed state',()=>{
 const m=fixture(),asset={...m.assets[0],state:'generating',job_ref:'synthetic-job'};
 const next=c.reconcile(m,{id:'a1',source_sha:sha,agent:'codex',kind:'asset.result',asset});
 assert.throws(()=>c.reconcile(next,{id:'a2',source_sha:sha,agent:'codex',kind:'asset.result',asset:{...asset,state:'ready'}}));
 const ready={...asset,state:'ready',storage_ref:'supabase-storage://creative/hero.webp',sha256:'b'.repeat(64)};
 assert.equal(c.reconcile(next,{id:'a3',source_sha:sha,agent:'codex',kind:'asset.result',asset:ready}).assets[0].state,'ready');
 assert.throws(()=>c.manifest({...m,assets:[{...ready,storage_ref:'https://temporary.invalid/?token=private'}]}));
 const failed=c.reconcile(next,{id:'a4',source_sha:sha,agent:'codex',kind:'asset.result',asset:{...asset,state:'failed'}});assert.equal(c.registrationPlan(failed).status,'ready_for_authorized_submission');
});
test('registration reuses the existing delivery port and records one receipt without publishing',async()=>{
 for(const moduleKey of ['website','ecommerce','crm_creator']){let calls=0;const transport=async d=>{calls++;assert.equal(d.module,moduleKey);return {project_id:uuid,lead_id:uuid};};const result=await c.register(fixture(moduleKey),transport);assert.equal(result.status,'recorded');assert.equal((await c.register(result.manifest,transport)).status,'recorded');assert.equal(calls,1);}
 let calls=0;await c.register({...fixture(),delivery:null},async()=>{calls++;throw Error('not allowed');});assert.equal(calls,0);assert.equal((await c.register(fixture())).status,'blocked');assert.equal((await c.register(fixture(),async()=>{throw Error('PRIVATE');})).status,'failed');
});
test('visual provider is unavailable by default; quotes do not authorize generation or unknown cost',async()=>{
 const request={id:'hero',model:'catalog-model',kind:'image',brief:'Synthetic hero',alt:'Synthetic decorative hero',reduced_motion:true};let starts=0;
 const port={quote:async()=>({credits:2,quote_ref:'q',expires_at:Date.now()+60000}),start:async()=>{starts++;return {job_ref:'synthetic-job'};}};
 assert.equal((await v.prepareVisual(request)).status,'blocked');await v.prepareVisual(request,port);assert.equal(starts,0);await assert.rejects(()=>v.generateVisual(request,port,null));await assert.rejects(()=>v.generateVisual(request,port,{request_id:'hero',quote_ref:'q',max_credits:1}));assert.equal(starts,0);
 assert.equal((await v.generateVisual(request,port,{request_id:'hero',quote_ref:'q',max_credits:2})).status,'generating');assert.equal(starts,1);
 await assert.rejects(()=>v.generateVisual(request,{...port,quote:async()=>({credits:null,quote_ref:'q',expires_at:Date.now()+1e5})},{request_id:'hero',quote_ref:'q',max_credits:2}));
 await assert.rejects(()=>v.prepareVisual({...request,kind:'video',reduced_motion:false},port));
});
test('CLI writes private atomic checkpoints, refuses stale handoffs and does not disclose source details',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'avalon-creative-'));const p=path.join(dir,'manifest.json');fs.writeFileSync(p,JSON.stringify(fixture()),{mode:0o600});
 const run=(...args)=>cp.spawnSync(process.execPath,['scripts/creative-bridge/checkpoint.cjs',...args],{encoding:'utf8'});
 try{const result=run('validate',p);assert.equal(result.status,0);assert.ok(!result.stdout.includes('Synthetic Dental'));assert.equal(run('handoff',p,'claude','b'.repeat(40),'Review').status,2);assert.equal(run('handoff',p,'claude',sha,'Review').status,0);assert.equal(JSON.parse(fs.readFileSync(p)).agent,'claude');assert.equal(fs.statSync(p).mode&0o777,0o600);assert.equal(fs.existsSync(p+'.lock'),false);const delivery=path.join(dir,'delivery.json');assert.equal(run('emit-delivery',p,delivery).status,0);assert.equal(run('emit-delivery',p,delivery).status,2);assert.equal(run('validate','package.json').status,2);const alias=path.join(dir,'repository');fs.symlinkSync(process.cwd(),alias,'dir');assert.equal(run('validate',path.join(alias,'tests/fixtures/creative-manifest.synthetic.json')).status,2);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('advancing code invalidates old CI and rejects late resource events',()=>{
 const m=fixture(),next=c.advance(m,sha,'b'.repeat(40),'feature/resume','Run CI on new commit');assert.equal(next.ci,'UNKNOWN');assert.equal(next.head_sha,'b'.repeat(40));assert.equal(next.history[0].sha,sha);assert.throws(()=>c.advance(m,'c'.repeat(40),'b'.repeat(40),'feature/resume','Run CI'));
 assert.throws(()=>c.reconcile(next,{id:'late',source_sha:sha,kind:'checkpoint',agent:'codex',next_action:'Old result'}));
});

test('manifest retains PR, CI and deployment evidence without trusting unsafe or external task links',()=>{
 const m=fixture();m.evidence={pull_request:'https://github.com/avaloncoreagency/Avalon-code/pull/112',ci_url:'https://github.com/avaloncoreagency/Avalon-code/actions/runs/123',preview_url:'https://synthetic.example.invalid/preview',production_url:null,observed_at:'2026-11-03T22:00:00Z'};assert.equal(c.manifest(m).evidence.pull_request,m.evidence.pull_request);
 for(const link of ['https://user:secret@example.invalid','https://example.invalid/?token=private','javascript:alert(1)'])assert.throws(()=>c.manifest({...m,evidence:{preview_url:link}}));
 assert.throws(()=>c.manifest({...m,evidence:{pull_request:'https://github.com/other/repo/pull/1'}}));
});
