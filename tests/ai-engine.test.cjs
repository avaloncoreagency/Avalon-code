// Avalon AI Engine — offline tests against synthetic provider servers (no network, no secrets, no spend).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../scripts/ai-engine/engine.cjs');

const ENV = { GROQ_API_KEY: 'test-groq', CLOUDFLARE_ACCOUNT_ID: 'acc', CLOUDFLARE_API_TOKEN: 'test-cf', OPENROUTER_API_KEY: 'test-or' };
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const completion = (text, extra = {}) => ({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 20, completion_tokens: 10, ...extra }, model: 'served' });

/** Fake provider fleet. `behave[provider]` returns a Response for chat calls; calls are logged. */
function fleet(behave = {}) {
  const calls = [];
  const f = async (url, init) => {
    const u = String(url), body = init && init.body ? JSON.parse(init.body) : null;
    const HOSTS = { 'api.groq.com': 'groq', 'api.cloudflare.com': 'cloudflare', 'openrouter.ai': 'openrouter' };
    const p = HOSTS[new URL(u).hostname] || 'other';
    calls.push({ p, u, body });
    if (u.endsWith('/models') && p === 'groq') return json(200, { data: E.PROVIDERS.groq.models.map(m => ({ id: m.id, active: true })) });
    if (u.includes('/ai/models/search')) return json(200, { result: E.PROVIDERS.cloudflare.models.map(m => ({ name: m.name || m.id })) });
    if (u.endsWith('/models') && p === 'openrouter') return json(200, { data: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', context_length: 131072, supported_parameters: ['tools'], pricing: { prompt: '0', completion: '0', request: '0' } },
      { id: 'tricky/paid-model:free', context_length: 131072, pricing: { prompt: '0.000001', completion: '0' } },
      { id: 'openai/gpt-4o', context_length: 128000, pricing: { prompt: '0.0000025', completion: '0.00001' } },
    ] });
    if (u.endsWith('/key')) return json(200, { data: { usage: 0, limit: 0, is_free_tier: true } });
    if (u.endsWith('/chat/completions')) return (behave[p] || (() => json(200, completion(`{"ok":true,"by":"${p}"}`))))(body);
    return json(404, {});
  };
  return { f, calls, chats: () => calls.filter(c => c.u.endsWith('/chat/completions')) };
}
const task = (over = {}) => ({ id: 'task-' + Math.random().toString(36).slice(2), manager: 'ren', purpose: 'prueba', dataClass: 'synthetic',
  messages: [{ role: 'user', content: 'Devuelve {"ok":true}' }], maxTokens: 200, requirements: { caps: ['json'], minQuality: 2 }, ...over });

test('free-only: OpenRouter keeps only ":free" ids whose every live price is 0; paid ids are refused before any request', async () => {
  const F = fleet();
  const a = E.createAdapters(ENV, F.f);
  const models = await a.openrouter.listModels();
  assert.deepEqual(models.map(m => m.id), ['meta-llama/llama-3.3-70b-instruct:free']);
  await assert.rejects(a.openrouter.chat({ model: 'openai/gpt-4o', messages: [], maxTokens: 10 }), /paid_model_refused/);
  assert.equal(F.chats().length, 0);
  await a.openrouter.chat({ model: models[0].id, messages: [{ role: 'user', content: 'x' }], maxTokens: 10 });
  assert.deepEqual(F.chats()[0].body.provider.max_price, { prompt: 0, completion: 0, request: 0 }, 'max_price=0 on every OpenRouter request');
});

