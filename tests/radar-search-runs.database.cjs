// Radar search ↔ run_id on real PostgreSQL (PGlite) with every migration. Synthetic businesses only.
// Proves: each run knows exactly which businesses it found (new + already known), a replay returns the same run and
// results without duplicates, the search descriptor is stored as history, converted businesses are linked but never
// rewritten, discovery never approves, and non-owners/anon read nothing.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const SAMUEL = '00000000-0000-4000-8000-0000000000b2';
const STRANGER = '00000000-0000-4000-8000-0000000000c3';
const place = (ref, name, lat = 25.77, lon = -80.19) => ({ source_ref: 'osm:node/' + ref, name, source_kind: 'osm', lat, lon, industry: 'restaurant', source_label: 'OpenStreetMap', license: 'ODbL' });

test('radar runs: results scoped by run, replay-safe history, no approval', { timeout: 120000 }, async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id) values('${MIGUEL}'),('${SAMUEL}'),('${STRANGER}');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner'),('${SAMUEL}','owner'),('${STRANGER}','operator');`);
  }
  const as = u => db.exec(u ? `reset role;set request.jwt.claim.sub='${u}';set role authenticated;` : `reset role;set request.jwt.claim.sub='';set role anon;`);
  const rows = async (q, p) => (await db.query(q, p)).rows;
  const one = async (q, p) => (await rows(q, p))[0];
  const ingest = (places, key, search = null) =>
    one('select crm_radar_ingest($1::jsonb, $2, null, $3::jsonb) r', [JSON.stringify(places), key, search && JSON.stringify(search)]).then(x => x.r);
  const runPlaces = id => rows('select p.source_ref, rp.outcome from crm_radar_run_places rp join crm_prospects p on p.id = rp.prospect_id where rp.run_id = $1 order by 1', [id]);

  await as(MIGUEL);
  // Search 1: ZIP 33101 (Miami, synthetic) → three new businesses.
  const zip = await ingest([place(1, 'Café Sintético'), place(2, 'Taco Sintético'), place(3, 'Dental Sintético')], 'manual:run-zip-0001',
    { kind: 'postcode', lat: 25.7743, lon: -80.1937, radius_m: 1609, label: '33101, Miami', industries: ['restaurant'] });
  assert.deepEqual([zip.found, zip.inserted, zip.updated, zip.replayed], [3, 3, 0, false]);
  assert.deepEqual((await runPlaces(zip.run_id)).map(r => r.outcome), ['inserted', 'inserted', 'inserted']);

  // Search 2: another zone that overlaps one known business → only ITS four results, one of them "known".
  const addr = await ingest([place(3, 'Dental Sintético'), place(10, 'Gym Sintético', 26.1, -80.14), place(11, 'Spa Sintético', 26.1, -80.14), place(12, 'Bar Sintético', 26.1, -80.14)],
    'manual:run-addr-0002', { kind: 'address', lat: 26.1224, lon: -80.1373, radius_m: 3000, label: '100 Las Olas Blvd', industries: [] });
  assert.deepEqual([addr.found, addr.inserted, addr.updated], [4, 3, 1]);
  const r2 = await runPlaces(addr.run_id);
  assert.deepEqual(r2.map(r => r.source_ref), ['osm:node/10', 'osm:node/11', 'osm:node/12', 'osm:node/3']);
  assert.equal(r2.find(r => r.source_ref === 'osm:node/3').outcome, 'known', 'already-known business is linked, not duplicated');
  assert.equal(Number((await one('select count(*) n from crm_prospects')).n), 6, 'no duplicate prospects');

  // Replay of the same run key: same run id, same counts, no new rows (no provider call needed).
  const again = await ingest([place(99, 'Fantasma')], 'manual:run-zip-0001');
  assert.equal(again.replayed, true);
  assert.equal(again.run_id, zip.run_id);
  assert.equal((await runPlaces(zip.run_id)).length, 3);
  assert.equal(Number((await one(`select count(*) n from crm_prospects where source_ref='osm:node/99'`)).n), 0);

  // Persistent history: the search descriptor is stored, ordered newest first.
  const hist = await rows('select query_kind, label, radius_m, center_lat, industries, status, found from crm_radar_runs order by started_at desc, query_kind');
  assert.equal(hist.length, 2);
  const h = Object.fromEntries(hist.map(r => [r.query_kind, r]));
  assert.deepEqual([h.postcode.label, h.postcode.radius_m, h.postcode.center_lat, h.postcode.industries, h.postcode.status, h.postcode.found], ['33101, Miami', 1609, 25.7743, ['restaurant'], 'succeeded', 3]);
  assert.equal(h.address.label, '100 Las Olas Blvd');

  // Regression: Fort Lauderdale ZIP 33311 then Hallandale ZIP 33009 must NOT reuse
  // a prior search's run_id or cached business list (all data below is synthetic).
  const zip33311 = await ingest([
    place(301, 'Roofing 33311 Sintético', 26.13, -80.16),
    place(302, 'Electric 33311 Sintético', 26.13, -80.16),
  ], 'manual:zip-33311-a', { kind: 'postcode', label: '33311', lat: 26.132, lon: -80.163, radius_m: 1500, industries: ['roofing'] });
  const zip33009 = await ingest([
    place(302, 'Electric 33311 Sintético', 26.13, -80.16),
    place(401, 'Cleaning 33009 Sintético', 25.987, -80.142),
  ], 'manual:zip-33009-b', { kind: 'postcode', label: '33009', lat: 25.986, lon: -80.145, radius_m: 1500, industries: ['cleaning'] });
  assert.notEqual(zip33311.run_id, zip33009.run_id, 'separate ZIP searches use separate run IDs');
  assert.deepEqual((await runPlaces(zip33311.run_id)).map(x => x.source_ref), ['osm:node/301', 'osm:node/302']);
  assert.deepEqual((await runPlaces(zip33009.run_id)).map(x => x.source_ref), ['osm:node/302', 'osm:node/401']);
  assert.deepEqual((await runPlaces(zip33009.run_id)).map(x => x.outcome), ['known', 'inserted'],
    'shared businesses remain known, without importing unrelated 33311 results into 33009');
  const zipDescriptions = await rows('select label,query_kind from crm_radar_runs where id in ($1,$2) order by label', [zip33311.run_id, zip33009.run_id]);
  assert.deepEqual(zipDescriptions.map(x => x.label), ['33009', '33311']);
  assert.ok(zipDescriptions.every(x => x.query_kind === 'postcode'));


  // Legacy 3-argument call (scheduler, older callers) still works and is linked; kind defaults to unknown.
  const legacy = await one('select crm_radar_ingest($1::jsonb, $2) r', [JSON.stringify([place(20, 'Legacy Sintético')]), 'legacy-run-0003']).then(x => x.r);
  assert.equal((await runPlaces(legacy.run_id)).length, 1);
  assert.equal((await one('select query_kind from crm_radar_runs where id=$1', [legacy.run_id])).query_kind, 'unknown');

  // Invalid descriptors are refused or neutralised, never trusted.
  await assert.rejects(db.query(`select crm_radar_ingest('[]'::jsonb, 'bad-desc-0004', null, '"x"'::jsonb)`), /radar_invalid/);
  const odd = await ingest([], 'odd-kind-0005', { kind: 'drop table', lat: 'x', radius_m: 5000 });
  assert.equal((await one('select query_kind, center_lat, radius_m from crm_radar_runs where id=$1', [odd.run_id])).query_kind, 'unknown');

  // Discovery never approves; everything found is pending.
  assert.deepEqual((await rows('select distinct status from crm_prospects')).map(r => r.status), ['pending']);

  // The other owner sees the same history; an operator and anon see nothing and cannot write links.
  await as(SAMUEL);
  assert.equal((await runPlaces(zip.run_id)).length, 3);
  await as(STRANGER);
  assert.equal((await rows('select * from crm_radar_run_places')).length, 0);
  await assert.rejects(db.query('select crm_radar_ingest($1::jsonb,$2)', ['[]', 'stranger-run-01']), /crm_forbidden/);
  await assert.rejects(db.query('insert into crm_radar_run_places(run_id, prospect_id, outcome) values($1,$2,$3)', [zip.run_id, zip.run_id, 'known']), /permission denied/);
  await as(null);
  await assert.rejects(db.query('select * from crm_radar_run_places'), /permission denied/);
});
