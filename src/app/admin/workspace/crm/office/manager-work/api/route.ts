import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { executeManagerCheck, isManagerCode } from "@/lib/office/manager-work";

export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/**
 * Immediate, deterministic execution under the verified owner's session.
 * No service-role key, paid provider, agent process, SQL writes or fake heartbeat.
 */
export async function POST(request: NextRequest) {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "No autorizado" }, 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return reply({ error: "Origen no permitido" }, 403);
  if (Number(request.headers.get("content-length") ?? 0) > 1024) return reply({ error: "Solicitud demasiado grande" }, 413);
  let body: unknown;
  try { body = await request.json(); } catch { return reply({ error: "JSON inválido" }, 400); }
  const manager = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).manager : null;
  if (!isManagerCode(manager)) return reply({ error: "Manager inválido" }, 400);

  const result = await executeManagerCheck(manager, async spec => {
    // HEAD queries with exact counts avoid row limits and fetching client details.
    let query = session.supabase.from(spec.table).select(spec.table === "agency_memberships" ? "user_id" : "id", { count: "exact", head: true });
    for (const filter of spec.filters) {
      if (filter.op === "eq") query = query.eq(filter.column, String(filter.value));
      else if (filter.op === "lt") query = query.lt(filter.column, String(filter.value));
      else if (filter.op === "in") query = query.in(filter.column, [...filter.value as readonly string[]]);
    }
    const { count, error } = await query;
    if (error || count === null || count === undefined) throw new Error("count_unavailable");
    return count;
  });
  return reply(result, result.status === "completed" ? 200 : 503);
}
