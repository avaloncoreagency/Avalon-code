// Avalon AI Engine — LIVE smoke test (synthetic data only). Proves, with real provider responses:
//  1. each configured provider lists verifiably-free models and answers one synthetic request;
//  2. capability-based selection per manager profile;
//  3. automatic failover (a forced rate limit on the first provider → the task completes on the next one);
//  4. resume (re-running a succeeded task id sends nothing);
//  5. $0: no cost reported, OpenRouter key usage unchanged before/after.
// Writes evidence JSON (no secrets, no prompts beyond the synthetic ones below). Exit 1 on any cost or if no provider works.
const fs = require('node:fs');
const E = require('./engine.cjs');

const out = process.argv[2] || '.ai-engine/smoke-evidence.json';
const env = process.env;
const synthetic = (p) => [
  { role: 'system', content: 'Eres un verificador de conexión. Responde SOLO con JSON válido.' },
  { role: 'user', content: `Devuelve {"ok":true,"provider":"${p}","sum":${2 + 3}} sin texto adicional.` },
];

(async () => {
  const ev = { at: new Date().toISOString(), sha: env.GITHUB_SHA || null, providers: {}, selection: {}, failover: null, resume: null, cost: {} };
  const store = new E.MemoryStore();
  const adapters = E.createAdapters(env);

  if (env.OPENROUTER_API_KEY) { try { ev.cost.openrouterBefore = await E.openRouterKeyStatus(env); } catch (e) { ev.cost.openrouterBefore = { error: e.message }; } }

  const { live, notes } = await E.discover(adapters, store.load(), env, new Date());
  for (const p of ['groq', 'cloudflare', 'openrouter', 'oracle']) {
    ev.providers[p] = { status: notes[p], models: (live[p] || []).map(m => m.id).slice(0, 12) };
    if (!live[p] || !live[p].length) continue;
    const r = await E.runTask(store, adapters, {
      id: `smoke-${p}-${Date.now()}`, manager: 'kenji', purpose: `Prueba de conexión ${p}`, dataClass: 'synthetic',
      messages: synthetic(p), maxTokens: 300, json: false, requirements: { caps: [], minQuality: 1, prefer: 'speed' },
    }, { env, order: [p] });
    const text = r.task.result ? r.task.result.text : '';
    ev.providers[p].call = { status: r.task.status, model: r.task.result && r.task.result.model, attempts: r.task.attempts, okJson: /"ok"\s*:\s*true/.test(text), sample: text.slice(0, 160) };
  }

  for (const w of E.activeWorkers()) ev.selection[w.key] = E.selectModels(w.ai.requirements, live).slice(0, 3).map(c => `${c.provider}:${c.model.id}`);

  // Failover: wrap the first working provider so it answers 429; the router must checkpoint it and move on.
  const working = Object.keys(ev.providers).filter(p => ev.providers[p].call && ev.providers[p].call.status === 'succeeded');
  if (working.length >= 2) {
    const first = working[0];
    const forced = { ...adapters, [first]: { ...adapters[first], chat: async () => { throw new E.ProviderError(first, 'rate_limited', 429, 60000); } } };
    const id = `smoke-failover-${Date.now()}`;
    const task = { id, manager: 'ren', purpose: 'Failover forzado', dataClass: 'synthetic', messages: synthetic('failover'), maxTokens: 300, requirements: { caps: [], minQuality: 1 } };
    const r = await E.runTask(store, forced, task, { env, order: working });
    // Resume: same id again must not call any provider.
    let calls = 0;
    const counting = Object.fromEntries(Object.entries(adapters).map(([k, a]) => [k, { ...a, chat: async (q) => { calls++; return a.chat(q); } }]));
    const again = await E.runTask(store, counting, task, { env, order: working });
    ev.failover = { forcedFailure: `${first}: 429 simulado`, status: r.task.status, servedBy: r.task.result && `${r.task.result.provider}:${r.task.result.model}`, attempts: r.task.attempts.map(a => `${a.provider}:${a.outcome}`) };
    ev.resume = { resumed: again.resumed, newProviderCalls: calls, sameResult: again.task.result && r.task.result && again.task.result.text === r.task.result.text };
  } else {
    ev.failover = { skipped: `se necesitan 2 proveedores operativos; hay ${working.length}` };
  }

  if (env.OPENROUTER_API_KEY) { try { ev.cost.openrouterAfter = await E.openRouterKeyStatus(env); } catch (e) { ev.cost.openrouterAfter = { error: e.message }; } }
  const s = store.load();
  ev.cost.ledgerUsd = E.totalCost(s);
  ev.cost.usage = s.usage;
  ev.cost.blocked = s.blocked;
  const orDelta = ev.cost.openrouterBefore && ev.cost.openrouterAfter && 'usage' in ev.cost.openrouterBefore && 'usage' in ev.cost.openrouterAfter
    ? ev.cost.openrouterAfter.usage - ev.cost.openrouterBefore.usage : null;
  ev.cost.openrouterUsageDelta = orDelta;

  fs.mkdirSync(require('node:path').dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(ev, null, 2));
  const lines = ['## Avalon AI Engine — smoke', '', '| Proveedor | Estado | Llamada | Modelo |', '|---|---|---|---|',
    ...Object.entries(ev.providers).map(([p, v]) => `| ${p} | ${v.status} | ${v.call ? v.call.status + (v.call.okJson ? ' (JSON ok)' : '') : '—'} | ${v.call ? v.call.model : '—'} |`),
    '', `Failover: ${JSON.stringify(ev.failover)}`, `Resume: ${JSON.stringify(ev.resume)}`,
    `Coste: ledger $${ev.cost.ledgerUsd}, OpenRouter delta ${orDelta}, bloqueados ${JSON.stringify(ev.cost.blocked)}`];
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  if (ev.cost.ledgerUsd > 0 || (orDelta !== null && orDelta > 0) || Object.keys(ev.cost.blocked).length) { console.error('COST GUARD TRIPPED'); process.exit(1); }
  if (!working.length) { console.error('NO PROVIDER WORKED'); process.exit(1); }
})().catch(e => { console.error('smoke_failed', e.message); process.exit(1); });
