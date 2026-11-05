// Manager execution engine on real PostgreSQL (PGlite). Synthetic identities only; no network, no secrets.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const MIGUEL = '00000000-0000-4000-8000-0000000000a1', SAMUEL = '00000000-0000-4000-8000-0000000000b2', OPER = '00000000-0000-4000-8000-0000000000c3';

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id,email) values('${MIGUEL}','m@example.invalid'),('${SAMUEL}','s@example.invalid'),('${OPER}','o@example.invalid');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner'),('${SAMUEL}','owner'),('${OPER}','operator');`);
  }
  const as = u => db.exec(`reset role;set request.jwt.claim.sub='${u}';set role authenticated;`);
  const anon = () => db.exec('reset role;set role anon;');
  const q = async (s, p) => (await db.query(s, p)).rows;
  const one = async (s, p) => (await q(s, p))[0];
  return { db, as, anon, q, one };
}
const enqueue = (one, manager = 'haru', cap = 'crm_followups', key = 'haru-run-0001') => one('select crm_agent_enqueue($1,$2,$3) id', [manager, cap, key]).then(r => r.id);
const claim = (one, id) => one('select crm_agent_claim($1) r', [id]).then(r => r.r);

test('engine: allowlist, idempotency, claim → complete, never re-executed', { timeout: 120000 }, async t => {
  const { db, as, one, q } = await setup(); t.after(() => db.close());
  await as(MIGUEL);
  assert.equal((await q('select count(*)::int n from crm_agent_capabilities'))[0].n, 6, 'five read capabilities + HARU followup_tasks');
  const id = await enqueue(one);
  assert.equal((await one('select status, executor_kind, requested_by from crm_agent_runs where id=$1', [id])).requested_by, MIGUEL);
  assert.equal(await enqueue(one), id, 'same key returns the same run');
  assert.equal((await q('select count(*)::int n from crm_agent_runs'))[0].n, 1);
  await assert.rejects(enqueue(one, 'haru', 'security_posture', 'haru-bad-0001'), /agent_capability_not_allowed/, 'a manager cannot run another manager\'s capability');
  await assert.rejects(enqueue(one, 'jarvis', 'crm_followups', 'jarvis-run-1'), /agent_capability_not_allowed/);
  await assert.rejects(enqueue(one, 'haru', 'crm_followups', 'short'), /agent_invalid_key/);

  await assert.rejects(db.query('select crm_agent_complete($1,$2,$3,$4)', [id, 'x', '{}', '[]']), /agent_run_not_running/, 'cannot complete before claiming');
  const c1 = await claim(one, id);
  assert.deepEqual({ ...c1 }, { claimed: true, status: 'running', error_code: null });
  const c2 = await claim(one, id);
  assert.equal(c2.claimed, false, 'a live lease cannot be claimed twice');
  await db.query('select crm_agent_complete($1,$2,$3::jsonb,$4::jsonb)', [id, '3 seguimientos vencidos', JSON.stringify({ overdue: 3 }), JSON.stringify([{ type: 'lead', id: 'l1' }])]);
  const done = await one('select * from crm_agent_runs where id=$1', [id]);
  assert.equal(done.status, 'completed'); assert.equal(done.attempts, 1);
  assert.equal(done.result_summary, '3 seguimientos vencidos');
  assert.ok(done.finished_at && done.started_at && !done.lease_until && done.error_code === null);
  const again = await claim(one, id);
  assert.deepEqual({ claimed: again.claimed, status: again.status }, { claimed: false, status: 'completed' }, 'a finished run is never re-executed');
});

