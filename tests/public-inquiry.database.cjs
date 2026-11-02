// Public quote form RPC: the only anonymous write path. Synthetic data only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
test('public inquiry: anon creates a pending prospect only, validated, throttled, deduplicated', { timeout: 120000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id) values('${MIGUEL}');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner');`);
  }
  await db.exec("reset role; set role anon;");
  const call = async r => (await db.query('select crm_public_inquiry($1::jsonb) r', [JSON.stringify(r)])).rows[0].r;
  const base = { company: 'Nova Sintética', name: 'Ana Prueba', email: 'ana@nova.example.invalid', phone: '+1 305 555 0100', message: 'Necesitamos web y recepcionista IA', services: ['website', 'receptionist', 'hack'] };
  assert.equal(await call({ ...base, email: 'no-es-correo' }), 'invalid');
  assert.equal(await call({ ...base, message: 'corto' }), 'invalid');
  // The anonymous RPC is callable directly; malformed JSON types must never
  // throw (SQLSTATE 22023) or create prospects, regardless of the UI schema.
  for (const services of ['website', null, { website: true }, 5, true]) {
    assert.equal(await call({ ...base, services }), 'invalid', `non-array services: ${JSON.stringify(services)}`);
  }
  assert.equal(await call({ ...base, website_url: 'http://spam.example' }), 'ok', 'honeypot answers ok');
  assert.equal(await call(base), 'ok');
  const withoutServices = { ...base };
  delete withoutServices.services;
  assert.equal(await call(withoutServices), 'ok', 'omitting optional services remains valid');
  assert.equal(await call({ ...base, email: 'ANA@nova.example.invalid' }), 'ok', 'third request of the day still accepted');
  assert.equal(await call(base), 'throttled', 'fourth within 24 h is throttled');
  await assert.rejects(db.query('select count(*) from crm_prospects'), /permission denied/, 'anon cannot read');
  await assert.rejects(db.query("insert into crm_prospects(company,source,owner_id,opportunity,acquired_at) values('x','x',$1,'x',now())", [MIGUEL]), /permission denied/);
  await db.exec('reset role;');
  const rows = (await db.query("select status, source_kind, owner_id, opportunity, created_by from crm_prospects")).rows;
  assert.equal(rows.length, 1, 'honeypot created nothing; same e-mail not duplicated');
  assert.equal(rows[0].status, 'pending', 'never approved, never a lead/client/sale');
  assert.equal(rows[0].source_kind, 'web_form');
  assert.match(rows[0].opportunity, /servicios: receptionist, website/);
  assert.doesNotMatch(rows[0].opportunity, /hack/);
  assert.equal(Number((await db.query('select count(*) n from crm_leads')).rows[0].n) + Number((await db.query('select count(*) n from crm_clients')).rows[0].n), 0);
  assert.equal(Number((await db.query('select count(*) n from crm_public_inquiries')).rows[0].n), 3);
});
