import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { parseRadarArea } from "@/lib/crm/radar";
import { GEOAPIFY_FREE_MAX_RADIUS_M } from "@/lib/crm/radar-geoapify";
import { RADAR_QUERY_KINDS, radarEndpoint, radarQuota, searchAndIngest, type RadarQueryKind } from "@/lib/crm/radar-search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

// Per-instance brake between human searches. The durable daily budget lives in searchAndIngest (persisted runs).
const lastByOwner = new Map<string, number>();
let active = false;

/** Owner-initiated area search. Results are persisted as pending "Encontrados" (never approved). */
export async function GET(request: NextRequest) {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "Solo propietarios autorizados pueden usar el radar." }, 403);
  const endpoint = radarEndpoint();
  if ("error" in endpoint) return reply({ error: endpoint.error, blocked: "provider" }, 503);
  const area = parseRadarArea(request.nextUrl.searchParams, endpoint.licensed);
  if ("error" in area) return reply({ error: area.error }, 400);
  if (endpoint.provider === "geoapify" && area.radiusM > GEOAPIFY_FREE_MAX_RADIUS_M)
    return reply({ error: "Geoapify Free: selecciona un radio de hasta 5 km para proteger el plan sin cargos." }, 400);
  const now = Date.now();
  if (active || (now - (lastByOwner.get(session.userId) ?? 0) < 30_000)) {
    return reply({ error: "El radar espera 30 s entre búsquedas para proteger la cuota del proveedor." }, 429);
  }
  active = true;
  lastByOwner.set(session.userId, now);
  try {
    const rawKind = request.nextUrl.searchParams.get("kind") ?? "map";
    const kind: RadarQueryKind = (RADAR_QUERY_KINDS as readonly string[]).includes(rawKind) && rawKind !== "campaign" ? rawKind as RadarQueryKind : "map";
    const out = await searchAndIngest(session.supabase, area, "manual:" + randomUUID(), null, undefined, kind);
    if (!out.ok) {
      // A search blocked by configuration or quota never reached the provider: do not make the owner wait 30 s.
      if (out.blocked) lastByOwner.delete(session.userId);
      return reply({ error: out.error, blocked: out.blocked }, out.status);
    }
    return reply({ run: out.run, area, quota: await radarQuota(session.supabase),
      source: endpoint.provider === "geoapify" ? "Geoapify Places / OpenStreetMap (ODbL)" : "OpenStreetMap (ODbL)",
      searchedAt: new Date().toISOString() });
  } finally { active = false; }
}
