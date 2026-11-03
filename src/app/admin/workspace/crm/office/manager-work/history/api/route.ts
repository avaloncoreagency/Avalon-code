import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { isManagerCode } from "@/lib/office/manager-work";

export const dynamic = "force-dynamic";
type RunHistory = {
  run_key: string; manager: string; source: string; status: string;
  started_at: string; finished_at: string | null; lease_until: string;
  result: unknown; error_code: string | null;
};

export async function GET() {
  const session = await getOwnerSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, {
    status: 403, headers: { "Cache-Control": "private, no-store" },
  });
  const { data, error } = await session.supabase.from("office_manager_runs")
    .select("run_key,manager,source,status,started_at,finished_at,lease_until,result,error_code")
    .order("started_at", { ascending: false }).limit(80);
  if (error) return NextResponse.json({ error: "No existe el registro de ejecuciones de staging o falta permiso" }, {
    status: 503, headers: { "Cache-Control": "private, no-store" },
  });

  const now = Date.now();
  const last: Record<string, RunHistory & { display_status: string }> = {};
  for (const raw of (data ?? []) as RunHistory[]) {
    if (!isManagerCode(raw.manager) || last[raw.manager]) continue;
    last[raw.manager] = {
      ...raw,
      display_status: raw.status === "running" && Date.parse(raw.lease_until) < now ? "stalled" : raw.status,
    };
  }
  return NextResponse.json({ last, observedAt: new Date(now).toISOString() }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
