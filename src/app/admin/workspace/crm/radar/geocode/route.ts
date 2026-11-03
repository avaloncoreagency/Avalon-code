import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { normalizeGeoapifyGeocoding } from "@/lib/crm/radar-geoapify";
import { geoapifyServerKey } from "@/lib/crm/radar-search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const cache = new Map<string, { at: number; results: unknown[]; attribution: string }>();
let last = 0;

/** One explicit, human-initiated place search (no autocomplete), cached 24 h, ≥1.1 s apart, per Nominatim policy. */
export async function GET(request: NextRequest) {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "No autorizado" }, 403);
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (q.length < 2) return reply({ error: "Escribe una ciudad, dirección o código postal." }, 400);
  const provider = process.env.AVALON_RADAR_PROVIDER;
  if (provider && provider !== "geoapify" && provider !== "overpass")
    return reply({ error: "Proveedor de radar no reconocido." }, 503);
  const geoapify = provider === "geoapify";
  const apiKey = geoapifyServerKey();
  // Key validation happens before cache lookup, with no silent fallback.
  if (geoapify && !apiKey) return reply({ error: "Falta una clave privada de Geoapify válida o las claves configuradas no coinciden." }, 503);
  // The OSM community Nominatim endpoint is not a managed commercial geocoder.
  // In production require an explicit private geocoder or licensed Geoapify.
  if (!geoapify && process.env.VERCEL_ENV === "production" && !process.env.AVALON_GEOCODER_URL?.trim())
    return reply({ error: "El buscador de ciudades requiere Geoapify o un geocodificador privado en producción." }, 503);
  const base = process.env.AVALON_GEOCODER_URL || "https://nominatim.openstreetmap.org/search";
  const key = `${geoapify ? "geoapify" : base}:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 86_400_000)
    return reply({ results: hit.results, attribution: hit.attribution, cached: true });
  if (Date.now() - last < 1100) return reply({ error: "Espera un segundo entre búsquedas de lugar." }, 429);
  last = Date.now();
  try {
    const url = new URL(base);
    if (url.protocol !== "https:") throw Error();
    const target = geoapify ? new URL("https://api.geoapify.com/v1/geocode/search") : url;
    target.search = geoapify
      ? new URLSearchParams({ text: q, limit: "5", lang: "es", format: "geojson" }).toString()
      : new URLSearchParams({ q, format: "jsonv2", limit: "5", addressdetails: "0" }).toString();
    const headers: Record<string, string> = {
      "User-Agent": "AvalonCoreAgency-LeadHunter/2.0 (https://avaloncoreagency.com)",
      "Accept-Language": "es,en",
    };
    if (geoapify) headers["x-api-key"] = apiKey!;
    const res = await fetch(target, { headers, signal: AbortSignal.timeout(8000), redirect: "error", cache: "no-store" });
    if (res.status === 429) return reply({ error: "Cuota de geocodificación agotada. No reintentaremos automáticamente." }, 429);
    if (!res.ok) return reply({ error: `El buscador de lugares respondió ${res.status}.` }, 503);
    const raw = await res.json() as unknown;
    const geoapifyResults = geoapify ? normalizeGeoapifyGeocoding(raw) : null;
    if (geoapify && geoapifyResults === null)
      return reply({ error: "Geoapify devolvió un formato inesperado; no se guardan resultados inválidos." }, 503);
    const parseCoordinate = (value: unknown): number =>
      typeof value === "number" ? value :
      typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
    const results = geoapify ? geoapifyResults! :
      (Array.isArray(raw) ? raw as { display_name?: string; lat?: string; lon?: string }[] : []).slice(0, 5)
        .map(r => ({
          label: typeof r.display_name === "string" ? r.display_name.slice(0, 200) : "",
          lat: parseCoordinate(r.lat), lon: parseCoordinate(r.lon),
        }))
        .filter(r => r.label && Number.isFinite(r.lat) && Number.isFinite(r.lon) &&
          Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180);
    if (cache.size > 500) cache.clear();
    const attribution = geoapify ? "© OpenStreetMap contributors · Powered by Geoapify" : "© OpenStreetMap contributors";
    cache.set(key, { at: Date.now(), results, attribution });
    return reply({ results, attribution });
  } catch { return reply({ error: "No se pudo buscar el lugar. Puedes tocar el mapa para elegir el centro." }, 503); }
}