test('selection by capability, quality, context and speed per manager profile', async () => {
  const F = fleet();
  const { live } = await E.discover(E.createAdapters(ENV, F.f), E.emptyState(), ENV, new Date());
  const ren = E.selectModels(E.profileOf('ren').ai.requirements, live);
  assert.equal(`${ren[0].provider}:${ren[0].model.id}`, 'groq:openai/gpt-oss-120b');
  assert.ok(ren.every(c => c.model.caps.includes('code') && c.model.context >= 16000 && c.model.quality >= 3));
  const shin = E.selectModels(E.profileOf('shin').ai.requirements, live);
  assert.ok(shin.length && shin.every(c => c.model.caps.includes('reasoning')));
  const haru = E.selectModels(E.profileOf('haru').ai.requirements, live);
  assert.ok(haru[0].model.caps.includes('fast'), 'speed-preferring profile ranks a fast model first');
  assert.ok(!E.selectModels({ caps: ['tools', 'reasoning'], minQuality: 5, minContext: 1e6 }, live).length);
});

test('automatic failover: 429 on Groq → cooldown recorded → task completes on Cloudflare; attempts checkpointed', async () => {
  const F = fleet({ groq: () => json(429, { error: 'rate' }, { 'retry-after': '120' }) });
  const store = new E.MemoryStore();
  const now = new Date('2026-11-05T10:00:00Z');
  const r = await E.runTask(store, E.createAdapters(ENV, F.f), task(), { env: ENV, now: () => now });
  assert.equal(r.task.status, 'succeeded');
  assert.equal(r.task.result.provider, 'cloudflare');
  assert.deepEqual(r.task.attempts.map(a => `${a.provider}:${a.outcome}`), ['groq:rate_limited', 'cloudflare:ok']);
  assert.equal(store.load().cooldownUntil.groq, '2026-11-05T10:02:00.000Z');
  // auth failure and 5xx also fail over; the second provider is never retried after an auth error.
  const G = fleet({ groq: () => json(401, {}), cloudflare: () => json(503, {}) });
  const r2 = await E.runTask(new E.MemoryStore(), E.createAdapters(ENV, G.f), task(), { env: ENV });
  assert.equal(r2.task.result, null, 'disallowed OpenRouter must not rescue a failed request');
  assert.deepEqual(r2.task.attempts.map(a => a.outcome), ['auth', 'unavailable']);
  assert.equal(G.calls.filter(c => c.p === 'openrouter').length, 0, 'no OpenRouter discovery or inference');
});

test('state persists and resumes: crash after a failed attempt, resume keeps the attempt history and continues; a succeeded task is never re-sent', async () => {
  const F = fleet({ groq: () => json(500, {}) });
  const t = task({ id: 'resume-task-0001' });
  const crashing = new E.MemoryStore(undefined, 2); // save #1 = running, save #2 = groq failure → crash
  await assert.rejects(E.runTask(crashing, E.createAdapters(ENV, F.f), t, { env: ENV }), /simulated_crash/);
  const saved = crashing.load();
  assert.equal(saved.tasks[t.id].status, 'running');
  assert.deepEqual(saved.tasks[t.id].attempts.map(a => a.outcome), ['unavailable']);
  const store = new E.MemoryStore(saved);
  const G = fleet({ groq: () => json(500, {}) });
  const r = await E.runTask(store, E.createAdapters(ENV, G.f), t, { env: ENV });
  assert.equal(r.resumed, true);
  assert.equal(r.task.status, 'succeeded');
  assert.deepEqual(r.task.attempts.map(a => `${a.provider}:${a.outcome}`), ['groq:unavailable', 'groq:unavailable', 'cloudflare:ok']);
  const H = fleet();
  const again = await E.runTask(store, E.createAdapters(ENV, H.f), t, { env: ENV });
  assert.equal(again.resumed, true);
  assert.equal(H.calls.length, 0, 'no provider call for an already-succeeded task');
});

