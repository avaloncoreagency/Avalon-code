// Regression guard for Security Command Center's register and status semantics.
// No network, environment secrets, or production access required.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const findings = fs.readFileSync('src/lib/security/findings.ts', 'utf8');
const page = fs.readFileSync('src/app/admin/security/page.tsx', 'utf8');

test('risk register covers R-01 through R-25 without duplicates', () => {
  const ids = [...findings.matchAll(/id: "(R-\d{2})"/g)].map(m => m[1]);
  assert.equal(ids.length, 25);
  assert.equal(new Set(ids).size, ids.length);
  for (let n = 1; n <= 25; n++) assert.ok(ids.includes(`R-${String(n).padStart(2, '0')}`));
});

test('counts of open risks exclude implemented-but-unverified findings', () => {
  assert.match(page, /f\.status === "open" \|\| f\.status === "blocked"/);
  assert.match(page, /f\.status === "implemented"/);
  assert.doesNotMatch(page, /f\.status !== "verified" && f\.status !== "accepted"/);
});

test('database connectivity never masquerades as verified RLS', () => {
  assert.match(page, /Conexión OK · RLS no verificado/);
  assert.match(page, /Connection OK · RLS not verified/);
});

test('source date and accepted SQL deny-all cases are explicitly recorded', () => {
  assert.match(findings, /REVIEWED_AT = "2026-11-12"/);
  assert.match(findings, /crm_private\.finance_access/);
  assert.match(findings, /crm_radar_worker_config/);
  assert.match(findings, /pg_net/);
  assert.match(findings, /crm_public_inquiry/);
});
