const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const load = f => { const m = { exports: {} }; new Function('module', 'exports', ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports); return m.exports; };
const P = load('src/lib/agents/policy.ts');
const now = new Date('2026-11-04T12:00:00Z');

test('status derivation: idle, running, stale lease, stale result', () => {
  assert.equal(P.deriveStatus(null, now, 24), 'idle');
  assert.equal(P.deriveStatus({ status: 'running', lease_until: '2026-11-04T12:03:00Z', finished_at: null }, now, 24), 'running');
  assert.equal(P.deriveStatus({ status: 'running', lease_until: '2026-11-04T11:59:00Z', finished_at: null }, now, 24), 'stale');
  assert.equal(P.deriveStatus({ status: 'completed', lease_until: null, finished_at: '2026-11-04T10:00:00Z' }, now, 24), 'completed');
  assert.equal(P.deriveStatus({ status: 'completed', lease_until: null, finished_at: '2026-11-02T10:00:00Z' }, now, 24), 'stale');
  assert.equal(P.deriveStatus({ status: 'blocked', lease_until: null, finished_at: '2026-11-04T10:00:00Z' }, now, 24), 'blocked');
});
test('activity always lists exactly five managers and bounds evidence', () => {
  const a = P.buildActivity([], {}, now, 24);
  assert.deepEqual(a.map(x => x.manager_key), ['ren', 'shin', 'haru', 'sora', 'kenji']);
  assert.ok(a.every(x => x.status === 'idle' && x.run_id === null && x.evidence_refs.length === 0));
  const refs = Array.from({ length: 30 }, (_, i) => ({ type: 'lead', id: 'x' + i })).concat([{ nope: 1 }]);
  const run = { id: 'r', manager_key: 'ren', task_title: 't', status: 'completed', started_at: null, finished_at: '2026-11-04T11:00:00Z', lease_until: null, result_summary: 'x'.repeat(3000), evidence_refs: refs, error_code: null, updated_at: '2026-11-04T11:00:00Z' };
  const r = P.buildActivity([run], {}, now, 24)[0];
  assert.equal(r.evidence_refs.length, 20); assert.equal(r.result_summary.length, 2000);
});
test('idempotency key is stable inside a 5-minute bucket and different outside it', () => {
  assert.equal(P.idempotencyKey('ren', new Date('2026-11-04T12:00:01Z')), P.idempotencyKey('ren', new Date('2026-11-04T12:04:59Z')));
  assert.notEqual(P.idempotencyKey('ren', new Date('2026-11-04T12:04:59Z')), P.idempotencyKey('ren', new Date('2026-11-04T12:05:00Z')));
});
test('routes are owner-gated, same-origin and never accept a free-form task', () => {
  const run = fs.readFileSync('src/app/admin/workspace/crm/office/manager-run/route.ts', 'utf8');
  const act = fs.readFileSync('src/app/admin/workspace/crm/office/manager-activity/route.ts', 'utf8');
  for (const s of [run, act]) assert.match(s, /getOwnerSession\(\)/);
  assert.match(run, /origin !== request\.nextUrl\.origin/); assert.match(run, /isManagerKey/);
  assert.doesNotMatch(run + act, /service_role|SUPABASE_SERVICE|process\.env/);
  assert.doesNotMatch(fs.readFileSync('src/lib/agents/executors.ts', 'utf8') + fs.readFileSync('src/lib/agents/runner.ts', 'utf8'), /fetch\(|child_process|\.insert\(|\.update\(|\.delete\(|\.upsert\(/, 'executors are read-only and offline');
});
