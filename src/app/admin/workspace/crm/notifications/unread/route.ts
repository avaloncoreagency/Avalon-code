import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** Personal task notifications only; membership is checked on the server and RLS enforces recipient. */
export async function GET() {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "No autorizado" }, 403);
  const { count, error } = await session.supabase.from("crm_notifications")
    .select("id", { head: true, count: "exact" })
    .eq("recipient_id", session.userId)
    .eq("category", "task")
    .is("read_at", null);
  if (error) return reply({ error: "Avisos no disponibles" }, 503);
  return reply({ unread: Math.max(0, count ?? 0) });
}
