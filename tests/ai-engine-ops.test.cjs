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
  // Regression (real Issues #139/#140): word stems are not owner-only verbs.
  assert.deepEqual(P.ownerOnlyRequests('Esta orden comprueba que el sistema no se atribuye ese trabajo.'), []);
  assert.deepEqual(P.ownerOnlyRequests('Verificar el SHA-256 de los modelos publicados por el Creative Bridge'), []);
  assert.deepEqual(P.ownerOnlyRequests('Comprar créditos de Higgsfield'), ['spend']);
  assert.deepEqual(P.ownerOnlyRequests('Publicar en producción y concede permisos de owner a otro usuario'), ['production_change', 'permission_change']);
  assert.deepEqual(P.ownerOnlyRequests('Eliminar la doble oficina'), [], 'removing a duplicate UI element is not deleting data');
  assert.deepEqual(P.ownerOnlyRequests('Borra los leads antiguos'), ['delete_data']);
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

// ─── P0-A: orders are never "done" without the requested result ─────────────────────────────────────────────────────────
test('order lifecycle: a diagnosis is not an implementation; only a change with green checks is verified', () => {
  assert.equal(P.classifyIntent('Arreglar la doble oficina'), 'change');
  assert.equal(P.classifyIntent('Revisar que las tablas tengan RLS'), 'diagnose');
  assert.equal(P.classifyIntent('Haz algo con la oficina'), 'change', 'ambiguous orders count as changes (fail-safe)');
  // Regression (real Issue #140): a review whose body mentions "integración" / "se añade" is still a review.
  assert.equal(P.classifyIntent('Verificar SHA-256 … se añade un análisis con IA', 'Orden: revisar la integridad de los modelos 3D de Higgsfield y la integración con Geoapify'), 'diagnose');
  assert.equal(P.classifyIntent('Hay dos escenas visuales', 'Orden: arreglar la doble oficina de Avalon HQ'), 'change');
  assert.equal(P.classifyIntent('detalle', 'Tarea: integrar Geoapify en el calendario'), 'change');
  const green = { status: 'succeeded', checks: [{ ok: true, exit: 0 }] };
  assert.equal(P.orderOutcome('diagnose', green).state, 'diagnosed');
  assert.deepEqual(P.orderOutcome('change', green), { state: 'needs_implementation', reason: 'diagnosis_only_no_change_executor' });
  assert.equal(P.orderOutcome('change', { ...green, change: { pr: 'x' } }).state, 'verified');
  assert.equal(P.orderOutcome('change', { status: 'succeeded', checks: [{ ok: false, exit: 1 }], change: { pr: 'x' } }).state, 'implemented');
  assert.equal(P.orderOutcome('change', { status: 'succeeded', checks: [] }).state, 'blocked');
  assert.equal(P.orderOutcome('diagnose', { status: 'failed' }).state, 'failed');
  assert.equal(P.orderOutcome('diagnose', { status: 'skipped' }).state, 'waiting');
  assert.equal(P.orderOutcome('change', green, ['production_change']).state, 'needs_owner');
  assert.ok(!Object.values(P.ORDER_LABEL).includes('avalon:done'), 'the ambiguous avalon:done label is no longer produced');
});

