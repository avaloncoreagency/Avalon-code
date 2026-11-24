// QUOTES-MANAGEMENT-001 on real PostgreSQL (PGlite), synthetic data: owner-only logical deletion with dependency guard.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const verifiedContract = require('./helpers/verified-contract.cjs');
const { PGlite } = require('@electric-sql/pglite');
const OWNER = '00000000-0000-4000-8000-0000000000a1', OWNER2 = '00000000-0000-4000-8000-0000000000b2', EMP = '00000000-0000-4000-8000-0000000000c3';

test('quote deletion: owners only, confirmed by version, logical, frozen, refused with dependents', { timeout: 240000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)', [OWNER, 'm@example.invalid', OWNER2, 's@example.invalid', EMP, 'e@example.invalid']);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.query("insert into agency_memberships(user_id,role) values($1,'owner'),($2,'owner'),($3,'operator')", [OWNER, OWNER2, EMP]);
  }
  await db.query('insert into crm_private.finance_access(user_id) values($1)', [OWNER]);
  const as = u => db.exec(`reset role; set request.jwt.claim.sub='${u}'; set role authenticated;`);
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  const content = c => ({ schemaVersion: 1, lang: 'es', currency: 'USD', title: `Propuesta ${c}`, issueDate: '2026-11-24', validUntil: '2099-12-31',
    client: { company: c, contact: '', email: '', phone: '', address: '' }, issuer: { name: 'Avalon', email: '', phone: '' }, seller: '', objectives: '', problem: '', solution: 's',
    scope: '', deliverables: '', exclusions: '', dependencies: '', timeline: '', support: '', terms: '', notes: '', thirdPartyCosts: '', model: 'fixed',
    lines: [{ code: 'desarrollo-web', name: 'Web', description: '', kind: 'one_time', qty: 1, unitPrice: '500.00' }], commission: null });
  const mk = async name => {
    const lead = (await one("insert into crm_leads(company,contact,source,owner_id) values($1,'QA','manual',$2) returning id", [name, OWNER])).id;
    const c = content(name);
    const q = (await one('select crm_quote_create($1,$2,$3::jsonb,$4::jsonb,$5) r', [lead, crypto.randomUUID(), JSON.stringify(c), '{}', crypto.createHash('sha256').update(JSON.stringify(c)).digest('hex')])).r;
    return { lead, id: q.quote_id };
  };
  const del = (id, v, reason = 'Prueba') => db.query('select crm_quote_delete($1,$2,$3) r', [id, v, reason]).then(r => r.rows[0].r);
  const ver = async id => (await one('select version from crm_quotes where id=$1', [id])).version;
  const advance = async (id, to, note = '') => db.query('select crm_quote_transition($1,$2,$3,$4)', [id, await ver(id), to, note]);

  await as(OWNER);
  const draft = await mk('Borrar QA');
  const accepted = await mk('Aceptada QA');
  for (const [to, note] of [['internal_review', ''], ['approved', ''], ['sent', 'Enviada por email QA'], ['accepted', 'Aceptada por email QA']]) await advance(accepted.id, to, note);
  const sold = await mk('Vendida QA');
  for (const [to, note] of [['internal_review', ''], ['approved', ''], ['sent', 'Enviada por email QA'], ['accepted', 'Aceptada por email QA']]) await advance(sold.id, to, note);
  await verifiedContract(db, sold.lead, 'Contrato QA');
  await db.query('select crm_quote_close_sale($1::jsonb)', [JSON.stringify({ quote_id: sold.id, version_no: 1 })]);

  // Employees and anonymous callers are refused; a direct UPDATE cannot fake a deletion.
  await as(EMP);
  await assert.rejects(del(draft.id, 1), /quote_delete_forbidden/);
  await db.exec('reset role; set role anon');
  await assert.rejects(del(draft.id, 1), /permission denied/);
  await as(OWNER);
  await assert.rejects(db.query('update crm_quotes set deleted_at=now(), deleted_by=$2 where id=$1', [draft.id, OWNER]), /quote_delete_forbidden|permission denied/);
  // Stale confirmation (version changed meanwhile) is refused.
  await assert.rejects(del(draft.id, (await ver(draft.id)) + 5), /quote_version_conflict/);
  // Consolidated documents are protected.
  await assert.rejects(del(accepted.id, await ver(accepted.id)), /quote_delete_accepted/);
  await assert.rejects(del(sold.id, await ver(sold.id)), /quote_delete_accepted|quote_delete_has_dependents/);
  const salesBefore = (await one('select count(*)::int n, sum(total)::text t from crm_sales')).n;

  // Owner deletes the draft: logical, audited, idempotent; the other owner can too (both owners, nobody else).
  const r = await del(draft.id, await ver(draft.id), 'Cotización de prueba');
  assert.equal(r.replayed, false);
  assert.equal((await del(draft.id, 999)).replayed, true, 'a double click returns the same result');
  const row = await one('select deleted_at is not null deleted, deleted_by, delete_reason from crm_quotes where id=$1', [draft.id]);
  assert.deepEqual(row, { deleted: true, deleted_by: OWNER, delete_reason: 'Cotización de prueba' });
  assert.equal((await one('select count(*)::int n from crm_quote_versions where quote_id=$1', [draft.id])).n, 1, 'versions kept (no cascade)');
  assert.equal((await one("select count(*)::int n from crm_timeline where event_type='quote.deleted' and record_id=$1", [draft.id])).n, 1, 'audited');
  await assert.rejects(advance(draft.id, 'internal_review'), /quote_deleted/, 'a deleted quote is frozen');
  assert.equal((await one('select count(*)::int n from crm_sales')).n, salesBefore, 'no sale touched');
  await as(OWNER2);
  const second = await mk('Borrar QA 2');
  assert.equal((await del(second.id, await ver(second.id))).replayed, false, 'the other owner can delete');
});
