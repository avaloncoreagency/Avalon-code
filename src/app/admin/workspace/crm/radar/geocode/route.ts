import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const cache = new Map<string, { at: number; results: unknown[] }>();
let last = 0;

/** One explicit, human-initiated place search (no autocomplete), cached 24 h, ≥1.1 s apart, per Nominatim policy. */
export async function GET(request: NextRequest) {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "No autorizado" }, 403);
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (q.length < 2) return reply({ error: "Escribe una ciudad, dirección o código postal." }, 400);
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 86_400_000) return reply({ results: hit.results, cached: true });
  if (Date.now() - last < 1100) return reply({ error: "Espera un segundo entre búsquedas de lugar." }, 429);
  last = Date.now();
  const base = process.env.AVALON_GEOCODER_URL || "https://nominatim.openstreetmap.org/search";
  try {
    const url = new URL(base);
    if (url.protocol !== "https:") throw Error();
    const geoapify = process.env.AVALON_RADAR_PROVIDER === "geoapify";
    const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
    if (geoapify && !apiKey) return reply({ error: "Falta configurar la clave de Geoapify en el servidor." }, 503);
    const target = geoapify ? new URL("https://api.geoapify.com/v1/geocode/search") : url;
    target.search = geoapify
      ? new URLSearchParams({ text: q, limit: "5", lang: "es", apiKey: apiKey! }).toString()
      : new URLSearchParams({ q, format: "jsonv2", limit: "5", addressdetails: "0" }).toString();
    const res = await fetch(target, { headers: { "User-Agent": "AvalonCoreAgency-LeadHunter/2.0 (https://avaloncoreagency.com)", "Accept-Language": "es,en" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (res.status === 429) return reply({ error: "Cuota de geocodificación agotada. No reintentaremos automáticamente." }, 429);
    if (!res.ok) return reply({ error: `El buscador de lugares respondió ${res.status}.` }, 503);
    const raw = await res.json() as unknown;
    const results = geoapify
      ? (Array.isArray((raw as { features?: unknown })?.features) ? (raw as { features: { properties?: { formatted?: string; lat?: number; lon?: number } }[] }).features : []).slice(0, 5)
          .map(f => ({ label: String(f.properties?.formatted ?? "").slice(0, 200), lat: Number(f.properties?.lat), lon: Number(f.properties?.lon) }))
          .filter(r => r.label && Number.isFinite(r.lat) && Number.isFinite(r.lon))
      : (Array.isArray(raw) ? raw as { display_name?: string; lat?: string; lon?: string }[] : []).slice(0, 5)
          .map(r => ({ label: String(r.display_name ?? "").slice(0, 200), lat: Number(r.lat), lon: Number(r.lon) }))
          .filter(r => r.label && Number.isFinite(r.lat) && Number.isFinite(r.lon));
    if (cache.size > 500) cache.clear();
    cache.set(key, { at: Date.now(), results });
    return reply({ results, attribution: geoapify ? "© OpenStreetMap contributors · Powered by Geoapify" : "© OpenStreetMap contributors" });
  } catch { return reply({ error: "No se pudo buscar el lugar. Puedes tocar el mapa para elegir el centro." }, 503); }
}