test('$0 guard: a reported cost or HTTP 402 blocks the provider; the ledger never records spend', async () => {
  const F = fleet({ groq: () => json(402, {}), cloudflare: () => json(200, completion('x', { cost: 0.0004 })) });
  const store = new E.MemoryStore();
  const r = await E.runTask(store, E.createAdapters(ENV, F.f), task(), { env: ENV });
  const s = store.load();
  assert.deepEqual(s.blocked, { groq: 'payment_required', cloudflare: 'cost_reported' });
  assert.equal(r.task.result, null, 'OpenRouter is disabled even when free');
  assert.equal(E.totalCost(s), 0);
  const callsBefore = F.calls.length;
  const again = await E.runTask(store, E.createAdapters(ENV, F.f), task(), { env: ENV });
  assert.equal(again.task.status, 'blocked', 'blocked providers stay out until a human clears them');
  assert.equal(F.calls.length, callsBefore, 'blocked providers trigger no new discovery');
});

test('daily caps below the free allowance: an exhausted provider is skipped without a request', async () => {
  const F = fleet();
  const day = E.utcDay(new Date());
  const s = E.emptyState();
  s.usage[E.usageKey(day, 'groq')] = { requests: E.PROVIDERS.groq.daily.requests, tokens: 0, neurons: 0, costUsd: 0 };
  s.usage[E.usageKey(day, 'cloudflare')] = { requests: 0, tokens: 0, neurons: E.PROVIDERS.cloudflare.daily.neurons, costUsd: 0 };
  const r = await E.runTask(new E.MemoryStore(s), E.createAdapters(ENV, F.f), task(), { env: ENV });
  assert.deepEqual(r.task.attempts.map(a => `${a.provider}:${a.outcome}`), ['groq:budget', 'cloudflare:budget']);
  assert.deepEqual(F.chats().map(c => c.p), [], 'exhausted allowances cannot fail over to OpenRouter');
});

test('data protection: client personal data, emails, phones, cards and keys never leave Avalon', async () => {
  const F = fleet();
  const a = E.createAdapters(ENV, F.f);
  for (const content of ['Cliente: ana.perez@gmail.com', 'Llamar al +34 612 345 678', 'tarjeta 4111 1111 1111 1111', 'key gsk_abcdefghijklmnopqrstuvwx', 'Authorization: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop']) {
    await assert.rejects(E.runTask(new E.MemoryStore(), a, task({ messages: [{ role: 'user', content }] }), { env: ENV }), /sensitive_content/);
  }
  await assert.rejects(E.runTask(new E.MemoryStore(), a, task({ dataClass: 'client_personal' }), { env: ENV }), /data_class_not_authorized/);
  assert.equal(F.calls.length, 0);
  assert.deepEqual(E.sensitiveFindings('owner m@example.invalid, fecha 2026-11-05 10:00'), []);
  assert.deepEqual(E.sensitiveFindings("const M = '00000000-0000-4000-8000-0000000000a1'; v0.169.0; 15084004 bytes"), [], 'UUIDs, versions and sizes are not phones');
  assert.deepEqual(E.sensitiveFindings('tel. (91) 555 12 34 / +1-415-555-0199'), ['phone']);
  assert.throws(() => E.assertProviderAllowed('groq', { NEXT_PUBLIC_GROQ_API_KEY: 'x' }), /secret_in_public_env/);
});

test('Oracle is prepared but not routable until verified; unconfigured providers are reported, not faked', async () => {
  const F = fleet();
  const { live, notes } = await E.discover(E.createAdapters({ GROQ_API_KEY: 'g' }, F.f), E.emptyState(), { GROQ_API_KEY: 'g' }, new Date());
  assert.equal(notes.oracle, 'prepared_not_operational');
  assert.equal(notes.cloudflare, 'not_configured');
  assert.equal(notes.openrouter, 'disabled_by_policy');
  assert.deepEqual(Object.keys(live), ['groq']);
  const G = fleet();
  const r = await E.runTask(new E.MemoryStore(), E.createAdapters({}, G.f), task(), { env: {} });
  assert.equal(r.task.status, 'blocked');
  assert.equal(G.calls.length, 0);
});

