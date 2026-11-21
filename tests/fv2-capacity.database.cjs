// Final Validation 2.0 — capacity for the first clients (1/5/10/25/50) on PGlite (WASM, single connection, in-process).
// Correctness is asserted; timings are MEASURED and printed only (no invented thresholds). PGlite is not hosted Supabase:
// network latency, PostgREST serialisation and RLS caching in production are NOT represented.
// Author: Claude Code (implementation owner) — not an independent QA result.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const { PGlite } = require('@electric-sql/pglite');
const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const SAMUEL = '00000000-0000-4000-8000-0000000000b2';
const uuid = i => `${String(i).padStart(8, '0')}-0000-4000-8000-${String(i).padStart(12, '0')}`;

test('capacity 1/5/10/25/50 clients: Clients 360 list, search, pagination, leads, projects, sales, inquiries, finance', { timeout: 600000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id,email) values('${MIGUEL}','m@example.invalid'),('${SAMUEL}','s@example.invalid');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner'),('${SAMUEL}','owner');`);
  }
  await db.query('insert into crm_private.finance_access(user_id) values($1)', [MIGUEL]);
  const as = u => db.exec(`reset role;set request.jwt.claim.sub='${u}';set role authenticated;`);
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  const time = async (fn) => { const s = performance.now(); const r = await fn(); return [r, Math.round((performance.now() - s) * 10) / 10]; };
  await as(MIGUEL);

  let created = 0;
  const report = [];
  for (const target of [1, 5, 10, 25, 50]) {
    for (; created < target; created++) {
      const i = created + 1;
      // Two clients share a trade name on purpose ("Repetida") — duplicates by name must not merge distinct clients.
      const legal = i % 10 === 0 ? `Empresa Repetida ${i}` : `Cliente Capacidad ${String(i).padStart(2, '0')}`;
      await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify({ idempotency_key: uuid(1000 + i), new_client: { legal_name: legal, trade_name: i % 10 === 0 ? 'Repetida' : '' },
        billing_mode: 'one_time', upfront_amount: '0', lines: [{ service_code: 'desarrollo-web', unit_price: String(1000 + i) }] })]);
      await db.query("insert into crm_leads(company,contact,source,owner_id) values($1,'Contacto','capacity',$2)", [`Lead Capacidad ${i}`, i % 2 ? MIGUEL : SAMUEL]);
      await db.exec('reset role; set role anon;');
      await db.query('select crm_public_inquiry($1::jsonb)', [JSON.stringify({ company: `Solicitud ${i}`, name: 'Prueba', email: `cap${i}@example.invalid`, message: 'Necesito una web para mi negocio.', services: ['website'], language: 'es' })]);
      // Spread the synthetic inquiries over time (2 h ago) so the documented global limit (30/hour) is tested separately.
      await db.exec('reset role;');
      await db.query("update crm_public_inquiries set created_at = now() - interval '2 hours' where created_at > now() - interval '1 minute'");
      await as(MIGUEL);
    }
    const [list, tList] = await time(() => db.query("select c.id, c.legal_name, count(*) over() total, (select count(*) from crm_sales s where s.client_id=c.id) sales, (select count(*) from os_projects p where p.client_id=c.id) projects from crm_clients c where c.status <> 'archived' order by c.legal_name, c.id limit 50 offset 0"));
    const [search, tSearch] = await time(() => db.query("select id from crm_clients where legal_name ilike '%Repetida%' or trade_name ilike '%Repetida%'"));
    const [empty, tEmpty] = await time(() => db.query("select id from crm_clients where legal_name ilike '%NoExisteNadaAsi%'"));
    const [leads, tLeads] = await time(() => db.query("select id, count(*) over() total from crm_leads where archived=false order by created_at desc, id limit 50"));
    const [inq, tInq] = await time(() => db.query('select p.id from crm_prospects p join crm_public_inquiries i on i.prospect_id=p.id'));
    const firstClient = list.rows[0].id;
    const [fin, tFin] = await time(() => one('select crm_client_finance_summary($1) s', [firstClient]));
    assert.equal(Number(list.rows[0].total), target, `${target}: count is exact`);
    assert.equal(list.rows.length, Math.min(target, 50), `${target}: page size`);
    assert.ok(list.rows.every(r => Number(r.sales) === 1 && Number(r.projects) >= 1), `${target}: every client keeps its sale and project`);
    assert.equal(search.rows.length, Math.floor(target / 10), `${target}: repeated names are distinct clients`);
    assert.equal(empty.rows.length, 0);
    assert.equal(Number(leads.rows[0].total), target);
    assert.equal(inq.rows.length, target, `${target}: every inquiry kept`);
    assert.ok(fin.s && typeof fin.s === 'object', `${target}: finance summary available`);
    report.push({ clients: target, ms: { clientsList: tList, search: tSearch, emptySearch: tEmpty, leads: tLeads, inquiries: tInq, financeSummary: tFin } });
  }
  // Pagination beyond the first page is complete and disjoint (no truncation, no overlap).
  const p1 = (await db.query('select id from crm_clients order by legal_name, id limit 20 offset 0')).rows.map(r => r.id);
  const p2 = (await db.query('select id from crm_clients order by legal_name, id limit 20 offset 20')).rows.map(r => r.id);
  const p3 = (await db.query('select id from crm_clients order by legal_name, id limit 20 offset 40')).rows.map(r => r.id);
  assert.equal(new Set([...p1, ...p2, ...p3]).size, 50, 'three pages cover all 50 clients exactly once');
  // Documented anti-abuse limit: more than 30 website inquiries in one hour are answered 'throttled' (visible to the
  // visitor, nothing stored, nothing reported as ok). Owner decision if a campaign needs a higher ceiling.
  await db.exec('reset role; set role anon;');
  const burst = [];
  for (let i = 0; i < 31; i++) burst.push((await db.query('select crm_public_inquiry($1::jsonb) r', [JSON.stringify({ company: `Ráfaga ${i}`, name: 'Prueba', email: `burst${i}@example.invalid`, message: 'Necesito una web para mi negocio.', services: ['website'], language: 'es' })])).rows[0].r);
  assert.deepEqual([burst.slice(0, 30).every(r => r === 'ok'), burst[30]], [true, 'throttled'], 'the 31st inquiry within an hour is throttled, never silently dropped as ok');
  await as(MIGUEL);
  // Samuel (owner) sees the same 50 clients — no per-owner leak or loss.
  await as(SAMUEL);
  assert.equal(Number((await one('select count(*) n from crm_clients')).n), 50);
  t.diagnostic('PGlite timings (ms, single run, this machine): ' + JSON.stringify(report));
  if (process.env.FV2_WRITE_MEASUREMENTS === '1') {
    fs.mkdirSync('docs/final-validation-2', { recursive: true });
    fs.writeFileSync('docs/final-validation-2/capacity-measurements.json', JSON.stringify({ engine: 'PGlite (WASM, in-process)', node: process.version, note: 'Single run; not hosted Supabase. Correctness asserted, timings informational.', report }, null, 2) + '\n');
  }
});
