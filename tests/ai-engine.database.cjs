// Avalon AI Engine migration on real PostgreSQL (PGlite), synthetic data only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const M = '00000000-0000-4000-8000-0000000000a1', X = '00000000-0000-4000-8000-0000000000c3';

test('AI engine schema: 10 profiles, inert reserved seats, $0-only ledger, service_role writes, owner-only reads, AI off by default', { timeout: 180000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id,email) values('${M}','m@example.invalid'),('${X}','x@example.invalid');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${M}','owner'),('${X}','operator');`);
  }
  const q = async (s) => (await db.query(s)).rows;
  const as = u => db.exec(`reset role;set request.jwt.claim.sub='${u}';set role authenticated;`);
  const svc = () => db.exec(`reset role;set role service_role;`);
  const fails = async (sql, re) => { await assert.rejects(db.exec(sql), re); };

  await as(M);
  const profiles = await q(`select key, status, ai_enabled from crm_ai_worker_profiles order by key`);
  assert.equal(profiles.length, 10);
  assert.equal(profiles.filter(p => p.status === 'reserved').length, 5);
  assert.ok(profiles.every(p => p.ai_enabled === false));
  assert.equal((await q(`select ai_enabled from crm_agent_settings`))[0].ai_enabled, false);

  // SHIN's posture review keeps flagging any OTHER anon-callable definer function (the control RPC is the only new exception).
  await db.exec(`reset role; create function public.rogue_definer() returns int language sql security definer set search_path = '' as 'select 1'; grant execute on function public.rogue_definer() to anon;`);
  const posture = (await q(`select public.crm_agent_security_posture_internal() p`))[0].p;
  const anonFinding = posture.findings.find(f => /definidor ejecutables por anon/.test(f.finding));
  assert.ok(anonFinding && /rogue_definer/.test(anonFinding.finding) && !/crm_ai_public_control/.test(anonFinding.finding), JSON.stringify(posture.findings));
  await db.exec(`drop function public.rogue_definer();`);
  await as(M);
  // Public control signal: anon gets ONLY switches + suspended keys; nothing else of the tables.
  await db.exec(`reset role; set role anon`);
  assert.deepEqual((await q(`select crm_ai_public_control() c`))[0].c, { kill_switch: false, automatic_enabled: false, ai_enabled: false, suspended: [] });
  await fails(`select * from crm_ai_worker_profiles`, /permission denied/);
  await fails(`select * from crm_agent_settings`, /permission denied/);
  await as(X); // operator, not owner: sees nothing
  assert.equal((await q(`select * from crm_ai_worker_profiles`)).length, 0);
  await fails(`insert into crm_ai_usage(day,provider) values(current_date,'groq')`, /permission denied/);
  await fails(`select crm_ai_set_enabled(true)`, /crm_forbidden/);

  await svc();
  await fails(`insert into crm_ai_tasks(id,worker_key,purpose,data_class,status) values('task-0001','ren','x','synthetic','running')`, /ai_disabled/);
  await as(M); await db.exec(`select crm_ai_set_enabled(true)`); await svc();
  await db.exec(`insert into crm_ai_tasks(id,worker_key,purpose,data_class,status,provider,model) values('task-0001','ren','x','synthetic','succeeded','groq','m')`);
  await fails(`insert into crm_ai_tasks(id,worker_key,purpose,data_class,status) values('task-0002','samuel_1','x','synthetic','running')`, /ai_worker_reserved/);
  await fails(`insert into crm_ai_memory(worker_key,kind,body) values('samuel_2','fact','x')`, /ai_worker_reserved/);
  await fails(`insert into crm_ai_tasks(id,worker_key,purpose,data_class,status) values('task-0003','ren','x','client_personal','running')`, /check constraint/);
  await fails(`insert into crm_ai_usage(day,provider,cost_usd) values(current_date,'openrouter',0.01)`, /check constraint/);
  await fails(`update crm_ai_tasks set cost_usd = 0.000001 where id='task-0001'`, /check constraint/);
  await db.exec(`insert into crm_ai_usage(day,provider,requests,tokens) values(current_date,'groq',3,900)`);
  await as(M); await db.exec(`select crm_ai_set_suspended('haru', true)`);
  await fails(`select crm_ai_set_suspended('samuel_4', true)`, /ai_worker_not_active/);
  await svc();
  await fails(`insert into crm_ai_tasks(id,worker_key,purpose,data_class,status) values('task-0004','haru','x','synthetic','running')`, /ai_worker_suspended/);
  await db.exec(`insert into crm_ai_tasks(id,worker_key,purpose,data_class,status) values('task-0005','kenji','x','synthetic','running')`);
  await as(X); await fails(`select crm_ai_set_suspended('kenji', true)`, /crm_forbidden/); await svc();
  await db.exec(`insert into crm_ai_memory(worker_key,kind,body,source) values('ren','result','PR borrador creado','ren-dev:2026-11-05')`);
  await fails(`update crm_ai_worker_profiles set status='active' where key='samuel_1'`, /permission denied/);
  await db.exec(`reset role`);
  await fails(`update crm_ai_worker_profiles set executors='[{"id":"x"}]' where key='samuel_3'`, /reserved_is_inert/);

  await as(M);
  assert.equal((await q(`select count(*)::int n from crm_ai_memory where worker_key='ren'`))[0].n, 1);
  assert.equal((await q(`select coalesce(sum(cost_usd),0)::float8 c from crm_ai_usage`))[0].c, 0);
  await db.exec(`update crm_agent_settings set kill_switch = true`).catch(() => {}); // owners use the RPC; table update is not granted
  await db.exec(`reset role; update crm_agent_settings set kill_switch = true`);
  await svc();
  await fails(`update crm_ai_tasks set status='running' where id='task-0001'`, /ai_disabled/);
  await db.exec(`reset role; set role anon`);
  const c = (await q(`select crm_ai_public_control() c`))[0].c;
  assert.equal(c.kill_switch, true, 'the kill switch reaches every executor through the public control');
  assert.deepEqual(c.suspended, ['haru']);
});
