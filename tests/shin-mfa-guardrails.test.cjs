// SHIN: focused, network-free MFA and fail-closed middleware regressions.
// Uses only synthetic auth state; no Supabase users, secrets or database writes.
// Run: node --test tests/shin-mfa-guardrails.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextRequest } = require('next/server');

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://isolated.example.invalid';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'synthetic-public-test-key';

function middlewareWith(ownerState) {
  // Exercise the real middleware, substituting only the external Auth service.
  const filename = path.resolve('src/lib/supabase/middleware.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mocks = {
    '@supabase/ssr': { createServerClient: () => ({}) },
    '@/lib/auth/access': {
      getOwnerState: async () => {
        if (ownerState === 'throws') throw new Error('synthetic auth outage');
        return ownerState;
      },
    },
    './cookies': { hardenSessionCookie: options => options },
  };
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', source)(
    id => Object.prototype.hasOwnProperty.call(mocks, id) ? mocks[id] : require(id),
    loaded,
    loaded.exports,
  );
  return loaded.exports.updateSession;
}

const request = route => new NextRequest('http://localhost:3000' + route);
function assertPrivateResponse(response) {
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
}
function redirectPath(response) {
  assert.ok(response.headers.get('location'), 'expected redirect location');
  return new URL(response.headers.get('location')).pathname;
}

test('MFA-pending owner cannot read API or dashboard until the second factor is complete', async () => {
  const middleware = middlewareWith({
    state: 'mfa',
    userId: '00000000-0000-4000-8000-000000000001',
    user: { id: '00000000-0000-4000-8000-000000000001' },
  });
  const api = await middleware(request('/api/private'));
  assert.equal(api.status, 401);
  assert.deepEqual(await api.json(), { error: 'MFA required' });
  assertPrivateResponse(api);

  for (const route of ['/admin/dashboard', '/admin/workspace/crm/tasks', '/admin/login']) {
    const response = await middleware(request(route));
    assert.equal(redirectPath(response), '/admin/mfa', route);
    assertPrivateResponse(response);
  }

  const challenge = await middleware(request('/admin/mfa'));
  assert.equal(challenge.status, 200);
  assertPrivateResponse(challenge);
});

test('missing identity or an Auth outage fails closed without exposing private routes', async () => {
  for (const ownerState of [{ state: 'none' }, 'throws']) {
    const middleware = middlewareWith(ownerState);
    const api = await middleware(request('/api/private'));
    assert.equal(api.status, 401);
    assert.deepEqual(await api.json(), { error: 'Unauthorized' });
    assertPrivateResponse(api);

    const dashboard = await middleware(request('/admin/dashboard'));
    assert.equal(redirectPath(dashboard), '/admin/login');
    assertPrivateResponse(dashboard);

    const challenge = await middleware(request('/admin/mfa'));
    assert.equal(redirectPath(challenge), '/admin/login');
  }
});
