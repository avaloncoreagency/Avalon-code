// Acceptance flow (P0): two owners work the SAME CRM end to end on real PostgreSQL (PGlite). Synthetic data only.
// Radar sighting → manual approval → pipeline → stage moves → sale → one client 360° seen identically by both owners,
// with no duplicate prospect, lead, client or sale at any step.
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
  await db.exec(`insert into auth.users(id,email) values('${MIGUEL}','miguel@example.invalid'),('${SAMUEL}','samuel@example.invalid'),('${STRANGER}','x@example.invalid');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner'),('${SAMUEL}','owner'),('${STRANGER}','operator');`);
  }
  const as = u => db.exec(`reset role;set request.jwt.claim.sub='${u}';set role authenticated;`);
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  const n = async (q, p) => Number((await one(q, p)).n);
  return { db, as, one, n };
}
const place = (ref, name, extra = {}) => ({ source_ref: 'osm:node/' + ref, name, source_kind: 'osm', lat: 25.77, lon: -80.19, industry: 'dentist', source_label: 'Geoapify Places (OpenStreetMap)', license: 'ODbL', ...extra });

test('two owners: radar → approval → pipeline → stages → sale → one shared client 360°, no duplicates', { timeout: 180000 }, async t => {
  const { db, as, one, n } = await setup();
  t.after(() => db.close());

  // 1. Miguel's radar search finds a business. It is only a pending prospect.
  await as(MIGUEL);
  const found = (await one('select crm_radar_ingest($1::jsonb,$2) r', [JSON.stringify([place(9001, 'Bright Dental Sintético', { phone: '+1 305 555 0142' })]), 'flow-run-0001'])).r;
  assert.deepEqual([found.inserted, found.updated], [1, 0]);
  const prospect = await one("select id, status, owner_id from crm_prospects where source_ref='osm:node/9001'");
  assert.equal(prospect.status, 'pending');
  assert.equal(await n('select count(*) n from crm_leads'), 0, 'discovery never creates a lead');

  // 2. Manual review: contact data + approval. Another owner cannot be blocked from the same record.
  await db.query("update crm_prospects set email='hola@bright.example.invalid', contact='Dra. Prueba' where id=$1", [prospect.id]);
  await as(SAMUEL);
  await assert.rejects(db.query('select crm_convert_prospect($1)', [prospect.id]), /aprueba/i, 'pipeline requires human approval first');
  await db.query("update crm_prospects set status='approved' where id=$1", [prospect.id]);

  // 3. Samuel (a different owner) sends it to the pipeline; repeating is idempotent.
  const leadId = (await one('select crm_convert_prospect($1) id', [prospect.id])).id;
  assert.equal((await one('select crm_convert_prospect($1) id', [prospect.id])).id, leadId, 'idempotent');
  assert.equal(await n('select count(*) n from crm_leads'), 1);
  assert.deepEqual({ ...(await one('select status, lead_id from crm_prospects where id=$1', [prospect.id])) }, { status: 'converted', lead_id: leadId });

  // 4. Samuel moves it through the board; Miguel sees the identical lead and history.
  for (const stage of ['contacted', 'qualified', 'proposal']) await db.query('update crm_leads set stage_id=$2 where id=$1', [leadId, stage]);
  await as(MIGUEL);
  assert.equal((await one('select stage_id from crm_leads where id=$1', [leadId])).stage_id, 'proposal');
  const history = (await db.query('select from_stage, to_stage, actor_id from crm_lead_stage_history where lead_id=$1 order by id', [leadId])).rows;
  assert.deepEqual(history.map(h => [h.from_stage, h.to_stage]), [[null, 'new'], ['new', 'contacted'], ['contacted', 'qualified'], ['qualified', 'proposal']]);
  assert.equal(history[3].actor_id, SAMUEL, 'the owner who moved it is recorded');

  // 5. Miguel registers the sale from that lead: website + AI receptionist for one company.
  const sale = (await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify({
    idempotency_key: '90000000-0000-4000-8000-000000000001', lead_id: leadId, new_client: { legal_name: 'Bright Dental Sintético' },
    contacts: [{ full_name: 'Dra. Prueba', email: 'hola@bright.example.invalid' }], seller_id: MIGUEL,
    lines: [{ service_code: 'desarrollo-web', unit_price: '2000' }, { service_code: 'recepcionista-ia', unit_price: '1200' }],
  })])).r;
  assert.equal(sale.client_created, true);
  assert.equal((await one('select stage_id from crm_leads where id=$1', [leadId])).stage_id, 'won', 'the sale closes the lead');
  const replay = (await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify({
    idempotency_key: '90000000-0000-4000-8000-000000000001', lead_id: leadId, new_client: { legal_name: 'Bright Dental Sintético' },
    lines: [{ service_code: 'desarrollo-web', unit_price: '2000' }, { service_code: 'recepcionista-ia', unit_price: '1200' }],
  })])).r;
  assert.equal(replay.sale_id, sale.sale_id, 'repeating the request returns the same sale');

  // 6. Samuel opens the client 360°: identical client, sale, orders, projects and tasks.
  await as(SAMUEL);
  const client = await one("select id, legal_name, origin_lead_id from crm_clients where legal_name='Bright Dental Sintético'");
  assert.equal(client.id, sale.client_id);
  assert.equal(client.origin_lead_id, leadId, 'the client keeps the originating lead');
  assert.equal(await n('select count(*) n from crm_sales where client_id=$1', [client.id]), 1);
  assert.equal(await n('select count(*) n from crm_work_orders where client_id=$1', [client.id]), 2, 'one order per sold service');
  assert.equal(await n('select count(*) n from os_projects where client_id=$1', [client.id]), 2, 'one project per module service');
  assert.ok(await n('select count(*) n from crm_tasks where client_id=$1', [client.id]) >= 2, 'tasks generated for the departments');
  assert.equal(await n("select count(*) n from crm_timeline where client_id=$1 and event_type='sale.confirmed'", [client.id]), 1);

  // 7. The same business is sighted again by another search: nothing is cloned or reopened.
  const again = (await one('select crm_radar_ingest($1::jsonb,$2) r', [JSON.stringify([place(9001, 'Bright Dental Sintético')]), 'flow-run-0002'])).r;
  assert.deepEqual([again.inserted, again.updated], [0, 1]);
  assert.deepEqual({ ...(await one('select status, lead_id from crm_prospects where id=$1', [prospect.id])) }, { status: 'converted', lead_id: leadId });

  // 8. Final inventory: one of everything.
  for (const [table, expected] of [['crm_prospects', 1], ['crm_leads', 1], ['crm_clients', 1], ['crm_sales', 1]])
    assert.equal(await n(`select count(*) n from ${table}`), expected, table);

  // A non-owner member sees none of it.
  await as(STRANGER);
  for (const table of ['crm_prospects', 'crm_leads', 'crm_clients', 'crm_sales', 'crm_lead_stage_history'])
    assert.equal(await n(`select count(*) n from ${table}`), 0, table + ' hidden from non-owners');
});

