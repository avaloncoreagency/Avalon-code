// P0.2 — review-only SQL docs/sql/public-intake-role-review.sql on an isolated database. Synthetic data only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const ts = require('typescript');
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

test('the intake token is a 60-second HS256 JWT for role avalon_intake; disabled without a strong secret', () => {
  const source = ts.transpileModule(fs.readFileSync('src/lib/supabase/intake.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', source)(id => id === 'server-only' ? {} : id === '@supabase/supabase-js' ? { createClient: () => ({}) } : require(id), mod, mod.exports);
  const secret = 'x'.repeat(40);
  const token = mod.exports.signIntakeToken(secret, 1_800_000_000);
  const [h, p, sig] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'HS256', typ: 'JWT' });
  assert.deepEqual(JSON.parse(Buffer.from(p, 'base64url')), { role: 'avalon_intake', iss: 'avalon-intake', iat: 1_800_000_000, exp: 1_800_000_060 });
  assert.equal(sig, crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url'));
  assert.equal(mod.exports.intakeMode({}), 'anon');
  assert.equal(mod.exports.intakeMode({ AVALON_INTAKE_JWT_SECRET: 'short' }), 'anon', 'a weak secret never enables the role path');
  assert.equal(mod.exports.intakeMode({ AVALON_INTAKE_JWT_SECRET: secret }), 'role');
  assert.equal(mod.exports.createIntakeClient({}), null);
});
