// Avalon AI Engine — persistent state: tasks (with every provider attempt), daily usage ledger, cooldowns, blocked
// providers and manager memory. Two implementations share one contract: an atomic JSON file (GitHub Actions worker /
// local) and an in-memory one (tests). The Supabase tables in 20261106090000_ai_engine.sql mirror the same shapes.
import type { ModelSpec, ProviderId } from "./catalog";
import type { ChatResult, ErrorKind } from "./adapters";
import type { DataClass } from "./guard";

export type Attempt = { provider: ProviderId; model: string; at: string; ms: number; outcome: "ok" | ErrorKind | "guard" | "budget" | "cooldown"; code?: string };
export type StepState = { status: "done" | "failed"; output: unknown; at: string };
export type TaskRecord = {
  id: string; manager: string; purpose: string; dataClass: DataClass;
  status: "pending" | "running" | "succeeded" | "failed" | "blocked";
  attempts: Attempt[];
  result: (ChatResult & { provider: ProviderId }) | null;
  steps: Record<string, StepState>;
  createdAt: string; updatedAt: string;
};
export type Usage = { requests: number; tokens: number; neurons: number; costUsd: number };
export type MemoryEntry = { manager: string; kind: "decision" | "lesson" | "fact" | "result"; text: string; source: string; at: string };
/** One row per provider call (success or failure): the persistent inference ledger. Tokens/cost come from the provider. */
export type Inference = { taskId: string; manager: string; provider: ProviderId; model: string; at: string; ms: number; input: number; output: number; costUsd: number; outcome: Attempt["outcome"] };
export const INFERENCE_LIMIT = 400;
export type State = {
  version: 1;
  inferences?: Inference[];
  /** Single-flight lease: at most one AI task runs at a time (plus the workflow-level concurrency group). */
  lease?: { taskId: string; until: string } | null;
  /** Consecutive non-rate-limit failures per provider (circuit breaker). */
  failures?: Partial<Record<ProviderId, number>>;
  tasks: Record<string, TaskRecord>;
  /** Reusable provider model listings; bounded to 30 minutes by the router, never holds credentials. */
  modelInventory?: Partial<Record<ProviderId, { at: string; models: ModelSpec[] }>>;
  usage: Record<string, Usage>; // key = `${day}:${provider}`
  cooldownUntil: Partial<Record<ProviderId, string>>;
  blocked: Partial<Record<ProviderId, string>>; // permanent until a human clears it
  memory: MemoryEntry[];
};

export const emptyState = (): State => ({ version: 1, tasks: {}, modelInventory: {}, usage: {}, cooldownUntil: {}, blocked: {}, memory: [], inferences: [], lease: null, failures: {} });

export interface Store {
  load(): State;
  save(s: State): void;
}

export class MemoryStore implements Store {
  private s: State;
  /** Number of saves: tests use it to simulate a crash after N checkpoints. */
  saves = 0;
  constructor(initial?: State, private crashAfter = Infinity) { this.s = structuredClone(initial ?? emptyState()); }
  load() { return structuredClone(this.s); }
  save(s: State) {
    this.s = structuredClone(s);
    if (++this.saves >= this.crashAfter) throw new Error("simulated_crash");
  }
}

export const usageKey = (day: string, p: ProviderId) => `${day}:${p}`;
export const utcDay = (d: Date) => d.toISOString().slice(0, 10);
export const MEMORY_LIMIT = 200;

export function remember(s: State, e: MemoryEntry) {
  s.memory.push({ ...e, text: e.text.slice(0, 600) });
  if (s.memory.length > MEMORY_LIMIT) s.memory.splice(0, s.memory.length - MEMORY_LIMIT);
}
export const recall = (s: State, manager: string, n = 8) => s.memory.filter(m => m.manager === manager).slice(-n);
