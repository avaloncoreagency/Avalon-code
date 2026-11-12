// CRM TITAN backend on isolated PostgreSQL (PGlite) with every migration. Synthetic users and businesses only; never
// connects to Supabase, Geoapify or any provider. Covers migration 20261112090000: commission approval, duplicate
// candidates, canonical task links, finance capability + exact aggregate (>100 sales, >200 expenses, two currencies,
// cancelled sales), Radar runs 33311 → 33009 (new / refreshed / known, no cross-run contamination, failures recorded),
// idempotent prospect conversion, no deletes, and the Funnel intake (Type B separation, durable limits, replays).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');

const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const SAMUEL = '00000000-0000-4000-8000-0000000000b2';
const STRANGER = '00000000-0000-4000-8000-0000000000c3';

function loadTs(file) {
  const js = ts.transpileModule(fs.readFileSync(path.resolve(file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(require, mod, mod.exports);
  return mod.exports;
}

async function setup({ transaction = true } = {}) {
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
  const one = async (sql, p) => (await q(sql, p))[0];
  const fails = async (sql, p, re) => {
    await db.exec('savepoint s');
    try { await db.query(sql, p); } catch (e) { await db.exec('rollback to savepoint s'); if (re) assert.match(e.message + ' ' + (e.code ?? ''), re); return e; }
    await db.exec('release savepoint s'); assert.fail('expected failure: ' + sql.slice(0, 120));
  };
  if (transaction) await db.exec('begin');
  return { db, as, q, one, fails };
}

test('TITAN backend: commissions, duplicates, links, finance, radar, conversion, no deletes', { timeout: 300000 }, async () => {
  const { db, as, q, one, fails } = await setup();

  // ── Commissions: no approval on someone else's behalf; new terms need a new approval ───────────────────────────
  await as('authenticated', MIGUEL);
  const lead = await one(`insert into crm_leads(company, phone, email, website, source, owner_id, industry_key)
    values('Brisa Fría HVAC, LLC', '+1 (954) 555-0101', 'ops@brisa.example.invalid', 'https://www.brisa.example.invalid/contact', 'Entrada manual', $1, 'hvac') returning id`, [MIGUEL]);
  await fails(`insert into crm_commercial_terms(lead_id, kind, billing_model, commission_pct, commission_base, commission_approved_by)
    values($1,'agreed','hybrid',8,'gross_profit',$2)`, [lead.id, SAMUEL], /commission_approval_forged/);
  const terms = await one(`insert into crm_commercial_terms(lead_id, kind, monthly_fee, billing_model, commission_pct, commission_base, commission_approved_by)
    values($1,'agreed',1500,'hybrid',8,'gross_profit',$2) returning id, commission_approved_at, version`, [lead.id, MIGUEL]);
  assert.ok(terms.commission_approved_at, 'approval time recorded');
  await as('authenticated', SAMUEL);
  await q(`update crm_commercial_terms set special_conditions = 'Revisión trimestral' where id = $1`, [terms.id]);
  const kept = await one('select commission_approved_by, commission_approved_at from crm_commercial_terms where id=$1', [terms.id]);
  assert.equal(kept.commission_approved_by, MIGUEL, 'an unrelated edit keeps the original approval');
  assert.deepEqual(kept.commission_approved_at, terms.commission_approved_at);
  await fails(`update crm_commercial_terms set commission_pct = 12 where id = $1`, [terms.id], /commission_approval_forged/);
  // Same approver and same terms: the update is allowed, but the approval timestamp cannot be forged.
  await q(`update crm_commercial_terms set commission_approved_at = now() - interval '9 days', commission_approved_by = $2 where id = $1`, [terms.id, MIGUEL]);
  const ts1 = await one('select commission_approved_at from crm_commercial_terms where id=$1', [terms.id]);
  assert.deepEqual(ts1.commission_approved_at, terms.commission_approved_at, 'approval time cannot be rewritten');
  await q(`update crm_commercial_terms set commission_pct = 12, commission_approved_by = $2 where id = $1`, [terms.id, SAMUEL]);
  const reapproved = await one('select commission_pct, commission_approved_by from crm_commercial_terms where id=$1', [terms.id]);
  assert.deepEqual([Number(reapproved.commission_pct), reapproved.commission_approved_by], [12, SAMUEL], 'changing the commission requires approving it yourself');
  const events = await q(`select event_type, actor_id from crm_timeline where entity='crm_commercial_terms' and record_id=$1 order by id`, [terms.id]);
  assert.deepEqual(events.map(e => [e.event_type, e.actor_id]), [['commission.approved', MIGUEL], ['commission.approved', SAMUEL]], 'each approval is audited with its actor');

  // ── Duplicate candidates over every lead (no 5,000 cap) ──────────────────────────────────────────────────────
  await as('authenticated', MIGUEL);
  await q(`insert into crm_leads(company, phone, source, owner_id, archived) values('Brisa Fria HVAC', '9545550101', 'x', $1, true)`, [MIGUEL]);
  const dupes = async (args) => (await q('select id, company from crm_lead_duplicate_candidates($1,$2,$3,$4)', args)).map(r => r.id);
  assert.deepEqual(await dupes(['954.555.0101', '', '', '']), [lead.id], 'phone digits match with or without +1; archived leads ignored');
  assert.deepEqual(await dupes(['', 'OPS@brisa.example.invalid', '', '']), [lead.id]);
  assert.deepEqual(await dupes(['', '', 'brisa.example.invalid', '']), [lead.id], 'domain from website');
  assert.deepEqual(await dupes(['', '', '', 'Brisa Fria HVAC Inc.']), [lead.id], 'accents and legal suffixes normalized like the UI');
  assert.deepEqual(await dupes(['123', 'nope', 'bad domain', 'x']), [], 'garbage input never matches everything');
  await as('authenticated', STRANGER);
  await fails(`select * from crm_lead_duplicate_candidates('9545550101','','','')`, [], /crm_forbidden/);
  await as('anon');
  await fails(`select * from crm_lead_duplicate_candidates('9545550101','','','')`, [], /permission denied/);

  // ── Seed two clients, a project and synthetic sales/costs (bulk rows bypass triggers: seeding only) ─────────
  await db.exec('reset role');
  await db.exec(`set request.jwt.claim.sub='${MIGUEL}'`);
  const [ca, cb] = await q(`insert into crm_clients(legal_name, source, owner_id) values('Cliente A Sintético','manual',$1),('Cliente B Sintético','manual',$1) returning id`, [MIGUEL]);
  await db.exec(`set session_replication_role = replica;
    insert into crm_sales(sale_number, idempotency_key, correlation_id, client_id, sold_on, currency, subtotal, total, recurring_monthly, billing_mode, seller_id, status, contract_status)
      select 'T-USD-' || g, gen_random_uuid(), gen_random_uuid(), '${ca.id}', date '2026-01-01' + g, 'USD', 100.10, 100.10, 0.20, 'one_time', '${MIGUEL}', 'confirmed',
             case when g = 7 then 'cancelled' else 'signed' end from generate_series(1, 101) g;
    insert into crm_sales(sale_number, idempotency_key, correlation_id, client_id, sold_on, currency, subtotal, total, billing_mode, seller_id, status)
      values ('T-USD-X', gen_random_uuid(), gen_random_uuid(), '${ca.id}', '2026-06-01', 'USD', 999.99, 999.99, 'one_time', '${MIGUEL}', 'cancelled');
    insert into crm_sales(sale_number, idempotency_key, correlation_id, client_id, sold_on, currency, subtotal, total, billing_mode, seller_id, status)
      select 'T-EUR-' || g, gen_random_uuid(), gen_random_uuid(), '${ca.id}', '2026-03-01', 'EUR', 50.05, 50.05, 'one_time', '${MIGUEL}', 'confirmed' from generate_series(1, 3) g;
    insert into crm_payments(sale_id, amount, currency, received_on, method, created_by)
      select id, case when currency = 'USD' then 33.37 else 50.05 end, currency, '2026-07-01', 'transfer', '${MIGUEL}' from crm_sales
      where client_id = '${ca.id}' and status = 'confirmed' and (currency = 'USD' or sale_number = 'T-EUR-1');
    insert into crm_payments(sale_id, amount, currency, received_on, method, created_by)
      select id, 999.99, 'USD', '2026-07-01', 'transfer', '${MIGUEL}' from crm_sales where sale_number = 'T-USD-X';
    insert into crm_client_costs(client_id, amount, currency, category, memo, incurred_on, created_by)
      select '${ca.id}', 1.11, 'USD', 'ads', 'Gasto sintético ' || g, date '2026-01-01' + g, '${MIGUEL}' from generate_series(1, 201) g;
    insert into crm_client_costs(client_id, amount, currency, category, memo, incurred_on, created_by)
      values ('${ca.id}', -5.00, 'EUR', 'refund', 'Reembolso sintético', '2026-02-01', '${MIGUEL}'), ('${ca.id}', -5.00, 'EUR', 'refund', 'Reembolso sintético 2', '2026-02-02', '${MIGUEL}');
    set session_replication_role = origin;
    insert into crm_private.finance_access(user_id) values ('${MIGUEL}');`);

  // ── Finance: capability from the database, exact aggregate ──────────────────────────────────────────────────
  await as('authenticated', MIGUEL);
  assert.deepEqual((await one('select crm_my_capabilities() c')).c, { owner: true, finance_view: true, commission_approve: true });
  const agg = (await one('select crm_client_finance_summary($1) s', [ca.id])).s;
  assert.deepEqual([agg.complete, agg.sales_confirmed, agg.sales_cancelled, agg.costs], [true, 104, 1, 203], 'every row, no 100/200 cap; cancelled sales apart');
  const usd = agg.currencies.find(c => c.currency === 'USD'), eur = agg.currencies.find(c => c.currency === 'EUR');
  assert.deepEqual([usd.sales, usd.costs, usd.contracted, usd.collected, usd.recurring_monthly, usd.expenses, usd.profit, usd.cancelled_contracts],
    [101, 201, '10110.10', '3370.37', '20.20', '223.11', '3147.26', 1], 'exact USD figures; the cancelled sale and its payment are excluded');
  assert.deepEqual([eur.sales, eur.contracted, eur.collected, eur.expenses, eur.profit], [3, '150.15', '50.05', '-10.00', '60.05'], 'EUR kept separate, never converted');
  const F = loadTs('src/lib/sales/client-finance.ts');
  const summary = F.summaryFromAggregate(agg);
  assert.equal(summary.complete, true);
  assert.deepEqual(summary.currencies.map(c => [c.currency, c.profitCents, c.collectedCents]), [['EUR', 6005, 5005], ['USD', 314726, 337037]], 'integer cents, no float drift');
  assert.equal(F.financeNotice(summary, 'es'), null);
  const empty = (await one('select crm_client_finance_summary($1) s', [cb.id])).s;
  assert.deepEqual([empty.currencies, F.summaryFromAggregate(empty).empty], [[], true], 'no rows → empty, not zero profit');
  await fails('select crm_client_finance_summary($1)', ['00000000-0000-4000-8000-00000000dead'], /client_not_found/);
  await as('authenticated', SAMUEL);
  assert.deepEqual((await one('select crm_my_capabilities() c')).c, { owner: true, finance_view: false, commission_approve: true }, 'no permission granted by assumption');
  await fails('select crm_client_finance_summary($1)', [ca.id], /finance_forbidden/);
  assert.equal((await q('select id from crm_client_costs')).length, 0, 'RLS also hides the expenses');
  await as('authenticated', STRANGER);
  assert.deepEqual((await one('select crm_my_capabilities() c')).c, { owner: false, finance_view: false, commission_approve: false });
  await fails('select crm_client_finance_summary($1)', [ca.id], /crm_forbidden/);
  await as('anon');
  await fails('select crm_my_capabilities()', [], /permission denied/);

  // ── Canonical links client → sale → project → task ─────────────────────────────────────────────────────────
  await as('authenticated', MIGUEL);
  const saleA = await one(`select id from crm_sales where sale_number = 'T-USD-1'`);
  const projA = await one(`insert into os_projects(module, name, client_id) values('website', 'Web Cliente A', $1) returning id`, [ca.id]);
  await fails(`insert into crm_tasks(title, assignee_id, client_id, sale_id) values('Tarea cruzada', $1, $2, $3)`, [MIGUEL, cb.id, saleA.id], /task_link_mismatch/);
  await fails(`insert into crm_tasks(title, assignee_id, client_id, project_id) values('Tarea cruzada', $1, $2, $3)`, [MIGUEL, cb.id, projA.id], /task_link_mismatch/);
  const inferred = await one(`insert into crm_tasks(title, assignee_id, project_id) values('Publicar web', $1, $2) returning client_id`, [MIGUEL, projA.id]);
  assert.equal(inferred.client_id, ca.id, 'the client is inferred from the project');
  const t2 = await one(`insert into crm_tasks(title, assignee_id, sale_id) values('Kickoff', $1, $2) returning id, client_id`, [MIGUEL, saleA.id]);
  assert.equal(t2.client_id, ca.id, 'the client is inferred from the sale');
  await q(`update crm_tasks set status = 'in_progress', client_id = client_id where id = $1`, [t2.id]);
  await fails(`update crm_tasks set client_id = $2 where id = $1`, [t2.id, cb.id], /task_link_mismatch/);

  // ── Radar: 33311 → 33009, scoped by run, new / refreshed / known ───────────────────────────────────────────
  const ingest = async (places, key, search) => (await one('select crm_radar_ingest($1::jsonb, $2, null, $3::jsonb) r', [JSON.stringify(places), key, JSON.stringify(search)])).r;
  const place = (ref, name, extra = {}) => ({ source_ref: 'osm:node/' + ref, name, lat: 26.13, lon: -80.17, ...extra });
  const run1 = await ingest([place(1, 'Fort Lauderdale Cuts'), place(2, 'Sistrunk HVAC'), place(3, 'Shared Plumbing')], 'zip-33311-run-001',
    { kind: 'postcode', label: '33311', lat: 26.14, lon: -80.17, radius_m: 1609, provider: 'geoapify' });
  assert.deepEqual([run1.found, run1.inserted, run1.known, run1.refreshed], [3, 3, 0, 0]);
  const run2 = await ingest([place(3, 'Shared Plumbing', { phone: '+1 305 555 0199' }), place(2, 'Sistrunk HVAC'), place(10, 'Hialeah Gardens Tattoo'), place(11, 'Hialeah Roofing')],
    'zip-33009-run-002', { kind: 'postcode', label: '33009', lat: 25.98, lon: -80.15, radius_m: 1609, provider: 'geoapify' });
  assert.deepEqual([run2.found, run2.inserted, run2.updated, run2.refreshed, run2.known], [4, 2, 2, 1, 1]);
  const scoped = async run => (await q(`select p.source_ref, rp.outcome from crm_radar_run_places rp join crm_prospects p on p.id = rp.prospect_id where rp.run_id = $1 order by p.source_ref`, [run])).map(r => r.source_ref + ':' + r.outcome);
  assert.deepEqual(await scoped(run2.run_id), ['osm:node/10:inserted', 'osm:node/11:inserted', 'osm:node/2:known', 'osm:node/3:refreshed']);
  assert.deepEqual(await scoped(run1.run_id), ['osm:node/1:inserted', 'osm:node/2:inserted', 'osm:node/3:inserted'], 'the 33009 search does not contaminate 33311');
  const late = await ingest([place(99, 'Late Response Business')], 'zip-33311-run-001', { kind: 'postcode', label: '33311' });
  assert.deepEqual([late.replayed, late.run_id], [true, run1.run_id], 'a late/duplicate response for an old run key changes nothing');
  assert.equal((await q(`select id from crm_prospects where source_ref = 'osm:node/99'`)).length, 0);
  assert.equal((await one(`select phone from crm_prospects where source_ref = 'osm:node/3'`)).phone, '+1 305 555 0199', 'empty contact data filled, never overwritten');
  assert.deepEqual(await one(`select provider, query_kind, label from crm_radar_runs where id = $1`, [run2.run_id]), { provider: 'geoapify', query_kind: 'postcode', label: '33009' });
  // Provider failure: recorded with provider + fixed code, counts for today's cap, idempotent, no raw messages.
  const fail = (await one(`select crm_radar_record_failure('zip-33009-run-003', '{"kind":"postcode","label":"33009"}'::jsonb, 'geoapify', 'provider_timeout') r`)).r;
  assert.equal(fail.status, 'failed');
  assert.equal((await one(`select crm_radar_record_failure('zip-33009-run-003', null, 'geoapify', 'provider_timeout') r`)).r.replayed, true);
  assert.deepEqual(await one(`select status, provider, error_code, found from crm_radar_runs where id = $1`, [fail.run_id]), { status: 'failed', provider: 'geoapify', error_code: 'provider_timeout', found: 0 });
  assert.equal(Number((await one(`select count(*) n from crm_radar_runs where started_at >= date_trunc('day', now())`)).n), 3, 'failed calls count against the daily cap');
  await fails(`select crm_radar_record_failure('zip-33009-run-004', null, 'geoapify', 'Geoapify said: key=abc')`, [], /radar_invalid/);
  assert.equal((await one(`select crm_radar_ingest('[]'::jsonb, 'zip-33009-run-003') r`)).r.status, 'failed', 'a failed run key is not replayed as success');
  // Conversion: needs the owner's approval; idempotent → exactly one lead.
  const pid = (await one(`select id from crm_prospects where source_ref = 'osm:node/10'`)).id;
  await fails('select crm_convert_prospect($1)', [pid], /aprueba/i);
  await q(`update crm_prospects set status = 'approved' where id = $1`, [pid]);
  const l1 = (await one('select crm_convert_prospect($1) id', [pid])).id;
  await as('authenticated', SAMUEL);
  const l2 = (await one('select crm_convert_prospect($1) id', [pid])).id;
  assert.equal(l1, l2, 'second conversion (other owner) returns the same lead');
  assert.equal(Number((await one(`select count(*) n from crm_leads where company = 'Hialeah Gardens Tattoo'`)).n), 1);
  await as('authenticated', STRANGER);
  await fails(`select crm_radar_record_failure('zip-x-run-0005', null, 'geoapify', 'provider_timeout')`, [], /crm_forbidden/);

  // ── Nothing is deleted: owners have no DELETE on CRM records ───────────────────────────────────────────────
  await as('authenticated', MIGUEL);
  for (const table of ['crm_leads', 'crm_commercial_terms', 'crm_contracts', 'crm_lead_assessments', 'crm_lead_scores', 'crm_sales', 'crm_payments', 'crm_client_costs', 'crm_radar_runs'])
    await fails(`delete from ${table}`, [], /permission denied/);
});

test('TITAN funnel: closed by default, Type B kept out, durable limits, one lead under replays', { timeout: 300000 }, async () => {
  const { db, as, q, one } = await setup({ transaction: false });
  await as('authenticated', MIGUEL);
  const client = await one(`insert into crm_clients(legal_name, owner_id, source) values('Contratista Sintético', $1, 'manual') returning id`, [MIGUEL]);
  await q(`insert into crm_growth_funnels(slug, title, template, status) values('avalon-capture-01', 'Funnel Avalon', 'capture', 'active')`);
  await q(`insert into crm_growth_funnels(slug, title, template, status, client_id) values('client-consumers-01', 'Funnel del contratista', 'capture', 'active', $1)`, [client.id]);
  await as('anon');
  const submit = async payload => (await one('select crm_growth_funnel_submit($1::jsonb) r', [JSON.stringify(payload)])).r;
  await assert.rejects(submit({ slug: 'avalon-capture-01' }), /permission denied/, 'without the reviewed grant anonymous visitors cannot write');
  await db.exec('reset role');
  await db.exec(fs.readFileSync('docs/sql/growth-funnel-public-grant.sql', 'utf8'));
  await as('anon');
  const base = { slug: 'avalon-capture-01', company: 'Synthetic Roofing Co', name: 'Ana Prueba', phone: '', message: 'Quiero información sobre su CRM', consent: true };
  assert.equal((await one(`select crm_growth_funnel_view('client-consumers-01') v`)).v, null, 'Type B funnels are not served');
  assert.equal(await submit({ ...base, slug: 'client-consumers-01', email: 'consumer@roof.example.invalid' }), 'unavailable');
  // Replays of the same visitor (double click, retried request) → one lead, one submission.
  for (let i = 0; i < 3; i++) assert.equal(await submit({ ...base, email: 'ana@roof.example.invalid' }), 'ok');
  // Durable per-device limit: the 6th request within an hour from the same hashed fingerprint is throttled.
  for (let i = 0; i < 5; i++) assert.equal(await submit({ ...base, email: `fp${i}@roof.example.invalid`, fingerprint: 'b'.repeat(64) }), 'ok');
  assert.equal(await submit({ ...base, email: 'fp9@roof.example.invalid', fingerprint: 'b'.repeat(64) }), 'throttled');
  await db.exec('reset role');
  assert.equal(Number((await one(`select count(*) n from crm_leads where email = 'ana@roof.example.invalid'`)).n), 1);
  assert.equal(Number((await one(`select count(*) n from crm_growth_funnel_submissions s join crm_leads l on l.id = s.lead_id where l.email = 'ana@roof.example.invalid'`)).n), 1);
  assert.equal(Number((await one(`select count(*) n from crm_leads where email = 'consumer@roof.example.invalid'`)).n), 0, 'no consumer enters the B2B CRM');
  for (const table of ['crm_sales', 'crm_events'])
    assert.equal(Number((await one(`select count(*) n from ${table}`)).n), 0, table + ' must stay empty');
  assert.deepEqual((await q(`select distinct origin, stage_id, audience from crm_leads where source like 'Funnel:%'`)), [{ origin: 'campaign', stage_id: 'new', audience: 'agency_b2b' }]);
  await db.close();
});
