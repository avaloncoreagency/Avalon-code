import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { loadStaffPresence } from "@/lib/office/presence-query";
import { INACTIVE } from "@/lib/office/presence";

export const dynamic = "force-dynamic";

/** Self-only status; never accepts a user ID supplied by the browser. */
export async function GET() {
  const session = await getOwnerSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const result = await loadStaffPresence(session.supabase, [session.user.id]);
  return NextResponse.json({
    presence: result.byUser[session.user.id] ?? INACTIVE,
    observedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
