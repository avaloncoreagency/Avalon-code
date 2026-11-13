// Operation Phoenix: after the FULL migration chain, os_projects must accept every module the UI offers (incl. chatbots).
// Guards against a later migration re-creating os_projects_module_check and silently dropping a module.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

test('os_projects_module_check allows every Avalon module after the full chain', { timeout: 120000 }, async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort())
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
  const def = (await db.query("select pg_get_constraintdef(oid) d from pg_constraint where conname = 'os_projects_module_check'")).rows[0].d;
  for (const m of ['website', 'ecommerce', 'crm_creator', 'receptionist', 'marketing', 'apps', 'chatbots'])
    assert.match(def, new RegExp(`'${m}'`), `module ${m} must be allowed`);
});
