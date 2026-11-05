// REN 0352-A: reject unverified manager telemetry at the owner-only HQ UI boundary.
// This is intentionally a shape guard, not a second execution engine or permission check.
import type { HqActivity } from "./hq-3d";

const MANAGERS = ["ren", "shin", "haru", "sora", "kenji"] as const;
const STATUSES = ["idle", "queued", "running", "completed", "failed", "blocked", "stale"] as const;
const asRecord = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const optionalString = (v: unknown) => v === null || typeof v === "string";

/** A successful HTTP response is not evidence unless it includes the actual five run records. */
export function parseHqActivity(payload: unknown): HqActivity | null {
  const root = asRecord(payload);
  const meta = asRecord(root?.meta);
  if (!meta || typeof meta.kill_switch !== "boolean" ||
      typeof meta.automatic_enabled !== "boolean" || typeof meta.executor_kind !== "string") return null;
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
    // A claimed live execution without an identifiable run or start time must not light a desk.
    if (m.status === "running" && (!m.run_id || !m.started_at ||
        !Number.isFinite(Date.parse(m.started_at as string)))) return null;
    seen.add(m.manager_key);
  }
  return payload as HqActivity;
}
