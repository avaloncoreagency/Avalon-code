// Canonical project→client link on real PostgreSQL (PGlite). Synthetic data only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const M = '00000000-0000-4000-8000-0000000000a1', S = '00000000-0000-4000-8000-0000000000b2', O = '00000000-0000-4000-8000-0000000000c3';

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id,email) values('${M}','m@example.invalid'),('${S}','s@example.invalid'),('${O}','o@example.invalid');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${M}','owner'),('${S}','owner'),('${O}','operator');`);
  }
  await db.exec(`reset role;set request.jwt.claim.sub='${M}';set role authenticated;`);
  return db;
}
const q = async (db, s, p) => (await db.query(s, p)).rows;
const project = (db, name, settings) => db.query("insert into os_projects(module,name,settings,created_by) values('website',$1,$2::jsonb,$3) returning id,client_id", [name, JSON.stringify(settings), M]).then(r => r.rows[0]);

test('project created by hand is linked to the client of its lead; history and existing links are preserved', { timeout: 120000 }, async t => {
  const db = await setup(); t.after(() => db.close());
  const lead = (await q(db, "insert into crm_leads(company,source,owner_id,created_by) values('Empresa Sintética','test',$1,$1) returning id", [M]))[0].id;
  const other = (await q(db, "insert into crm_leads(company,source,owner_id,created_by) values('Otra Sintética','test',$1,$1) returning id", [M]))[0].id;
  // Project referencing a lead that is NOT a client yet → stays unlinked (nothing invented).
  const early = await project(db, 'Antes del cliente', { operations: { client_lead_id: lead } });
  assert.equal(early.client_id, null);
  // The lead becomes a client → the earlier project is linked automatically; settings untouched.
  const client = (await q(db, "insert into crm_clients(legal_name,source,owner_id,origin_lead_id,created_by) values('Empresa Sintética','test',$1,$2,$1) returning id", [M, lead]))[0].id;
  const row = (await q(db, 'select client_id, settings from os_projects where id=$1', [early.id]))[0];
  assert.equal(row.client_id, client); assert.equal(row.settings.operations.client_lead_id, lead, 'historical reference preserved');
  // New project after the client exists → linked at insert.
  assert.equal((await project(db, 'Después', { operations: { client_lead_id: lead } })).client_id, client);
  // Garbage / unknown lead / no operations → never linked, never an error.
  for (const s of [{ operations: { client_lead_id: 'not-a-uuid' } }, { operations: { client_lead_id: other } }, { operations: 'x' }, {}])
    assert.equal((await project(db, 'Sin vínculo', s)).client_id, null);
  // An explicit client_id is never overwritten by the lead reference.
  const second = (await q(db, "insert into crm_clients(legal_name,source,owner_id,created_by) values('Cliente Distinto','test',$1,$1) returning id", [M]))[0].id;
  const kept = (await q(db, "insert into os_projects(module,name,client_id,settings,created_by) values('website','Explícito',$1,$2::jsonb,$3) returning client_id", [second, JSON.stringify({ operations: { client_lead_id: lead } }), M]))[0];
  assert.equal(kept.client_id, second);
  // Updating the project's settings re-resolves only when client_id is still null.
  const u = await project(db, 'Editado', {}); await db.query("update os_projects set settings=$2::jsonb where id=$1", [u.id, JSON.stringify({ operations: { client_lead_id: lead } })]);
  assert.equal((await q(db, 'select client_id from os_projects where id=$1', [u.id]))[0].client_id, client);
  // Several projects, one company: all point to the same single client (no duplicate company).
  assert.equal((await q(db, 'select count(distinct client_id)::int n from os_projects where client_id=$1', [client]))[0].n, 1);
  assert.equal((await q(db, "select count(*)::int n from crm_clients where lower(legal_name)='empresa sintética'"))[0].n, 1);
});

test('a non-owner cannot link projects or read them', { timeout: 120000 }, async t => {
  const db = await setup(); t.after(() => db.close());
  await db.exec(`reset role;set request.jwt.claim.sub='${O}';set role authenticated;`);
  assert.equal((await q(db, 'select count(*)::int n from os_projects'))[0].n, 0);
  await assert.rejects(db.query("insert into os_projects(module,name,created_by) values('website','x',$1)", [O]), /row-level security|permission|violates/i);
});
