import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { isManagerKey } from "@/lib/agents/policy";
import { runManager, startMission } from "@/lib/agents/runner";

export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

/** Owner-initiated run of one manager's single allowlisted task, or the emergency stop. Same-origin only (CSRF). */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) return reply({ error: "Origen no permitido" }, 403);
  const session = await getOwnerSession();
  if (!session) return reply({ error: "No autorizado" }, 403);
  const body = await request.json().catch(() => null) as { manager_key?: unknown; kill_switch?: unknown; automatic?: unknown; mission?: unknown } | null;
  if (!body) return reply({ error: "Solicitud inválida" }, 400);
  if (typeof body.kill_switch === "boolean") {
    const { error } = await session.supabase.rpc("crm_agent_set_kill_switch", { p_on: body.kill_switch });
    return error ? reply({ error: "No se pudo cambiar el interruptor" }, 500) : reply({ kill_switch: body.kill_switch });
  }
  if (typeof body.automatic === "boolean") {
    const { error } = await session.supabase.rpc("crm_agent_set_automatic", { p_on: body.automatic });
    return error ? reply({ error: "No se pudo cambiar el modo automático" }, 500) : reply({ automatic_enabled: body.automatic });
  }
  if (body.mission === "daily") {
    try {
      // One daily mission per owner per UTC day from the button; the scheduler uses its own key.
      return reply(await startMission(session.supabase as never, `daily-${session.user.id}-${new Date().toISOString().slice(0, 10)}`));
    } catch {
      return reply({ error: "No se pudo iniciar la misión" }, 500);
    }
  }
  if (!isManagerKey(body.manager_key)) return reply({ error: "Manager inválido" }, 400);
  try {
    return reply(await runManager(session.supabase as never, body.manager_key));
  } catch {
    return reply({ error: "No se pudo ejecutar la tarea" }, 500);
  }
}
