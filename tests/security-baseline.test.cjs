const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const ts = require('typescript');

function loadNextConfig() {
  const source = ts.transpileModule(fs.readFileSync('next.config.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', source)(() => ({}), mod, mod.exports);
  return mod.exports;
}

test('every route gets the baseline security headers', async () => {
  const { default: config, securityHeaders } = loadNextConfig();
  assert.equal(config.poweredByHeader, false);
  const rules = await config.headers();
  assert.deepEqual(rules.map(r => r.source), ['/:path*']);
  const h = Object.fromEntries(rules[0].headers.map(x => [x.key.toLowerCase(), x.value]));
  assert.match(h['strict-transport-security'], /max-age=(\d+)/);
  assert.ok(Number(/max-age=(\d+)/.exec(h['strict-transport-security'])[1]) >= 31536000);
  assert.doesNotMatch(h['strict-transport-security'], /preload/, 'preload requires a separate decision');
  assert.equal(h['x-frame-options'], 'DENY');
  assert.equal(h['x-content-type-options'], 'nosniff');
  const csp = h['content-security-policy'];
  for (const d of ["frame-ancestors 'none'", "form-action 'self'", "object-src 'none'", "base-uri 'self'"]) assert.ok(csp.includes(d), d);
  assert.equal(securityHeaders.length, rules[0].headers.length);
});

test('email confirm route fails closed with 503 when APP_ORIGIN is invalid', () => {
  const src = fs.readFileSync('src/app/admin/auth/confirm/route.ts', 'utf8');
  const originCheck = src.indexOf('getAppOrigin()');
  assert.ok(originCheck > -1 && originCheck < src.indexOf('verifyOtp'), 'origin must be resolved before any token is consumed');
  assert.match(src, /status: 503/);
  assert.equal((src.match(/getAppOrigin\(\)/g) || []).length, 1);
});

test('every production migration is present in the repository', () => {
  // Versions recorded in production on 2026-11-02 (supabase_migrations.schema_migrations).
  const applied = ['20261102053022', '20261102053452', '20261102070500', '20261102085430'];
  const files = fs.readdirSync('supabase/migrations');
  for (const v of applied) assert.ok(files.some(f => f.startsWith(v + '_')), `missing migration ${v}`);
});

test('recovered crm_core migration is byte-identical to production', () => {
  const sql = fs.readFileSync('supabase/migrations/20261102085430_crm_core.sql', 'utf8');
  const body = sql.slice(sql.indexOf('-- Prepared only.'));
  assert.equal(crypto.createHash('md5').update(body).digest('hex'), 'b3fd64363aa4c5b463a9eedf03124a9f');
});

test('no service-role or secret key can reach client bundles', () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
  for (const f of walk('src')) {
    const s = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /service_role|SERVICE_ROLE|NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE)/, f);
  }
  assert.doesNotMatch(fs.readFileSync('.env.example', 'utf8'), /service_role|sb_secret_/i);
});
