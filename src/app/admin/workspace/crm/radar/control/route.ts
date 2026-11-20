import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { radarExternalEnabled, RADAR_PAUSED_MESSAGE } from "@/lib/crm/radar-control";
export const dynamic = "force-dynamic";
/** Read-only owner-scoped switch state. No browser action can change deployment configuration. */
export async function GET() {
  if (!await getOwnerSession()) return NextResponse.json({error:"No autorizado"},{status:403});
  return NextResponse.json({externalEnabled:radarExternalEnabled(),message:RADAR_PAUSED_MESSAGE},{headers:{"Cache-Control":"private, no-store"}});
}
