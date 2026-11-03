'use strict';

// REN integration gate for PR #82 after Client 360 landed on main via PR #101.
// Regression test only: the owners of Client 360 must reconcile its implementation.
// Source-level checks do not replace authorization / browser E2E.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const page = fs.readFileSync('src/app/admin/workspace/crm/clients/[id]/page.tsx', 'utf8');
const workspace = fs.readFileSync('src/components/sales/client-workspace.tsx', 'utf8');

test('Client 360 parent preserves the finance visibility contract from merged main', () => {
  assert.match(page, /<ClientWorkspace\b[^>]*financeAllowed=\{financeAllowed\}/s,
    'Pass financeAllowed explicitly; otherwise the older PR #82 can restore unrestricted client financial UI.');
  assert.match(page, /\{financeAllowed\s*&&/,
    'Hide customer monetary totals when finance authorization is not granted.');
  assert.match(page, /\{!financeAllowed\s*\?/,
    'Non-finance owners must receive the restricted-view notice.');
});

test('Client 360 child skips private financial reads and displays for restricted viewers', () => {
  assert.match(workspace, /financeAllowed:\s*boolean/,
    'ClientWorkspace must require the authorization flag from its owner-only parent.');
  assert.match(workspace, /financeAllowed\s*\?\s*run<Cost\[\]>/,
    'Do not fetch the finance cost ledger for a viewer lacking finance access.');
  assert.match(workspace, /\{financeAllowed\s*&&/,
    'Financial totals and cost panels must remain conditional.');
});
