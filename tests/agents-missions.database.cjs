// Avalon HQ 0350: missions with dependent steps, configurable registry, SQL executors, real internal writes (HARU),
// retries, kill switch and the scheduler tick. Real PostgreSQL (PGlite), synthetic data only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const M = '00000000-0000-4000-8000-0000000000a1', S = '00000000-0000-4000-8000-0000000000b2', X = '00000000-0000-4000-8000-0000000000c3';

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id,email) values('${M}','m@example.invalid'),('${S}','s@example.invalid'),('${X}','x@example.invalid');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${M}','owner'),('${S}','owner'),('${X}','operator');`);
  }
  const as = u => db.exec(`reset role;set request.jwt.claim.sub='${u}';set role authenticated;`);
  const q = async (s, p) => (await db.query(s, p)).rows;
  const one = async (s, p) => (await q(s, p))[0];
  await as(M);
  await db.exec(`insert into crm_leads(company,source,owner_id,follow_up_at,created_by) values
    ('Lead Vencido A','test','${M}',now()-interval '2 days','${M}'),('Lead Vencido B','test','${S}',now()-interval '1 day','${M}'),
    ('Lead Futuro','test','${M}',now()+interval '3 days','${M}');
    insert into crm_prospects(company,source,owner_id,opportunity,acquired_at,created_by,stars) values
    ('P5','radar','${M}','x',now(),'${M}',5),('P2','radar','${M}','x',now(),'${M}',2);`);
  return { db, as, q, one };
}

test('daily mission: six dependent steps across five managers, real internal tasks, idempotent', { timeout: 180000 }, async t => {
  const { db, as, q, one } = await setup(); t.after(() => db.close());
  const r = (await one("select crm_agent_mission_start(null,null,'mission-0001') r")).r;
  assert.equal(r.status, 'completed');
  const steps = await q('select step, manager_key, capability, status, depends_on, result, result_summary, evidence_refs, requested_by from crm_agent_runs where mission_id=$1 order by step', [r.mission_id]);
  assert.deepEqual(steps.map(s => s.manager_key), ['sora', 'haru', 'haru', 'kenji', 'shin', 'ren']);
  assert.ok(steps.every(s => s.status === 'completed' && s.requested_by === M));
  assert.deepEqual(steps[5].depends_on, [1, 3, 4, 5]);
  assert.equal(steps[0].result.review_first_4_5_stars, 1);
  assert.equal(steps[1].result.overdue_follow_ups, 2);
  assert.equal(steps[2].result.tasks_created, 2, 'HARU created one internal task per overdue follow-up');
  assert.equal(steps[5].result.mission_steps.length, 5, 'REN consolidates the other managers');
  const tasks = await q("select title, assignee_id, source, priority from crm_tasks where source='automation' order by title");
  assert.deepEqual(tasks.map(x => [x.title, x.assignee_id]), [['Seguimiento vencido: Lead Vencido A', M], ['Seguimiento vencido: Lead Vencido B', S]]);
  assert.equal((await one("select count(*)::int n from crm_notifications where category='task'")).n >= 1, true, 'assignee notified');
  // Replaying the same mission key never re-executes; a new mission never duplicates tasks.
  assert.equal((await one("select crm_agent_mission_start(null,null,'mission-0001') r")).r.mission_id, r.mission_id);
  const again = (await one("select crm_agent_mission_start(null,null,'mission-0002') r")).r;
  assert.equal(again.status, 'completed');
  assert.equal((await one("select result from crm_agent_runs where mission_id=$1 and step=3", [again.mission_id])).result.tasks_created, 0);
  assert.equal((await one("select count(*)::int n from crm_tasks where source='automation'")).n, 2);
  // The other owner sees missions and tasks; a non-owner sees nothing and cannot start or retry.
  await as(S); assert.equal((await one('select count(*)::int n from crm_agent_missions')).n, 2);
  await as(X);
  assert.equal((await one('select count(*)::int n from crm_agent_missions')).n, 0);
  assert.equal((await one('select count(*)::int n from crm_agent_task_links')).n, 0);
  await assert.rejects(db.query("select crm_agent_mission_start(null,null,'mission-x001')"), /crm_forbidden/);
  await assert.rejects(db.query("select crm_agent_set_automatic(true)"), /crm_forbidden/);
  await assert.rejects(db.query("select crm_agent_run_now('haru','followup_tasks','single-x001')"), /crm_forbidden/);
  await db.exec('reset role; set role anon;');
  await assert.rejects(db.query("select crm_agent_mission_start(null,null,'mission-a001')"), /permission denied/);
});

