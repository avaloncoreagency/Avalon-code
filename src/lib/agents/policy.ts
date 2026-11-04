// Pure policy for the five office managers. Deterministic, free executors only: nothing here calls an AI provider,
// the network, a shell or any write path other than the owner-only run RPCs.
export const MANAGER_KEYS = ["ren", "shin", "haru", "sora", "kenji"] as const;
export type ManagerKey = (typeof MANAGER_KEYS)[number];
export type ManagerStatus = "idle" | "queued" | "running" | "completed" | "failed" | "blocked" | "stale";

/** Capability allowlist: one read-only task per manager. Mirrors public.crm_agent_capabilities (the DB enforces it). */
export const CAPABILITY: Record<ManagerKey, string> = {
  ren: "operations_plan", shin: "security_posture", haru: "crm_followups", sora: "radar_review_queue", kenji: "data_quality_cost",
};

export const isManagerKey = (v: unknown): v is ManagerKey => typeof v === "string" && (MANAGER_KEYS as readonly string[]).includes(v);

export type RunRow = {
  id: string; manager_key: ManagerKey; task_title: string; status: "queued" | "running" | "completed" | "failed" | "blocked";
  started_at: string | null; finished_at: string | null; lease_until: string | null; result_summary: string; evidence_refs: unknown;
  error_code: string | null; updated_at: string;
};
export type EvidenceRef = { type: string; id: string; label?: string };
export type ManagerActivity = {
  manager_key: ManagerKey; run_id: string | null; status: ManagerStatus; task_title: string; started_at: string | null; finished_at: string | null;
  result_summary: string; evidence_refs: EvidenceRef[]; error_code: string | null; updated_at: string | null;
};

/** `stale` is derived, never stored: a running run whose lease expired, or a completed run older than the freshness window. */
export function deriveStatus(run: Pick<RunRow, "status" | "lease_until" | "finished_at"> | null, now: Date, freshnessHours: number): ManagerStatus {
  if (!run) return "idle";
  if (run.status === "running") return run.lease_until && new Date(run.lease_until) <= now ? "stale" : "running";
  if (run.status === "completed" && run.finished_at && now.getTime() - new Date(run.finished_at).getTime() > freshnessHours * 3600_000) return "stale";
  return run.status;
}

const cleanRefs = (v: unknown): EvidenceRef[] => (Array.isArray(v) ? v : []).slice(0, 20).flatMap(r => {
  const o = r as Record<string, unknown>;
  return o && typeof o.type === "string" && typeof o.id === "string" ? [{ type: o.type.slice(0, 40), id: o.id.slice(0, 80), ...(typeof o.label === "string" ? { label: o.label.slice(0, 120) } : {}) }] : [];
});

/** Latest run per manager → the agreed 10-field contract. Always returns exactly five entries, in a fixed order. */
export function buildActivity(runs: RunRow[], titles: Partial<Record<ManagerKey, string>>, now: Date, freshnessHours: number): ManagerActivity[] {
  return MANAGER_KEYS.map(key => {
    const latest = runs.filter(r => r.manager_key === key).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
    return {
      manager_key: key, run_id: latest?.id ?? null, status: deriveStatus(latest, now, freshnessHours),
      task_title: latest?.task_title ?? titles[key] ?? CAPABILITY[key], started_at: latest?.started_at ?? null, finished_at: latest?.finished_at ?? null,
      result_summary: (latest?.result_summary ?? "").slice(0, 2000), evidence_refs: cleanRefs(latest?.evidence_refs),
      error_code: latest?.error_code ?? null, updated_at: latest?.updated_at ?? null,
    };
  });
}

/** Idempotency key: one run per manager per 5-minute bucket, so a double click or retry never runs twice. */
export const idempotencyKey = (key: ManagerKey, now: Date) => `${key}-${Math.floor(now.getTime() / 300_000)}`;
