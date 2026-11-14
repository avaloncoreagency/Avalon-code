const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function loadRateLimit() {
  const out = ts.transpileModule(fs.readFileSync('src/lib/security/rate-limit.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', out)(require, mod, mod.exports);
  return mod.exports;
}
function loadActions(client, authorize) {
  const source = ts.transpileModule(fs.readFileSync('src/app/login/actions.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  const mocks = {
    '@/lib/supabase/server': { createClient: async () => client },
    // Login uses the MFA-aware owner state; a verified owner without MFA is "ok".
    '@/lib/auth/access': { getOwnerState: async c => { const m = await authorize(c); return m ? { state: 'ok', ...m } : { state: 'none' }; } },
    'next/headers': { headers: async () => new Headers() },
    '@/lib/security/rate-limit': loadRateLimit(),
    '@/lib/security/turnstile': { verifyLoginHuman: async () => 'ok' },
    'next/navigation': { redirect: url => { throw Error(url); } },
  };
  new Function('require', 'module', 'exports', source)(id => {
    assert.ok(id in mocks, `Unexpected import: ${id}`);
    return mocks[id];
  }, mod, mod.exports);
  return mod.exports;
}

test('login always renders email/password and cannot initiate Google OAuth', () => {
  const panel = fs.readFileSync('src/components/auth/login-panel.tsx', 'utf8');
  const page = fs.readFileSync('src/app/login/page.tsx', 'utf8');
  assert.match(panel, /name="email"/);
  assert.match(panel, /name="password"/);
  assert.match(panel, /action=\{signIn\}/);
  assert.doesNotMatch(panel, /google|oauth|passwordEnabled/i);
  assert.doesNotMatch(page, /AUTH_PASSWORD_LOGIN_ENABLED|passwordEnabled/);
  assert.match(panel, /forgot-password/);
  assert.match(panel, /aria-pressed=\{showPassword\}/);
});

test('legacy password flag cannot disable login, invitation or recovery flows', () => {
  for (const filename of [
    'src/app/login/actions.ts', 'src/lib/auth/policy.ts',
    'src/app/admin/password-actions.ts', 'src/components/auth/password-page.tsx',
    'src/app/admin/auth/confirm/route.ts',
  ]) assert.doesNotMatch(fs.readFileSync(filename, 'utf8'), /AUTH_PASSWORD_LOGIN_ENABLED/);
});

test('password login normalizes email, preserves password bytes and checks trusted membership', async () => {
  let credentials;
  const client = { auth: { signInWithPassword: async input => { credentials = input; return { error: null }; } } };
  const actions = loadActions(client, async actual => {
    assert.equal(actual, client);
    return { userId: 'synthetic-owner', role: 'owner' };
  });
  const form = new FormData();
  form.set('email', '  OWNER@Example.Invalid  ');
  form.set('password', '  exact synthetic password  ');
  await assert.rejects(actions.signIn(form), /\/admin\/dashboard$/);
  assert.deepEqual(credentials, { email: 'owner@example.invalid', password: '  exact synthetic password  ' });
  assert.equal(actions.signInWithGoogle, undefined);
});
