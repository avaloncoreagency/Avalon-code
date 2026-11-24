const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
test('two agency owners share inquiry history; outsider/client A/client B have no internal access', { timeout: 180000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  const ids = [1,2,3,4,5].map(x => '00000000-0000-4000-8000-' + String(x).padStart(12, '0'));
  for (const id of ids) await db.query('insert into auth.users(id) values($1)', [id]);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) for (const id of ids.slice(0,2)) await db.query("insert into agency_memberships(user_id,role) values($1,'owner')", [id]);
  }
  await db.exec('set role anon');
  const input = { company: 'Synthetic Client A', name: 'QA', email: 'client-a@example.invalid', message: 'A synthetic private inquiry to preserve.', services: ['website'] };
  assert.equal((await db.query('select crm_public_inquiry($1::jsonb) r', [JSON.stringify(input)])).rows[0].r, 'ok');
  await db.exec('reset role');
  for (let i=0;i<ids.length;i++) {
    await db.exec(`set request.jwt.claim.sub='${ids[i]}'; set role authenticated`);
    const count = Number((await db.query('select count(*) n from crm_public_inquiries')).rows[0].n);
    assert.equal(count, i < 2 ? 1 : 0, 'identity index '+i);
    await assert.rejects(db.query("update crm_public_inquiries set message='tampered'"), /permission denied/);
    await db.exec('reset role');
  }
  // No external customer tenancy model is implied: client A/B are unprivileged synthetic identities.
});
