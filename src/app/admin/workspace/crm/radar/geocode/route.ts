import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { validGeoapifyKey } from "@/lib/crm/radar-geoapify";

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
  const keyValue = process.env.AVALON_GEOAPIFY_PLACES_KEY?.trim();
  if (!keyValue) return reply({ error: "Geoapify no está configurado. Añade AVALON_GEOAPIFY_PLACES_KEY en Vercel para buscar ciudades." }, 503);
  if (keyValue && !validGeoapifyKey(keyValue))
    return reply({ error: "La clave Geoapify de Vercel no es válida. Revisa la configuración." }, 503);
  const useGeoapify = !!keyValue;
  const base = useGeoapify ? "https://api.geoapify.com/v1/geocode/search"
    : (process.env.AVALON_GEOCODER_URL || "https://nominatim.openstreetmap.org/search");
  try {
    const url = new URL(base);
    if (url.protocol !== "https:") throw Error();
    // Free Geoapify accepts browser/server geocoding, with actual formatted
    // locations. The key is used server-side only and is not returned to React.
    url.search = useGeoapify
      ? new URLSearchParams({ text:q, format:"json", limit:"5", lang:"es", apiKey:keyValue! }).toString()
      : new URLSearchParams({ q, format:"jsonv2", limit:"5", addressdetails:"0" }).toString();
    const res = await fetch(url, {
      headers: { "User-Agent": "AvalonCoreAgency-LeadHunter/2.1 (https://avaloncoreagency.com)", "Accept-Language": "es,en" },
      signal: AbortSignal.timeout(8000), cache: "no-store",
    });
    if (!res.ok) return reply({
      error: useGeoapify && (res.status === 403 || res.status === 401)
        ? "Geoapify bloqueó la búsqueda de ciudades: revisa la clave y restricciones (401/403)."
        : `El buscador de lugares respondió ${res.status}.`,
    }, 503);
    const raw = await res.json() as {
      results?: { formatted?: string; lat?: number; lon?: number }[];
    } | { display_name?: string; lat?: string; lon?: string }[];
    const rows = useGeoapify && !Array.isArray(raw)
      ? (Array.isArray(raw.results) ? raw.results : []).map(r=>({ label:r.formatted, lat:r.lat,lon:r.lon }))
      : (Array.isArray(raw) ? raw : []).map(r=>({ label:r.display_name, lat:r.lat,lon:r.lon }));
    const results = rows.slice(0,5).map(r=>({
      label: String(r.label ?? "").slice(0,200),
      lat: Number(r.lat), lon: Number(r.lon),
    })).filter(r=>r.label && Number.isFinite(r.lat) && Number.isFinite(r.lon));
    if (cache.size > 500) cache.clear();
    cache.set(key, { at: Date.now(), results });
    return reply({ results, attribution: useGeoapify
      ? "Powered by Geoapify · © OpenStreetMap contributors"
      : "© OpenStreetMap contributors" });
  } catch { return reply({ error: "No se pudo buscar el lugar. Puedes tocar el mapa para elegir el centro." }, 503); }
}
