import { executeManagerCheck, isManagerCode, type CountReader, type ManagerCode, type ManagerReport } from "./manager-work";

/** Explicit, trusted command. Free-text Office requests are never executed as code or LLM prompts. */
export const SAFE_OFFICE_COMMAND = "AVALON_MANAGER_CHECK_V1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export type WorkerSource = "scheduled" | "requested";
export type WorkerResult = {
  manager: ManagerCode;
  runKey: string;
  status: "completed" | "failed" | "duplicate";
  observedAt: string;
};
export type RunStore = {
  /** Atomic claim (unique key, 4-minute lease, at most 3 attempts). Null = already completed/running. */
  claim(runKey: string, manager: ManagerCode, source: WorkerSource, requestId: string | null): Promise<string | null>;
  /** Must conditionally finish only when claim token still owns the lease. */
  finish(runKey: string, token: string, status: "completed" | "failed", result: ManagerReport | null, errorCode: string | null): Promise<boolean>;
};

export function workerRunKey(manager: ManagerCode, source: WorkerSource, now: Date, requestId: string | null): string {
  if (!isManagerCode(manager) || !Number.isFinite(now.getTime())) throw new Error("invalid_run");
  if (source === "scheduled" && requestId === null) {
    return `scheduled:${manager}:${now.toISOString().slice(0, 13)}`;
  }
  if (source === "requested" && typeof requestId === "string" && UUID.test(requestId)) {
    return `request:${requestId.toLowerCase()}`;
  }
  throw new Error("invalid_run");
}

/** One persisted result per hour/manager or per explicit safe Office request. */
export async function executeWorkerRun(
  manager: ManagerCode,
  source: WorkerSource,
  requestId: string | null,
  store: RunStore,
  countReader: CountReader,
  now: Date = new Date(),
): Promise<WorkerResult> {
  const runKey = workerRunKey(manager, source, now, requestId);
  const observedAt = now.toISOString();
  const token = await store.claim(runKey, manager, source, requestId);
  if (token === null) return { manager, runKey, status: "duplicate", observedAt };
  if (!UUID.test(token)) throw new Error("invalid_claim_token");

  let result: ManagerReport | null = null;
  let status: "completed" | "failed" = "failed";
  try {
    result = await executeManagerCheck(manager, countReader, now, "staging_service_worker");
    if (result.status === "completed") status = "completed";
  } catch {
    // Keep errors outside the persisted run, avoiding leaks of secrets and customer details.
    result = null;
  }
  const saved = await store.finish(runKey, token, status, status === "completed" ? result : null,
    status === "completed" ? null : "check_unavailable");
  if (!saved) throw new Error("lease_lost");
  return { manager, runKey, status, observedAt };
}
