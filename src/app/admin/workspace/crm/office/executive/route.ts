import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

type Run = { id: string; manager_key: string; task_title: string; status: string; trigger: string; created_at: string; finished_at: string | null; error_code: string | null; evidence_refs: unknown };

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
    db.from("crm_agent_runs").select("id,manager_key,task_title,status,trigger,created_at,finished_at,error_code,evidence_refs").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    db.from("crm_agent_missions").select("id,status,created_at").gte("created_at", since).limit(200),
    db.from("crm_agent_settings").select("kill_switch,automatic_enabled").eq("id", "avalon").maybeSingle(),
    db.from("crm_ai_usage").select("day,provider,requests,tokens,cost_usd").gte("day", since.slice(0, 10)),
  ]);
  if (runs.error || settings.error) return reply({ error: "Motor de managers no disponible" }, 503);
  const rows = (runs.data ?? []) as Run[];
  const count = (f: (r: Run) => boolean) => rows.filter(f).length;
  const hasEvidence = (r: Run) => Array.isArray(r.evidence_refs) ? r.evidence_refs.length > 0 : !!r.evidence_refs && typeof r.evidence_refs === "object" && Object.keys(r.evidence_refs as object).length > 0;
  const byManager = Object.fromEntries(["ren", "shin", "haru", "sora", "kenji"].map(k => [k, {
    total: count(r => r.manager_key === k), completed: count(r => r.manager_key === k && r.status === "completed"), failed: count(r => r.manager_key === k && (r.status === "failed" || r.status === "blocked")),
  }]));
  const usage = aiUsage.error ? null : (aiUsage.data ?? []) as { provider: string; requests: number; tokens: number; cost_usd: number }[];
  return reply({
    window_days: 7,
    runs: {
      received: rows.length,
      pending: count(r => r.status === "queued"),
      active: count(r => r.status === "running"),
      completed: count(r => r.status === "completed"),
      completed_with_evidence: count(r => r.status === "completed" && hasEvidence(r)),
      failed_or_blocked: count(r => r.status === "failed" || r.status === "blocked"),
      scheduled: count(r => r.trigger === "schedule"),
    },
    by_manager: byManager,
    errors: rows.filter(r => r.status === "failed" || r.status === "blocked").slice(0, 6).map(r => ({ manager: r.manager_key, title: r.task_title, code: r.error_code, at: r.created_at })),
    recent: rows.slice(0, 8).map(r => ({ manager: r.manager_key, title: r.task_title, status: r.status, at: r.finished_at ?? r.created_at })),
    missions: missions.error ? null : { total: (missions.data ?? []).length, completed: (missions.data ?? []).filter(m => m.status === "completed").length },
    control: { kill_switch: settings.data?.kill_switch ?? null, automatic_enabled: settings.data?.automatic_enabled ?? null },
    // AI Engine ledger lives in crm_ai_usage once 20261106090000_ai_engine.sql is applied; until then: not verified here.
    ai: usage === null ? null : {
      requests: usage.reduce((n, u) => n + u.requests, 0), tokens: usage.reduce((n, u) => n + u.tokens, 0),
      cost_usd: usage.reduce((n, u) => n + Number(u.cost_usd), 0), providers: [...new Set(usage.map(u => u.provider))],
    },
    generated_at: new Date().toISOString(),
  });
}
