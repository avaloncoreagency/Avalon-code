// Avalon OS operations: tiered autonomy, routing, locks, limits, crash recovery and evidence verification.
// Synthetic executors only — no network, no secrets, no repository mutation.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const E = require('../scripts/ai-engine/engine.cjs');
const OPS = require('../scripts/ai-engine/operate.cjs');
const { verifyEvidence } = require('../scripts/ai-engine/managers.cjs');
const P = OPS.policy;
const ctx = (o = {}) => ({ killSwitch: false, suspended: [], counts: { hour: 0, day: 0 }, ...o });

test('tiers: automatic and pre-approved work runs without asking; owner-only work never runs', () => {
  assert.deepEqual(P.decide('shin', 'diagnose', ctx()), { allowed: true, tier: 'auto', reason: 'automatic' });
  assert.deepEqual(P.decide('ren', 'open_draft_pr', ctx()), { allowed: true, tier: 'policy', reason: 'pre_approved_policy' });
  assert.equal(P.decide('shin', 'open_draft_pr', ctx()).reason, 'action_not_in_manager_policy', 'only REN may open draft PRs');
  for (const a of ['production_change', 'migration_real_data', 'permission_change', 'spend', 'external_contact', 'delete_data', 'irreversible']) {
    for (const m of ['ren', 'shin', 'haru', 'sora', 'kenji']) assert.deepEqual(P.decide(m, a, ctx()), { allowed: false, tier: 'owner', reason: 'requires_owner_approval' });
  }
});

test('kill switch, individual suspension, limits and reserved seats block before any work', () => {
  assert.equal(P.decide('ren', 'read', ctx({ killSwitch: true })).reason, 'kill_switch');
  assert.equal(P.decide('haru', 'read', ctx({ suspended: ['haru'] })).reason, 'manager_suspended');
  assert.equal(P.decide('sora', 'read', ctx({ suspended: ['haru'] })).allowed, true, 'suspension is individual');
  assert.equal(P.decide('kenji', 'read', ctx({ counts: { hour: P.LIMITS.perHour, day: 1 } })).reason, 'hourly_limit');
  assert.equal(P.decide('kenji', 'read', ctx({ counts: { hour: 0, day: P.LIMITS.perDay } })).reason, 'daily_limit');
  assert.equal(P.decide('samuel_1', 'read', ctx()).reason, 'reserved_or_unknown_worker');
});

test('task intake routes to the right manager and flags owner-only requests', () => {
  assert.equal(P.routeTask('Revisar las políticas RLS y la sesión de autenticación').manager, 'shin');
  assert.equal(P.routeTask('El pipeline del CRM pierde el lead al registrar la venta').manager, 'haru');
  assert.equal(P.routeTask('Preparar recursos creativos para el Marketing Hub y Higgsfield').manager, 'sora');
  assert.equal(P.routeTask('Hay una regresión en las pruebas de móvil').manager, 'kenji');
  assert.equal(P.routeTask('Organizar dependencias del plan técnico').manager, 'ren');
  assert.deepEqual(P.ownerOnlyRequests('Despliega a producción y borra los leads viejos'), ['production_change', 'delete_data']);
  assert.deepEqual(P.ownerOnlyRequests('Revisa las pruebas del calendario'), []);
  // Regression (real Issue #136): label text like `avalon:needs-owner` is not a permission change; the title outweighs body words.
  assert.deepEqual(P.ownerOnlyRequests('Pide un cambio en producción; resultado: la etiqueta `avalon:needs-owner`'), ['production_change']);
  assert.equal(P.routeTask('Prueba negativa del sistema de recepción', 'Revisar la seguridad de las sesiones').manager, 'shin');
});

test('KENJI rejects results that look done but cite no executed check', () => {
  const ok = { checks: [{ cmd: 'npm test', exit: 0 }] };
  assert.deepEqual(verifyEvidence({ shin: ok, haru: { summary: 'todo bien' }, sora: { checks: [] }, x: { checks: [{ cmd: 'a' }] } }), ['haru', 'sora', 'x']);
});

