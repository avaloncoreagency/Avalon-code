import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { buildActivity, type RunRow } from "@/lib/agents/policy";

export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

/** Contract: docs/office/MANAGER_ACTIVITY_CONTRACT.md. Owner-only (session + RLS); never exposes anything to GitHub. */
export async function GET() {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "No autorizado" }, 403);
  const db = session.supabase;
  const [runs, settings, caps] = await Promise.all([
    db.from("crm_agent_runs").select("id,manager_key,task_title,status,started_at,finished_at,lease_until,result_summary,evidence_refs,error_code,updated_at").order("updated_at", { ascending: false }).limit(100),
    db.from("crm_agent_settings").select("kill_switch,automatic_enabled,freshness_hours").eq("id", "avalon").maybeSingle(),
    db.from("crm_agent_capabilities").select("manager_key,title"),
  ]);
  if (runs.error || settings.error || caps.error) return reply({ error: "Motor de managers no disponible" }, 503);
  const s = settings.data ?? { kill_switch: false, automatic_enabled: false, freshness_hours: 24 };
  const titles = Object.fromEntries((caps.data ?? []).map(c => [c.manager_key, c.title]));
  const now = new Date();
  return reply({
    managers: buildActivity((runs.data ?? []) as RunRow[], titles, now, s.freshness_hours),
    meta: { executor_kind: "deterministic", kill_switch: s.kill_switch, automatic_enabled: s.automatic_enabled, freshness_hours: s.freshness_hours, generated_at: now.toISOString() },
  });
}
