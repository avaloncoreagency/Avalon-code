import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { parseRadarArea } from "@/lib/crm/radar";
import { GEOAPIFY_FREE_MAX_RADIUS_M } from "@/lib/crm/radar-geoapify";
import { radarEndpoint, searchAndIngest } from "@/lib/crm/radar-search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

// Per-instance brakes for the community server; a licensed endpoint carries its own SLA.
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
    return reply({ error: "El radar espera 30 s entre búsquedas para respetar el servidor de datos abiertos." }, 429);
  }
  active = true;
  lastByOwner.set(session.userId, now);
  try {
    const out = await searchAndIngest(session.supabase, area, "manual:" + randomUUID());
    if (!out.ok) return reply({ error: out.error, blocked: out.blocked }, out.status);
    return reply({ run: out.run, area,
      source: endpoint.provider === "geoapify" ? "Geoapify Places / OpenStreetMap (ODbL)" : "OpenStreetMap (ODbL)",
      searchedAt: new Date().toISOString() });
  } finally { active = false; }
}