// ─── One control for every executor ─────────────────────────────────────────────────────────────────────────────────────
test('control: scheduled runs fail closed without Avalon control; unreachable control stops everything; Avalon switches are obeyed', async () => {
  const withEnv = async (vars, fn) => { const saved = {}; for (const [k, v] of Object.entries(vars)) { saved[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; } try { return await fn(); } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } } };
  const none = { AVALON_SUPABASE_URL: undefined, AVALON_SUPABASE_PUBLISHABLE_KEY: undefined, AVALON_AI_ENGINE_DISABLED: undefined };
  assert.equal((await withEnv({ ...none, GITHUB_EVENT_NAME: 'schedule' }, () => OPS.readControl())).killSwitch, true);
  assert.equal((await withEnv({ ...none, GITHUB_EVENT_NAME: 'workflow_dispatch' }, () => OPS.readControl())).killSwitch, false);
  assert.equal((await withEnv({ ...none, AVALON_AI_ENGINE_DISABLED: 'true' }, () => OPS.readControl())).killSwitch, true);
  // The fake Supabase runs in a CHILD process: readControl() uses a synchronous curl that would block an in-process server.
  const cp = require('node:child_process');
  const ctlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctl-'));
  const replyFile = path.join(ctlDir, 'reply.json');
  const setReply = r => fs.writeFileSync(replyFile, JSON.stringify(r));
  setReply({ kill_switch: true, automatic_enabled: true, ai_enabled: true, suspended: ['haru', 'Bad Key'] });
  // Fixed server code; the reply file path is passed as an argument, never interpolated into code.
  const child = cp.spawn(process.execPath, ['-e', "const fs=require('fs');const f=process.argv[1];require('http').createServer((q,r)=>{r.setHeader('content-type','application/json');r.end(fs.readFileSync(f))}).listen(0,'127.0.0.1',function(){console.log(this.address().port)})", replyFile]);
  const port = await new Promise(r => child.stdout.once('data', d => r(String(d).trim())));
  const url = `http://127.0.0.1:${port}`;
  const local = { AVALON_SUPABASE_URL: url, AVALON_SUPABASE_PUBLISHABLE_KEY: 'pk', no_proxy: '127.0.0.1', NO_PROXY: '127.0.0.1' };
  try {
    const on = await withEnv({ ...local, GITHUB_EVENT_NAME: 'schedule' }, () => OPS.readControl());
    assert.deepEqual([on.source, on.killSwitch, on.suspended], ['avalon', true, ['haru']], 'only well-formed manager keys are taken');
    setReply({ kill_switch: false, suspended: [] });
    assert.equal((await withEnv({ ...local, GITHUB_EVENT_NAME: 'schedule' }, () => OPS.readControl())).killSwitch, false);
    setReply({ code: 'PGRST202', message: 'not found' });
    assert.equal((await withEnv({ ...local, GITHUB_EVENT_NAME: 'schedule' }, () => OPS.readControl())).reason, 'avalon_control_rpc_missing');
    setReply({ unexpected: 1 });
    assert.equal((await withEnv(local, () => OPS.readControl())).killSwitch, true, 'malformed answer → fail closed');
  } finally { child.kill(); fs.rmSync(ctlDir, { recursive: true, force: true }); }
  assert.equal((await withEnv({ AVALON_SUPABASE_URL: 'http://127.0.0.1:9', AVALON_SUPABASE_PUBLISHABLE_KEY: 'pk', no_proxy: '127.0.0.1', NO_PROXY: '127.0.0.1' }, () => OPS.readControl())).reason, 'avalon_control_unreachable');
  // The control reaches runManager: Avalon kill switch / suspension block before any work.
  const h = harness();
  try {
    assert.equal((await OPS.runManager(h.store, 'ren', 'ops:ren:C1', { control: { killSwitch: true, suspended: [] } })).reason, 'kill_switch');
    assert.equal((await OPS.runManager(h.store, 'haru', 'ops:haru:C1', { control: { killSwitch: false, suspended: ['haru'] } })).reason, 'manager_suspended');
    assert.deepEqual(h.calls, []);
  } finally { h.restore(); }
});

