// P0.2 — review-only SQL docs/sql/public-intake-role-review.sql on an isolated database. Synthetic data only.
// Uses only PGlite (the negative-inputs workflow installs tests/qa only); the server helper is unit-tested in
// tests/quote-antibot.test.cjs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const TOKEN = 'synthetic-intake-token-' + 'x'.repeat(24);
const ROTATED = 'synthetic-rotated-token-' + 'y'.repeat(24);
const sha = v => crypto.createHash('sha256').update(v, 'utf8').digest('hex');

test('after the review SQL, the REST path needs the server token; anon cannot reach the inner functions', { timeout: 180000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id) values('${MIGUEL}');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner');`);
  }
  const inquiry = n => JSON.stringify({ company: 'Barbería Sintética', name: 'Ana Prueba', email: `ana${n}@barberia.example.invalid`, message: 'Necesito una página web con reservas.', services: ['website'] });
  const as = async (role, sql, params) => { await db.exec(`reset role; set role ${role};`); try { return await db.query(sql, params); } finally { await db.exec('reset role;'); } };

  // Today (before the review SQL) the direct anonymous path exists: this is the gap being closed.
  assert.equal((await as('anon', 'select crm_public_inquiry($1::jsonb) r', [inquiry(0)])).rows[0].r, 'ok');

  await db.exec(fs.readFileSync('docs/sql/public-intake-role-review.sql', 'utf8'));
  await db.query('insert into crm_private.intake_tokens(token_sha256,label) values($1,$2)', [sha(TOKEN), 'synthetic']);

  await assert.rejects(as('anon', 'select crm_public_inquiry($1::jsonb) r', [inquiry(1)]), /permission denied/, '1. direct anonymous RPC refused');
  await assert.rejects(as('anon', "select crm_growth_funnel_submit('{}'::jsonb)"), /permission denied/);
  await assert.rejects(as('authenticated', 'select crm_public_inquiry($1::jsonb) r', [inquiry(1)]), /permission denied/, 'signed-in users get no bypass either');
  await assert.rejects(as('authenticated', 'select crm_public_intake($1::jsonb,$2) r', [inquiry(1), TOKEN]), /permission denied/, 'the wrapper is for the anonymous web path only');
  for (const bad of [null, '', 'short', 'wrong-token-' + 'z'.repeat(30)])
    assert.equal((await as('anon', 'select crm_public_intake($1::jsonb,$2) r', [inquiry(2), bad])).rows[0].r, 'unavailable', `2. ${bad === null ? 'missing' : 'invalid'} token refused`);
  assert.equal((await as('anon', 'select crm_public_intake($1::jsonb,$2) r', [inquiry(3), TOKEN])).rows[0].r, 'ok', '3. the server path still saves');
  assert.equal((await as('anon', 'select crm_public_funnel_intake($1::jsonb,$2) r', ['{}', 'nope'])).rows[0].r, 'unavailable');
  await assert.rejects(as('anon', 'select * from crm_private.intake_tokens'), /permission denied/, 'token hashes are not readable');
  await assert.rejects(as('anon', 'select crm_private.intake_token_valid($1)', [TOKEN]), /permission denied/);

  // Rotation without downtime: add the new hash, then revoke the old one.
  await db.query('insert into crm_private.intake_tokens(token_sha256,label) values($1,$2)', [sha(ROTATED), 'rotated']);
  assert.equal((await as('anon', 'select crm_public_intake($1::jsonb,$2) r', [inquiry(4), ROTATED])).rows[0].r, 'ok');
  await db.query('update crm_private.intake_tokens set revoked_at=now() where token_sha256=$1', [sha(TOKEN)]);
  assert.equal((await as('anon', 'select crm_public_intake($1::jsonb,$2) r', [inquiry(5), TOKEN])).rows[0].r, 'unavailable', '4. a revoked token stops working');

  const stored = Number((await db.query("select count(*) n from crm_prospects where email like 'ana%@barberia.example.invalid'")).rows[0].n);
  assert.equal(stored, 3, 'only the legitimate submissions (before the SQL, valid token, rotated token) were stored');
  const tokenLeak = (await db.query("select count(*) n from crm_prospects where opportunity like '%synthetic-intake-token%' or opportunity like '%synthetic-rotated-token%'")).rows[0].n;
  assert.equal(Number(tokenLeak), 0, 'the token is never stored with the inquiry');

  // 7. Rollback block restores today's behavior.
  await db.exec('grant execute on function public.crm_public_inquiry(jsonb) to anon, authenticated; grant execute on function public.crm_growth_funnel_submit(jsonb) to anon;');
  assert.equal((await as('anon', 'select crm_public_inquiry($1::jsonb) r', [inquiry(6)])).rows[0].r, 'ok', 'rollback works');
});
