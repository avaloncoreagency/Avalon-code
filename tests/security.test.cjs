// Security regression tests (no network, no secrets). Run: node --test tests/security.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const ts = require('typescript');

function load(file, mocks = {}) {
  const filename = path.resolve(file);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const loaded = { exports: {} };
  const localRequire = id => (id in mocks ? mocks[id] : id === 'server-only' ? {} : require(id));
  new Function('require', 'module', 'exports', source)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const read = f => fs.readFileSync(f, 'utf8');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const src = walk('src').filter(f => /\.(ts|tsx)$/.test(f));

// ─── Rate limiting (R-03) ───────────────────────────────────────────────────
const rl = load('src/lib/security/rate-limit.ts');

test('rate limiter blocks after the limit and recovers after the window', () => {
  let now = 1_000_000;
  const limiter = new rl.SlidingWindowLimiter(100, () => now);
  const rule = { limit: 3, windowMs: 60_000 };
  for (let i = 0; i < 3; i++) assert.equal(limiter.hit('k', rule).allowed, true);
  const blocked = limiter.hit('k', rule);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= 60_000);
  now += 60_001;
  assert.equal(limiter.hit('k', rule).allowed, true);
  limiter.reset('k');
  assert.equal(limiter.hit('k', { limit: 1, windowMs: 1000 }).allowed, true);
});

test('rate limiter keys are hashed and memory is bounded', () => {
  const key = rl.hashKey('login-account', 'Owner@Example.com ');
  assert.match(key, /^login-account:[0-9a-f]{64}$/);
  assert.ok(!key.toLowerCase().includes('example'));
  assert.equal(key, rl.hashKey('login-account', 'owner@example.com'));
  const limiter = new rl.SlidingWindowLimiter(5);
  for (let i = 0; i < 50; i++) limiter.hit(`k${i}`, { limit: 5, windowMs: 60_000 });
  assert.equal(limiter.size(), 5);
});

test('client IP prefers the edge-provided header and is bounded', () => {
  const h = obj => ({ get: n => obj[n] ?? null });
  assert.equal(rl.clientIp(h({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' })), '203.0.113.7');
  assert.equal(rl.clientIp(h({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })), '198.51.100.1');
  assert.equal(rl.clientIp(h({})), 'unknown');
  assert.ok(rl.clientIp(h({ 'x-real-ip': 'x'.repeat(500) })).length <= 64);
});

test('auth actions are throttled before contacting Supabase, with generic errors', () => {
  const login = read('src/app/login/actions.ts');
  assert.ok(login.indexOf('authLimiter.hit') > -1 && login.indexOf('authLimiter.hit') < login.indexOf('signInWithPassword'));
  assert.match(login, /error=throttled/);
  // Wrong password and unknown account produce the same response.
  assert.equal((login.match(/error=invalid/g) || []).length, 2);
  const recovery = read('src/app/admin/password-actions.ts');
  assert.ok(recovery.indexOf('authLimiter.hit') < recovery.indexOf('resetPasswordForEmail'));
  assert.match(recovery, /redirect\("\/admin\/forgot-password\?sent=1"\)/); // same screen when throttled
  assert.match(read('src/app/admin/mfa-actions.ts'), /mfaVerifyPerUser/);
});

// ─── Session cookies (R-04) ─────────────────────────────────────────────────
const ck = load('src/lib/supabase/cookies.ts');

test('session cookies are HttpOnly, Secure in production, SameSite=Lax, host-only, idle-limited', () => {
  const c = ck.hardenSessionCookie({ path: '/x', sameSite: 'none', httpOnly: false, maxAge: 400 * 86400, domain: 'evil.example' }, true);
  assert.equal(c.httpOnly, true);
  assert.equal(c.secure, true);
  assert.equal(c.sameSite, 'lax');
  assert.equal(c.path, '/');
  assert.equal(c.domain, undefined);
  assert.equal(c.maxAge, ck.SESSION_IDLE_SECONDS);
  assert.ok(ck.SESSION_IDLE_SECONDS <= 24 * 3600);
  assert.equal(ck.hardenSessionCookie({ maxAge: 0 }, true).maxAge, 0, 'deletions preserved');
  assert.equal(ck.hardenSessionCookie({}, false).secure, false, 'localhost dev over http');
  for (const f of ['src/lib/supabase/server.ts', 'src/lib/supabase/middleware.ts']) assert.match(read(f), /hardenSessionCookie\(options\)/, f);
  assert.ok(!fs.existsSync('src/lib/supabase/browser.ts'), 'no browser client that would need readable cookies');
});

test('sign-out revokes the session server-side', () => {
  const out = read('src/app/dashboard/actions.ts');
  assert.match(out, /auth\.signOut\(\)/); // default scope: global (all refresh tokens)
  assert.match(out, /redirect\("\/admin\/login"\)/);
});

// ─── Security headers (R-01) ────────────────────────────────────────────────
const hd = load('src/lib/security/headers.ts');

test('security headers: anti-framing, nosniff, enforced minimal CSP, report-only full CSP, HSTS without preload', () => {
  const map = Object.fromEntries(hd.SECURITY_HEADERS.map(h => [h.key.toLowerCase(), h.value]));
  assert.equal(map['x-frame-options'], 'DENY');
  assert.equal(map['x-content-type-options'], 'nosniff');
  assert.match(map['content-security-policy'], /frame-ancestors 'none'/);
  assert.match(map['content-security-policy'], /object-src 'none'/);
  assert.doesNotMatch(map['content-security-policy'], /script-src/, 'script policy stays report-only until validated');
  assert.match(map['content-security-policy-report-only'], /default-src 'self'/);
  assert.match(map['permissions-policy'], /camera=\(\)/);
  assert.match(map['strict-transport-security'], /max-age=\d{8}/);
  assert.doesNotMatch(map['strict-transport-security'], /preload/);
  assert.equal(map['referrer-policy'], 'no-referrer');
  const config = read('next.config.ts');
  assert.match(config, /SECURITY_HEADERS/);
  assert.match(config, /source: "\/:path\*"/);
  assert.match(config, /poweredByHeader: false/);
});

// ─── MFA / authorization state (R-07) ───────────────────────────────────────
function fakeClient({ user = { id: 'u1', app_metadata: { provider: 'email' } }, role = 'owner', aal = { currentLevel: 'aal1', nextLevel: 'aal1' }, userError = null, aalError = null } = {}) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: userError }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: aalError ? null : aal, error: aalError }) },
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: role ? { role } : null, error: null }) }) }) }),
  };
}
const access = load('src/lib/auth/access.ts', { '@/lib/supabase/server': { createClient: async () => { throw new Error('unused'); } }, './policy': load('src/lib/auth/policy.ts') });