test('duplicate business: conversion conflict is a unique violation and the human link creates no second lead', { timeout: 120000 }, async t => {
  const { db, as, one, n } = await setup();
  t.after(() => db.close());
  await as(MIGUEL);
  const lead = await one("insert into crm_leads(company,contact,email,source,owner_id) values('Orbit Dental','Clara','clara@orbit.example.invalid','Manual',$1) returning id", [MIGUEL]);
  await as(SAMUEL);
  // Same e-mail, different case, arriving from another channel (CSV / website form / radar).
  const p = await one("insert into crm_prospects(company,contact,email,source,owner_id,acquired_at,status,opportunity) values('Orbit Dental SRL','Clara','Clara@Orbit.example.invalid','CSV',$1,now(),'approved','x') returning id", [SAMUEL]);
  await assert.rejects(db.query('select crm_convert_prospect($1)', [p.id]), e => e.code === '23505' && /crm_leads_email_unique/.test(e.message),
    'the database refuses a second open lead with that e-mail (the app turns this into an explained, linkable conflict)');
  assert.equal(await n('select count(*) n from crm_leads'), 1);
  // The exact update the app performs after the owner confirms "Vincular al lead existente".
  const link = await db.query("update crm_prospects set status='converted', lead_id=$2 where id=$1 and status='approved' returning id", [p.id, lead.id]);
  assert.equal(link.rows.length, 1, 'owners may link under RLS');
  assert.equal(await n('select count(*) n from crm_leads'), 1, 'still one lead');
  await assert.rejects(db.query("update crm_prospects set status='pending' where id=$1", [p.id]), /immutable/i, 'a linked prospect is frozen like any converted one');
  assert.ok(await n("select count(*) n from crm_audit where entity='crm_prospects' and record_id=$1", [p.id]) >= 2, 'the link is audited');
  // A non-owner cannot link anything.
  await as(STRANGER);
  assert.equal((await db.query("update crm_prospects set status='converted', lead_id=$2 where id=$1 returning id", [p.id, lead.id])).rows.length, 0);
});
