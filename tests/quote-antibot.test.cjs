// P0.2 — public quote form: server-side human check before the database, values kept on failure, one-time tokens.
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

function quoteAction({ human = 'ok', rpc = { data: 'ok', error: null }, allowed = true } = {}) {
  const calls = { rpc: [], human: [] };
  const mod = load('src/app/quote-actions.ts', {
    'next/headers': { headers: async () => new Headers({ 'x-forwarded-for': '198.51.100.7' }) },
    '@/lib/supabase/server': { createClient: async () => ({ rpc: async (name, args) => { calls.rpc.push([name, args]); return rpc; } }) },
    '@/lib/security/rate-limit': { authLimiter: { hit: () => ({ allowed }) }, clientIp: () => '198.51.100.7', hashKey: (...x) => x.join(':') },
    '@/lib/supabase/intake': load('src/lib/supabase/intake.ts'),
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

test('the intake call is token-gated only when a strong server token exists; the token never leaves the server call', () => {
  const intake = load('src/lib/supabase/intake.ts');
  const token = 'x'.repeat(40);
  assert.deepEqual(intake.intakeCall('inquiry', { a: 1 }, {}), { fn: 'crm_public_inquiry', args: { request: { a: 1 } } });
  assert.deepEqual(intake.intakeCall('funnel', { a: 1 }, {}), { fn: 'crm_growth_funnel_submit', args: { request: { a: 1 } } });
  assert.equal(intake.intakeMode({ AVALON_INTAKE_TOKEN: 'short' }), 'direct', 'a weak token never enables the gate');
  assert.deepEqual(intake.intakeCall('inquiry', { a: 1 }, { AVALON_INTAKE_TOKEN: token }), { fn: 'crm_public_intake', args: { request: { a: 1 }, p_token: token } });
  assert.deepEqual(intake.intakeCall('funnel', { a: 1 }, { AVALON_INTAKE_TOKEN: ` ${token} ` }), { fn: 'crm_public_funnel_intake', args: { request: { a: 1 }, p_token: token } });
  assert.doesNotMatch(fs.readFileSync('src/lib/supabase/intake.ts', 'utf8'), /NEXT_PUBLIC_|createHmac|node:crypto/, 'no public env and no token signing');
});

// FV-001 (Codex #295): the funnel must not reach the intake client or RPC unless the server human check passes.
function funnelAction({ human = 'ok', rpc = { data: 'ok', error: null } } = {}) {
  const calls = { client: 0, rpc: [], human: [] };
  const mod = load('src/app/f/[slug]/actions.ts', {
    'next/headers': { headers: async () => new Headers({ 'x-forwarded-for': '198.51.100.9' }) },
    '@/lib/supabase/server': { createClient: async () => { calls.client++; return { rpc: async (name, args) => { calls.rpc.push([name, args]); return rpc; } }; } },
    '@/lib/security/rate-limit': { authLimiter: { hit: () => ({ allowed: true }) }, clientIp: () => '198.51.100.9', hashKey: (...x) => x.join(':') },
    '@/lib/supabase/intake': load('src/lib/supabase/intake.ts'),
    '@/lib/growth/funnel': { validSlug: s => /^[a-z0-9-]{3,60}$/.test(s) },
    '@/lib/security/turnstile': { verifyHumanToken: async (token, action) => { calls.human.push([token, action]); return typeof human === 'function' ? human(token) : human; } },
  });
  return { submitFunnel: mod.submitFunnel, calls };
}
const funnelForm = (token) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ slug: 'barberia-sintetica', company: 'Barbería Sintética', name: 'Ana Prueba', email: 'ana@barberia.example.invalid',
    phone: '', message: 'Quiero reservas en línea para mi barbería.', consent: 'yes', consent_version: 'v1', website_url: '' })) f.set(k, v);
  if (token !== undefined) f.set('cf-turnstile-response', token);
  return f;
};

test('FV-001: missing, invalid, expired, replayed or unverifiable funnel challenges never reach the intake client or RPC', async () => {
  const scenarios = [['missing', undefined, 'invalid', 'human'], ['invalid', 'tok-forged', 'invalid', 'human'], ['expired', 'tok-expired', 'invalid', 'human'],
    ['replayed', 'tok-replayed', 'invalid', 'human'], ['provider unavailable', 'tok-provider-down', 'unavailable', 'unavailable']];
  for (const [label, token, verdict, expected] of scenarios) {
    const { submitFunnel, calls } = funnelAction({ human: verdict });
    const state = await submitFunnel({ status: 'idle' }, funnelForm(token));
    assert.equal(state.status, expected, label);
    assert.equal(calls.client, 0, `${label}: no database client created`);
    assert.equal(calls.rpc.length, 0, `${label}: no RPC`);
    assert.equal(calls.human[0][1], 'avalon_funnel', `${label}: funnel-specific action`);
    assert.equal(state.values.message, 'Quiero reservas en línea para mi barbería.', `${label}: typed values kept`);
    assert.ok(!JSON.stringify(state).includes(token ?? '\u0000'), `${label}: token never echoed`);
  }
});

test('FV-001: a verified funnel submission reaches the intake once and never forwards the token', async () => {
  const { submitFunnel, calls } = funnelAction();
  assert.deepEqual(await submitFunnel({ status: 'idle' }, funnelForm('good-token')), { status: 'ok', attempt: 1 });
  assert.equal(calls.rpc.length, 1);
  assert.equal(calls.rpc[0][0], 'crm_growth_funnel_submit');
  assert.ok(!JSON.stringify(calls.rpc[0][1]).includes('good-token'));
  const ui = fs.readFileSync('src/app/f/[slug]/form.tsx', 'utf8');
  assert.match(ui, /<HumanVerification key=\{state\.attempt \?\? 0\} siteKey=\{turnstileSiteKey\} language="es" action="avalon_funnel"/);
  assert.match(ui, /name="cf-turnstile-response" value=\{token\}/);
  assert.match(fs.readFileSync('src/app/f/[slug]/page.tsx', 'utf8'), /turnstileSiteKey=\{publicTurnstileSiteKey\(\)\}/);
});

test('Codex #295: invalid funnel input (no consent, oversized) is rejected before Cloudflare, the limiter or the DB', async () => {
  for (const extra of [{ consent: 'no' }, { company: 'X'.repeat(201) }, { message: 'm'.repeat(2001) }]) {
    const { submitFunnel, calls } = funnelAction({ human: 'ok' });
    const f = funnelForm('tok-valid');
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    const state = await submitFunnel({ status: 'idle' }, f);
    assert.equal(state.status, 'invalid', JSON.stringify(Object.keys(extra)));
    assert.deepEqual([calls.human.length, calls.client, calls.rpc.length], [0, 0, 0]);
  }
});
