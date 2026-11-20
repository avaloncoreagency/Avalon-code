// P0.2 — public quote form: server-side human check before the database, values kept on failure, one-time tokens.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const crypto = require('node:crypto');

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

function quoteAction({ human = 'ok', rpc = { data: 'ok', error: null }, allowed = true } = {}) {
  const calls = { rpc: [], human: [] };
  const mod = load('src/app/quote-actions.ts', {
    'next/headers': { headers: async () => new Headers({ 'x-forwarded-for': '198.51.100.7' }) },
    '@/lib/supabase/server': { createClient: async () => ({ rpc: async (name, args) => { calls.rpc.push([name, args]); return rpc; } }) },
    '@/lib/security/rate-limit': { authLimiter: { hit: () => ({ allowed }) }, clientIp: () => '198.51.100.7', hashKey: (...x) => x.join(':') },
    '@/lib/supabase/intake': { createIntakeClient: () => null },
    '@/lib/security/turnstile': { verifyHumanToken: async (token, action) => { calls.human.push([token, action]); return human; } },
  });
  return { requestQuote: mod.requestQuote, calls };
}
const form = (extra = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ company: 'Barbería Sintética', name: 'Ana Prueba', email: 'ana@barberia.example.invalid', phone: '',
    message: 'Necesito una página web con reservas.', language: 'es', 'cf-turnstile-response': 'synthetic-token', ...extra })) f.set(k, v);
  f.append('services', 'website'); f.append('services', 'crm');
  return f;
};

test('a missing or rejected human check never reaches the database and keeps every typed value', async () => {
  const { requestQuote, calls } = quoteAction({ human: 'invalid' });
  const state = await requestQuote({ status: 'idle' }, form());
  assert.equal(state.status, 'human');
  assert.equal(calls.rpc.length, 0, 'no RPC without a verified human');
  assert.deepEqual(calls.human, [['synthetic-token', 'avalon_quote']], 'verified for the quote action, not the login one');
  assert.deepEqual(state.values, { company: 'Barbería Sintética', name: 'Ana Prueba', email: 'ana@barberia.example.invalid', phone: '',
    message: 'Necesito una página web con reservas.', services: ['website', 'crm'] });
  assert.equal(state.attempt, 1);
  assert.ok(!JSON.stringify(state).includes('synthetic-token'), 'the token is never echoed back');
});

test('Cloudflare outage or partial configuration fails closed as unavailable, values preserved', async () => {
  const { requestQuote, calls } = quoteAction({ human: 'unavailable' });
  const state = await requestQuote({ status: 'human', attempt: 1 }, form());
  assert.equal(state.status, 'unavailable');
  assert.equal(calls.rpc.length, 0);
  assert.equal(state.values.message, 'Necesito una página web con reservas.');
  assert.equal(state.attempt, 2, 'each answered submission re-arms the one-time widget');
});

test('a verified human reaches the reviewed RPC once; database answers map to honest states', async () => {
  let { requestQuote, calls } = quoteAction();
  assert.deepEqual(await requestQuote({ status: 'idle' }, form()), { status: 'ok', attempt: 1 });
  assert.equal(calls.rpc.length, 1);
  assert.equal(calls.rpc[0][0], 'crm_public_inquiry');
  assert.ok(!('cf-turnstile-response' in calls.rpc[0][1].request), 'the token is not forwarded to the database');
  for (const [data, expected] of [['throttled', 'throttled'], ['invalid', 'invalid'], ['unavailable', 'unavailable'], ['weird', 'unavailable']]) {
    ({ requestQuote } = quoteAction({ rpc: { data, error: null } }));
    const state = await requestQuote({ status: 'idle' }, form());
    assert.equal(state.status, expected);
    assert.equal(state.values.company, 'Barbería Sintética', `${data}: values kept`);
  }
  ({ requestQuote } = quoteAction({ rpc: { data: null, error: { code: '57014' } } }));
  assert.equal((await requestQuote({ status: 'idle' }, form())).status, 'unavailable', 'a storage error is never reported as ok');
});

