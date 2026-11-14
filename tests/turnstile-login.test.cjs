const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');

function load(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
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
const configured = {
  TURNSTILE_SITE_KEY: 'synthetic-site',
  TURNSTILE_SECRET_KEY: 'synthetic-server-only-secret',
  TURNSTILE_EXPECTED_HOSTNAME: 'avaloncoreagency.com',
};
const response = (result, ok = true) => ({ ok, json: async () => result });
const good = { success: true, hostname: 'avaloncoreagency.com', action: 'avalon_login' };

test('Turnstile only enables when both keys are configured; partial config blocks', async () => {
  assert.equal(gate.turnstileStatus({}), 'disabled');
  assert.equal(gate.turnstileStatus(configured), 'enabled');
  assert.equal(gate.turnstileStatus({ TURNSTILE_SITE_KEY: 'site' }), 'misconfigured');
  assert.equal(gate.turnstileStatus({ TURNSTILE_SECRET_KEY: 'secret' }), 'misconfigured');
  assert.equal(await gate.verifyLoginHuman(null, { env: {} }), 'ok', 'legacy rollout does not lock out owners before keys are installed');
  for (const env of [{ TURNSTILE_SITE_KEY: 'site' }, { TURNSTILE_SECRET_KEY: 'secret' }]) {
    assert.equal(await gate.verifyLoginHuman('arbitrary', { env, fetcher: () => { throw Error('should not fetch'); } }), 'unavailable');
  }
});

test('missing, forged, oversized or non-string tokens never contact Cloudflare', async () => {
  let calls = 0;
  const options = { env: configured, fetcher: async () => { calls++; return response(good); } };
  for (const token of [null, '', 'x'.repeat(2049), { name: 'x' }]) {
    assert.equal(await gate.verifyLoginHuman(token, options), 'invalid');
  }
  assert.equal(calls, 0);
});

test('server sends only an accepted token to siteverify, not email or password', async () => {
  const calls = [];
  const result = await gate.verifyLoginHuman('synthetic-human-token', {
    env: configured,
    fetcher: async (url, init) => { calls.push({ url, init }); return response(good); },
  });
  assert.equal(result, 'ok');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.cache, 'no-store');
  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get('secret'), configured.TURNSTILE_SECRET_KEY);
  assert.equal(body.get('response'), 'synthetic-human-token');
  assert.equal(body.has('email'), false);
  assert.equal(body.has('password'), false);
  assert.ok(calls[0].init.signal);
});

test('failed/expired/replayed tokens, wrong action or wrong hostname deny login', async () => {
  const candidates = [
    { success: false, 'error-codes': ['timeout-or-duplicate'] },
    { success: false, 'error-codes': ['invalid-input-response'] },
    { success: true, hostname: 'avaloncoreagency.com.evil.invalid', action: 'avalon_login' },
    { success: true, hostname: 'evil.invalid', action: 'avalon_login' },
    { success: true, hostname: 'avaloncoreagency.com', action: 'other_action' },
    { success: true, hostname: 'avaloncoreagency.com' },
    { success: 'true', hostname: 'avaloncoreagency.com', action: 'avalon_login' },
  ];
  for (const result of candidates) {
    assert.equal(await gate.verifyLoginHuman('token', { env: configured, fetcher: async () => response(result) }), 'invalid');
  }
});

test('fail closed on network outage, 429, malformed responses, or missing hostname setting', async () => {
  assert.equal(await gate.verifyLoginHuman('token', { env: configured, fetcher: async () => { throw Error('offline'); } }), 'unavailable');
  assert.equal(await gate.verifyLoginHuman('token', { env: configured, fetcher: async () => response({}, false) }), 'unavailable');
  assert.equal(await gate.verifyLoginHuman('token', { env: configured, fetcher: async () => response(null) }), 'unavailable');
  assert.equal(await gate.verifyLoginHuman('token', { env: { ...configured, TURNSTILE_EXPECTED_HOSTNAME: '' } }), 'unavailable');
});

test('login server action verifies human before requesting Supabase credentials', async () => {
  let supabaseCalls = 0, verified = false;
  const action = load('src/app/login/actions.ts', {
    '@/lib/supabase/server': { createClient: async () => { supabaseCalls++; throw Error('Supabase must not be called'); } },
    '@/lib/auth/access': { getOwnerState: async () => ({ state: 'none' }) },
    '@/lib/security/turnstile': { verifyLoginHuman: async () => { verified = true; return 'invalid'; } },
    '@/lib/security/rate-limit': {
      AUTH_RULES: { loginPerIp: {limit:100,windowMs:60000}, loginPerAccount: {limit:100,windowMs:60000} },
      authLimiter: { hit: () => ({ allowed: true }) },
      clientIp: () => 'synthetic-test-ip', hashKey: (scope, value) => scope + ':' + value,
    },
    'next/navigation': { redirect: url => { throw Error(url); } },
    'next/headers': { headers: async () => new Headers() },
  });
  const form = new FormData();
  form.set('email', 'fake@example.invalid');
  form.set('password', 'synthetic-password');
  await assert.rejects(action.signIn(form), /error=human$/);
  assert.equal(verified, true);
  assert.equal(supabaseCalls, 0);
});

test('Turnstile widget and Content-Security-Policy support Cloudflare without weakening framing', () => {
  const login = fs.readFileSync('src/components/auth/login-panel.tsx', 'utf8');
  const page = fs.readFileSync('src/app/login/page.tsx', 'utf8');
  const csp = fs.readFileSync('src/lib/security/headers.ts', 'utf8');
  assert.match(login, /data-action="avalon_login"/);
  assert.match(login, /data-sitekey=\{turnstileSiteKey\}/);
  assert.match(login, /api\.js/);
  assert.match(page, /TURNSTILE_SITE_KEY/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /frame-src https:\/\/challenges\.cloudflare\.com/);
});
