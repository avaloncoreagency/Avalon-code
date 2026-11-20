'use strict';
// Independent synthetic probe. No network, secrets or application writes.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function action(root, options = {}) {
  const intakeSource = ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/supabase/intake.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const intakeModule = { exports: {} };
  new Function('require','module','exports',intakeSource)(id => { if(id === 'server-only') return {}; throw Error('Unreviewed intake dependency: '+id); }, intakeModule, intakeModule.exports);
  const calls = { human: 0, rpc: 0, intake: 0 };
  const client = { rpc: async () => { calls.rpc++; return options.networkFailure ? { data: null, error: { code: 'synthetic' } } : { data: 'ok', error: null }; } };
  const mocks = {
    'next/headers': { headers: async () => new Headers() },
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/supabase/intake': { intakeCall: (kind, request) => { calls.intake++; return intakeModule.exports.intakeCall(kind, request, { AVALON_INTAKE_TOKEN: 'synthetic-review-only-token-00000000000000' }); } },
    '@/lib/security/rate-limit': { authLimiter: { hit: () => ({ allowed: true }) }, clientIp: () => '198.51.100.40', hashKey: () => 'synthetic' },
    '@/lib/growth/funnel': { validSlug: () => true },
    '@/lib/security/turnstile': { verifyHumanToken: async () => { calls.human++; return options.human || 'invalid'; } },
  };
  const source = ts.transpileModule(fs.readFileSync(path.join(root, 'src/app/f/[slug]/actions.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', source)(id => {
    if (id in mocks) return mocks[id];
    if (id === 'node:crypto') return require(id);
    throw Error('Unreviewed dependency: ' + id);
  }, mod, mod.exports);
  return { submit: mod.exports.submitFunnel, calls };
}
function form(extra = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ slug: 'qa-synthetic', company: 'Synthetic Business', name: 'Synthetic Contact', email: 'qa@example.invalid', message: 'Solicitud sintética / synthetic inquiry', consent: 'yes', consent_version: 'qa-v1', 'cf-turnstile-response': 'invalid-synthetic-token', ...extra })) f.set(k, v);
  return f;
}
async function probe(root) {
  const results = [];
  for (const scenario of ['missing', 'invalid', 'expired', 'replayed', 'provider-unavailable']) {
    const a = action(root, { human: scenario === 'provider-unavailable' ? 'unavailable' : 'invalid' });
    const response = await a.submit({ status: 'idle' }, form({ 'cf-turnstile-response': scenario === 'missing' ? '' : scenario }));
    results.push({ scenario, ...a.calls, status: response.status, accepted: a.calls.rpc === 0 && response.status !== 'ok' });
  }
  return results;
}
module.exports = { action, form, probe };
if (require.main === module) probe(path.resolve(process.argv[2] || '.')).then(results => {
  console.log(JSON.stringify({ kind: 'mocked-server-boundary', results }, null, 2));
  if (results.some(r => !r.accepted)) process.exitCode = 1;
}).catch(e => { console.error(e); process.exitCode = 1; });
