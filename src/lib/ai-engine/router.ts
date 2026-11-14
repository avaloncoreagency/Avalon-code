// Avalon AI Engine — capability-based model selection with automatic provider failover and resumable task state.
// Every attempt is checkpointed to the Store BEFORE the next one starts, so a crash or a new worker run resumes the same
// task: a succeeded task is never re-sent, and providers that already failed for it are skipped.
import { PROVIDERS, estimateNeurons, type Capability, type ModelSpec, type ProviderId } from "./catalog";
import { ProviderError, type Adapter, type ChatResult, type Msg } from "./adapters";
import { GuardError, assertProviderAllowed, assertSendable, type DataClass } from "./guard";
import { INFERENCE_LIMIT, usageKey, utcDay, type Attempt, type State, type Store, type TaskRecord } from "./store";

export type Requirements = { caps: Capability[]; minQuality: number; minContext?: number; prefer?: "quality" | "speed" };
export type Candidate = { provider: ProviderId; model: ModelSpec; score: number };
export type AiTask = {
  id: string; manager: string; purpose: string; dataClass: DataClass;
  messages: Msg[]; maxTokens: number; requirements: Requirements; json?: boolean;
};
export type RunOptions = { env: Record<string, string | undefined>; now?: () => Date; order?: ProviderId[]; maxAttempts?: number };
export type RunOutcome = { task: TaskRecord; resumed: boolean };

// Owner policy: OpenRouter is intentionally excluded, even if a stale key exists.
const ROUTABLE: ProviderId[] = ["groq", "cloudflare", "oracle"];
const MAX_PROVIDER_ATTEMPTS_PER_TASK = 3;
const MODEL_INVENTORY_TTL_MS = 30 * 60_000;
const allowedOrder = (order: ProviderId[] = ROUTABLE) => [...new Set(order)].filter(p => p !== "openrouter");

