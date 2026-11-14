// Execute the existing #101 SQL acceptance suite; never connect to a hosted DB.
const {test} = require('node:test');
const fs = require('node:fs');
const {PGlite} = require('@electric-sql/pglite');

test('client workspace: ordered migration chain, shared history, private finance and RLS', {timeout:60000}, async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  // Existing pipeline fixture supplies the two owners, outsider and Acme QA client.
  await db.exec(fs.readFileSync('tests/sql/crm_pipeline.test.sql', 'utf8'));
  await db.exec(fs.readFileSync('tests/sql/client_workspace.test.sql', 'utf8'));
});

test('client workspace acceptance rejects a chain missing its required migration', {timeout:60000}, async t => {
  const assert = require('node:assert/strict');
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql') && f !== '20261103113000_crm_client_workspace.sql').sort()) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  await db.exec(fs.readFileSync('tests/sql/crm_pipeline.test.sql', 'utf8'));
  await assert.rejects(db.exec(fs.readFileSync('tests/sql/client_workspace.test.sql', 'utf8')), error => error.code === '42P01' && /finance_access/.test(error.message));
});
