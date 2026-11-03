import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAreaQuery, toIngest, type RadarArea } from "./radar";
import { buildGeoapifyRequest, normalizeGeoapifyPlaces } from "./radar-geoapify";

export type SearchOutcome = { ok: true; run: { run_id: string; found: number; inserted: number; updated: number; replayed: boolean } } | { ok: false; status: number; error: string; blocked?: "provider" };

export type RadarProvider =
  | { kind: "geoapify"; url: string; licensed: true }
  | { kind: "overpass"; url: string; licensed: boolean };

/** Only explicitly configured remote HTTPS hosts may act as owned/licensed Overpass.
 * Ownership and commercial rights must be verified separately by the agency.
 */
export function safeLicensedOverpassUrl(input: string): string | null {
  try {
    const u = new URL(input);
    const host = u.hostname.toLowerCase().replace(/\\.$/, "");
    const community = ["overpass-api.de", "overpass.kumi.systems", "tile.openstreetmap.org", "nominatim.openstreetmap.org"];
    if (u.protocol !== "https:" || u.username || u.password || u.port ||
        !host.includes(".") || /^[0-9.]+$/.test(host) || host.includes(":") ||
        host.endsWith(".local") || host.endsWith(".internal") ||
        host.endsWith(".localhost") || host.endsWith(".test") ||
        community.some(domain => host === domain || host.endsWith("." + domain))) return null;
    return u.href;
  } catch { return null; }
}

/** PR #65 compatibility: accept either server-only Places secret, never choose
 * between two different keys silently. A provider selector remains mandatory.
 */
export function geoapifyServerKey(): string | null {
  const primary = process.env.GEOAPIFY_API_KEY?.trim();
  const alternate = process.env.AVALON_GEOAPIFY_PLACES_KEY?.trim();
  if (primary && alternate && primary !== alternate) return null;
  return primary || alternate || null;
}

/** Explicit provider selection. Missing key fails closed: never falls back to a public API. */
export function radarEndpoint(): RadarProvider | { error: string } {
  const provider = process.env.AVALON_RADAR_PROVIDER;
  if (provider === "geoapify") {
    if (!geoapifyServerKey()) {
      return { error: "Geoapify seleccionado, pero falta una clave privada válida o hay dos claves distintas configuradas. No se usa Overpass como respaldo." };
    }
    return { kind: "geoapify", url: "https://api.geoapify.com/v2/places", licensed: true };
  }
  if (provider && provider !== "overpass") return { error: "Proveedor del radar no reconocido." };
  const configured = process.env.AVALON_RADAR_OVERPASS_URL;
  if (!configured) {
    if (process.env.VERCEL_ENV === "production") return { error: "El radar necesita un proveedor de mapas propio o con licencia comercial en producción (AVALON_RADAR_OVERPASS_URL). No se usa el servidor comunitario para prospección comercial." };
    return { kind: "overpass", url: "https://overpass-api.de/api/interpreter", licensed: false };
  }
  const url = safeLicensedOverpassUrl(configured);
  if (!url) return { error: "URL del proveedor Overpass inválida: no usar infraestructura comunitaria, local o sin HTTPS." };
  return { kind: "overpass", url, licensed: true };
}

/** One bounded query to the provider, persisted through the idempotent ingest RPC (never approves). */
export async function searchAndIngest(db: SupabaseClient, area: RadarArea, runKey: string, campaignId: string | null = null, limit?: number): Promise<SearchOutcome> {
  const endpoint = radarEndpoint();
  if ("error" in endpoint) return { ok: false, status: 503, error: endpoint.error, blocked: "provider" };
  try {
    const geoapify = endpoint.kind === "geoapify";
    const key = geoapifyServerKey();
    const res = await fetch(endpoint.url, geoapify ? {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key ?? "" },
      body: JSON.stringify(buildGeoapifyRequest(area, limit)),
      signal: AbortSignal.timeout(12_000), redirect: "error", cache: "no-store",
    } : {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "AvalonCoreAgency-LeadHunter/2.0 (https://avaloncoreagency.com; human-initiated)" },
      body: new URLSearchParams({ data: buildAreaQuery(area, limit ?? (endpoint.licensed ? 1000 : 200)) }),
      signal: AbortSignal.timeout(endpoint.licensed ? 65_000 : 16_000), redirect: "error", cache: "no-store",
    });
    if (res.status === 429) return { ok: false, status: 429, error: "El proveedor alcanzó su límite (429). Detenemos la búsqueda; revisa consumo o inténtalo más tarde." };
    if (res.status === 401 || res.status === 403) return { ok: false, status: 503, error: "Proveedor no autorizado o clave incorrecta. Revisa la cuenta, dominio y cuota sin compartir la clave." };
    if (!res.ok) return { ok: false, status: 503, error: `El proveedor de lugares respondió ${res.status}; no se muestran resultados inventados.` };
    if (Number(res.headers.get("content-length") ?? 0) > 8_000_000) return { ok: false, status: 503, error: "Respuesta demasiado grande; reduce el radio." };
    const body = await res.json() as { elements?: unknown; features?: unknown };
    if (geoapify ? !Array.isArray(body?.features) : !Array.isArray(body?.elements)) {
      return { ok: false, status: 503, error: "El proveedor devolvió un formato inesperado. No se importaron negocios." };
    }
    const places = geoapify ? normalizeGeoapifyPlaces(body, area.label) : toIngest(body.elements, area.label);
    if (geoapify && Array.isArray(body.features) && body.features.length > 0 && places.length === 0) {
      return { ok: false, status: 502, error: "Geoapify devolvió lugares sin nombre, coordenadas o identidad OSM verificables; no se importaron resultados." };
    }
    const { data, error } = await db.rpc("crm_radar_ingest", { places, run_key: runKey, campaign: campaignId });
    if (error) return { ok: false, status: 503, error: error.code === "PGRST202" ? "La migración del radar (20261102190000) no está aplicada en este entorno." : "No se pudieron guardar los resultados." };
    return { ok: true, run: data };
  } catch {
    return { ok: false, status: 503, error: "No se pudo consultar el mapa (tiempo agotado o red). No se muestran resultados inventados." };
  }
}
