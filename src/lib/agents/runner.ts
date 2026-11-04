import { CAPABILITY, idempotencyKey, type ManagerKey } from "./policy";
import { EXECUTORS, type AgentDb } from "./executors";

export type RunOutcome = { run_id: string; status: "completed" | "failed" | "blocked" | "running"; error_code: string | null };
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;

/** enqueue → claim (kill switch, limits, lease) → deterministic executor → complete/fail. Any executor error is recorded, never swallowed. */
export async function runManager(db: AgentDb & { rpc: Rpc }, key: ManagerKey, now = new Date()): Promise<RunOutcome> {
  const enq = await db.rpc("crm_agent_enqueue", { p_manager: key, p_capability: CAPABILITY[key], p_key: idempotencyKey(key, now) });
  if (enq.error) throw new Error(enq.error.message ?? "enqueue_failed");
  const run = enq.data as string;
  const claim = await db.rpc("crm_agent_claim", { p_run: run });
  if (claim.error) throw new Error(claim.error.message ?? "claim_failed");
  const c = claim.data as { claimed: boolean; status: RunOutcome["status"]; error_code: string | null };
  if (!c.claimed) return { run_id: run, status: c.status, error_code: c.error_code };
  try {
    const report = await EXECUTORS[key](db, now);
    const done = await db.rpc("crm_agent_complete", { p_run: run, p_summary: report.summary, p_result: report.result, p_evidence: report.evidence });
    if (done.error) throw new Error(done.error.message ?? "complete_failed");
    return { run_id: run, status: "completed", error_code: null };
  } catch {
    await db.rpc("crm_agent_fail", { p_run: run, p_code: "executor_error" });
    return { run_id: run, status: "failed", error_code: "executor_error" };
  }
}
