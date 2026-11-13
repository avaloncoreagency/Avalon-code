// REN 0352-A: reject unverified manager telemetry at the owner-only HQ UI boundary.
// This is intentionally a shape guard, not a second execution engine or permission check.
import type { HqActivity } from "./hq-3d";

const MANAGERS = ["ren", "shin", "haru", "sora", "kenji"] as const;
const STATUSES = ["idle", "queued", "running", "completed", "failed", "blocked", "stale"] as const;
const asRecord = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const optionalString = (v: unknown) => v === null || typeof v === "string";

/** A successful HTTP response is not evidence unless it includes the actual five run records. */
export function parseHqActivity(payload: unknown, nowMs = Date.now()): HqActivity | null {
  const root = asRecord(payload);
  const meta = asRecord(root?.meta);
  if (!meta || typeof meta.kill_switch !== "boolean" ||
      typeof meta.automatic_enabled !== "boolean" || typeof meta.executor_kind !== "string") return null;
  // A syntactically valid 200 response can still be an old replay or a future-dated
  // snapshot. The server stamps generated_at on every owner-only activity response.
  // Fail closed rather than lighting desks for unverifiable stale telemetry.
  if (typeof meta.generated_at !== "string" || !Number.isFinite(nowMs)) return null;
  const generatedMs = Date.parse(meta.generated_at);
  if (!Number.isFinite(generatedMs) || Math.abs(nowMs - generatedMs) > 120_000) return null;
  const managers = root?.managers;
  if (!Array.isArray(managers) || managers.length !== MANAGERS.length) return null;
  const seen = new Set<string>();
  for (const item of managers) {
    const m = asRecord(item);
    if (!m || typeof m.manager_key !== "string" ||
        !(MANAGERS as readonly string[]).includes(m.manager_key) || seen.has(m.manager_key) ||
        typeof m.status !== "string" || !(STATUSES as readonly string[]).includes(m.status) ||
        !optionalString(m.run_id) || !optionalString(m.started_at) ||
        !optionalString(m.finished_at) || !optionalString(m.error_code) ||
        !optionalString(m.updated_at) || typeof m.task_title !== "string" ||
        typeof m.result_summary !== "string" || !Array.isArray(m.evidence_refs)) return null;
    // All non-idle states must refer to a real run. Otherwise a malformed HTTP 200
    // could paint a desk green for a completed execution that never existed.
    if (m.status === "idle" ? m.run_id !== null :
        typeof m.run_id !== "string" || m.run_id.trim().length === 0) return null;
    // Snapshot freshness alone is insufficient: a run cannot finish before it starts,
    // nor can it report events far in the future relative to the server snapshot.
    const startedMs = typeof m.started_at === "string" ? Date.parse(m.started_at) : null;
    const finishedMs = typeof m.finished_at === "string" ? Date.parse(m.finished_at) : null;
    if ((startedMs !== null && (!Number.isFinite(startedMs) || startedMs > generatedMs + 120_000)) ||
        (finishedMs !== null && (!Number.isFinite(finishedMs) || finishedMs > generatedMs + 120_000)) ||
        (startedMs !== null && finishedMs !== null && finishedMs < startedMs)) return null;
    if (m.status === "completed" && finishedMs === null) return null;
    // A claimed live execution without an identifiable start time must not light a desk.
    if (m.status === "running" && startedMs === null) return null;
    seen.add(m.manager_key);
  }
  return payload as HqActivity;
}