test('workforce: five active managers with objectives and real executors; five reserved seats are inert', () => {
  assert.equal(E.WORKFORCE.length, 10);
  const active = E.activeWorkers();
  assert.deepEqual(active.map(w => w.key), ['ren', 'shin', 'haru', 'sora', 'kenji']);
  for (const w of active) { assert.ok(w.objectives.length && w.executors.length && w.ai); assert.ok(w.ai.dataClasses.every(d => E.ALLOWED_DATA.includes(d))); }
  const reserved = E.WORKFORCE.filter(w => w.status === 'reserved');
  assert.equal(reserved.length, 5);
  for (const w of reserved) { assert.match(w.department, /Equipo de Samuel/); assert.deepEqual([w.objectives, w.executors, w.ai], [[], [], null]); }
  // Operation Phoenix: no worker has an executor that can open branches/PRs on its own.
  assert.ok(E.WORKFORCE.every(w => w.executors.every(x => x.effect !== 'branch_pr')), 'REN autonomous PR executor retired');
});

test('memory: bounded, per manager, recalled in order', () => {
  const s = E.emptyState();
  for (let i = 0; i < E.MEMORY_LIMIT + 5; i++) E.remember(s, { manager: i % 2 ? 'ren' : 'kenji', kind: 'fact', text: 'n' + i, source: 't', at: String(i) });
  assert.equal(s.memory.length, E.MEMORY_LIMIT);
  assert.deepEqual(E.recall(s, 'ren', 2).map(m => m.text), ['n201', 'n203']);
});

// ─── Operación 0352: persistent inference ledger, concurrency lease, circuit breaker ────────────────────────────────────
test('inference ledger: one persistent row per provider call with manager, model, tokens, cost 0 and outcome', async () => {
  const F = fleet({ groq: () => json(429, {}, { 'retry-after': '60' }) });
  const store = new E.MemoryStore();
  await E.runTask(store, E.createAdapters(ENV, F.f), task({ id: 'ledger-task-0001', manager: 'haru' }), { env: ENV });
  const rows = store.load().inferences;
  assert.deepEqual(rows.map(r => [r.manager, r.provider, r.outcome, r.input, r.output, r.costUsd]), [['haru', 'groq', 'rate_limited', 0, 0, 0], ['haru', 'cloudflare', 'ok', 20, 10, 0]]);
  assert.ok(rows.every(r => r.taskId === 'ledger-task-0001' && r.model && r.at));
  assert.equal(E.totalCost(store.load()), 0);
});

test('concurrency: a live lease makes another task wait without sending anything; the lease is released and expires', async () => {
  const F = fleet();
  const now = new Date('2026-11-05T10:00:00Z');
  const s = E.emptyState(); s.lease = { taskId: 'someone-else', until: new Date(now.getTime() + 60_000).toISOString() };
  const store = new E.MemoryStore(s);
  const r = await E.runTask(store, E.createAdapters(ENV, F.f), task({ id: 'wait-task-0001' }), { env: ENV, now: () => now });
  assert.equal(r.task.status, 'pending');
  assert.equal(F.calls.length, 0, 'no discovery, no inference while another task holds the lease');
  assert.equal(store.load().tasks['wait-task-0001'], undefined, 'nothing persisted for a task that did not start');
  // Expired lease: runs, and releases its own lease when done.
  const later = new Date(now.getTime() + 120_000);
  const ok = await E.runTask(store, E.createAdapters(ENV, F.f), task({ id: 'wait-task-0001' }), { env: ENV, now: () => later });
  assert.equal(ok.task.status, 'succeeded');
  assert.equal(store.load().lease, null);
  // A crash inside the task still releases the lease (finally).
  const crashing = new E.MemoryStore(undefined, 2);
  await assert.rejects(E.runTask(crashing, E.createAdapters(ENV, fleet().f), task({ id: 'lease-crash-0001' }), { env: ENV }), /simulated_crash/);
});

