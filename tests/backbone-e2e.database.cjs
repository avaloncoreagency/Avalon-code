// Mission 0349 Phase 9: one continuous synthetic chain on real PostgreSQL (PGlite):
// Radar prospect → evidence/stars → human approval → single lead → pipeline → multi-service sale → one client →
// work orders → projects (canonical client link) → tasks → payment → delivery progress → outsider denied.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const verifiedContract = require('./helpers/verified-contract.cjs');
const { PGlite } = require('@electric-sql/pglite');
const M = '00000000-0000-4000-8000-0000000000a1', S = '00000000-0000-4000-8000-0000000000b2', X = '00000000-0000-4000-8000-0000000000c3';
const place = (ref, name) => ({ source_ref: 'osm:node/' + ref, name, source_kind: 'osm', lat: 25.77, lon: -80.19, industry: 'dental', source_label: 'OpenStreetMap', license: 'ODbL' });

test('backbone: prospect → lead → sale → client → orders → projects → tasks → payment, no duplicates, outsider denied', { timeout: 240000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id,email) values('${M}','m@example.invalid'),('${S}','s@example.invalid'),('${X}','x@example.invalid');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${M}','owner'),('${S}','owner'),('${X}','operator');`);
  }
  const as = u => db.exec(`reset role;set request.jwt.claim.sub='${u}';set role authenticated;`);
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  const n = async (q, p) => Number((await one(q, p)).n);

  // 1–2. Owner A: Radar discovers a business twice (repeat run) → one prospect, honestly unscored.
  await as(M);
  const run = key => one('select crm_radar_ingest($1::jsonb,$2) r', [JSON.stringify([place(9, 'Clínica Orbit Sintética')]), key]).then(x => x.r);
  assert.equal((await run('e2e-run-0001')).inserted, 1);
  assert.equal((await run('e2e-run-0002')).inserted, 0, 'second sighting never clones');
  const p = await one("select id, stars, status from crm_prospects where source_ref='osm:node/9'");
  assert.equal(p.stars, null); assert.equal(p.status, 'pending');
  // 3. Evidence → explainable stars.
  for (const s of ['website', 'crm', 'receptionist', 'marketing', 'automation']) await db.query("insert into crm_prospect_needs(prospect_id,service,state,method,confidence) values($1,$2,'verified_missing','call','high')", [p.id, s]);
  await db.query("insert into crm_prospect_needs(prospect_id,service,state) values($1,'ecommerce','not_applicable')", [p.id]);
  const scored = await one('select stars, confidence, stars_reasons from crm_prospects where id=$1', [p.id]);
  assert.equal(scored.stars, 5); assert.equal(scored.confidence, 'high'); assert.ok(scored.stars_reasons.length > 0);
  // 4. No approval → no lead; human approval → exactly one lead, replay-safe.
  await assert.rejects(db.query('select crm_convert_prospect($1)', [p.id]), /aprueba/);
  await db.query("update crm_prospects set status='approved' where id=$1", [p.id]);
  const lead = (await one('select crm_convert_prospect($1) id', [p.id])).id;
  assert.equal((await one('select crm_convert_prospect($1) id', [p.id])).id, lead);
  assert.equal(await n('select count(*) n from crm_leads'), 1);
  // 5. Owner B advances the same lead through the pipeline.
  await as(S);
  for (const stage of ['contacted', 'proposal']) await db.query('update crm_leads set stage_id=$2 where id=$1', [lead, stage]);
  assert.equal((await one('select stage_id from crm_leads where id=$1', [lead])).stage_id, 'proposal');
  // 6–8. A manually created project already references the lead (legacy field) before any client exists.
  await db.query("insert into os_projects(module,name,settings,created_by) values('website','Borrador previo',$1::jsonb,$2)", [JSON.stringify({ operations: { client_lead_id: lead } }), S]);
  assert.equal(await n('select count(*) n from os_projects where client_id is null'), 1);
  // 7. Multi-service sale from the lead → ONE client, three orders/projects, tasks; legacy project auto-linked.
  await as(M);
  await verifiedContract(db, lead);
  const sale = (await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify({
    idempotency_key: '88888888-8888-4888-8888-888888888888', lead_id: lead, new_client: { legal_name: 'Clínica Orbit Sintética' }, upfront_amount: '1000', billing_mode: 'mixed',
    lines: [{ service_code: 'desarrollo-web', unit_price: '2000' }, { service_code: 'crm-personalizado', unit_price: '3000' }, { service_code: 'marketing-mensual', unit_price: '600' }],
  })])).r;
  assert.deepEqual([sale.client_created, sale.work_orders, sale.projects], [true, 3, 3]);
  assert.equal((await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify({ idempotency_key: '88888888-8888-4888-8888-888888888888', lead_id: lead, lines: [{ service_code: 'desarrollo-web', unit_price: '2000' }] })])).r.replayed, true);
  assert.equal(await n('select count(*) n from crm_clients'), 1); assert.equal(await n('select count(*) n from crm_leads'), 1);
  assert.equal(await n('select count(*) n from os_projects'), 4);
  assert.equal(await n('select count(*) n from os_projects where client_id=$1', [sale.client_id]), 4, 'sale projects AND the legacy draft all point to the one client');
  assert.equal((await one('select stage_id from crm_leads where id=$1', [lead])).stage_id, 'won');
  // 9. Every chain link is a real foreign key: line → work order → project → client; tasks carry sale/project/client.
  assert.equal(await n('select count(*) n from crm_work_orders w join crm_sale_lines l on l.id=w.sale_line_id join os_projects p on p.id=w.project_id where w.client_id=$1 and p.client_id=w.client_id and l.sale_id=w.sale_id', [sale.client_id]), 3);
  assert.equal(await n('select count(*) n from crm_tasks where client_id=$1 and sale_id=$2 and project_id is not null', [sale.client_id, sale.sale_id]), sale.tasks);
  assert.deepEqual((await db.query('select distinct module from os_projects p join crm_work_orders w on w.project_id=p.id order by 1')).rows.map(r => r.module), ['crm_creator', 'marketing', 'website']);
  // 10–11. Payment recorded (not agreed) + delivery progress rolls up.
  assert.equal(Number((await one('select collected from crm_sales_metrics()')).collected), 0);
  await db.query("insert into crm_payments(sale_id,amount,currency,received_on,method) values($1,1000,'USD','2026-11-04','transfer')", [sale.sale_id]);
  assert.equal(Number((await one('select collected from crm_sales_metrics()')).collected), 1000);
  const orders = (await db.query('select id from crm_work_orders where sale_id=$1', [sale.sale_id])).rows;
  await db.query("update crm_work_orders set status='delivered' where id=any($1)", [orders.map(o => o.id)]);
  assert.equal((await one('select delivery_status from crm_sales where id=$1', [sale.sale_id])).delivery_status, 'delivered');
  assert.ok(await n("select count(*) n from crm_timeline where client_id=$1", [sale.client_id]) >= 6, 'one auditable story');
  // 12. Outsider (non-owner member) and anon: nothing visible, nothing callable.
  await as(X);
  for (const tbl of ['crm_prospects', 'crm_leads', 'crm_clients', 'crm_sales', 'crm_work_orders', 'os_projects', 'crm_tasks', 'crm_payments'])
    assert.equal(await n(`select count(*) n from ${tbl}`), 0, tbl + ' hidden');
  await assert.rejects(db.query('select crm_convert_prospect($1)', [p.id]));
  await db.exec('reset role; set role anon;');
  await assert.rejects(db.query('select * from crm_clients'), /permission denied/);
});

test('AI assistants stay disconnected: adapters return null and every integration is not_connected', () => {
  const ts = require('typescript');
  const m = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(fs.readFileSync('src/lib/os/integrations.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports);
  assert.equal(m.exports.getAiAdapter(), null); assert.equal(m.exports.getMessagingAdapter(), null); assert.equal(m.exports.getSocialPublisher(), null);
  assert.ok(m.exports.INTEGRATIONS.every(i => i.status === 'not_connected'));
});