test('engine: kill switch and rate limits block BEFORE any work starts', { timeout: 120000 }, async t => {
  const { db, as, one, q } = await setup(); t.after(() => db.close());
  await as(MIGUEL);
  await db.query('select crm_agent_set_kill_switch(true)');
  assert.equal((await one('select kill_switch, updated_by from crm_agent_settings')).updated_by, MIGUEL, 'the switch is attributable');
  const a = await enqueue(one, 'ren', 'operations_plan', 'ren-switch-001');
  const blocked = await claim(one, a);
  assert.deepEqual({ ...blocked }, { claimed: false, status: 'blocked', error_code: 'kill_switch' });
  assert.equal((await one('select status, error_code, started_at from crm_agent_runs where id=$1', [a])).started_at, null, 'never started');
  await db.query('select crm_agent_set_kill_switch(false)');

  // Hourly limit of 2 for this manager.
  await db.exec("reset role; update crm_agent_settings set hourly_limit=2;"); await as(MIGUEL);
  for (const key of ['kenji-aaaa-001', 'kenji-aaaa-002']) { const id = await enqueue(one, 'kenji', 'data_quality_cost', key); assert.equal((await claim(one, id)).claimed, true); await db.query("select crm_agent_complete($1,'ok','{}'::jsonb,'[]'::jsonb)", [id]); }
  const third = await enqueue(one, 'kenji', 'data_quality_cost', 'kenji-aaaa-003');
  assert.deepEqual({ ...(await claim(one, third)) }, { claimed: false, status: 'blocked', error_code: 'hourly_limit' });
  // Another manager is unaffected.
  const other = await enqueue(one, 'sora', 'radar_review_queue', 'sora-aaaa-0001');
  assert.equal((await claim(one, other)).claimed, true);

  // Daily limit.
  await db.exec("reset role; update crm_agent_settings set hourly_limit=60, daily_limit=1;"); await as(MIGUEL);
  const d1 = await enqueue(one, 'shin', 'security_posture', 'shin-aaaa-0001'); assert.equal((await claim(one, d1)).claimed, true);
  await db.query("select crm_agent_complete($1,'ok','{}'::jsonb,'[]'::jsonb)", [d1]);
  const d2 = await enqueue(one, 'shin', 'security_posture', 'shin-aaaa-0002');
  assert.equal((await claim(one, d2)).error_code, 'daily_limit');
  assert.equal((await q("select count(*)::int n from crm_agent_runs where status='blocked'"))[0].n, 3);
});

test('engine: expired lease is recovered with bounded attempts, then fails closed', { timeout: 120000 }, async t => {
  const { db, as, one } = await setup(); t.after(() => db.close());
  await as(MIGUEL);
  const id = await enqueue(one, 'haru', 'crm_followups', 'haru-lease-001');
  for (let attempt = 1; attempt <= 3; attempt++) {
    assert.equal((await claim(one, id)).claimed, true, 'attempt ' + attempt);
    await db.exec("reset role; update crm_agent_runs set lease_until = now() - interval '1 minute' where status='running';"); await as(MIGUEL);
  }
  const last = await claim(one, id);
  assert.deepEqual({ ...last }, { claimed: false, status: 'failed', error_code: 'lease_expired' });
  const row = await one('select attempts, status, error_code from crm_agent_runs where id=$1', [id]);
  assert.deepEqual({ ...row }, { attempts: 3, status: 'failed', error_code: 'lease_expired' });
  // A completion after the lease expired is refused.
  const late = await enqueue(one, 'haru', 'crm_followups', 'haru-lease-002');
  await claim(one, late);
  await db.exec("reset role; update crm_agent_runs set lease_until = now() - interval '1 minute' where id='" + late + "';"); await as(MIGUEL);
  await assert.rejects(db.query("select crm_agent_complete($1,'late','{}'::jsonb,'[]'::jsonb)", [late]), /agent_run_not_running/);
  await db.query("select crm_agent_fail($1,'executor_error')", [late]);
  assert.equal((await one('select status, error_code from crm_agent_runs where id=$1', [late])).status, 'failed');
});