test('circuit breaker: three consecutive 5xx put a provider in cooldown across tasks; a success resets the counter', async () => {
  const now = new Date('2026-11-05T11:00:00Z');
  const F = fleet({ groq: () => json(503, {}) });
  const store = new E.MemoryStore();
  for (let i = 0; i < 3; i++) await E.runTask(store, E.createAdapters(ENV, F.f), task({ id: 'brk-task-000' + i }), { env: ENV, now: () => now });
  assert.equal(F.chats().filter(c => c.p === 'groq').length, 3);
  assert.equal(store.load().cooldownUntil.groq, '2026-11-05T11:15:00.000Z');
  const before = F.chats().filter(c => c.p === 'groq').length;
  await E.runTask(store, E.createAdapters(ENV, F.f), task({ id: 'brk-task-0009' }), { env: ENV, now: () => new Date(now.getTime() + 60_000) });
  assert.equal(F.chats().filter(c => c.p === 'groq').length, before, 'Groq is not called while its breaker is open');
  // After the cooldown a healthy answer resets the failure counter.
  const G = fleet();
  const st = new E.MemoryStore(store.load());
  await E.runTask(st, E.createAdapters(ENV, G.f), task({ id: 'brk-task-0010' }), { env: ENV, now: () => new Date(now.getTime() + 20 * 60_000) });
  assert.equal(st.load().failures.groq, 0);
});

test('owner routing excludes OpenRouter even when explicitly requested, while direct adapter tests remain available', async () => {
  const F = fleet();
  const adapters = E.createAdapters(ENV, F.f);
  const order = ['openrouter', 'groq'];
  const s = E.emptyState();
  const { live, notes } = await E.discover(adapters, s, ENV, new Date('2026-11-14T10:00:00Z'), order);
  assert.equal(notes.openrouter, 'disabled_by_policy');
  assert.deepEqual(Object.keys(live), ['groq']);
  assert.ok(E.selectModels({ caps: ['json'], minQuality: 2 }, live, order).every(x => x.provider === 'groq'));
  await E.runTask(new E.MemoryStore(), adapters, task({ id: 'no-openrouter-explicit' }), { env: ENV, order });
  assert.equal(F.calls.filter(c => c.p === 'openrouter').length, 0);
});

test('provider inventory is reused for 30 minutes and refreshed after expiry', async () => {
  const F = fleet();
  const a = E.createAdapters(ENV, F.f), state = E.emptyState();
  const start = new Date('2026-11-14T10:00:00Z');
  await E.discover(a, state, ENV, start);
  const first = F.calls.length;
  assert.ok(first >= 2, 'initial live inventory is fetched');
  const again = await E.discover(a, state, ENV, new Date(start.getTime() + 60_000));
  assert.equal(F.calls.length, first, 'no repeat model-list calls in TTL');
  assert.match(again.notes.groq, /^cached:/);
  await E.discover(a, state, ENV, new Date(start.getTime() + 31 * 60_000));
  assert.ok(F.calls.length > first, 'expired cache is refreshed');
});

test('provider attempts remain capped across repeated resumptions, including when maxAttempts is excessive', async () => {
  const F = fleet({
    groq: () => json(503, {}),
    cloudflare: () => json(503, {}),
    openrouter: () => json(200, completion('should never be used')),
  });
  const store = new E.MemoryStore(), t = task({ id: 'bounded-task' });
  for (let i = 0; i < 4; i++) {
    const result = await E.runTask(store, E.createAdapters(ENV, F.f), t, { env: ENV, maxAttempts: 99 });
    assert.ok(result.task.attempts.filter(a => a.outcome !== 'budget' && a.outcome !== 'cooldown').length <= 3);
  }
  assert.ok(F.chats().length <= 3, 'no extra model requests on repeated resumptions');
  assert.ok(F.chats().every(c => c.p !== 'openrouter'));
});
