const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const load=require('../../scripts/creative-bridge/continuity-loader.cjs');
const {compileMission,missionHandoff}=load('src/lib/operations/mission-plan.ts');
const {startMission}=load('src/lib/agents/runner.ts');
const M='00000000-0000-4000-8000-0000000000a1',S='00000000-0000-4000-8000-0000000000b2',X='00000000-0000-4000-8000-0000000000c3';
const plan=()=>({schema:1,id:'omega-database-proof',objective:'Synthetic deterministic review',authorizedBy:M,clientId:null,priority:'P1',createdAt:'2026-11-20T13:00:00Z',budget:{maxSteps:3,maxAttempts:1,externalUsd:0},nextAction:'Owner reviews the persisted SQL diagnostic results.',tasks:[
 {id:'followups',department:'client_operations',mode:'diagnostic',manager:'haru',dependsOn:[],acceptance:'Count overdue synthetic followups without creating business records.'},
 {id:'quality',department:'quality_assurance',mode:'diagnostic',manager:'kenji',dependsOn:['followups'],acceptance:'Persist bounded diagnostic result.'},
 {id:'consolidate',department:'ai_orchestrator',mode:'diagnostic',manager:'ren',dependsOn:['quality'],acceptance:'Consolidate preceding SQL results.'}]});
test('compiled mission uses existing SQL, persists across reopen, replays once, respects owner2/outsider and kill switch', {timeout:180000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'omega-mission-'));let db=new PGlite(dir);t.after(async()=>{await db.close();fs.rmSync(dir,{recursive:true,force:true});});
 await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql','utf8'));
 await db.query('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)',[M,'m@example.invalid',S,'s@example.invalid',X,'x@example.invalid']);
 for(const f of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
  await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
  if(f.startsWith('20261102053022'))await db.query("insert into agency_memberships(user_id,role) values($1,'owner'),($2,'owner'),($3,'operator')",[M,S,X]);
 }
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 const adapter={rpc:async(name,args)=>{assert.equal(name,'crm_agent_mission_start');try{return{data:(await db.query('select crm_agent_mission_start($1,$2::jsonb,$3) r',[args.p_title,JSON.stringify(args.p_steps),args.p_key])).rows[0].r,error:null};}catch(e){return{data:null,error:{message:e.message}};}}};
 const p=plan(),c=compileMission(p,M,{enabled:true,paused:false,suspendedManagers:[]});assert.equal(c.status,'PLANNED');
 await as(M);const r=await startMission(adapter,c.key,c.title,c.steps);assert.equal(r.status,'completed');
 const rows=(await db.query('select step,manager_key,capability,status,result_summary,contract_version from crm_agent_runs where mission_id=$1 order by step',[r.mission_id])).rows;
 assert.equal(missionHandoff(p,c,{...r,requested_by:M,runs:rows}).status,'VERIFYING');
 assert.equal((await startMission(adapter,c.key,c.title,c.steps)).mission_id,r.mission_id);
 assert.equal((await db.query('select count(*)::int n from crm_agent_runs')).rows[0].n,3);
 for(const table of ['crm_tasks','crm_sales','crm_clients'])assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0,'no business writes '+table);
 await db.close();db=new PGlite(dir);await as(S);assert.equal((await db.query('select count(*)::int n from crm_agent_missions')).rows[0].n,1,'second owner reads durable mission after database reopen');
 const results=(await db.query('select result from crm_agent_runs where mission_id=$1 order by step',[r.mission_id])).rows;
 assert.equal(results[0].result.overdue_follow_ups,0);assert.equal(results[2].result.mission_steps.length,2);
 assert.equal(missionHandoff(p,c,{...r,requested_by:M,runs:rows},{missionId:r.mission_id,reviewerId:S,criteriaIds:c.taskOrder,result:'passed',observedAt:new Date().toISOString()}).status,'COMPLETED','independent SQL oracle matches diagnostic acceptance, not customer acceptance');
 await as(X);assert.equal((await db.query('select count(*)::int n from crm_agent_missions')).rows[0].n,0);await assert.rejects(startMission(adapter,'outsider-attempt',c.title,c.steps),/crm_forbidden/);
 await as(M);await db.query('select crm_agent_set_kill_switch(true)');const blocked=await startMission(adapter,'omega-paused-proof',c.title,c.steps);assert.notEqual(blocked.status,'completed');
 const states=(await db.query('select status,error_code from crm_agent_runs where mission_id=$1 order by step',[blocked.mission_id])).rows;assert.ok(states.every(s=>s.status==='blocked'&&s.error_code==='kill_switch'));
 assert.equal((await db.query('select count(*)::int n from crm_agent_runs where mission_id=$1 and attempts>0',[blocked.mission_id])).rows[0].n,0);
});
