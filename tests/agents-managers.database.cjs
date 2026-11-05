// Each manager runs its allowlisted task through the real runner against real PostgreSQL (PGlite) and leaves a persistent result.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const MIGUEL = '00000000-0000-4000-8000-0000000000a1', SAMUEL = '00000000-0000-4000-8000-0000000000b2';

const cache = {};
function load(name) { // transpile src/lib/agents/<name>.ts; relative imports resolve to siblings
  if (cache[name]) return cache[name];
  const out = ts.transpileModule(fs.readFileSync(`src/lib/agents/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const m = { exports: {} };
  new Function('require', 'module', 'exports', out)(p => p.startsWith('./') ? load(p.slice(2)) : require(p), m, m.exports);
  return (cache[name] = m.exports);
}

// Minimal PostgREST-like builder over the caller's role (RLS applies because queries run as `authenticated`).
function client(db) {
  const qb = table => {
    const f = []; let cols = '*', ord = '', lim = '';
    const b = {
      select(c) { cols = c; return b; },
      eq(c, v) { f.push([`${c} = $`, v]); return b; }, lt(c, v) { f.push([`${c} < $`, v]); return b; }, gt(c, v) { f.push([`${c} > $`, v]); return b; },
      is(c) { f.push([`${c} is null`]); return b; }, in(c, vs) { f.push([`${c} = any($)`, vs]); return b; },
      order(c) { ord = ` order by ${c}`; return b; }, limit(n) { lim = ` limit ${Number(n)}`; return b; },
      then(res, rej) {
        const params = []; const where = f.map(([s, v]) => v === undefined ? s : (params.push(v), s.split('$').join('$' + params.length))).join(' and ');
        return db.query(`select ${cols} from public.${table}${where ? ' where ' + where : ''}${ord}${lim}`, params)
          .then(r => ({ data: r.rows, error: null }), e => ({ data: null, error: { code: e.code || 'x', message: e.message } })).then(res, rej);
      },
    };
    return b;
  };
  return {
    from: qb,
    rpc: (name, args) => {
      const keys = Object.keys(args || {});
      const call = `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}${k === 'p_result' || k === 'p_evidence' ? '::jsonb' : ''}`).join(',')}) as r`;
      return db.query(call, keys.map(k => typeof args[k] === 'object' && args[k] !== null ? JSON.stringify(args[k]) : args[k]))
        .then(r => ({ data: r.rows[0].r, error: null }), e => ({ data: null, error: { code: e.code || 'x', message: e.message } }));
    },
  };
}

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id,email) values('${MIGUEL}','m@example.invalid'),('${SAMUEL}','s@example.invalid');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner'),('${SAMUEL}','owner');`);
  }
  return db;
}
const asOwner = db => db.exec(`reset role;set request.jwt.claim.sub='${MIGUEL}';set role authenticated;`);

