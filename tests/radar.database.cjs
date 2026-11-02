// Radar 2.0 data rules on real PostgreSQL (PGlite). Synthetic businesses only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const SAMUEL = '00000000-0000-4000-8000-0000000000b2';
const STRANGER = '00000000-0000-4000-8000-0000000000c3';
const place = (ref, name, extra = {}) => ({ source_ref: 'osm:node/' + ref, name, source_kind: 'osm', lat: 25.77, lon: -80.19, industry: 'restaurant', source_label: 'OpenStreetMap', license: 'ODbL', ...extra });

test('radar: dedupe, honest stars, confidence, override, do-not-contact and human approval to pipeline', { timeout: 120000 }, async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id) values('${MIGUEL}'),('${SAMUEL}'),('${STRANGER}');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner'),('${SAMUEL}','owner'),('${STRANGER}','operator');`);
  }
  const as = u => db.exec(`reset role;set request.jwt.claim.sub='${u}';set role authenticated;`);
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  const ingest = (places, key) => one('select crm_radar_ingest($1::jsonb, $2) r', [JSON.stringify(places), key]).then(x => x.r);

  await as(MIGUEL);
  const r1 = await ingest([place(1, 'Café Sintético'), place(2, 'Taco Sintético'), place(3, 'Chain Sintética'), place(4, 'Chain Sintética')], 'manual-run-0001');
  assert.deepEqual([r1.found, r1.inserted, r1.updated], [4, 4, 0], 'chains with the same name are distinct businesses by source id');
  assert.equal((await ingest([place(1, 'x')], 'manual-run-0001')).replayed, true, 'same run key replays');
  const r2 = await ingest([place(1, 'Café Sintético', { phone: '+1 305 555 0100' }), place(5, 'Nuevo Sintético')], 'manual-run-0002');
  assert.deepEqual([r2.inserted, r2.updated], [1, 1], 'a second campaign/zone updates instead of cloning');
  assert.equal(Number((await one('select count(*) n from crm_prospects')).n), 5);
  const cafe = await one("select * from crm_prospects where source_ref='osm:node/1'");
  assert.equal(cafe.phone, '+1 305 555 0100', 'missing contact filled from a later sighting');
  assert.equal(cafe.status, 'pending', 'discovery never approves');
  assert.equal(cafe.stars, null, 'no evidence → Sin calificar, never 5 stars by missing data');
  assert.equal(cafe.confidence, 'none');

  const need = (service, state, method = 'call', confidence = 'high') =>
    db.query('insert into crm_prospect_needs(prospect_id,service,state,method,confidence) values($1,$2,$3,$4,$5) on conflict (prospect_id,service) do update set state=excluded.state, method=excluded.method, confidence=excluded.confidence', [cafe.id, service, state, method, confidence]);
  await need('website', 'unverified', '');
  assert.equal((await one('select stars from crm_prospects where id=$1', [cafe.id])).stars, null, 'unverified is not evidence');
  await assert.rejects(db.query("insert into crm_prospect_needs(prospect_id,service,state) values($1,'crm','verified_missing')", [cafe.id]), /check/, 'verified state requires a method');
  await need('website', 'verified_present'); await need('crm', 'verified_present');
  let c = await one('select stars, confidence, stars_reasons from crm_prospects where id=$1', [cafe.id]);
  assert.equal(c.stars, 1, 'tools present → 1 star (exploration)');
  assert.ok(c.stars_reasons.some(r => r.includes('presente')), 'reasons are explainable');
  for (const s of ['website', 'crm', 'receptionist', 'marketing', 'automation']) await need(s, 'verified_missing');
  await need('ecommerce', 'not_applicable', '');
  c = await one('select stars, confidence, research_status from crm_prospects where id=$1', [cafe.id]);
  assert.equal(c.stars, 5, 'verified needs across the applicable catalog → 5 stars');
  assert.equal(c.confidence, 'high', 'confidence is a separate indicator');
  assert.equal(c.research_status, 'researching');

  // Manual override needs a reason and is audited.
  await assert.rejects(db.query("update crm_prospects set stars_override=3 where id=$1", [cafe.id]), /check/);
  await db.query("update crm_prospects set stars_override=4, override_reason='Cliente dijo que ya usa un CRM gratuito' where id=$1", [cafe.id]);
  assert.ok(Number((await one("select count(*) n from crm_audit where entity='crm_prospects' and record_id=$1", [cafe.id])).n) >= 2);

  // Do-not-contact blocks approval; approval is human; conversion is the existing pipeline path.
  const taco = await one("select id from crm_prospects where source_ref='osm:node/2'");
  await db.query('update crm_prospects set do_not_contact=true where id=$1', [taco.id]);
  await assert.rejects(db.query("update crm_prospects set status='approved' where id=$1", [taco.id]), /radar_do_not_contact/);
  await assert.rejects(db.query('select crm_convert_prospect($1)', [cafe.id]), /aprueba/, 'pipeline requires prior human approval');
  await db.query("update crm_prospects set status='approved' where id=$1", [cafe.id]);
  const lead = (await one('select crm_convert_prospect($1) id', [cafe.id])).id;
  assert.equal((await one('select crm_convert_prospect($1) id', [cafe.id])).id, lead, 'idempotent transfer');
  assert.equal((await one('select company from crm_leads where id=$1', [lead])).company, 'Café Sintético');
  const after = await ingest([place(1, 'Café Sintético')], 'manual-run-0003');
  assert.equal(after.updated, 1, 'converted business is still recognised (no clone)');
  assert.equal((await one('select status from crm_prospects where id=$1', [cafe.id])).status, 'converted', 'sighting does not reset review');

  // Campaigns: owner-only, start paused, bounded.
  await db.query("insert into crm_radar_campaigns(name,center_lat,center_lon,radius_m,owner_id) values('Restaurantes Miami',25.77,-80.19,16093,$1)", [MIGUEL]);
  await assert.rejects(db.query("insert into crm_radar_campaigns(name,center_lat,center_lon,radius_m,owner_id) values('x',25,-80,500000,$1)", [MIGUEL]), /check/);
  assert.equal((await one('select status from crm_radar_campaigns')).status, 'paused', 'campaigns start paused until authorized');

  await as(STRANGER);
  for (const tbl of ['crm_prospects', 'crm_prospect_needs', 'crm_radar_campaigns', 'crm_radar_runs']) assert.equal(Number((await one(`select count(*) n from ${tbl}`)).n), 0, tbl);
  await assert.rejects(db.query('select crm_radar_ingest($1::jsonb,$2)', ['[]', 'stranger-run-01']), /crm_forbidden/);
  await assert.rejects(db.query('insert into crm_radar_runs(idempotency_key,trigger) values($1,$2)', ['forged-run-01', 'manual']), /permission denied/);
});
