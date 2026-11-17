// Static guard over supabase/migrations: every SECURITY DEFINER function that anon/authenticated can execute must be
// owner-gated, token-gated or an explicitly reviewed public endpoint. Mirrors the Supabase Security Advisor findings
// 0028/0029 (production: 6 anon, 38 authenticated, 39 unique) without connecting to any database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { audit, PUBLIC_ALLOWLIST } = require('../scripts/security/definer-audit.cjs');

test('no executable SECURITY DEFINER function is ungated', () => {
  const ungated = audit().filter(r => r.gate === 'ungated').map(r => r.name);
  assert.deepEqual(ungated, [], 'add an owner/token check or a reviewed PUBLIC_ALLOWLIST entry with justification');
});

test('anonymous SECURITY DEFINER surface is exactly the reviewed public endpoints', () => {
  const anon = audit().filter(r => r.anon).map(r => r.name).sort();
  assert.deepEqual(anon, Object.keys(PUBLIC_ALLOWLIST).sort());
});

test('no executable SECURITY DEFINER function builds dynamic SQL', () => {
  assert.deepEqual(audit().filter(r => r.dynamicSql).map(r => r.name), []);
});

test('Core Engine money RPCs are owner-gated and not anonymous', () => {
  const rows = new Map(audit().map(r => [r.name, r]));
  for (const name of ['crm_invoice_record', 'crm_invoice_void', 'crm_payment_verify', 'crm_payment_reverse', 'crm_commission_agree', 'crm_commission_transition']) {
    const r = rows.get(name);
    assert.ok(r, name + ' is executable by authenticated');
    assert.equal(r.gate, 'owner', name);
    assert.equal(r.anon, false, name);
  }
});
