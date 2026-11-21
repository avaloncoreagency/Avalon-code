'use strict';
// Independent execution of the current token-wrapper SQL. Synthetic in-memory DB only.
const fs = require('node:fs'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
async function probe() {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema crm_private;
      create table qa_private(value text); insert into qa_private values('synthetic');
      create function crm_public_inquiry(jsonb) returns text language sql as $$ select 'ok'::text $$;
      create function crm_growth_funnel_submit(jsonb) returns text language sql as $$ select 'ok'::text $$;`);
    await db.exec(fs.readFileSync('docs/sql/public-intake-role-review.sql','utf8'));
    const token = 'synthetic-revocable-token-00000000000000000';
    await db.query('insert into crm_private.intake_tokens(token_sha256) values($1)', [crypto.createHash('sha256').update(token).digest('hex')]);
    const call = async (name, value) => {
      await db.exec('set role anon');
      try { return (await db.query(`select ${name}('{}'::jsonb,$1) r`, [value])).rows[0].r; }
      finally { await db.exec('reset role'); }
    };
    for (const fn of ['crm_public_intake','crm_public_funnel_intake']) {
      for (const bad of [null, '', 'short', 'x'.repeat(40), 'x'.repeat(257)]) assert.equal(await call(fn,bad),'unavailable');
      assert.equal(await call(fn,token),'ok');
    }
    await db.exec('set role anon');
    for (const fn of ['crm_public_inquiry','crm_growth_funnel_submit']) await assert.rejects(db.query(`select ${fn}('{}'::jsonb)`), /permission denied/);
    await assert.rejects(db.query('select * from qa_private'),/permission denied/);
    await assert.rejects(db.query('select * from crm_private.intake_tokens'),/permission denied/);
    await db.exec('reset role; update crm_private.intake_tokens set revoked_at=now()');
    assert.equal(await call('crm_public_intake',token),'unavailable');
    assert.equal(await call('crm_public_funnel_intake',token),'unavailable');
    console.log('PASS: both wrappers deny bad/revoked tokens and direct anonymous RPC access; token hash/private rows denied');
  } finally { await db.close(); }
}
if (require.main === module) probe().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { probe };
