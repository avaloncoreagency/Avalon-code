// P0.1 / P0.3 — every accepted website message is preserved; owners review each one reversibly. Synthetic data only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const SAMUEL = '00000000-0000-4000-8000-0000000000b2';
const OUTSIDER = '00000000-0000-4000-8000-0000000000c3';

async function setup(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id) values('${MIGUEL}'),('${SAMUEL}'),('${OUTSIDER}');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner'),('${SAMUEL}','owner'),('${OUTSIDER}','operator');`);
  }
  const anon = async r => { await db.exec('reset role; set role anon;'); try { return (await db.query('select crm_public_inquiry($1::jsonb) r', [JSON.stringify(r)])).rows[0].r; } finally { await db.exec('reset role;'); } };
  const as = async id => db.exec(`reset role; set request.jwt.claim.sub='${id}'; set role authenticated;`);
  return { db, anon, as };
}
const base = { company: 'Barbería Sintética', name: 'Ana Prueba', email: 'ana@barberia.example.invalid', phone: '+1 305 555 0100',
  message: 'Necesito una página web con reservas para mi barbería.', services: ['website'], language: 'es' };

test('two different messages from one sender are both preserved on ONE prospect; identical replays are idempotent', { timeout: 180000 }, async t => {
  const { db, anon } = await setup(t);
  assert.equal(await anon(base), 'ok', '1. first valid inquiry');
  assert.equal(await anon({ ...base, message: 'También quiero cotizar un CRM para clientes frecuentes.', services: ['crm'] }), 'ok', '2. second, different message');
  assert.equal(await anon(base), 'ok', '3. identical resubmission answers ok');
  assert.equal(await anon({ ...base, email: 'ANA@barberia.example.invalid ' }), 'ok', '4. double submit with case/space variation');
  const prospects = (await db.query("select id from crm_prospects where lower(email)='ana@barberia.example.invalid'")).rows;
  assert.equal(prospects.length, 1, 'a single prospect, never a duplicate business');
  const rows = (await db.query('select message, message_sha256, services, source, review_status, version, consent_version from crm_public_inquiries where prospect_id=$1 order by created_at, message', [prospects[0].id])).rows;
  assert.equal(rows.length, 2, 'two distinct messages stored; replays not duplicated');
  assert.deepEqual(rows.map(r => r.message).sort(), [base.message, 'También quiero cotizar un CRM para clientes frecuentes.'].sort());
  for (const r of rows) {
    assert.match(r.message_sha256, /^[0-9a-f]{64}$/);
    assert.equal(r.source, 'website_form');
    assert.equal(r.review_status, 'pending');
    assert.equal(r.version, 1);
    assert.equal(r.consent_version, null, 'consent is never fabricated when the form did not declare a version');
  }
  for (const table of ['crm_leads', 'crm_clients', 'crm_sales'])
    assert.equal(Number((await db.query(`select count(*) n from ${table}`)).rows[0].n), 0, `${table}: an inquiry is never a lead, client or sale`);
});

test('consent version is stored only when declared and well-formed; malformed input and honeypot store nothing', { timeout: 180000 }, async t => {
  const { db, anon } = await setup(t);
  assert.equal(await anon({ ...base, consent_version: 'privacy-2026-11' }), 'ok');
  assert.equal(await anon({ ...base, email: 'x@barberia.example.invalid', consent_version: 'DROP TABLE;' }), 'invalid');
  assert.equal(await anon({ ...base, email: 'y@barberia.example.invalid', message: 'corto' }), 'invalid');
  assert.equal(await anon({ ...base, email: 'z@barberia.example.invalid', services: 'website' }), 'invalid');
  assert.equal(await anon({ ...base, email: 'bot@barberia.example.invalid', website_url: 'http://spam.example' }), 'ok', 'honeypot answers ok');
  const rows = (await db.query('select consent_version from crm_public_inquiries')).rows;
  assert.deepEqual(rows.map(r => r.consent_version), ['privacy-2026-11'], 'only the valid inquiry was stored');
});

test('a storage failure is not reported as success and leaves nothing half-written', { timeout: 180000 }, async t => {
  const { db, anon } = await setup(t);
  await db.exec("alter table public.crm_public_inquiries add constraint qa_force_failure check (message <> 'FALLA SINTÉTICA DE ALMACENAMIENTO')");
  await assert.rejects(anon({ ...base, message: 'FALLA SINTÉTICA DE ALMACENAMIENTO' }), /qa_force_failure/, '5. the caller sees an error, never "ok"');
  assert.equal(Number((await db.query('select count(*) n from crm_prospects')).rows[0].n), 0, 'the prospect insert rolled back with the receipt');
});

test('owners review each message reversibly with history and optimistic versions; others cannot', { timeout: 180000 }, async t => {
  const { db, anon, as } = await setup(t);
  assert.equal(await anon(base), 'ok');
  const id = (await db.query('select id from crm_public_inquiries')).rows[0].id;
  await as(MIGUEL);
  const review = (status, note, version) => db.query('update crm_public_inquiries set review_status=$1, review_note=$2 where id=$3 and version=$4 returning version, reviewed_by', [status, note, id, version]);
  let r = await review('possible_spam', 'Parece publicidad', 1);
  assert.equal(r.rows[0].version, 2); assert.equal(r.rows[0].reviewed_by, MIGUEL);
  assert.equal((await review('legitimate', 'stale', 1)).rows.length, 0, '6. stale version changes nothing');
  await as(SAMUEL);
  r = await review('legitimate', 'Falso positivo: es una barbería real', 2);
  assert.equal(r.rows[0].version, 3, 'false positive recovered by the other owner');
  await assert.rejects(db.query("update crm_public_inquiries set message='alterado' where id=$1", [id]), /permission denied/, 'the original message is immutable');
  await assert.rejects(db.query('delete from crm_public_inquiries where id=$1', [id]), /permission denied/, 'receipts are never deleted');
  const history = (await db.query('select from_status, to_status, actor_id from crm_public_inquiry_reviews where inquiry_id=$1 order by created_at, to_status desc', [id])).rows;
  assert.deepEqual(history.map(h => [h.from_status, h.to_status, h.actor_id]), [['pending', 'possible_spam', MIGUEL], ['possible_spam', 'legitimate', SAMUEL]]);
  await assert.rejects(db.query("insert into crm_public_inquiry_reviews(inquiry_id,from_status,to_status,actor_id) values($1,'x','y',$2)", [id, SAMUEL]), /permission denied/, 'history is append-only through the trigger');
  await as(OUTSIDER);
  assert.equal((await db.query('select count(*) n from crm_public_inquiries')).rows[0].n, 0, '8. a non-owner cannot read messages');
  assert.equal((await db.query('select count(*) n from crm_public_inquiry_reviews')).rows[0].n, 0);
  assert.equal((await db.query("update crm_public_inquiries set review_status='discarded' where id=$1 returning id", [id])).rows.length, 0, 'a non-owner cannot review');
  await db.exec('reset role; set role anon;');
  await assert.rejects(db.query('select message from crm_public_inquiries'), /permission denied/, 'anonymous callers cannot read messages');
  await db.exec('reset role;');
  await as(MIGUEL);
  await assert.rejects(review('approved', '', 3), /crm_public_inquiries_review_status/, '9. unknown review status rejected');
  assert.equal((await db.query('select review_status, message from crm_public_inquiries where id=$1', [id])).rows[0].message, base.message, '10. message intact on re-read');
});
