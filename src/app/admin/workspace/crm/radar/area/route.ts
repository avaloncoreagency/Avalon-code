import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { parseRadarArea } from "@/lib/crm/radar";
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
  const now = Date.now();
  if (active || now - (lastByOwner.get(session.userId) ?? 0) < 30_000) {
    return reply({ error: "Espera 30 segundos entre búsquedas para proteger la cuota del proveedor." }, 429);
  }
  active = true;
  lastByOwner.set(session.userId, now);
  try {
    const out = await searchAndIngest(session.supabase, area, "manual:" + randomUUID());
    if (!out.ok) return reply({ error: out.error, blocked: out.blocked }, out.status);
    return reply({ run: out.run, area, source: endpoint.kind === "geoapify" ? "Geoapify · OpenStreetMap (ODbL)" : "OpenStreetMap (ODbL)", capped: endpoint.kind === "geoapify" ? "Máximo 40 negocios por consulta; búsqueda no exhaustiva." : undefined, searchedAt: new Date().toISOString() });
  } finally { active = false; }
}