/** Rank every live model that satisfies the requirements. Pure: used directly by tests and by the worker's plan. */
export function selectModels(req: Requirements, live: Partial<Record<ProviderId, ModelSpec[]>>, order: ProviderId[] = ROUTABLE): Candidate[] {
  const out: Candidate[] = [];
  for (const [i, provider] of allowedOrder(order).entries()) {
    for (const model of live[provider] ?? []) {
      if (model.quality < req.minQuality) continue;
      if (req.minContext && model.context < req.minContext) continue;
      if (!req.caps.every(c => model.caps.includes(c))) continue;
      const speed = model.caps.includes("fast") ? 1 : 0;
      const score = req.prefer === "speed" ? speed * 40 + model.quality * 5 : model.quality * 10 + speed * 2;
      out.push({ provider, model, score: score - i * 0.5 });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

const estTokens = (msgs: Msg[], maxOut: number) => Math.ceil(msgs.reduce((n, m) => n + m.content.length, 0) / 3.5) + maxOut;

function withinBudget(s: State, p: ProviderId, day: string, tokens: number, maxOut: number): boolean {
  const u = s.usage[usageKey(day, p)] ?? { requests: 0, tokens: 0, neurons: 0, costUsd: 0 };
  const cap = PROVIDERS[p].daily;
  if (u.costUsd > 0) return false;
  if (u.requests + 1 > cap.requests || u.tokens + tokens > cap.tokens) return false;
  if (cap.neurons !== undefined && u.neurons + estimateNeurons(tokens - maxOut, maxOut) > cap.neurons) return false;
  return true;
}

function addUsage(s: State, p: ProviderId, day: string, r: ChatResult | null) {
  const k = usageKey(day, p);
  const u = s.usage[k] ?? { requests: 0, tokens: 0, neurons: 0, costUsd: 0 };
  u.requests += 1;
  if (r) {
    u.tokens += r.usage.input + r.usage.output;
    if (p === "cloudflare") u.neurons += estimateNeurons(r.usage.input, r.usage.output);
    u.costUsd += r.costUsd;
  }
  s.usage[k] = u;
}

/** Discover live free models per provider (cached per call). A provider whose listing fails is simply not routable. */
export async function discover(adapters: Record<ProviderId, Adapter>, s: State, env: Record<string, string | undefined>, now: Date, order = ROUTABLE) {
  const live: Partial<Record<ProviderId, ModelSpec[]>> = {};
  const notes: Record<string, string> = {};
  if (order.includes("openrouter")) notes.openrouter = "disabled_by_policy";
  for (const p of allowedOrder(order)) {
    if (PROVIDERS[p].status !== "operational" && env.ORACLE_AI_VERIFIED !== "true") { notes[p] = "prepared_not_operational"; continue; }
    if (s.blocked[p]) { notes[p] = "blocked:" + s.blocked[p]; continue; }
    const cd = s.cooldownUntil[p];
    if (cd && new Date(cd) > now) { notes[p] = "cooldown_until:" + cd; continue; }
    if (!adapters[p].configured) { notes[p] = "not_configured"; continue; }
    const cached = s.modelInventory?.[p];
    const cacheAge = cached ? now.getTime() - Date.parse(cached.at) : NaN;
    if (cached && Number.isFinite(cacheAge) && cacheAge >= 0 && cacheAge < MODEL_INVENTORY_TTL_MS) {
      live[p] = cached.models;
      notes[p] = `cached:${cached.models.length}`;
      continue;
    }
    try {
      const models = await adapters[p].listModels();
      live[p] = models;
      (s.modelInventory ??= {})[p] = { at: now.toISOString(), models };
      notes[p] = `${models.length} modelos gratuitos`;
    } catch (e) { notes[p] = e instanceof ProviderError ? e.kind : "list_failed"; }
  }
  return { live, notes };
}

export const LEASE_MS = 10 * 60_000;
export const BREAKER = { failures: 3, cooldownMs: 15 * 60_000 };

function logInference(s: State, t: AiTask, a: Attempt, r: ChatResult | null) {
  (s.inferences ??= []).push({ taskId: t.id, manager: t.manager, provider: a.provider, model: a.model, at: a.at, ms: a.ms, input: r?.usage.input ?? 0, output: r?.usage.output ?? 0, costUsd: r?.costUsd ?? 0, outcome: a.outcome });
  if (s.inferences.length > INFERENCE_LIMIT) s.inferences.splice(0, s.inferences.length - INFERENCE_LIMIT);
}
/** Circuit breaker: three consecutive hard failures (5xx / timeout / invalid response) put the provider in a 15-minute cooldown. */
function noteOutcome(s: State, p: ProviderId, ok: boolean, hard: boolean, now: Date) {
  const f = (s.failures ??= {});
  if (ok) { f[p] = 0; return; }
  if (!hard) return;
  f[p] = (f[p] ?? 0) + 1;
  if (f[p]! >= BREAKER.failures) { s.cooldownUntil[p] = new Date(now.getTime() + BREAKER.cooldownMs).toISOString(); f[p] = 0; }
}

export async function runTask(store: Store, adapters: Record<ProviderId, Adapter>, t: AiTask, o: RunOptions): Promise<RunOutcome> {
  const now = o.now ?? (() => new Date());
  const s0 = store.load();
  const existing = s0.tasks[t.id];
  if (existing?.status === "succeeded") return { task: existing, resumed: true };
  // Concurrency: one AI task at a time. Another task's live lease means this one waits (nothing is sent, nothing is lost).
  if (s0.lease && Date.parse(s0.lease.until) > now().getTime() && s0.lease.taskId !== t.id) {
    const iso0 = now().toISOString();
    return { task: existing ?? { id: t.id, manager: t.manager, purpose: t.purpose, dataClass: t.dataClass, status: "pending", attempts: [], result: null, steps: {}, createdAt: iso0, updatedAt: iso0 }, resumed: false };
  }
  try { return await execute(store, adapters, t, o, existing); } finally { const s = store.load(); if (s.lease?.taskId === t.id) { s.lease = null; store.save(s); } }
}

async function execute(store: Store, adapters: Record<ProviderId, Adapter>, t: AiTask, o: RunOptions, existing: TaskRecord | undefined): Promise<RunOutcome> {
  const now = o.now ?? (() => new Date());
  const s = store.load();

  // Guards first: nothing is sent if the data or the environment is not allowed.
  assertSendable(t.dataClass, t.messages.map(m => m.content));
  const iso = now().toISOString();
  const task: TaskRecord = existing ?? { id: t.id, manager: t.manager, purpose: t.purpose, dataClass: t.dataClass, status: "pending", attempts: [], result: null, steps: {}, createdAt: iso, updatedAt: iso };
  const resumed = !!existing;
  task.status = "running";
  s.tasks[t.id] = task;
  s.lease = { taskId: t.id, until: new Date(now().getTime() + LEASE_MS).toISOString() };
  store.save(s);

  const order = allowedOrder(o.order);
  const { live } = await discover(adapters, s, o.env, now(), order);
  const candidates = selectModels(t.requirements, live, order);
  // Skip (provider, model) pairs that already failed permanently for this task; providers whose failure was transient are
  // re-tried only after their cooldown.
  const deadPairs = new Set(task.attempts.filter(a => ["bad_request", "invalid_response", "guard"].includes(a.outcome)).map(a => a.provider + "|" + a.model));
  const deadProviders = new Set<ProviderId>(task.attempts.filter(a => a.outcome === "auth").map(a => a.provider));
  // A task has one lifetime attempt allowance: resuming it cannot silently buy more provider attempts.
  const requestedAttempts = Number.isInteger(o.maxAttempts) ? o.maxAttempts! : MAX_PROVIDER_ATTEMPTS_PER_TASK;
  const maxAttempts = Math.max(0, Math.min(MAX_PROVIDER_ATTEMPTS_PER_TASK, requestedAttempts));
  let tried = task.attempts.filter(a => a.outcome !== "budget" && a.outcome !== "cooldown").length;

  for (const c of candidates) {
    if (tried >= maxAttempts) break;
    if (deadProviders.has(c.provider) || deadPairs.has(c.provider + "|" + c.model.id)) continue;
    const day = utcDay(now());
    const cd = s.cooldownUntil[c.provider];
    if (cd && new Date(cd) > now()) continue;
    const tokens = estTokens(t.messages, t.maxTokens);
    const attempt: Attempt = { provider: c.provider, model: c.model.id, at: now().toISOString(), ms: 0, outcome: "ok" };
    if (!withinBudget(s, c.provider, day, tokens, t.maxTokens)) {
      attempt.outcome = "budget"; task.attempts.push(attempt); logInference(s, t, attempt, null); deadProviders.add(c.provider); store.save(s); continue;
    }
    tried++;
    const t0 = Date.now();
    try {
      assertProviderAllowed(c.provider, o.env);
      const r = await adapters[c.provider].chat({ model: c.model.id, messages: t.messages, maxTokens: t.maxTokens, json: t.json });
      attempt.ms = Date.now() - t0;
      addUsage(s, c.provider, day, r);
      noteOutcome(s, c.provider, true, false, now());
      task.attempts.push(attempt); logInference(s, t, attempt, r);
      task.result = { ...r, provider: c.provider };
      task.status = "succeeded";
      task.updatedAt = now().toISOString();
      store.save(s);
      return { task, resumed };
    } catch (e) {
      attempt.ms = Date.now() - t0;
      if (e instanceof GuardError) {
        attempt.outcome = "guard"; attempt.code = e.code;
        s.blocked[c.provider] = e.code; // a cost signal or a billing response disables the provider until a human clears it
        deadProviders.add(c.provider);
      } else if (e instanceof ProviderError) {
        attempt.outcome = e.kind; attempt.code = String(e.status || "");
        if (e.kind === "rate_limited") s.cooldownUntil[c.provider] = new Date(now().getTime() + e.retryAfterMs).toISOString();
        if (["rate_limited", "auth", "unavailable", "timeout", "not_configured"].includes(e.kind)) deadProviders.add(c.provider);
        addUsage(s, c.provider, day, null);
        noteOutcome(s, c.provider, false, ["unavailable", "timeout", "invalid_response"].includes(e.kind), now());
      } else {
        attempt.outcome = "invalid_response"; attempt.code = (e as Error).message.slice(0, 80);
      }
      task.attempts.push(attempt); logInference(s, t, attempt, null);
      task.updatedAt = now().toISOString();
      store.save(s); // checkpoint every failed attempt before failing over
    }
  }
  task.status = candidates.length ? "failed" : "blocked";
  task.updatedAt = now().toISOString();
  store.save(s);
  return { task, resumed };
}

/** Total recorded inference cost (must stay 0). */
export const totalCost = (s: State) => Object.values(s.usage).reduce((n, u) => n + u.costUsd, 0);