test('engine: access control — owners only, never anon, never direct writes, runs belong to their requester', { timeout: 120000 }, async t => {
  const { db, as, anon, one, q } = await setup(); t.after(() => db.close());
  await as(MIGUEL);
  const id = await enqueue(one);
  // Another owner can read runs but cannot claim, complete or fail someone else's run.
  await as(SAMUEL);
  assert.equal((await q('select count(*)::int n from crm_agent_runs'))[0].n, 1, 'owners share the activity');
  await assert.rejects(claim(one, id), /agent_run_not_yours/);
  await assert.rejects(db.query("select crm_agent_fail($1,'x_error')", [id]), /agent_run_not_yours/);
  // A non-owner member sees nothing and can do nothing.
  await as(OPER);
  assert.equal((await q('select count(*)::int n from crm_agent_runs'))[0].n, 0);
  assert.equal((await q('select count(*)::int n from crm_agent_settings'))[0].n, 0);
  for (const sql of ["select crm_agent_enqueue('haru','crm_followups','oper-key-0001')", 'select crm_agent_claim(\'' + id + '\')', "select crm_agent_set_kill_switch(true)", 'select crm_agent_security_posture()'])
    await assert.rejects(db.query(sql), /crm_forbidden/, sql);
  // Direct table writes are impossible for every role, including owners.
  await as(MIGUEL);
  for (const sql of ["insert into crm_agent_runs(manager_key,capability,task_title,requested_by,idempotency_key) values('haru','crm_followups','x','" + MIGUEL + "','direct-key-001')",
    "update crm_agent_runs set status='completed'", 'delete from crm_agent_runs', "update crm_agent_settings set kill_switch=true", "insert into crm_agent_capabilities values('haru','evil_cap','x')"])
    await assert.rejects(db.query(sql), /permission denied/, sql);
  // The anonymous role has no access to any of it.
  await anon();
  for (const sql of ['select * from crm_agent_runs', 'select * from crm_agent_settings', "select crm_agent_enqueue('haru','crm_followups','anon-key-0001')", 'select crm_agent_security_posture()'])
    await assert.rejects(db.query(sql), /permission denied/, sql);
});

test('engine: schema refuses to label a manager as AI and keeps reports bounded', { timeout: 120000 }, async t => {
  const { db, as, one } = await setup(); t.after(() => db.close());
  await db.exec('reset role;');
  await assert.rejects(db.query("insert into crm_agent_runs(manager_key,capability,task_title,requested_by,idempotency_key,executor_kind) values('haru','crm_followups','x',$1,'ai-claim-0001','llm')", [MIGUEL]), /check/);
  await assert.rejects(db.query("insert into crm_agent_runs(manager_key,capability,task_title,requested_by,idempotency_key,status) values('haru','crm_followups','x',$1,'bad-state-001','completed')", [MIGUEL]), /check/, 'completed requires finished_at');
  await as(MIGUEL);
  const id = await enqueue(one, 'ren', 'operations_plan', 'ren-bounds-001'); await claim(one, id);
  await assert.rejects(db.query("select crm_agent_complete($1,'ok','{}'::jsonb,$2::jsonb)", [id, JSON.stringify(Array.from({ length: 21 }, (_, i) => ({ type: 'lead', id: 'x' + i })))]), /check/, 'at most 20 evidence refs');
  await db.query("select crm_agent_complete($1,$2,'{}'::jsonb,'[]'::jsonb)", [id, 'x'.repeat(5000)]);
  assert.equal((await one('select length(result_summary) n from crm_agent_runs where id=$1', [id])).n, 2000, 'summary truncated to 2000');
});

test('engine: security posture reports catalog facts and detects a table without RLS', { timeout: 120000 }, async t => {
  const { db, as, one } = await setup(); t.after(() => db.close());
  await as(MIGUEL);
  let p = (await one('select crm_agent_security_posture() p')).p;
  assert.deepEqual(p.tables_without_rls, [], 'every table in the migration chain has RLS');
  assert.deepEqual(p.definer_functions_callable_by_anon, ['crm_ai_public_control', 'crm_public_inquiry'], 'the only anonymous definers are the documented public quote RPC and the reviewed AI control signal (switches only)');
  assert.equal(p.owner_memberships, 2); assert.equal(p.other_memberships, 1);
  assert.equal(p.kill_switch, false);
  await db.exec('reset role; create table public.forgotten_table(id int);'); await as(MIGUEL);
  p = (await one('select crm_agent_security_posture() p')).p;
  assert.deepEqual(p.tables_without_rls, ['forgotten_table'], 'a new table without RLS is detected');
});