test('owner state: owners pass, others fail closed', async () => {
  assert.equal((await access.getOwnerState(fakeClient())).state, 'ok');
  assert.equal((await access.getOwnerState(fakeClient({ role: 'admin' }))).state, 'none', 'admin role grants nothing yet');
  assert.equal((await access.getOwnerState(fakeClient({ role: 'operator' }))).state, 'none');
  assert.equal((await access.getOwnerState(fakeClient({ role: null }))).state, 'none', 'infra account without membership');
  assert.equal((await access.getOwnerState(fakeClient({ user: null }))).state, 'none');
  assert.equal((await access.getOwnerState(fakeClient({ userError: new Error('x') }))).state, 'none');
  assert.equal((await access.getOwnerState(fakeClient({ user: { id: 'u', app_metadata: { provider: 'github' } } }))).state, 'none');
  assert.equal((await access.getOwnerState(fakeClient({ aalError: new Error('x') }))).state, 'none');
});

test('MFA: an owner with a verified factor needs AAL2 before any access', async () => {
  const pending = await access.getOwnerState(fakeClient({ aal: { currentLevel: 'aal1', nextLevel: 'aal2' } }));
  assert.equal(pending.state, 'mfa');
  assert.equal(await access.getAuthorizedOwner(fakeClient({ aal: { currentLevel: 'aal1', nextLevel: 'aal2' } })), null);
  assert.equal((await access.getOwnerState(fakeClient({ aal: { currentLevel: 'aal2', nextLevel: 'aal2' } }))).state, 'ok');
  const mw = read('src/lib/supabase/middleware.ts');
  assert.match(mw, /owner\.state === "mfa"/);
  assert.match(mw, /"\/admin\/mfa"/);
  for (const f of ['src/app/login/actions.ts', 'src/app/admin/auth/callback/route.ts']) assert.match(read(f), /\/admin\/mfa/, f);
  const page = read('src/app/admin/mfa/page.tsx');
  assert.match(page, /owner\.state === "ok"\) redirect\("\/admin\/dashboard"\)/);
  assert.match(page, /owner\.state !== "mfa"\) redirect\("\/admin\/login"\)/);
});

