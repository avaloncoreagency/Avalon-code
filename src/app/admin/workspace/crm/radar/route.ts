import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { buildRadarQuery, normalizeRadarResults, parseRadarSearch, type RadarPlace } from "@/lib/crm/radar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

// Shared within a warm worker only; these limits mitigate accidental retries, not
// a globally distributed quota. Production scale needs a paid/owned data endpoint.
const results = new Map<string, { timestamp: number; places: RadarPlace[] }>();
const lastSearch = new Map<string, number>();
let active = false;
const TTL = 15 * 60 * 1000;
const WAIT = 30 * 1000;

export async function GET(request: NextRequest) {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "Solo propietarios autorizados pueden usar el radar." }, 403);
  const params = request.nextUrl.searchParams;
  const search = parseRadarSearch(params.get("zone"), params.get("service"), params.get("radius"));
  if (!search) return reply({ error: "Selecciona una zona, servicio y radio válidos." }, 400);
  const key = search.zone.id + "/" + search.service + "/" + search.radius;
  const now = Date.now();
  const cached = results.get(key);
  if (cached && now - cached.timestamp < TTL) {
    return reply({ places: cached.places, zone: search.zone.name, source: "OpenStreetMap", cached: true });
  }
  if (active || now - (lastSearch.get(session.userId) ?? 0) < WAIT) {
    return reply({ error: "El radar limita consultas para proteger los datos abiertos. Prueba de nuevo en 30 segundos." }, 429);
  }
  // Small interactive pilot only: never run automated sweeps or bulk harvesting.
  // Use AVALON_RADAR_OVERPASS_URL with a licensed/owned endpoint to scale.
  let endpoint = "https://overpass-api.de/api/interpreter";
  if (process.env.AVALON_RADAR_OVERPASS_URL) {
    try {
      const configured = new URL(process.env.AVALON_RADAR_OVERPASS_URL);
      if (configured.protocol !== "https:") throw new Error("HTTPS required");
      endpoint = configured.href;
    } catch {
      return reply({ error: "La URL del proveedor de mapas no es válida." }, 503);
    }
  }
  active = true;
  lastSearch.set(session.userId, now);
  try {
    const query = buildRadarQuery(search.zone.lat, search.zone.lon, search.radius);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "AvalonCoreAgency-LeadHunter/1.0 (https://avaloncoreagency.com; human-initiated internal pilot)",
      },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(14000),
      cache: "no-store",
    });
    if (!res.ok) {
      return reply({ error: "El servicio de mapas está ocupado o limitó la consulta. Inténtalo más tarde." }, 503);
    }
    const reportedLength = Number(res.headers.get("content-length") ?? 0);
    if (reportedLength > 1_500_000) return reply({ error: "Respuesta del mapa demasiado grande." }, 503);
    const data = await res.json() as { elements?: unknown };
    const places = normalizeRadarResults(data.elements, search.service, search.zone.name);
    if (results.size > 70) results.clear();
    results.set(key, { timestamp: Date.now(), places });
    return reply({ places, zone: search.zone.name, source: "OpenStreetMap", cached: false });
  } catch {
    return reply({ error: "No se pudo consultar el mapa. Verifica la conexión o intenta otra zona." }, 503);
  } finally {
    active = false;
  }
}
