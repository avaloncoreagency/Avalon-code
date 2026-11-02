import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { buildAreaQuery, parseRadarArea, toIngest } from "@/lib/crm/radar";

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
  const configured = process.env.AVALON_RADAR_OVERPASS_URL;
  const area = parseRadarArea(request.nextUrl.searchParams, Boolean(configured));
  if ("error" in area) return reply({ error: area.error }, 400);
  if (process.env.VERCEL_ENV === "production" && !configured) {
    return reply({ error: "El radar necesita un proveedor de mapas propio o con licencia comercial en producción (AVALON_RADAR_OVERPASS_URL). No se usa el servidor comunitario para prospección comercial.", blocked: "provider" }, 503);
  }
  let endpoint = "https://overpass-api.de/api/interpreter";
  if (configured) {
    try { const u = new URL(configured); if (u.protocol !== "https:") throw Error(); endpoint = u.href; }
    catch { return reply({ error: "La URL del proveedor de mapas no es válida." }, 503); }
  }
  const now = Date.now();
  if (active || (!configured && now - (lastByOwner.get(session.userId) ?? 0) < 30_000)) {
    return reply({ error: "El radar espera 30 s entre búsquedas para respetar el servidor de datos abiertos." }, 429);
  }
  active = true;
  lastByOwner.set(session.userId, now);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "AvalonCoreAgency-LeadHunter/2.0 (https://avaloncoreagency.com; human-initiated)" },
      body: new URLSearchParams({ data: buildAreaQuery(area, configured ? 1000 : 200) }),
      signal: AbortSignal.timeout(configured ? 65_000 : 16_000), cache: "no-store",
    });
    if (res.status === 429) return reply({ error: "El proveedor de mapas limitó las consultas (429). Inténtalo más tarde." }, 503);
    if (!res.ok) return reply({ error: `El proveedor de mapas respondió ${res.status}. No se muestran resultados inventados.` }, 503);
    if (Number(res.headers.get("content-length") ?? 0) > 8_000_000) return reply({ error: "Respuesta del mapa demasiado grande; reduce el radio." }, 503);
    const body = await res.json() as { elements?: unknown };
    const places = toIngest(body.elements, area.label);
    const { data, error } = await session.supabase.rpc("crm_radar_ingest", { places, run_key: "manual:" + randomUUID() });
    if (error) return reply({ error: error.code === "PGRST202" ? "La migración del radar (20261102190000) no está aplicada en este entorno." : "No se pudieron guardar los resultados." }, 503);
    return reply({ run: data, refs: places.map(p => p.source_ref), area, source: "OpenStreetMap (ODbL)", searchedAt: new Date().toISOString() });
  } catch {
    return reply({ error: "No se pudo consultar el mapa (tiempo agotado o red). No se muestran resultados inventados." }, 503);
  } finally { active = false; }
}
