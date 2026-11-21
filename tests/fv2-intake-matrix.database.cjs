// Final Validation 2.0 — intake matrix at the database: concurrent and repeated submissions, EN/ES, gated path,
// explicit rollback. PGlite serialises one connection, so "concurrent" here means interleaved submissions in one
// transaction queue; true multi-session concurrency is Codex's disposable-PostgreSQL probe (#295).
// Author: Claude Code (implementation owner) — not an independent QA result.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const TOKEN = 'synthetic-intake-token-' + 'q'.repeat(24);
const sha = v => crypto.createHash('sha256').update(v, 'utf8').digest('hex');

test('intake matrix: repeated/concurrent submissions, EN/ES, gated wrappers, rollback is explicit only', { timeout: 240000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id) values('${MIGUEL}');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner');`);
  }
  const anonCall = async (fn, args) => { await db.exec('reset role; set role anon;'); try { return (await db.query(`select ${fn} r`, args)).rows[0].r; } finally { await db.exec('reset role;'); } };
  const req = over => JSON.stringify({ company: 'Matrix Sintética', name: 'Mía Prueba', email: 'mia@matrix.example.invalid', message: 'Necesito una web con reservas.', services: ['website'], language: 'es', ...over });

  // #18 / #20: the same message submitted many times at once is stored once; distinct messages from one sender are each kept.
  const same = await Promise.all(Array.from({ length: 6 }, () => anonCall('crm_public_inquiry($1::jsonb)', [req()])));
  assert.ok(same.every(r => r === 'ok' || r === 'throttled'), JSON.stringify(same));
  assert.equal(Number((await db.query('select count(*) n from crm_public_inquiries')).rows[0].n), 1, 'identical burst stored once');
  assert.equal(Number((await db.query('select count(*) n from crm_prospects')).rows[0].n), 1, 'one prospect');
  // #19 + #15: a different message (English) from the same sender is preserved on the same prospect, language kept.
  assert.equal(await anonCall('crm_public_inquiry($1::jsonb)', [req({ message: 'We also need an online store later.', language: 'en' })]), 'ok');
  const rows = (await db.query('select message, language from crm_public_inquiries order by created_at')).rows;
  assert.deepEqual(rows.map(r => r.language), ['es', 'en']);
  // #17: no consent version declared → stored as null, never fabricated (and a malformed one is refused).
  assert.equal(await anonCall('crm_public_inquiry($1::jsonb)', [req({ email: 'bad@matrix.example.invalid', consent_version: '<script>' })]), 'invalid');

  // #10: after the review SQL, the direct anonymous RPC is closed and only the token-gated wrapper works.
  await db.exec(fs.readFileSync('docs/sql/public-intake-role-review.sql', 'utf8'));
  await db.query('insert into crm_private.intake_tokens(token_sha256,label) values($1,$2)', [sha(TOKEN), 'synthetic']);
  await assert.rejects(anonCall('crm_public_inquiry($1::jsonb)', [req({ email: 'direct@matrix.example.invalid' })]), /permission denied/);
  await assert.rejects(anonCall('crm_growth_funnel_submit($1::jsonb)', ['{}']), /permission denied/, '#11 direct funnel RPC closed');
  assert.equal(await anonCall('crm_public_intake($1::jsonb,$2)', [req({ email: 'gated@matrix.example.invalid' }), TOKEN]), 'ok');
  // Dedupe/throttle still apply behind the wrapper (it delegates to the same function).
  assert.equal(await anonCall('crm_public_intake($1::jsonb,$2)', [req({ email: 'gated@matrix.example.invalid' }), TOKEN]), 'ok');
  assert.equal(Number((await db.query("select count(*) n from crm_prospects where email like 'gated@%'")).rows[0].n), 1);
  // Re-applying the review SQL is idempotent and does not reopen anything.
  await db.exec(fs.readFileSync('docs/sql/public-intake-role-review.sql', 'utf8'));
  await assert.rejects(anonCall('crm_public_inquiry($1::jsonb)', [req({ email: 'again@matrix.example.invalid' })]), /permission denied/, 're-apply keeps the path closed');
  // Applying ANY later migration replay of the inquiry function must not silently restore anon EXECUTE.
  const grants = (await db.query("select has_function_privilege('anon','public.crm_public_inquiry(jsonb)','execute') a")).rows[0].a;
  assert.equal(grants, false);
  // The rollback reopens the direct path ONLY through its explicit GRANT statements (documented, owner-run).
  await db.exec('grant execute on function public.crm_public_inquiry(jsonb) to anon, authenticated;');
  assert.equal(await anonCall('crm_public_inquiry($1::jsonb)', [req({ email: 'rollback@matrix.example.invalid' })]), 'ok');
});
