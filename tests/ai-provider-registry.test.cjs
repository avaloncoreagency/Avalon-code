const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const m = { exports: {} };
new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync('src/lib/ai/provider-registry.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports, require);
const R = m.exports;
const cfg = (o = {}) => ({ enabled: true, provider: 'llm', monthlyBudgetUsd: 10, spentUsd: 0, ...o });
const on = { AVALON_AI_ENABLED: 'true' };

test('with today\'s code every resolution is null: nothing is connected', () => {
  R.clearAdapterFactories();
  assert.equal(R.resolveAiAdapter(cfg(), on).reason, 'no_adapter_registered');
  assert.equal(R.resolveAiAdapter(cfg(), {}).reason, 'global_disabled');
  assert.ok(R.PROVIDERS.every(p => p.status === 'not_connected' && !/^NEXT_PUBLIC_/.test(p.secretEnv)));
  assert.ok(R.PROVIDERS.every(p => p.defaultLimits.monthlyBudgetUsd === 0), 'default budget is zero');
});
test('every gate must pass before an adapter is returned (isolated fake factory, no network)', () => {
  let built = 0; R.registerAdapterFactory('llm', () => (built++, { provider: 'fake', respond: async () => ({ text: '', usage: { inputTokens: 0, outputTokens: 0 } }) }));
  const r = (c, env = on, k = false) => R.resolveAiAdapter(c, env, k);
  assert.equal(r(cfg(), on, true).reason, 'kill_switch');
  assert.equal(r(cfg(), {}).reason, 'global_disabled');
  assert.equal(r(cfg({ enabled: false })).reason, 'project_disabled');
  assert.equal(r(cfg({ monthlyBudgetUsd: 0 })).reason, 'budget_not_set');
  assert.equal(r(cfg({ spentUsd: 10 })).reason, 'budget_exhausted');
  assert.equal(r(cfg({ provider: 'x' })).reason, 'unknown_provider');
  assert.equal(r(cfg(), { ...on, NEXT_PUBLIC_AI_API_KEY: 'x' }).reason, 'secret_in_public_env');
  assert.equal(built, 0, 'the factory is never invoked unless all gates pass');
  const ok = r(cfg()); assert.equal(ok.reason, 'ok'); assert.equal(ok.adapter.provider, 'fake'); assert.equal(built, 1);
  R.clearAdapterFactories();
});
test('registry source has no network, secret value or provider SDK', () => {
  const s = fs.readFileSync('src/lib/ai/provider-registry.ts', 'utf8');
  assert.doesNotMatch(s, /fetch\(|from "openai"|@anthropic-ai|sk-[A-Za-z0-9]{10}/);
});