// ─── Intake end to end with a fake GitHub CLI (P0-A + P0-B) ─────────────────────────────────────────────────────────────
test('intake: diagnosis → diagnosed, change without executor → needs-implementation, stuck in-progress recovered, exception never leaves in-progress', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-'));
  const log = path.join(dir, 'calls.jsonl');
  const old = new Date(Date.now() - 2 * 3600e3).toISOString(), fresh = new Date().toISOString();
  const issues = [
    { number: 201, title: 'Revisar RLS de las tablas nuevas', body: 'Solo diagnóstico de seguridad', labels: [{ name: 'avalon:task' }], updatedAt: fresh },
    { number: 202, title: 'Arreglar la doble oficina', body: 'Hay dos escenas visuales', labels: [{ name: 'avalon:task' }], updatedAt: fresh },
    { number: 203, title: 'Revisar pruebas del CRM', body: 'quedó colgada', labels: [{ name: 'avalon:task' }, { name: 'avalon:in-progress' }], updatedAt: old },
    { number: 204, title: 'Revisar algo', body: 'está en curso ahora mismo', labels: [{ name: 'avalon:task' }, { name: 'avalon:in-progress' }], updatedAt: fresh },
    { number: 205, title: 'Ya respondida', body: '', labels: [{ name: 'avalon:task' }, { name: 'avalon:diagnosed' }], updatedAt: old },
  ];
  fs.writeFileSync(path.join(dir, 'gh'), `#!/usr/bin/env node
const fs=require('fs');const a=process.argv.slice(2);let input='';try{input=fs.readFileSync(0,'utf8')}catch{}
fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({a,input})+'\\n');
if(a[0]==='issue'&&a[1]==='list'){process.stdout.write(${JSON.stringify(JSON.stringify(issues))});}
`, { mode: 0o755 });
  const h = harness({ PATH: dir + path.delimiter + process.env.PATH });
  try {
    const out = await OPS.intake(h.store, { killSwitch: false, suspended: [] });
    const byIssue = Object.fromEntries(out.map(r => [r.issue, r.orderState || r.status]));
    assert.deepEqual(byIssue, { 201: 'diagnosed', 202: 'needs_implementation', 203: 'diagnosed' }, 'fresh in-progress (204) and answered (205) orders are not picked');
    const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
    const labelsAdded = calls.filter(c => c.a[1] === 'edit').map(c => [c.a[2], c.a[c.a.indexOf('--add-label') + 1]]);
    assert.ok(labelsAdded.some(([n, l]) => n === '202' && l === 'avalon:needs-implementation'));
    assert.ok(!labelsAdded.some(([, l]) => l === 'avalon:done'), 'never avalon:done');
    const comment202 = calls.find(c => c.a[1] === 'comment' && c.a[2] === '202').input;
    assert.match(comment202, /implementación pendiente/);
    const orders = h.store.load().ops.orders;
    assert.deepEqual(orders[202].history.map(x => x.state), ['received', 'classified', 'running', 'needs_implementation']);
    // Exception during execution: the order returns to the queue, never stays "in progress".
    OPS.setExecutors({ ren: async () => { throw new Error('boom'); }, shin: async () => { throw new Error('boom'); }, haru: async () => { throw new Error('boom'); }, sora: async () => { throw new Error('boom'); }, kenji: async () => { throw new Error('boom'); } });
    issues.splice(0, issues.length, { number: 206, title: 'Revisar seguridad', body: '', labels: [{ name: 'avalon:task' }], updatedAt: fresh });
    fs.writeFileSync(path.join(dir, 'gh'), fs.readFileSync(path.join(dir, 'gh'), 'utf8').replace(/process\.stdout\.write\(.*\);\}/, `process.stdout.write(${JSON.stringify(JSON.stringify(issues))});}`));
    fs.writeFileSync(log, '');
    const out2 = await OPS.intake(h.store, { killSwitch: false, suspended: [] });
    assert.equal(out2[0].reason, 'exception');
    const last = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse).filter(c => c.a[1] === 'edit').at(-1).a;
    assert.equal(last[last.indexOf('--add-label') + 1], 'avalon:task');
    assert.ok(last.includes('avalon:in-progress'), 'in-progress label removed');
    assert.equal(h.store.load().ops.orders[206].state, 'waiting');
    // Kill switch: intake does nothing at all.
    fs.writeFileSync(log, '');
    assert.equal((await OPS.intake(h.store, { killSwitch: true, suspended: [] }))[0].reason, 'kill_switch');
    assert.equal(fs.readFileSync(log, 'utf8'), '');
  } finally { h.restore(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// ─── Operación 0352: explicit dependencies, plan and persisted evidence per order ──────────────────────────────────────
test('orders: explicit dependencies are parsed; unmet ones wait, cycles block; plan/limits/evidence are persisted', async () => {
  assert.deepEqual(P.parseDependencies('Depende de #12, #15 y #3. Bloqueada por #7. Mira #99 en general'), [3, 7, 12, 15]);
  assert.deepEqual(P.parseDependencies('Sin dependencias, ver #5'), [], 'a plain mention is not a dependency');
  assert.equal(P.dependencySatisfied({ state: 'OPEN', labels: ['avalon:needs-implementation'] }), false);
  assert.equal(P.dependencySatisfied({ state: 'OPEN', labels: ['avalon:verified'] }), true);
  assert.equal(P.dependencySatisfied({ state: 'CLOSED', labels: [] }), true);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-dep-'));
  const log = path.join(dir, 'calls.jsonl'), data = path.join(dir, 'data.json');
  const fresh = new Date().toISOString();
  fs.writeFileSync(data, JSON.stringify({
    list: [
      { number: 301, title: 'Revisar RLS', body: 'Depende de #310', labels: [{ name: 'avalon:task' }], updatedAt: fresh },
      { number: 302, title: 'Revisar pruebas del CRM', body: 'Depende de #311', labels: [{ name: 'avalon:task' }], updatedAt: fresh },
      { number: 303, title: 'Revisar la seguridad', body: 'Depende de #312', labels: [{ name: 'avalon:task' }], updatedAt: fresh },
    ],
    view: {
      310: { state: 'OPEN', labels: [{ name: 'avalon:needs-implementation' }], body: '' },
      311: { state: 'OPEN', labels: [{ name: 'avalon:verified' }], body: '' },
      312: { state: 'OPEN', labels: [{ name: 'avalon:task' }], body: 'Depende de #303' },
    },
  }));
  fs.writeFileSync(path.join(dir, 'gh'), `#!/usr/bin/env node
const fs=require('fs');const a=process.argv.slice(2);let input='';try{input=fs.readFileSync(0,'utf8')}catch{}
fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({a,input})+'\\n');
const d=JSON.parse(fs.readFileSync(${JSON.stringify(data)},'utf8'));
if(a[0]==='issue'&&a[1]==='list')process.stdout.write(JSON.stringify(d.list));
if(a[0]==='issue'&&a[1]==='view')process.stdout.write(JSON.stringify(d.view[a[2]]||null));
`, { mode: 0o755 });
  const h = harness({ PATH: dir + path.delimiter + process.env.PATH });
  try {
    const out = await OPS.intake(h.store, { killSwitch: false, suspended: [] });
    const by = Object.fromEntries(out.map(r => [r.issue, r.orderState || r.reason || r.status]));
    assert.deepEqual(by, { 301: 'waiting_for:#310', 302: 'diagnosed', 303: 'dependency_cycle' });
    const orders = h.store.load().ops.orders;
    assert.equal(orders[301].state, 'waiting');
    assert.deepEqual(orders[302].dependsOn, [311]);
    assert.deepEqual(orders[302].plan.steps, ['classify', 'execute', 'verify', 'record_evidence']);
    assert.deepEqual(orders[302].limits, { attempts: 3, executionMs: 20 * 60_000 });
    assert.ok(orders[302].evidence.length && orders[302].evidence.every(e => typeof e.exit === 'number'), 'evidence persisted with exit codes');
    assert.equal(orders[302].result.summary, 'kenji ok'.replace('kenji', orders[302].manager) , 'result persisted');
    assert.equal(orders[303].state, 'blocked');
    // An order that depends on itself is blocked at once (second round: at most 3 orders are processed per round).
    const d = JSON.parse(fs.readFileSync(data, 'utf8'));
    d.list = [{ number: 304, title: 'Revisar sesiones', body: 'Depende de #304', labels: [{ name: 'avalon:task' }], updatedAt: fresh }];
    fs.writeFileSync(data, JSON.stringify(d));
    const self = await OPS.intake(h.store, { killSwitch: false, suspended: [] });
    assert.deepEqual([self[0].status, self[0].reason], ['blocked', 'dependency_cycle']);
    d.list = [{ number: 301, title: 'Revisar RLS', body: 'Depende de #310', labels: [{ name: 'avalon:task' }], updatedAt: fresh }];
    fs.writeFileSync(data, JSON.stringify(d));
    // The waiting order is commented once, not on every round.
    fs.writeFileSync(log, '');
    await OPS.intake(h.store, { killSwitch: false, suspended: [] });
    const comments301 = fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(c => c.a[1] === 'comment' && c.a[2] === '301');
    assert.equal(comments301.length, 0);
  } finally { h.restore(); fs.rmSync(dir, { recursive: true, force: true }); }
});