// ─── Authorization coverage ─────────────────────────────────────────────────
const PUBLIC_PAGES = new Set(['login', 'signup', 'forgot-password', 'reset-password', 'mfa'].map(p => path.join('src/app/admin', p, 'page.tsx')));

test('every private admin page verifies the owner on the server', () => {
  for (const file of src.filter(f => f.startsWith(path.join('src', 'app', 'admin')) && f.endsWith('page.tsx'))) {
    if (PUBLIC_PAGES.has(file)) continue;
    const body = read(file);
    assert.ok(/requireOwner\(\)|getOwnerState\(/.test(body) || (/<Suite/.test(body) && !/supabase/.test(body)), `unguarded page: ${file}`);
  }
});

test('every exported server action re-verifies the owner', () => {
  const files = src.filter(f => /actions\.ts$/.test(f) && f.includes(path.join('app', 'admin', 'workspace')));
  assert.ok(files.length >= 6);
  for (const file of files) {
    const body = read(file);
    // Local helpers that verify the owner, directly or through another helper (transitive).
    const fns = [...body.matchAll(/^async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)^\}/gm)].map(m => ({ name: m[1], body: m[2] }));
    const helpers = [];
    for (let changed = true; changed;) {
      changed = false;
      for (const fn of fns) {
        if (helpers.includes(fn.name)) continue;
        if (/ownerForAction\(\)/.test(fn.body) || helpers.some(h => new RegExp(`\\b${h}\\(`).test(fn.body))) { helpers.push(fn.name); changed = true; }
      }
    }
    const exports = body.split(/^export async function /m).slice(1);
    for (const chunk of exports) {
      const name = chunk.slice(0, chunk.indexOf('('));
      const guarded = /ownerForAction\(\)/.test(chunk) || helpers.some(h => new RegExp(`\\b${h}\\(`).test(chunk));
      assert.ok(guarded, `${file} → ${name} does not verify the owner`);
    }
  }
  const mfa = read('src/app/admin/mfa-actions.ts');
  for (const name of ['startTotpEnrollment', 'confirmTotpEnrollment', 'removeTotpFactor']) assert.match(mfa.slice(mfa.indexOf(`function ${name}`)), /getOwnerSession\(\)/, name);
});

test('private route handlers require an owner session; middleware covers /admin and /api', () => {
  for (const file of src.filter(f => f.endsWith('route.ts') && f.includes(path.join('app', 'admin')) && !f.includes(path.join('admin', 'auth')))) {
    assert.match(read(file), /getOwnerSession\(\)/, file);
  }
  const mw = read('src/middleware.ts');
  assert.match(mw, /"\/admin\/:path\*"/);
  assert.match(mw, /"\/api\/:path\*"/);
});

test('no open redirects: auth callbacks use a fixed origin and ignore next/returnTo', () => {
  for (const f of ['src/app/admin/auth/callback/route.ts', 'src/app/admin/auth/confirm/route.ts']) {
    const body = read(f);
    assert.doesNotMatch(body, /searchParams\.get\("(next|returnTo|redirect|redirect_to)"\)/, f);
    assert.match(body, /getAppOrigin\(\)/, f);
  }
  const actions = read('src/lib/os/actions.ts');
  assert.match(actions, /!path\.startsWith\("\/admin\/"\) \|\| path\.startsWith\("\/\/"\)/);
});

// ─── Secrets and supply chain ───────────────────────────────────────────────
test('no privileged keys in application code or public env vars', () => {
  for (const file of src) {
    const body = read(file);
    assert.doesNotMatch(body, /service_role|SERVICE_ROLE|SUPABASE_SECRET/, file);
    assert.doesNotMatch(body, /NEXT_PUBLIC_\w*(SECRET|SERVICE|PRIVATE|TOKEN|PASSWORD)/, file);
  }
  const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n');
  assert.ok(!tracked.some(f => /(^|\/)\.env($|\.(?!example$))/.test(f)), '.env files must not be committed');
});

