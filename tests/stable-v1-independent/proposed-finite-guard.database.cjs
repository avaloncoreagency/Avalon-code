'use strict';
// Proposed correction executed ONLY inside this test's disposable DB, never a migration or runtime edit.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { fixture, OWNER } = require('./fixture.cjs');
test('proposed finite-value guard rejects NaN while preserving exact normal amounts', { timeout: 180000 }, async t => {
  const { db, as, one, record } = await fixture(t);
  const source = fs.readFileSync('supabase/migrations/20261119150000_crm_attributed_conversions.sql', 'utf8');
  const definition = source.match(/create function public\.crm_attribution_record\(request jsonb\)[\s\S]*?end \$\$;/)?.[0];
  assert.ok(definition, 'exact existing function must be found');
  const anchor = 'if amt is null or amt <= 0 or excluded < 0 or excluded >= amt or';
  assert.equal(definition.split(anchor).length, 2, 'proposal must match one guard, never silently skip');
  const proposal = definition.replace('create function', 'create or replace function').replace(anchor,
    "if amt::text in ('NaN','Infinity','-Infinity') or excluded::text in ('NaN','Infinity','-Infinity') or amt is null or amt <= 0 or excluded < 0 or excluded >= amt or");
  await db.exec('reset role'); await db.exec(proposal); await as(OWNER);
  for (const value of ['NaN', 'Infinity', '-Infinity']) {
    await assert.rejects(record('QA-FIX-GROSS-' + value, value), /amount_invalid|conversion_invalid/);
    await assert.rejects(record('QA-FIX-EXCLUDED-' + value, '100', value), /amount_invalid|conversion_invalid/);
  }
  assert.equal((await one('select count(*)::int n from crm_attributed_conversions')).n, 0);
  const id = await record('QA-FIX-VALID', '1000.01', '200.01');
  assert.deepEqual(await one('select gross_collected::text gross,excluded_amount::text excluded,commission_due::text due from crm_attributed_conversions where id=$1', [id]),
    { gross: '1000.01', excluded: '200.01', due: '40.00' });
});