test('per-IP throttling answers before Cloudflare or the database are contacted', async () => {
  const { requestQuote, calls } = quoteAction({ allowed: false });
  const state = await requestQuote({ status: 'idle' }, form());
  assert.equal(state.status, 'throttled');
  assert.equal(calls.human.length + calls.rpc.length, 0);
  assert.equal(state.values.email, 'ana@barberia.example.invalid');
});

test('Siteverify accepts a quote token only for the quote action; a login token cannot submit a quote', async () => {
  const gate = load('src/lib/security/turnstile.ts');
  const env = { TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret', TURNSTILE_EXPECTED_HOSTNAME: 'avaloncoreagency.com' };
  const reply = body => async () => ({ ok: true, json: async () => body });
  assert.equal(await gate.verifyHumanToken('t', 'avalon_quote', { env, fetcher: reply({ success: true, hostname: 'avaloncoreagency.com', action: 'avalon_quote' }) }), 'ok');
  assert.equal(await gate.verifyHumanToken('t', 'avalon_quote', { env, fetcher: reply({ success: true, hostname: 'avaloncoreagency.com', action: 'avalon_login' }) }), 'invalid');
  assert.equal(await gate.verifyHumanToken('t', 'avalon_quote', { env, fetcher: reply({ success: true, hostname: 'evil.example', action: 'avalon_quote' }) }), 'invalid');
  assert.equal(await gate.verifyHumanToken('t', 'avalon_quote', { env, fetcher: reply({ success: false, 'error-codes': ['timeout-or-duplicate'] }) }), 'invalid', 'expired or replayed token');
  assert.equal(await gate.verifyHumanToken('', 'avalon_quote', { env }), 'invalid');
  assert.equal(await gate.verifyLoginHuman('t', { env, fetcher: reply({ success: true, hostname: 'avaloncoreagency.com', action: 'avalon_login' }) }), 'ok', 'login unchanged');
  assert.equal(gate.publicTurnstileSiteKey({}), undefined, 'no widget when the server cannot verify');
  assert.equal(gate.publicTurnstileSiteKey({ TURNSTILE_SITE_KEY: 'site' }), undefined, 'partial configuration exposes no widget');
  assert.equal(gate.publicTurnstileSiteKey(env), 'site');
});

test('the form starts the challenge only on an explicit click and re-arms it after each answer', () => {
  const ui = fs.readFileSync('src/components/public/quote-form.tsx', 'utf8');
  assert.match(ui, /<HumanVerification key=\{state\.attempt \?\? 0\} siteKey=\{turnstileSiteKey\} language=\{lang\} action="avalon_quote"/);
  assert.match(ui, /name="cf-turnstile-response" value=\{token\}/);
  for (const field of ['company', 'name', 'email', 'phone', 'message']) assert.match(ui, new RegExp(`defaultValue=\\{v\\?\\.${field}\\}`));
  const widget = fs.readFileSync('src/components/auth/human-verification.tsx', 'utf8');
  assert.match(widget, /if \(attempt === 0 \|\| !scriptReady\) return;/, 'no automatic execution on page load');
});

test('the intake token is a 60-second HS256 JWT for role avalon_intake; disabled without a strong secret', () => {
  const source = ts.transpileModule(fs.readFileSync('src/lib/supabase/intake.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', source)(id => id === 'server-only' ? {} : id === '@supabase/supabase-js' ? { createClient: () => ({}) } : require(id), mod, mod.exports);
  const secret = 'x'.repeat(40);
  const token = mod.exports.signIntakeToken(secret, 1_800_000_000);
  const [h, p, sig] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'HS256', typ: 'JWT' });
  assert.deepEqual(JSON.parse(Buffer.from(p, 'base64url')), { role: 'avalon_intake', iss: 'avalon-intake', iat: 1_800_000_000, exp: 1_800_000_060 });
  assert.equal(sig, crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url'));
  assert.equal(mod.exports.intakeMode({}), 'anon');
  assert.equal(mod.exports.intakeMode({ AVALON_INTAKE_JWT_SECRET: 'short' }), 'anon', 'a weak secret never enables the role path');
  assert.equal(mod.exports.intakeMode({ AVALON_INTAKE_JWT_SECRET: secret }), 'role');
  assert.equal(mod.exports.createIntakeClient({}), null);
});