test('five managers each produce a persistent, truthful result from synthetic CRM data', { timeout: 180000 }, async t => {
  const db = await setup(); t.after(() => db.close());
  await asOwner(db);
  await db.exec(`
    insert into crm_leads(company,source,owner_id,follow_up_at,created_by) values
      ('Sintética A','test','${MIGUEL}', now() - interval '3 days','${MIGUEL}'),
      ('Sintética B','test','${MIGUEL}', now() + interval '3 days','${MIGUEL}');
    insert into crm_prospects(company,source,owner_id,opportunity,acquired_at,created_by,stars) values
      ('Prospecto 5','radar','${MIGUEL}','sin web propia',now(),'${MIGUEL}',5),
      ('Prospecto 2','radar','${MIGUEL}','poca evidencia',now(),'${MIGUEL}',2),
      ('Prospecto sin nota','radar','${MIGUEL}','revisar',now(),'${MIGUEL}',null);
    insert into crm_tasks(title,assignee_id,priority,status,due_at,created_by) values
      ('Atrasada urgente','${MIGUEL}','urgent','todo', now() - interval '1 day','${MIGUEL}'),
      ('Bloqueada','${MIGUEL}','normal','blocked', null,'${MIGUEL}');`);
  await asOwner(db);
  const { runManager } = load('runner'); const { buildActivity } = load('policy');
  const c = client(db);
  const out = {};
  for (const k of ['haru', 'sora', 'kenji', 'shin', 'ren']) {
    out[k] = await runManager(c, k, new Date());
    assert.equal(out[k].status, 'completed', k + ': ' + JSON.stringify(out[k]));
  }
  const runs = (await db.query('select * from crm_agent_runs order by manager_key')).rows;
  assert.equal(runs.length, 5);
  const by = Object.fromEntries(runs.map(r => [r.manager_key, r]));
  assert.ok(runs.every(r => r.status === 'completed' && r.executor_kind === 'deterministic' && r.finished_at && r.requested_by === MIGUEL));
  assert.equal(by.haru.result.overdue_follow_ups, 1); assert.equal(by.haru.result.overdue_tasks, 1);
  assert.equal(by.sora.result.pending, 3); assert.equal(by.sora.result.review_first_4_5_stars, 1); assert.equal(by.sora.result.unscored, 1);
  assert.deepEqual(by.sora.result.by_stars, [0, 1, 0, 0, 1]);
  assert.equal(by.kenji.result.leads_without_contact, 2); assert.equal(by.kenji.result.incremental_cost_usd, 0);
  assert.equal(by.shin.result.scope, 'catalog_review_only'); assert.deepEqual(by.shin.result.findings, []);
  assert.match(by.shin.result_summary, /No equivale a declarar el sistema seguro/);
  assert.ok(by.ren.result.plan.length >= 2, 'REN prioritises blocked + overdue + pending');
  assert.ok(by.haru.evidence_refs.length > 0 && by.haru.evidence_refs.every(e => e.type && e.id));
  assert.ok(!JSON.stringify(runs).includes('@'), 'reports carry no contact data');

  // Re-running inside the same 5-minute bucket returns the same run and executes nothing new.
  const again = await runManager(c, 'haru', new Date());
  assert.equal(again.run_id, out.haru.run_id); assert.equal((await db.query('select count(*)::int n from crm_agent_runs')).rows[0].n, 5);

  // The activity contract is derived from the persisted rows: five managers, all "completed".
  const rows = (await db.query('select * from crm_agent_runs')).rows.map(r => ({ ...r, evidence_refs: r.evidence_refs, started_at: r.started_at && new Date(r.started_at).toISOString(), finished_at: r.finished_at && new Date(r.finished_at).toISOString(), lease_until: null, updated_at: new Date(r.updated_at).toISOString() }));
  const act = buildActivity(rows, {}, new Date(), 24);
  assert.deepEqual(act.map(a => [a.manager_key, a.status]), [['ren', 'completed'], ['shin', 'completed'], ['haru', 'completed'], ['sora', 'completed'], ['kenji', 'completed']]);
  assert.equal(buildActivity(rows, {}, new Date(Date.now() + 48 * 3600e3), 24)[0].status, 'stale', 'old completed results turn stale');
});

test('kill switch stops every manager and a broken executor is recorded as failed, not completed', { timeout: 180000 }, async t => {
  const db = await setup(); t.after(() => db.close());
  await asOwner(db);
  const { runManager } = load('runner'); const c = client(db);
  await db.query('select crm_agent_set_kill_switch(true)');
  for (const k of ['ren', 'shin', 'haru', 'sora', 'kenji']) assert.deepEqual({ ...await runManager(c, k, new Date()) }, { run_id: (await db.query('select id from crm_agent_runs where manager_key=$1', [k])).rows[0].id, status: 'blocked', error_code: 'kill_switch' });
  await db.query('select crm_agent_set_kill_switch(false)');
  // A capability without an adapter fails closed and is recorded, never reported as completed.
  await db.exec("reset role; insert into crm_agent_capabilities(manager_key,capability,title) values('haru','no_adapter','x');");
  await asOwner(db);
  const r = await runManager(c, 'haru', new Date(Date.now() + 3600e3 * 24), 'no_adapter');
  assert.deepEqual({ status: r.status, error_code: r.error_code }, { status: 'failed', error_code: 'executor_error' });
});

test('SHIN flags a table created without RLS', { timeout: 180000 }, async t => {
  const db = await setup(); t.after(() => db.close());
  await db.exec('create table public.forgotten_table(id int);'); await asOwner(db);
  const { runManager } = load('runner'); await runManager(client(db), 'shin', new Date());
  const r = (await db.query("select result, result_summary from crm_agent_runs where manager_key='shin'")).rows[0];
  assert.equal(r.result.findings[0].severity, 'high'); assert.match(r.result.findings[0].finding, /forgotten_table/);
});
