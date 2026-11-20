// P0.2 — review-only SQL docs/sql/public-intake-role-review.sql on an isolated database. Synthetic data only.
// Uses only PGlite (the negative-inputs workflow installs tests/qa only); the JWT signer is unit-tested in tests/quote-antibot.test.cjs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const MIGUEL = '00000000-0000-4000-8000-0000000000a1';

test('after the review SQL, anon cannot call the intake RPC; avalon_intake can, and can read nothing', { timeout: 180000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id) values('${MIGUEL}');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner');`);
  }
  const inquiry = { company: 'Barbería Sintética', name: 'Ana Prueba', email: 'ana@barberia.example.invalid', message: 'Necesito una página web con reservas.', services: ['website'] };
  const call = role => db.query(`set role ${role}; select crm_public_inquiry($1::jsonb) r`, [JSON.stringify(inquiry)]);
  // Today (before the review SQL): the anonymous path exists — this is the gap being closed.
  await db.exec('set role anon;');
  assert.equal((await db.query('select crm_public_inquiry($1::jsonb) r', [JSON.stringify(inquiry)])).rows[0].r, 'ok');
  await db.exec('reset role;');

  await db.exec(fs.readFileSync('docs/sql/public-intake-role-review.sql', 'utf8'));
  await db.exec('set role anon;');
  await assert.rejects(db.query('select crm_public_inquiry($1::jsonb) r', [JSON.stringify({ ...inquiry, email: 'b@barberia.example.invalid' })]), /permission denied/, 'direct anonymous RPC refused');
  await assert.rejects(db.query("select crm_growth_funnel_submit('{}'::jsonb)"), /permission denied/);
  await db.exec('reset role; set role authenticated;');
  await assert.rejects(db.query('select crm_public_inquiry($1::jsonb) r', [JSON.stringify(inquiry)]), /permission denied/, 'signed-in users do not get the intake path either');
  await db.exec('reset role; set role avalon_intake;');
  assert.equal((await db.query('select crm_public_inquiry($1::jsonb) r', [JSON.stringify({ ...inquiry, email: 'c@barberia.example.invalid' })])).rows[0].r, 'ok', 'the server role keeps the form working');
  for (const table of ['crm_prospects', 'crm_public_inquiries', 'crm_leads', 'crm_clients'])
    await assert.rejects(db.query(`select count(*) from ${table}`), /permission denied/, `avalon_intake cannot read ${table}`);
  await assert.rejects(db.query("select crm_confirm_sale('{}'::jsonb)"), /permission denied/, 'no other RPC');
  await db.exec('reset role;');
  const role = (await db.query("select rolcanlogin, rolbypassrls, rolsuper from pg_roles where rolname='avalon_intake'")).rows[0];
  assert.deepEqual(role, { rolcanlogin: false, rolbypassrls: false, rolsuper: false });
  void call;
});

