const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');

// Real Next.js + @supabase/ssr over HTTP. Only the remote Google/Auth/Data
// service is synthetic; no production keys, users or database are involved.
test('OAuth PKCE, SSR cookies, owner gate, refresh and logout over HTTP', { timeout: 60000 }, async t => {
  let scenario = 'owner';
  let refreshCount = 0;
  const exchanges = new Map();
  const tokens = new Map();
  const verifierChecks = [];
  const logoutCalls = [];
  const membershipChecks = [];
  let origin;
  function makeSession(kind, expiresIn = 3600) {
    const user = {
      id: kind === 'nonmember' ? '00000000-0000-4000-8000-000000000003' : kind === 'owner2' ? '00000000-0000-4000-8000-000000000002' : '00000000-0000-4000-8000-000000000001',
      aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'google', providers: ['google'] },
      user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z',
    };
    const exp = Math.floor(Date.now() / 1000) + expiresIn;
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const access_token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: user.aud, exp, role: user.role })}.synthetic-signature`;
    tokens.set(access_token, { kind, user });
    return { access_token, refresh_token: `synthetic-refresh-${kind}`, token_type: 'bearer', expires_in: expiresIn, expires_at: exp, user };
  }
  const remote = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (url.pathname === '/auth/v1/authorize') {
      assert.equal(url.searchParams.get('provider'), 'google');
      assert.equal(url.searchParams.get('redirect_to'), origin + '/admin/auth/callback');
      assert.equal(url.searchParams.get('code_challenge_method'), 's256');
      const code = `synthetic-${scenario}-${exchanges.size}`;
      exchanges.set(code, { challenge: url.searchParams.get('code_challenge'), kind: scenario });
      res.writeHead(302, { Location: `${origin}/admin/auth/callback?code=${code}` }); res.end(); return;
    }
    if (url.pathname === '/auth/v1/token') {
      let raw = ''; for await (const part of req) raw += part;
      const body = JSON.parse(raw);
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        refreshCount++;
        return json(200, makeSession(body.refresh_token.replace('synthetic-refresh-', '')));
      }
      assert.equal(url.searchParams.get('grant_type'), 'pkce');
      const exchange = exchanges.get(body.auth_code);
      if (!exchange || !body.code_verifier || createHash('sha256').update(body.code_verifier).digest('base64url') !== exchange.challenge) return json(400, { error: 'invalid_grant', msg: 'Invalid PKCE verifier' });
      exchanges.delete(body.auth_code);
      verifierChecks.push(exchange.kind);
      return json(200, makeSession(exchange.kind));
    }
    const token = req.headers.authorization?.replace('Bearer ', '');
    const identity = tokens.get(token);
    if (url.pathname === '/auth/v1/user') return identity ? json(200, identity.user) : json(401, { message: 'Invalid synthetic identity' });
    if (url.pathname === '/rest/v1/agency_memberships') {
      assert.ok(identity, 'membership query must have an authenticated identity');
      assert.equal(url.searchParams.get('user_id'), `eq.${identity.user.id}`);
      membershipChecks.push(identity.kind);
      return json(200, identity.kind === 'nonmember' ? [] : [{ role: 'owner' }]);
    }
    if (url.pathname === '/auth/v1/logout') {
      logoutCalls.push(url.searchParams.get('scope') ?? 'global');
      tokens.delete(token);
      res.writeHead(204); res.end(); return;
    }
    json(404, { error: 'Unknown synthetic endpoint' });
  });
  await new Promise(resolve => remote.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => remote.close(resolve)));
  const remoteOrigin = `http://127.0.0.1:${remote.address().port}`;
  // Reserve an available local port before starting the real production build.
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  origin = `http://localhost:${port}`;
  const next = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', String(port)], {
    env: { ...process.env, GH_TOKEN: '', GITHUB_TOKEN: '', BRIDGE_GITHUB_TOKEN: '', BRIDGE_VERCEL_TOKEN: '', BRIDGE_SUPABASE_TOKEN: '', APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: remoteOrigin, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-publishable-key', AUTH_PASSWORD_LOGIN_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  next.stdout.on('data', chunk => { output += chunk; });
  next.stderr.on('data', chunk => { output += chunk; });
  t.after(async () => { next.kill(); await new Promise(resolve => next.once('exit', resolve)); });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(origin)).ok) break; } catch { /* Wait for server startup only. */ }
    if (attempt === 99) assert.fail('Next server failed to start: ' + output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  async function check(name, run) { await run(); t.diagnostic("PASS " + name); }
  function actionBody(action) { const data = new FormData(); data.set(action, ""); return data; }
  const jar = new Map();
  async function request(url, options = {}) {
    const response = await fetch(url.startsWith('http') ? url : origin + url, {
      ...options, redirect: 'manual', headers: { cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '), ...options.headers },
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0]; const equals = pair.indexOf('=');
      const key = pair.slice(0, equals), value = pair.slice(equals + 1);
      if (/max-age=0/i.test(cookie) || !value) jar.delete(key); else jar.set(key, value);
    }
    return response;
  }
  function actionId(html) {
    const match = html.match(/name="(\$ACTION_ID_[^"]+)"/);
    assert.ok(match, 'server action form must be present'); return match[1];
  }
  async function startOAuth(kind) {
    scenario = kind;
    const login = await request('/admin/login');
    assert.equal(login.status, 200);
    const action = actionId(await login.text());
    const started = await request('/admin/login', { method: 'POST', headers: { origin }, body: actionBody(action) });
    assert.equal(started.status, 303);
    const authorize = started.headers.get('location');
    assert.equal(new URL(authorize).origin, remoteOrigin);
    assert.ok([...jar.keys()].some(key => key.endsWith('code-verifier')), 'PKCE verifier cookie must reach browser');
    const provider = await request(authorize);
    return provider.headers.get('location');
  }
  await check('signed-out page and API deny access; public page stays accessible', async () => {
    assert.equal((await request('/')).status, 200);
    const denied = await request('/admin/dashboard');
    assert.equal(new URL(denied.headers.get('location'), origin).pathname, '/admin/login');
    assert.equal((await request('/api/private')).status, 401);
    assert.equal((await request('/api/dev-bridge/resume?issue=8&as=samuel')).status, 401);
    assert.equal(new URL((await request('/admin/dev-bridge')).headers.get('location'), origin).pathname, '/admin/login');
  });
  let consumedCallback;
  await check('owner signs in through actual PKCE exchange and SSR cookies', async () => {
    consumedCallback = await startOAuth('owner');
    const callback = await request(consumedCallback);
    assert.equal(new URL(callback.headers.get('location'), origin).pathname, '/admin/dashboard');
    assert.ok([...jar.keys()].some(key => key.endsWith('auth-token')), 'session cookie must be set');
    assert.ok(![...jar.keys()].some(key => key.endsWith('code-verifier')), 'verifier cookie must be consumed');
    const dashboard = await request('/admin/dashboard');
    assert.equal(dashboard.status, 200);
    assert.match(await dashboard.text(), /owner/);
    const bridgePage=await request('/admin/dev-bridge');
    assert.equal(bridgePage.status,200);
    assert.match(await bridgePage.text(),/Dev Bridge/);
    assert.equal((await request('/api/dev-bridge/resume?issue=invalid&as=samuel')).status,400);
    for (const slug of ['crm', 'website-designer', 'ecommerce-designer', 'crm-creator', 'ai-receptionist', 'marketing-hub']) {
      const moduleResponse = await request('/admin/workspace/' + slug);
      assert.equal(moduleResponse.status, 200);
      assert.match(await moduleResponse.text(), /Espacio preparado/);
    }
    assert.equal((await request('/admin/workspace/unknown')).status, 404);
    assert.match(dashboard.headers.get('cache-control'), /no-store/);
    assert.equal(new URL((await request('/admin/login')).headers.get('location'), origin).pathname, '/admin/dashboard');
  });
  await check('expired session refreshes cookies and retains owner access', async () => {
    const key = [...jar.keys()].find(key => key.endsWith('auth-token'));
    const expired = makeSession('owner', -60);
    jar.set(key, 'base64-' + Buffer.from(JSON.stringify(expired)).toString('base64url'));
    const response = await request('/admin/dashboard');
    assert.equal(response.status, 200);
    assert.ok(refreshCount > 0);
    assert.notEqual(jar.get(key), 'base64-' + Buffer.from(JSON.stringify(expired)).toString('base64url'));
  });
  await check('HUD logout removes session and blocks subsequent private requests', async () => {
    const dashboard = await request('/admin/dashboard');
    const action = actionId(await dashboard.text());
    const response = await request('/admin/dashboard', { method: 'POST', headers: { origin }, body: actionBody(action) });
    assert.equal(response.status, 303);
    assert.ok(![...jar.keys()].some(key => key.endsWith('auth-token')));
    assert.equal((await request('/admin/dashboard')).status, 307);
    assert.equal((await request('/api/private')).status, 401);
    assert.equal((await request('/api/dev-bridge/resume?issue=8&as=samuel')).status, 401);
    assert.equal(new URL((await request('/admin/dev-bridge')).headers.get('location'), origin).pathname, '/admin/login');
    assert.ok(logoutCalls.includes('global'));
  });
  await check('second synthetic owner receives identical permissions', async () => {
    const callback = await startOAuth('owner2');
    assert.equal(new URL((await request(callback)).headers.get('location'), origin).pathname, '/admin/dashboard');
    const dashboard = await request('/admin/dashboard');
    assert.equal(dashboard.status, 200);
    const html = await dashboard.text();
    assert.match(html, /owner/);
    assert.equal((await request('/admin/dashboard', { method: 'POST', headers: { origin }, body: actionBody(actionId(html)) })).status, 303);
  });
  await check('callback replay and missing verifier cannot create sessions', async () => {
    assert.match((await request(consumedCallback)).headers.get('location'), /error=callback$/);
    const callback = await startOAuth('owner');
    jar.clear();
    assert.match((await request(callback)).headers.get('location'), /error=callback$/);
    assert.equal((await request('/api/private')).status, 401);
    assert.equal((await request('/api/dev-bridge/resume?issue=8&as=samuel')).status, 401);
    assert.equal(new URL((await request('/admin/dev-bridge')).headers.get('location'), origin).pathname, '/admin/login');
  });
  await check('Google identity without owner membership is signed out and denied', async () => {
    const callback = await startOAuth('nonmember');
    const response = await request(callback);
    assert.match(response.headers.get('location'), /error=unauthorized$/);
    assert.ok(![...jar.keys()].some(key => key.endsWith('auth-token')));
    assert.equal((await request('/admin/dashboard')).status, 307);
    assert.equal((await request('/api/private')).status, 401);
    assert.equal((await request('/api/dev-bridge/resume?issue=8&as=samuel')).status, 401);
    assert.equal(new URL((await request('/admin/dev-bridge')).headers.get('location'), origin).pathname, '/admin/login');
    assert.ok(logoutCalls.includes('local'));
  });
  assert.deepEqual(verifierChecks, ['owner', 'owner2', 'nonmember']);
  assert.ok(membershipChecks.includes('owner') && membershipChecks.includes('nonmember'));
});
