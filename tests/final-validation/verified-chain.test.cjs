'use strict';
// Independent chain: real action -> real Siteverify validator -> real intake adapter.
// Only the external provider, request metadata, limiter and DB transport are synthetic.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = process.env.FINAL_VALIDATION_ROOT || process.cwd();
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', source)(id => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id === 'server-only') return {};
    if (id === 'node:crypto') return require(id);
    throw Error('Unreviewed dependency: ' + id);
  }, mod, mod.exports);
  return mod.exports;
}
const definitions = [
  { kind: 'funnel', file: 'src/app/f/[slug]/actions.ts', fn: 'submitFunnel', action: 'avalon_funnel', rpc: 'crm_public_funnel_intake' },
  { kind: 'inquiry', file: 'src/app/quote-actions.ts', fn: 'requestQuote', action: 'avalon_quote', rpc: 'crm_public_intake' },
];
function chain(def, scenario) {
  const calls = { client: 0, rpc: [], provider: [] };
  const gate = load('src/lib/security/turnstile.ts');
  const intake = load('src/lib/supabase/intake.ts');
  const env = { TURNSTILE_SITE_KEY: 'synthetic-site', TURNSTILE_SECRET_KEY: 'synthetic-secret', TURNSTILE_EXPECTED_HOSTNAME: 'qa.example.invalid' };
  if (scenario === 'partial') delete env.TURNSTILE_SECRET_KEY;
  if (scenario === 'disabled') { delete env.TURNSTILE_SITE_KEY; delete env.TURNSTILE_SECRET_KEY; }
  const fetcher = async (url, init) => {
    calls.provider.push({ url, action: def.action, token: init.body.get('response') });
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(init.method, 'POST');
    if (scenario === 'outage') throw Error('synthetic provider outage');
    if (scenario === 'http-error') return { ok: false };
    if (scenario === 'bad-json') return { ok: true, json: async () => { throw Error('synthetic malformed JSON'); } };
    let body = { success: true, action: def.action, hostname: 'qa.example.invalid' };
    if (scenario === 'wrong-action') body.action = 'avalon_login';
    if (scenario === 'wrong-host') body.hostname = 'qa.example.invalid.attacker.invalid';
    if (['invalid', 'expired', 'replayed'].includes(scenario)) body = { success: false, 'error-codes': [scenario === 'invalid' ? 'invalid-input-response' : 'timeout-or-duplicate'] };
    return { ok: true, json: async () => body };
  };
  const actionModule = load(def.file, {
    'next/headers': { headers: async () => new Headers() },
    '@/lib/security/turnstile': { verifyHumanToken: (token, action) => gate.verifyHumanToken(token, action, { env, fetcher }) },
    '@/lib/supabase/intake': { intakeCall: (kind, request) => intake.intakeCall(kind, request, { AVALON_INTAKE_TOKEN: 'synthetic-server-token-'.repeat(2) }) },
    '@/lib/supabase/server': { createClient: async () => { calls.client++; return { rpc: async (fn, args) => { calls.rpc.push({ fn, args }); return scenario === 'db-error' ? { error: { code: 'synthetic' }, data: null } : { error: null, data: 'ok' }; } }; } },
    '@/lib/security/rate-limit': { authLimiter: { hit: () => ({ allowed: scenario !== 'rate-limit' }) }, clientIp: () => '198.51.100.44', hashKey: () => 'synthetic' },
    '@/lib/growth/funnel': { validSlug: () => true },
  });
  const form = new FormData();
  for (const [k, v] of Object.entries({ slug: 'qa-synthetic', company: 'Prueba sintética', name: 'QA Synthetic', email: 'qa@example.invalid', phone: '', message: 'Español e inglés / synthetic request', consent: 'yes', consent_version: 'qa-v1', language: 'es', 'cf-turnstile-response': scenario === 'missing' ? '' : 'synthetic-human-token' })) form.set(k, v);
  form.append('services', 'website');
  return { calls, submit: () => actionModule[def.fn]({ status: 'idle', attempt: 2 }, form) };
}
for (const def of definitions) {
  for (const scenario of ['missing', 'invalid', 'expired', 'replayed', 'outage', 'http-error', 'bad-json', 'wrong-action', 'wrong-host', 'partial', 'rate-limit']) {
    test(`${def.kind}: ${scenario} stops before DB and preserves draft`, async () => {
      const { calls, submit } = chain(def, scenario);
      const state = await submit();
      assert.notEqual(state.status, 'ok');
      assert.equal(calls.client, 0);
      assert.equal(calls.rpc.length, 0);
      assert.equal(state.values.company, 'Prueba sintética');
      assert.equal(state.values.message, 'Español e inglés / synthetic request');
      assert.equal(state.attempt, 3);
      assert.ok(!JSON.stringify(state).includes('synthetic-human-token'));
      if (['missing', 'partial', 'rate-limit'].includes(scenario)) assert.equal(calls.provider.length, 0);
    });
  }
  test(`${def.kind}: valid chain calls only its scoped wrapper once`, async () => {
    const { calls, submit } = chain(def, 'valid');
    assert.equal((await submit()).status, 'ok');
    assert.equal(calls.provider.length, 1);
    assert.equal(calls.rpc.length, 1);
    assert.equal(calls.rpc[0].fn, def.rpc);
    assert.ok(!JSON.stringify(calls.rpc[0]).includes('synthetic-human-token'));
  });
  test(`${def.kind}: database failure after verified human is honest`, async () => {
    const { calls, submit } = chain(def, 'db-error');
    assert.equal((await submit()).status, 'unavailable');
    assert.equal(calls.provider.length, 1);
    assert.equal(calls.rpc.length, 1);
  });
  test(`${def.kind}: absent keys still allow legacy mode (rollout blocker)`, async () => {
    const { calls, submit } = chain(def, 'disabled');
    assert.equal((await submit()).status, 'ok');
    assert.equal(calls.provider.length, 0);
    assert.equal(calls.rpc.length, 1);
  });
}
