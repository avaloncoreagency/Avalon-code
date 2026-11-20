'use strict';
// Executes the ACTUAL review-only SQL against tiny synthetic functions in disposable PGlite.
// Intentionally does not connect to Supabase. Fresh-role success != reused-role safety.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
async function scenario(existing) {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role authenticator noinherit;
      create table public.qa_private(value text); insert into qa_private values('synthetic');
      create function public.crm_public_inquiry(jsonb) returns text language sql as $$ select 'ok'::text $$;
      create function public.crm_growth_funnel_submit(jsonb) returns text language sql as $$ select 'ok'::text $$;`);
    if (existing) await db.exec('create role avalon_intake nologin; grant select on qa_private to avalon_intake;');
    await db.exec(fs.readFileSync('docs/sql/public-intake-role-review.sql', 'utf8'));
    const row = (await db.query(`select has_table_privilege('avalon_intake','qa_private','select') as private_read,
      pg_has_role('authenticator','avalon_intake','MEMBER') as can_switch,
      has_function_privilege('anon','crm_public_inquiry(jsonb)','EXECUTE') as anon_execute,
      has_function_privilege('authenticated','crm_public_inquiry(jsonb)','EXECUTE') as user_execute`)).rows[0];
    return { existing, ...row, accepted: !row.private_read && row.can_switch && !row.anon_execute && !row.user_execute };
  } finally { await db.close(); }
}
module.exports = { scenario };
if (require.main === module) Promise.all([scenario(false), scenario(true)]).then(results => {
  console.log(JSON.stringify({ kind: 'isolated-PGlite-role-reuse', results }, null, 2));
  if (results.some(r => !r.accepted)) process.exitCode = 1;
}).catch(e => { console.error(e); process.exitCode = 1; });
