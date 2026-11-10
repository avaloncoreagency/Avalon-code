// Avalon engine registry on isolated PostgreSQL (PGlite) with every migration. Synthetic users only.
// Proves: ten engines registered as NOT_CONFIGURED; owners read, others do not; honest state rules (no READY without
// verified configuration + license; RUNNING/FAILED/RATE_LIMITED cannot be typed by a person); kill switch and seat
// suspension show PAUSED without rewriting the recorded state.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const SAMUEL = '00000000-0000-4000-8000-0000000000b2';
const STRANGER = '00000000-0000-4000-8000-0000000000c3';

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid default auth.uid(), unique (bucket_id, name));
    alter table storage.objects enable row level security;`);
  await db.exec(`insert into auth.users(id) values('${MIGUEL}'),('${SAMUEL}'),('${STRANGER}')`);
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));
    if (file.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner'),('${SAMUEL}','owner'),('${STRANGER}','operator')`);
  }
  const as = async (role, user = '') => db.exec(`reset role;set request.jwt.claim.role='${role}';set request.jwt.claim.sub='${user}';set role ${role}`);
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const fails = async (sql, p, code, msg) => {
    await db.exec('savepoint s');
    try { await db.query(sql, p); } catch (e) {
      await db.exec('rollback to savepoint s');
      if (code) assert.equal(e.code, code, e.message);
      if (msg) assert.match(e.message, msg);
      return;
    }
    await db.exec('release savepoint s');
    assert.fail('expected failure: ' + sql.slice(0, 100));
  };
  await db.exec('begin');
  return { db, as, q, fails };
}

test('engine registry: ten honest engines, owner-only, no optimistic states', async () => {
  const h = await setup();

  await h.as('authenticated', MIGUEL);
  const rows = await h.q('select engine_id, manager, name, deployment_status, effective_status, configuration_status, estimated_cost_usd from crm_engine_status order by manager');
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map(r => r.manager).sort(), ['AKIRA', 'ECHO', 'HARU', 'KENJI', 'LUMI', 'NOVA', 'REN', 'SHIN', 'SORA', 'VEGA']);
  assert.ok(rows.every(r => r.deployment_status === 'NOT_CONFIGURED' && r.effective_status === 'NOT_CONFIGURED'), 'nothing claims to be installed');
  assert.ok(rows.every(r => r.estimated_cost_usd === null), 'cost is unknown, never assumed 0');
  assert.equal((await h.q(`select name from crm_engine_registry where engine_id='ren'`))[0].name, 'LangGraph');

  // Other users: an operator (no owner membership) and anonymous read nothing / cannot update.
  await h.as('authenticated', STRANGER);
  assert.equal((await h.q('select engine_id from crm_engine_status')).length, 0);
  await h.fails(`select crm_engine_update('kenji','PAUSED')`, [], '42501');
  await h.as('anon');
  await h.fails('select engine_id from crm_engine_registry', [], '42501');
  await h.fails(`select crm_engine_update('kenji','PAUSED')`, [], '42501');

  // Honest state rules.
  await h.as('authenticated', MIGUEL);
  await h.fails(`select crm_engine_update('kenji','RUNNING')`, [], '22023', /reserved_for_executor/);
  await h.fails(`select crm_engine_update('kenji','FAILED')`, [], '22023', /reserved_for_executor/);
  await h.fails(`select crm_engine_update('kenji','READY')`, [], '23514');                       // not verified
  await h.fails(`select crm_engine_update('kenji','READY', p_configuration_status => 'verified')`, [], '23514'); // license not verified
  await h.fails(`update crm_engine_registry set deployment_status='READY' where engine_id='kenji'`, [], '42501'); // no direct writes
  const ready = (await h.q(`select (crm_engine_update('kenji','READY', p_configuration_status => 'verified', p_license => 'Apache-2.0', p_license_verified => true)).*`))[0];
  assert.equal(ready.deployment_status, 'READY');
  assert.equal(ready.updated_by, MIGUEL);
  await h.as('authenticated', SAMUEL);
  const unavailable = (await h.q(`select (crm_engine_update('lumi','UNAVAILABLE', p_error_code => 'gpu_not_available')).*`))[0];
  assert.equal(unavailable.error_code, 'gpu_not_available');
  await h.fails(`select crm_engine_update('vega','UNAVAILABLE')`, [], '23514');                   // error state needs a code
  await h.fails(`select crm_engine_update('nope','PAUSED')`, [], 'P0002');

  // Kill switch and seat suspension → effective PAUSED, recorded state untouched.
  await h.as('authenticated', MIGUEL);
  await h.q(`select crm_agent_set_kill_switch(true)`);
  let k = (await h.q(`select deployment_status, effective_status, paused_reason from crm_engine_status where engine_id='kenji'`))[0];
  assert.deepEqual(k, { deployment_status: 'READY', effective_status: 'PAUSED', paused_reason: 'kill_switch' });
  await h.q(`select crm_agent_set_kill_switch(false)`);
  await h.q(`select crm_ai_set_suspended('kenji', true)`);
  k = (await h.q(`select effective_status, paused_reason from crm_engine_status where engine_id='kenji'`))[0];
  assert.deepEqual(k, { effective_status: 'PAUSED', paused_reason: 'seat_suspended' });
  await h.q(`select crm_ai_set_suspended('kenji', false)`);
  k = (await h.q(`select effective_status from crm_engine_status where engine_id='kenji'`))[0];
  assert.equal(k.effective_status, 'READY');
});