test('configurable steps, validation, dependency failure, retry and kill switch', { timeout: 180000 }, async t => {
  const { db, as, one, q } = await setup(); t.after(() => db.close());
  await assert.rejects(db.query(`select crm_agent_mission_start('x','[{"manager":"haru","capability":"security_posture"}]'::jsonb,'bad-cap-0001')`), /agent_capability_not_allowed/);
  await assert.rejects(db.query(`select crm_agent_mission_start('x','[{"manager":"haru","capability":"crm_followups","depends_on":[1]}]'::jsonb,'bad-dep-0001')`), /agent_mission_invalid_dependency/);
  // A disabled capability cannot be assigned.
  await db.query("select crm_agent_capability_set('kenji','data_quality_cost',false)");
  await assert.rejects(db.query(`select crm_agent_mission_start('x','[{"manager":"kenji","capability":"data_quality_cost"}]'::jsonb,'disabled-0001')`), /agent_capability_not_allowed/);
  await db.query("select crm_agent_capability_set('kenji','data_quality_cost',true)");
  // A step that cannot run blocks its dependants (never silently skipped): hourly limit of 1 already used by KENJI.
  await db.exec("reset role; update crm_agent_settings set hourly_limit=1;"); await as(M);
  await db.query("select crm_agent_run_now('kenji','data_quality_cost','single-pre-01')");
  const m = (await one(`select crm_agent_mission_start('Custom','[{"manager":"kenji","capability":"data_quality_cost"},{"manager":"ren","capability":"operations_plan","depends_on":[1]}]'::jsonb,'custom-0001') r`)).r;
  assert.equal(m.status, 'failed');
  assert.deepEqual((await q('select error_code from crm_agent_runs where mission_id=$1 order by step', [m.mission_id])).map(x => x.error_code), ['hourly_limit', 'dependency_failed']);
  await db.exec("reset role; update crm_agent_settings set hourly_limit=6;"); await as(M);
  // Retry: a failed run is re-queued in place (same id, attempts+1) and its blocked dependants resume.
  await db.exec("reset role; update crm_agent_runs set status='failed', error_code='executor_error' where mission_id='" + m.mission_id + "' and step=1;");
  await as(M);
  const kid = (await one('select id from crm_agent_runs where mission_id=$1 and step=1', [m.mission_id])).id;
  assert.equal((await one('select crm_agent_retry($1) s', [kid])).s, 'completed');
  assert.equal((await one('select status from crm_agent_missions where id=$1', [m.mission_id])).status, 'completed');
  assert.equal((await one('select count(*)::int n from crm_agent_runs where mission_id=$1', [m.mission_id])).n, 2, 'no duplicate runs');
  // Kill switch: everything blocks before work starts.
  await db.query('select crm_agent_set_kill_switch(true)');
  const k = (await one("select crm_agent_run_now('haru','followup_tasks','single-kill-01') r")).r;
  assert.deepEqual([k.status, k.error_code], ['blocked', 'kill_switch']);
  assert.equal((await one("select count(*)::int n from crm_tasks where source='automation'")).n, 0);
});

test('scheduler tick: no-op until an owner enables automation; then one daily mission attributed to that owner', { timeout: 180000 }, async t => {
  const { db, as, one } = await setup(); t.after(() => db.close());
  await db.exec('reset role;');
  assert.equal((await one('select crm_private.agent_scheduler_tick() r')).r, 'automatic_disabled');
  await as(S); await db.query('select crm_agent_set_automatic(true)');
  await db.exec('reset role;');
  assert.equal((await one('select crm_private.agent_scheduler_tick() r')).r, 'ok');
  assert.equal((await one('select crm_private.agent_scheduler_tick() r')).r, 'ok');
  const ms = (await db.query("select trigger, requested_by, status from crm_agent_missions")).rows;
  assert.equal(ms.length, 1, 'one mission per day even with repeated ticks');
  assert.deepEqual([ms[0].trigger, ms[0].requested_by, ms[0].status], ['schedule', S, 'completed']);
  await as(M); await db.query('select crm_agent_set_kill_switch(true)'); await db.exec('reset role;');
  assert.equal((await one('select crm_private.agent_scheduler_tick() r')).r, 'kill_switch');
  await as(M); await assert.rejects(db.query("select crm_private.agent_scheduler_tick()"), /permission denied/);
});
