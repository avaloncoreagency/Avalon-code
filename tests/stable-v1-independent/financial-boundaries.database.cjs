'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, OWNER, OTHER } = require('./fixture.cjs');

test('financial RPC rejects non-finite gross without storing a conversion', { timeout: 180000 }, async t => {
  const { one, record, client } = await fixture(t);
  for (const value of ['NaN', 'Infinity', '-Infinity']) {
    await t.test(value, async () => {
      const before = await one('select count(*)::int n from crm_attributed_conversions');
      let failure;
      try { await record('QA-NONFINITE-' + value, value); } catch (error) { failure = error; }
      if (!failure) t.diagnostic(JSON.stringify(await one('select crm_attribution_summary($1) summary', [client])));
      assert.ok(failure, value + ' must be rejected by the database RPC');
      assert.match(failure.message, /amount_invalid|conversion_invalid/);
      assert.deepEqual(await one('select count(*)::int n from crm_attributed_conversions'), before);
    });
  }
});

test('legacy populated upgrade retains legitimate history and disables unaudited transitions', { timeout: 180000 }, async t => {
  const { db, record, row, advance, upgrade } = await fixture(t, true);
  const reported = await record('QA-LEGACY-REPORTED');
  const verified = await record('QA-LEGACY-VERIFIED');
  const paid = await record('QA-LEGACY-PAID');
  for (const id of [verified, paid]) await db.query("select crm_attribution_transition($1,'verified','QA-RECEIPT')", [id]);
  await db.query("select crm_attribution_transition($1,'paid','QA-TRANSFER')", [paid]);
  const before = await Promise.all([reported, verified, paid].map(row));
  await upgrade();
  for (let i = 0; i < before.length; i++) {
    const after = await row(before[i].id);
    for (const key of Object.keys(before[i])) assert.deepEqual(after[key], before[i][key], 'preserve ' + key);
    assert.equal(after.version, 1);
  }
  t.diagnostic('Upgrade preserved all three historical rows and initialized version 1; next check is legitimate legacy progression.');
  await assert.rejects(db.query("select crm_attribution_transition($1,'paid','QA-BYPASS')", [verified]), e => e.code === '42501');
  await assert.rejects(advance(verified, 'paid', 1), /invalid_conversion_transition/);
  await advance(verified, 'invoiced', 1);
  await advance(verified, 'paid', 2);
  assert.equal((await row(verified)).status, 'paid');
  await assert.rejects(advance(paid, 'void', 1), /invalid_conversion_transition/);
});

test('competing stale requests append one event; failed event write rolls back the financial state', { timeout: 180000 }, async t => {
  const { db, record, advance, row, one, as } = await fixture(t);
  const id = await record('QA-COMPETING');
  // PGlite queues these on one connection: verifies stale-request handling, NOT multi-session locking.
  const results = await Promise.allSettled([advance(id, 'client_paid_verified', 1), advance(id, 'client_paid_verified', 1)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, '40001');
  assert.equal((await row(id)).version, 2);
  assert.equal((await one('select count(*)::int n from crm_attribution_events where conversion_id=$1', [id])).n, 1);
  const before = await row(id);
  await db.exec(`reset role;
    create function public.qa_reject_event() returns trigger language plpgsql as $$begin raise exception 'synthetic_event_failure'; end$$;
    create trigger qa_reject_event before insert on crm_attribution_events for each row execute function public.qa_reject_event();`);
  await as(OWNER);
  await assert.rejects(advance(id, 'attribution_verified', 2), /synthetic_event_failure/);
  assert.deepEqual(await row(id), before, 'event failure must roll back all conversion changes');
  await as(OTHER);
  assert.equal((await one('select count(*)::int n from crm_attributed_conversions')).n, 0);
  await assert.rejects(advance(id, 'attribution_verified', 2), e => e.code === '42501');
});
