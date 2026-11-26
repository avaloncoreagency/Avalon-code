const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

test('isolated backup restores the client and canonical lead at the snapshot boundary, including access controls', async t => {
  const owner = '00000000-0000-4000-8000-0000000000a1';
  const source = new PGlite();
  t.after(() => source.close());
  await source.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await source.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));
  }
  await source.query('insert into auth.users(id,email) values ($1,$2)', [owner, 'restore@example.invalid']);
  await source.query("insert into agency_memberships(user_id,role) values ($1,'owner')", [owner]);
  async function asOwner(db) {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  }
  async function register(name) {
    const { rows } = await source.query('select crm_register_client_with_opportunity($1::jsonb) result', [
      JSON.stringify({ legal_name: name, source: 'Synthetic restore rehearsal' }),
    ]);
    return rows[0].result;
  }
  await asOwner(source);
  const saved = await register('Restore fixture A');
  const snapshot = await source.dumpDataDir();
  const later = await register('Restore fixture B');
  assert.notEqual(later.client_id, saved.client_id);

  const restored = new PGlite({ loadDataDir: snapshot });
  t.after(() => restored.close());
  await asOwner(restored);
  const { rows } = await restored.query(
    'select c.id, l.id as lead from crm_clients c join crm_leads l on l.id = c.origin_lead_id',
  );
  assert.deepEqual(rows, [{ id: saved.client_id, lead: saved.lead_id }]);
  assert.equal((await restored.query('select id from crm_clients')).rows.length, 1);
  await restored.exec('reset role; set role anon');
  await assert.rejects(restored.query('select id from crm_clients'), { code: '42501' });
  assert.equal((await source.query('select id from crm_clients')).rows.length, 2);
});
