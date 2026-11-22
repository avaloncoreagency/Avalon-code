// Final Validation 2.0 — migration 20261120160000 (message history, REVIEW ONLY) applied OVER a pre-existing synthetic
// schema with legacy rows, plus permission/RLS/constraint checks and the intake review SQL ordering.
// Author: Claude Code (implementation owner) — not an independent QA result. Never run against production.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const STRANGER = '00000000-0000-4000-8000-0000000000c3';
const TARGET = '20261120160000_public_inquiry_message_history.sql';

test('message-history migration upgrades a populated older schema without loss and with owner-only review', { timeout: 300000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id) values('${MIGUEL}'),('${STRANGER}');`);
  const files = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort();
  assert.ok(files.includes(TARGET), 'migration under review is present');
  // Migrations added after TARGET (e.g. 20261121180000 sale/lead guard) are applied right after it below,
  // so the upgrade is verified against the whole current chain, not only up to TARGET.
  const later = files.filter(f => f > TARGET);
  for (const f of files.filter(f => f < TARGET)) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner'),('${STRANGER}','operator');`);
  }
  // Production-like state before the upgrade: legacy receipts created by the OLD function (message not stored).
  const anon = async (sql, p) => { await db.exec('reset role; set role anon;'); try { return (await db.query(sql, p)).rows[0]; } finally { await db.exec('reset role;'); } };
  const req = over => JSON.stringify({ company: 'Legado Sintético', name: 'Ana', email: 'ana@legado.example.invalid', message: 'Mensaje anterior que no se guardaba.', services: ['website'], ...over });
  assert.equal((await anon('select crm_public_inquiry($1::jsonb) r', [req()])).r, 'ok');
  assert.equal((await anon('select crm_public_inquiry($1::jsonb) r', [req({ email: 'luis@legado.example.invalid', company: 'Otro Legado' })])).r, 'ok');
  const before = Number((await db.query('select count(*) n from crm_public_inquiries')).rows[0].n);
  const prospectsBefore = (await db.query('select id, status, opportunity from crm_prospects order by id')).rows;

  await db.exec(fs.readFileSync('supabase/migrations/' + TARGET, 'utf8'));
  for (const f of later) await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));

  const legacy = (await db.query('select message, review_status, version, source from crm_public_inquiries order by created_at')).rows;
  assert.equal(legacy.length, before, 'no receipt lost or duplicated by the upgrade');
  assert.ok(legacy.every(r => r.message === null && r.review_status === 'pending' && r.version === 1), 'legacy messages are NOT reconstructed (null), pending, version 1');
  assert.deepEqual((await db.query('select id, status, opportunity from crm_prospects order by id')).rows, prospectsBefore, 'prospects untouched');
  // New submissions after the upgrade store the message; constraints reject bad review values.
  assert.equal((await anon('select crm_public_inquiry($1::jsonb) r', [req({ message: 'Nuevo mensaje después de la migración.' })])).r, 'ok');
  assert.equal(Number((await db.query("select count(*) n from crm_public_inquiries where message = 'Nuevo mensaje después de la migración.'")).rows[0].n), 1);
  // Only owners may review; operators and anon cannot write review fields or read the history.
  await db.exec(`reset role;set request.jwt.claim.sub='${STRANGER}';set role authenticated;`);
  const opUpdate = await db.query("update crm_public_inquiries set review_status='legitimate' returning id").then(r => r.rows.length, e => e.message);
  assert.ok(opUpdate === 0 || /forbidden|permission/i.test(String(opUpdate)), 'operator is refused or changes nothing: ' + opUpdate);
  assert.equal(Number((await db.query('select count(*) n from crm_public_inquiry_reviews')).rows[0].n), 0);
  await assert.rejects(db.query("update crm_public_inquiries set message='forged'"), /permission denied/, 'message column is not writable by app roles');
  await db.exec(`reset role;set request.jwt.claim.sub='${MIGUEL}';set role authenticated;`);
  assert.equal((await db.query("update crm_public_inquiries set review_status='legitimate' where message is null returning id")).rows.length, 2, 'owner can review legacy rows');
  await assert.rejects(db.query("update crm_public_inquiries set review_status='approved_by_ai' where message is null"), /check|violates|invalid/i, 'unknown review states are rejected');
  await assert.rejects(db.query('delete from crm_public_inquiry_reviews'), /permission denied/, 'review history is append-only');
  await db.exec('reset role;');
  // Order with the intake review SQL: it applies cleanly AFTER the migration (wrapper delegates to the new function).
  await db.exec(fs.readFileSync('docs/sql/public-intake-role-review.sql', 'utf8'));
  assert.equal((await db.query("select has_function_privilege('anon','public.crm_public_inquiry(jsonb)','execute') a")).rows[0].a, false);
});
