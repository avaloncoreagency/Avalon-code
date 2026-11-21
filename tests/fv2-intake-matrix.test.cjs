// Final Validation 2.0 — public form security matrix, gaps not covered elsewhere (unit level, mocked network).
// Author: Claude Code (implementation owner) — not an independent QA result.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', source)(id => {
    if (id in mocks) return mocks[id];
    if (id === 'server-only') return {};
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'), mocks);
    return require(id);
  }, mod, mod.exports);
  return mod.exports;
}
const gate = load('src/lib/security/turnstile.ts');
const env = { TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret', TURNSTILE_EXPECTED_HOSTNAME: 'avaloncoreagency.com' };

test('Cloudflare failures fail closed as unavailable, never as ok (#8 Cloudflare error)', async () => {
  const cases = [
    ['network error', async () => { throw new TypeError('fetch failed'); }],
    ['timeout', async () => { throw Object.assign(new Error('aborted'), { name: 'TimeoutError' }); }],
    ['HTTP 500', async () => ({ ok: false, json: async () => ({}) })],
    ['non-JSON body', async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } })],
    ['null body', async () => ({ ok: true, json: async () => null })],
  ];
  for (const [label, fetcher] of cases)
    assert.equal(await gate.verifyHumanToken('t', 'avalon_quote', { env, fetcher }), 'unavailable', label);
});

test('token shape, action and hostname are exact (#2 #3 #6 #7)', async () => {
  const ok = body => async () => ({ ok: true, json: async () => body });
  assert.equal(await gate.verifyHumanToken(null, 'avalon_funnel', { env }), 'invalid', 'missing');
  assert.equal(await gate.verifyHumanToken('x'.repeat(2049), 'avalon_funnel', { env }), 'invalid', 'oversized token never sent');
  assert.equal(await gate.verifyHumanToken('t', 'avalon_funnel', { env, fetcher: ok({ success: true, action: 'avalon_quote', hostname: 'avaloncoreagency.com' }) }), 'invalid', 'quote token on funnel');
  assert.equal(await gate.verifyHumanToken('t', 'avalon_funnel', { env, fetcher: ok({ success: true, action: 'avalon_funnel', hostname: 'avaloncoreagency.com.evil.example' }) }), 'invalid', 'suffix hostname');
  assert.equal(await gate.verifyHumanToken('t', 'avalon_funnel', { env, fetcher: ok({ success: true, action: 'avalon_funnel', hostname: 'AVALONCOREAGENCY.COM' }) }), 'ok', 'case-insensitive exact host');
  assert.equal(await gate.verifyHumanToken('t', 'avalon_funnel', { env: { ...env, TURNSTILE_EXPECTED_HOSTNAME: '' }, fetcher: ok({ success: true }) }), 'unavailable', 'no expected host configured fails closed');
});

test('the intake token never reaches browser code (#10)', () => {
  const clientFiles = [];
  const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name)) clientFiles.push(p); } };
  walk('src');
  const browser = clientFiles.filter(f => /^\s*["']use client["']/.test(fs.readFileSync(f, 'utf8')));
  assert.ok(browser.length > 10, 'client components found');
  for (const f of browser) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /AVALON_INTAKE_TOKEN|intakeCall|supabase\/intake/, f + ' must not touch the intake token');
  assert.match(fs.readFileSync('src/lib/supabase/intake.ts', 'utf8'), /^import "server-only";/, 'intake helper is server-only');
});

test('the quote form works in English and keeps typed values; the token is never echoed (#15 #16)', async () => {
  const calls = [];
  const mod = load('src/app/quote-actions.ts', {
    'next/headers': { headers: async () => new Headers() },
    '@/lib/supabase/server': { createClient: async () => ({ rpc: async (name, args) => { calls.push(args.request); return { data: 'ok', error: null }; } }) },
    '@/lib/security/rate-limit': { authLimiter: { hit: () => ({ allowed: true }) }, clientIp: () => '198.51.100.8', hashKey: (...x) => x.join(':') },
    '@/lib/supabase/intake': load('src/lib/supabase/intake.ts'),
    '@/lib/security/turnstile': { verifyHumanToken: async () => 'invalid' },
  });
  const f = new FormData();
  for (const [k, v] of Object.entries({ company: 'Synthetic Co', name: 'Jane Test', email: 'jane@example.invalid', phone: '', message: 'We need a booking website.', language: 'en', 'cf-turnstile-response': 'tok-secret-123' })) f.set(k, v);
  const state = await mod.requestQuote({ status: 'idle' }, f);
  assert.equal(state.status, 'human');
  assert.equal(state.values.message, 'We need a booking website.');
  assert.ok(!JSON.stringify(state).includes('tok-secret-123'));
  assert.equal(calls.length, 0);
  const ui = fs.readFileSync('src/components/public/quote-form.tsx', 'utf8');
  assert.match(ui, /Before sending, tap “Verify I am human”/, 'English recovery message');
});
