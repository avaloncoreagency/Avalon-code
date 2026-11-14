const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function policyModule() {
  const source = fs.readFileSync('src/components/suite/poll-policy.ts', 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', js)(exports);
  return exports;
}

test('polling cadence halves steady-state background requests with a short focus debounce', () => {
  const p = policyModule();
  assert.equal(p.SUITE_POLL_INTERVAL_MS, 60_000);
  assert.equal(p.SUITE_FOCUS_DEBOUNCE_MS, 15_000);
  const now = 100_000;
  assert.equal(p.shouldRefreshNow(0, now, true), true);
  assert.equal(p.shouldRefreshNow(now - 14_999, now, true), false);
  assert.equal(p.shouldRefreshNow(now - 15_000, now, true), true);
  assert.equal(p.shouldRefreshNow(now - 60_000, now, false), false);
  assert.equal(p.shouldRefreshNow(now + 10_000, now, true), true, 'clock correction does not permanently block refresh');
  assert.equal(p.shouldRefreshNow(now, NaN, true), false);
});

test('both private status feeds apply the same cadence and stay focused on the signed-in page', () => {
  const source = fs.readFileSync('src/components/suite/chrome.tsx', 'utf8');
  assert.equal((source.match(/window\.setInterval\(/g) ?? []).length, 2);
  assert.equal((source.match(/SUITE_POLL_INTERVAL_MS\)/g) ?? []).length, 2);
  assert.match(source, /shouldRefreshNow\(inboxLastAttemptAt\.current/);
  assert.match(source, /shouldRefreshNow\(presenceLastAttemptAt\.current/);
  assert.match(source, /void refresh\(\);/);
  assert.match(source, /void update\(\);/);
  assert.doesNotMatch(source, /setInterval[\s\S]{0,120}30000/, 'no old 30-second loops');
});