test('no secret-looking values in tracked files', () => {
  const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(f => f && !/package-lock\.json$|\.(png|jpg|svg|ico|woff2?)$/.test(f) && fs.existsSync(f));
  const patterns = [
    ['JWT', new RegExp('eyJ[A-Za-z0-9_-]{20,}\\.eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}')],
    ['Supabase secret key', new RegExp('sb_' + 'secret_[A-Za-z0-9_-]{16,}')],
    ['private key', new RegExp('-----BEGIN ' + '(RSA |EC |OPENSSH )?PRIVATE KEY-----')],
    ['GitHub token', new RegExp('gh' + '[pousr]_[A-Za-z0-9]{30,}')],
    ['AWS key', new RegExp('AK' + 'IA[0-9A-Z]{16}')],
    ['Stripe live key', new RegExp('sk_' + 'live_[0-9A-Za-z]{16,}')],
    ['Postgres URL with password', new RegExp('postgres(ql)?://[^:\\s]+:[^@\\s]{6,}@(?!localhost)')],
  ];
  for (const file of tracked) {
    const body = read(file);
    for (const [label, re] of patterns) assert.doesNotMatch(body, re, `${label} in ${file}`);
  }
});

test('every migration table has RLS enabled and anon revoked (default privileges grant ALL)', () => {
  const sql = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).map(f => read(path.join('supabase/migrations', f))).join('\n');
  const tables = [...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/gi)].map(m => m[1]);
  assert.ok(tables.length >= 7);
  // Tables hardened in a `foreach t in array array['a','b'] loop ... format('... %I ...', t)` block.
  const looped = { rls: new Set(), anon: new Set() };
  for (const m of sql.matchAll(/foreach t in array array\[([^\]]+)\][\s\S]*?end loop;/gi)) {
    const names = [...m[1].matchAll(/'(\w+)'/g)].map(x => x[1]);
    if (/format\('alter table public\.%I enable row level security'/i.test(m[0])) names.forEach(n => looped.rls.add(n));
    if (/format\('revoke all on public\.%I from anon/i.test(m[0])) names.forEach(n => looped.anon.add(n));
  }
  for (const t of tables) {
    assert.ok(looped.rls.has(t) || new RegExp(`alter table public\\.${t} enable row level security`, 'i').test(sql), `RLS missing on ${t}`);
    assert.ok(looped.anon.has(t) || new RegExp(`revoke [^;]*public\\.${t}[^;]*from anon|revoke all on public\\.${t} from anon`, 'i').test(sql), `anon not revoked on ${t}`);
  }
  // Single reviewed exception: the public quote form RPC (validated, honeypot, SQL-level throttling,
  // creates only pending prospects). Any other anon grant fails this test.
  const anonGrants = [...sql.matchAll(/grant [^;]* to anon[^;]*;/gi)].map(m => m[0]);
  assert.deepEqual(anonGrants, [
    'grant execute on function public.crm_public_inquiry(jsonb) to anon, authenticated;',
    // Reviewed (AI Engine): the single operational control read by the GitHub Actions worker with the publishable key.
    'grant execute on function public.crm_ai_public_control() to anon, authenticated, service_role;',
  ], 'no grants to anon except the reviewed public inquiry and AI control RPCs');
  // The control RPC may expose ONLY these four switches; any other key needs a new review.
  const ctl = fs.readFileSync('supabase/migrations/20261106090000_ai_engine.sql', 'utf8');
  const body = ctl.slice(ctl.indexOf('create function public.crm_ai_public_control()'), ctl.indexOf('revoke all on function public.crm_ai_public_control()'));
  assert.deepEqual([...body.matchAll(/'([a-z_]+)',/g)].map(m => m[1]), ['kill_switch', 'automatic_enabled', 'ai_enabled', 'suspended'], 'crm_ai_public_control exposes only switches');
  assert.doesNotMatch(body, /email|phone|lead|prospect|client|token|secret/i);
  for (const m of sql.matchAll(/security definer([\s\S]*?)\$\$/gi)) assert.match(m[1], /set search_path\s*=\s*''/i, 'SECURITY DEFINER needs empty search_path');
});

test('CI workflows use least-privilege tokens and never run untrusted code with secrets', () => {
  for (const f of fs.readdirSync('.github/workflows')) {
    const wf = read(path.join('.github/workflows', f));
    assert.match(wf, /^permissions:\s*\n\s+contents: read/m, `${f}: top-level read-only permissions`);
    assert.doesNotMatch(wf, /pull_request_target/, `${f}: pull_request_target is not allowed`);
    assert.doesNotMatch(wf, /\$\{\{\s*github\.event\.(pull_request|issue|comment)\.[^}]*(title|body|head_ref)/, `${f}: untrusted input in run step`);
  }
  assert.ok(fs.existsSync('.github/dependabot.yml'));
});
