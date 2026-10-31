const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextRequest } = require('next/server');

// Load the actual TypeScript handlers with isolated Supabase/Next adapters.
function load(file, mocks = {}) {
  const filename = path.resolve(file);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const loaded = { exports: {} };
  const localRequire = id => {
    if (id in mocks) return mocks[id];
    if (id === 'server-only') return {};
    if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), id + '.ts'), mocks);
    return require(id);
  };
  new Function('require', 'module', 'exports', source)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const policy = load('src/lib/auth/policy.ts');
function client({ role = 'owner', user = { id: 'verified-uuid', app_metadata: { provider: 'google' } }, authError = null, membershipError = null } = {}) {
  const calls = [];
  const db = {
    auth: { getUser: async () => ({ data: { user }, error: authError }) },
    from(table) { calls.push(['from', table]); return this; },
    select(columns) { calls.push(['select', columns]); return this; },
    eq(key, value) { calls.push(['eq', key, value]); return this; },
    maybeSingle: async () => ({ data: role === null ? null : { role }, error: membershipError }),
  };
  return { db, calls };
}
const access = load('src/lib/auth/access.ts', { '@/lib/supabase/server': { createClient: async () => { throw Error('Unexpected client creation'); } } });
test('authorization verifies identity, then queries membership by verified UUID', async () => {
  const { db, calls } = client();
  assert.deepEqual(await access.getAuthorizedMember(db), { userId: 'verified-uuid', role: 'owner' });
  assert.deepEqual(calls, [['from', 'agency_memberships'], ['select', 'role'], ['eq', 'user_id', 'verified-uuid']]);
});
for (const [name, options] of Object.entries({ 'signed out': { user: null }, 'invalid identity': { authError: Error('forged token') }, nonmember: { role: null }, admin: { role: 'admin' }, operator: { role: 'operator' }, 'RLS failure': { membershipError: Error('denied') }, 'editable metadata spoof': { user: { id: 'attacker', app_metadata: { provider: 'email' }, user_metadata: { role: 'owner', provider: 'google' } } } })) {
  test(`authorization denies ${name}`, async () => assert.equal(await access.getAuthorizedMember(client(options).db), null));
}
test('callback origin rejects external inputs and non-HTTPS hosts', () => {
  for (const value of ['https://app.test/path', 'https://user:pass@app.test', 'http://app.test', 'javascript:alert(1)', 'https://app.test?next=https://evil.test']) {
    process.env.APP_ORIGIN = value; assert.throws(() => policy.getAppOrigin());
  }
  process.env.APP_ORIGIN = 'http://localhost:3000'; assert.equal(policy.getAppOrigin(), 'http://localhost:3000');
});
function callback({ authorized = true, exchangeError = null } = {}) {
  const calls = [];
  const db = { auth: { exchangeCodeForSession: async code => { calls.push(['exchange', code]); return { error: exchangeError }; }, signOut: async options => { calls.push(['logout', options]); return { error: null }; } } };
  return { calls, handler: load('src/app/admin/auth/callback/route.ts', {
    '@/lib/supabase/server': { createClient: async () => db },
    '@/lib/auth/access': { getAuthorizedMember: async () => authorized ? { role: 'owner' } : null },
    '@/lib/auth/policy': policy,
  }).GET };
}
test('callback exchanges PKCE code and ignores malicious return destinations/host', async () => {
  process.env.APP_ORIGIN = 'http://localhost:3000';
  const { calls, handler } = callback();
  const result = await handler(new NextRequest('https://attacker.test/admin/auth/callback?code=synthetic&next=https://evil.test', { headers: { 'x-forwarded-host': 'evil.test' } }));
  assert.equal(result.headers.get('location'), 'http://localhost:3000/admin/dashboard');
  assert.deepEqual(calls, [['exchange', 'synthetic']]);
  assert.match(result.headers.get('cache-control'), /no-store/);
});
test('callback rejects nonmembers and closes their session', async () => {
  const { calls, handler } = callback({ authorized: false });
  const result = await handler(new NextRequest('http://localhost:3000/admin/auth/callback?code=synthetic'));
  assert.match(result.headers.get('location'), /error=unauthorized$/);
  assert.deepEqual(calls[1], ['logout', { scope: 'local' }]);
});
test('callback rejects missing code, provider failure and failed exchange', async () => {
  for (const query of ['', '?error=access_denied&code=synthetic', '?code=synthetic']) {
    const { handler } = callback({ exchangeError: Error('invalid PKCE') });
    const result = await handler(new NextRequest('http://localhost:3000/admin/auth/callback' + query));
    assert.match(result.headers.get('location'), /error=callback$/);
  }
});
function middleware(authorized) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'synthetic';
  return load('src/lib/supabase/middleware.ts', {
    '@supabase/ssr': { createServerClient: (_url, _key, options) => { options.cookies.setAll([{ name: 'refreshed', value: 'synthetic', options: { httpOnly: true } }]); return {}; } },
    '@/lib/auth/access': { getAuthorizedMember: async () => authorized ? { role: 'owner' } : null },
  }).updateSession;
}
test('middleware blocks every private page and API, preserving refreshed cookies', async () => {
  for (const route of ['/admin/dashboard', '/admin/crm', '/admin/login/nested', '/admin/auth/callback/nested', '/api/private', '/api/admin/test', '/dashboard/crm']) {
    const result = await middleware(false)(new NextRequest('http://localhost:3000' + route));
    if (route.startsWith('/api/')) assert.equal(result.status, 401);
    else assert.equal(result.headers.get('location'), 'http://localhost:3000/admin/login');
    assert.equal(result.cookies.get('refreshed').value, 'synthetic');
    assert.match(result.headers.get('cache-control'), /no-store/);
  }
});
test('middleware permits login/callback, allows owners, redirects signed-in owner', async () => {
  for (const route of ['/admin/login', '/admin/auth/callback']) assert.equal((await middleware(false)(new NextRequest('http://localhost:3000' + route))).status, 200);
  assert.equal((await middleware(true)(new NextRequest('http://localhost:3000/admin/dashboard'))).status, 200);
  assert.match((await middleware(true)(new NextRequest('http://localhost:3000/admin/login'))).headers.get('location'), /admin\/dashboard$/);
});
test('legacy GET redirects while dashboard POST logout remains available', async () => {
  assert.match((await middleware(true)(new NextRequest('http://localhost:3000/login'))).headers.get('location'), /admin\/login$/);
  assert.match((await middleware(true)(new NextRequest('http://localhost:3000/dashboard'))).headers.get('location'), /admin\/dashboard$/);
  assert.equal((await middleware(true)(new NextRequest('http://localhost:3000/dashboard', { method: 'POST' }))).status, 200);
});
test('existing logout calls Supabase signOut before redirecting', async () => {
  let signedOut = false;
  const action = load('src/app/dashboard/actions.ts', {
    '@/lib/supabase/server': { createClient: async () => ({ auth: { signOut: async () => { signedOut = true; } } }) },
    'next/navigation': { redirect: location => { assert.equal(signedOut, true); throw Error(location); } },
  });
  await assert.rejects(action.signOut(), /\/login/);
});
test('password server action is disabled by default even when invoked directly', async () => {
  delete process.env.AUTH_PASSWORD_LOGIN_ENABLED;
  const actions = load('src/app/login/actions.ts', {
    '@/lib/supabase/server': {}, '@/lib/auth/access': {}, '@/lib/auth/policy': policy,
    'next/navigation': { redirect: location => { throw Error(location); } },
  });
  await assert.rejects(actions.signIn(new FormData()), /error=disabled/);
});
test('Google action uses the configured callback and server-side OAuth redirect', async () => {
  process.env.APP_ORIGIN = 'http://localhost:3000';
  const actions = load('src/app/login/actions.ts', {
    '@/lib/supabase/server': { createClient: async () => ({ auth: { signInWithOAuth: async args => {
      assert.equal(args.provider, 'google');
      assert.equal(args.options.redirectTo, 'http://localhost:3000/admin/auth/callback');
      return { data: { url: 'https://example.supabase.co/auth/v1/authorize?provider=google' }, error: null };
    } } }) },
    '@/lib/auth/access': {}, '@/lib/auth/policy': policy,
    'next/navigation': { redirect: location => { throw Error(location); } },
  });
  await assert.rejects(actions.signInWithGoogle(), /https:\/\/example.supabase.co\/auth\/v1\/authorize/);
});

 test('callback returns a clear uncached 503 when application origin is missing', async () => {
  const saved = process.env.APP_ORIGIN;
  delete process.env.APP_ORIGIN;
  try {
    const { handler } = callback();
    const result = await handler(new NextRequest('http://localhost:3000/admin/auth/callback?code=synthetic'));
    assert.equal(result.status, 503);
    assert.match(result.headers.get('cache-control'), /no-store/);
    assert.equal(result.headers.get('location'), null);
  } finally { process.env.APP_ORIGIN = saved; }
});
