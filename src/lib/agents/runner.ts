import { CAPABILITY, idempotencyKey, type ManagerKey } from "./policy";

export type RunOutcome = { run_id: string; status: "completed" | "failed" | "blocked" | "running" | "queued"; error_code: string | null };
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;

/**
 * One manager, one allowlisted capability, executed by the single SQL executor (crm_agent_run_now): the same code path the
 * scheduler uses. Kill switch, limits, idempotency and owner checks are enforced in the database.
 */
export async function runManager(db: { rpc: Rpc }, key: ManagerKey, now = new Date(), capability: string = CAPABILITY[key]): Promise<RunOutcome> {
  const { data, error } = await db.rpc("crm_agent_run_now", { p_manager: key, p_capability: capability, p_key: idempotencyKey(key, now) + ":" + capability });
  if (error) throw new Error(error.message ?? "run_failed");
  return data as RunOutcome;
}

/** Owner-started mission. `steps` null = the daily operations template defined in SQL. */
export async function startMission(db: { rpc: Rpc }, key: string, title: string | null = null, steps: unknown = null) {
  const { data, error } = await db.rpc("crm_agent_mission_start", { p_title: title, p_steps: steps, p_key: key });
  if (error) throw new Error(error.message ?? "mission_failed");
  return data as { mission_id: string; status: string };
}
