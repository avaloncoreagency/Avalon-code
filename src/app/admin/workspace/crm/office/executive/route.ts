import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

// An exact head COUNT, or null when the count is unavailable (error, RLS, or a client that returns no count).
async function exactCount(q: PromiseLike<{ count?: number | null; error?: unknown }>): Promise<number | null> {
  try {
    const { count, error } = await q;
    return !error && typeof count === "number" && Number.isFinite(count) ? count : null;
  } catch { return null; }
}

type Run = { id: string; manager_key: string; task_title: string; status: string; trigger: string; created_at: string; finished_at: string | null; error_code: string | null; evidence_refs: unknown };

// Read caps. One extra row is requested so a capped read is DETECTED (KENJI #47/#132): a capped sample is never
// published as a 7-day total. When the cap is hit, totals come from an exact COUNT or are null ("Sin datos").
const RUN_CAP = 500;
const MISSION_CAP = 200;
const MANAGERS = ["ren", "shin", "haru", "sora", "kenji"] as const;

/**
 * Executive view of Avalon HQ. Owner-only (session + RLS). Every number comes from stored rows; when a source does not
 * exist yet (AI Engine tables not migrated, GitHub orders not readable from the app) the value is null and the UI says
 * "Sin datos" / "No verificado" — nothing is estimated.
 */
export async function GET() {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "No autorizado" }, 403);
  const db = session.supabase;
  const since = new Date(Date.now() - 7 * 86400e3).toISOString();
  const [runs, missions, settings, aiUsage] = await Promise.all([
    db.from("crm_agent_runs").select("id,manager_key,task_title,status,trigger,created_at,finished_at,error_code,evidence_refs").gte("created_at", since).order("created_at", { ascending: false }).limit(RUN_CAP + 1),
    db.from("crm_agent_missions").select("id,status,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(MISSION_CAP + 1),
    db.from("crm_agent_settings").select("kill_switch,automatic_enabled").eq("id", "avalon").maybeSingle(),
    db.from("crm_ai_usage").select("day,provider,requests,tokens,cost_usd").gte("day", since.slice(0, 10)),
  ]);
  if (runs.error || settings.error) return reply({ error: "Motor de managers no disponible" }, 503);
  const fetched = (runs.data ?? []) as Run[];
  const runsComplete = fetched.length <= RUN_CAP;
  const rows = fetched.slice(0, RUN_CAP);
  // Exact total only when the cap was hit; a missing/failed count stays null instead of guessing.
  const exactRuns = runsComplete ? rows.length : await exactCount(db.from("crm_agent_runs").select("id", { count: "exact", head: true }).gte("created_at", since));
  const count = (f: (r: Run) => boolean) => rows.filter(f).length;
  const total = (f: (r: Run) => boolean) => (runsComplete ? count(f) : null);
  const hasEvidence = (r: Run) => Array.isArray(r.evidence_refs) ? r.evidence_refs.length > 0 : !!r.evidence_refs && typeof r.evidence_refs === "object" && Object.keys(r.evidence_refs as object).length > 0;
  const statusCounts = (pick: (f: (r: Run) => boolean) => number | null) => ({
    pending: pick(r => r.status === "queued"),
    active: pick(r => r.status === "running"),
    completed: pick(r => r.status === "completed"),
    completed_with_evidence: pick(r => r.status === "completed" && hasEvidence(r)),
    failed_or_blocked: pick(r => r.status === "failed" || r.status === "blocked"),
    scheduled: pick(r => r.trigger === "schedule"),
  });
  const managerCounts = (pick: (f: (r: Run) => boolean) => number | null) => Object.fromEntries(MANAGERS.map(k => [k, {
    total: pick(r => r.manager_key === k), completed: pick(r => r.manager_key === k && r.status === "completed"), failed: pick(r => r.manager_key === k && (r.status === "failed" || r.status === "blocked")),
  }]));
  const missionRows = missions.error ? null : (missions.data ?? []) as { status: string }[];
  const missionsComplete = missionRows !== null && missionRows.length <= MISSION_CAP;
  const usage = aiUsage.error ? null : (aiUsage.data ?? []) as { provider: string; requests: number; tokens: number; cost_usd: number }[];
  return reply({
    window_days: 7,
    // complete=false: the 7-day window holds more rows than the read cap. Totals are then an exact COUNT (received) or
    // null; per-status numbers over the newest RUN_CAP rows are returned separately under `sample`, never as totals.
    data_complete: runsComplete && (missionRows === null || missionsComplete),
    runs: {
      complete: runsComplete,
      partial: !runsComplete,
      received: exactRuns,
      ...statusCounts(total),
      ...(runsComplete ? {} : { sample: { size: rows.length, newest_first: true, ...statusCounts(count) } }),
    },
    by_manager: managerCounts(total),
    ...(runsComplete ? {} : { by_manager_sample: managerCounts(count) }),
    errors: rows.filter(r => r.status === "failed" || r.status === "blocked").slice(0, 6).map(r => ({ manager: r.manager_key, title: r.task_title, code: r.error_code, at: r.created_at })),
    recent: rows.slice(0, 8).map(r => ({ manager: r.manager_key, title: r.task_title, status: r.status, at: r.finished_at ?? r.created_at })),
    missions: missionRows === null ? null : missionsComplete
      ? { total: missionRows.length, completed: missionRows.filter(m => m.status === "completed").length, complete: true }
      : { total: await exactCount(db.from("crm_agent_missions").select("id", { count: "exact", head: true }).gte("created_at", since)), completed: null, complete: false },
    control: { kill_switch: settings.data?.kill_switch ?? null, automatic_enabled: settings.data?.automatic_enabled ?? null },
    // AI Engine ledger lives in crm_ai_usage once 20261106090000_ai_engine.sql is applied; until then: not verified here.
    ai: usage === null ? null : {
      requests: usage.reduce((n, u) => n + u.requests, 0), tokens: usage.reduce((n, u) => n + u.tokens, 0),
      cost_usd: usage.reduce((n, u) => n + Number(u.cost_usd), 0), providers: [...new Set(usage.map(u => u.provider))],
    },
    generated_at: new Date().toISOString(),
  });
}