function harness(env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-'));
  const store = new E.FileStore(path.join(dir, 'state.json'));
  const calls = [];
  let fail = 0;
  const exec = name => async () => { calls.push(name); if (fail > 0) { fail--; throw new Error('executor_crash'); } return { capability: name + '_cap', actions: ['read'], checks: [{ cmd: 'synthetic', exit: 0, ok: true }], findings: [], metrics: {}, summary: name + ' ok' }; };
  OPS.setExecutors({ ren: exec('ren'), shin: exec('shin'), haru: exec('haru'), sora: exec('sora'), kenji: exec('kenji') });
  const saved = {};
  for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; process.env[k] = v; }
  return { store, calls, crashNext: (n = 1) => { fail = n; }, restore: () => { for (const k of Object.keys(env)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('persistent run: result stored, re-run of the same task is resumed without executing again', async () => {
  const h = harness();
  try {
    const r = await OPS.runManager(h.store, 'haru', 'ops:haru:2026-11-05T10', {});
    assert.equal(r.status, 'succeeded');
    const again = await OPS.runManager(h.store, 'haru', 'ops:haru:2026-11-05T10', {});
    assert.equal(again.resumed, true);
    assert.deepEqual(h.calls, ['haru'], 'no duplicate operation on reload/re-run');
    const s = h.store.load();
    assert.equal(s.tasks['ops:haru:2026-11-05T10'].status, 'succeeded');
    assert.match(E.recall(s, 'haru', 1)[0].text, /haru_cap: haru ok/);
  } finally { h.restore(); }
});

test('interrupted run is recovered with bounded retries', async () => {
  const h = harness();
  try {
    h.crashNext(1);
    await assert.rejects(OPS.runManager(h.store, 'sora', 'ops:sora:T1', {}), /executor_crash/);
    const mid = h.store.load();
    assert.equal(mid.tasks['ops:sora:T1'].status, 'running', 'checkpoint written before the work started');
    const r = await OPS.runManager(h.store, 'sora', 'ops:sora:T1', {});
    assert.equal(r.status, 'succeeded');
    assert.equal(h.store.load().tasks['ops:sora:T1'].steps.started.output.n, 2);
    h.crashNext(5);
    for (let i = 0; i < 3; i++) await assert.rejects(OPS.runManager(h.store, 'kenji', 'ops:kenji:T2', {}));
    assert.deepEqual(await OPS.runManager(h.store, 'kenji', 'ops:kenji:T2', {}), { manager: 'kenji', taskId: 'ops:kenji:T2', status: 'failed', reason: 'retries_exhausted' });
  } finally { h.restore(); }
});

test('kill switch and suspension stop runs; a busy manager is not run twice concurrently; hourly limit holds', async () => {
  let h = harness({ AVALON_AI_ENGINE_DISABLED: 'true' });
  try { assert.equal((await OPS.runManager(h.store, 'ren', 'ops:ren:T', {})).reason, 'kill_switch'); assert.deepEqual(h.calls, []); } finally { h.restore(); }
  h = harness({ AVALON_SUSPENDED: 'shin' });
  try {
    assert.equal((await OPS.runManager(h.store, 'shin', 'ops:shin:T', {})).reason, 'manager_suspended');
    assert.equal((await OPS.runManager(h.store, 'haru', 'ops:haru:T', {})).status, 'succeeded');
  } finally { h.restore(); }
  h = harness();
  try {
    const s = h.store.load();
    s.ops = { runs: [], locks: { ren: { taskId: 'other', until: new Date(Date.now() + 60e3).toISOString() } } };
    h.store.save(s);
    assert.equal((await OPS.runManager(h.store, 'ren', 'ops:ren:T', {})).reason, 'locked_by:other');
    for (let i = 0; i < OPS.policy.LIMITS.perHour; i++) await OPS.runManager(h.store, 'kenji', 'ops:kenji:L' + i, {});
    assert.equal((await OPS.runManager(h.store, 'kenji', 'ops:kenji:L-extra', {})).reason, 'hourly_limit');
  } finally { h.restore(); }
});
