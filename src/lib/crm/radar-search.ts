import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAreaQuery, toIngest, type RadarArea } from "./radar";
import {
  GEOAPIFY_PLACES_URL, GEOAPIFY_FREE_MAX_RADIUS_M, validGeoapifyKey,
  geoapifyPlacesRequest, normalizeGeoapifyPlaces,
} from "./radar-geoapify";

export type SearchOutcome = { ok: true; run: { run_id: string; found: number; inserted: number; updated: number; replayed: boolean } } | { ok: false; status: number; error: string; blocked?: "provider" };

/** Commercial-compatible free plan takes priority when explicitly configured.
 *  No silent production fallback to the public Overpass community instance.
 */
export function radarEndpoint():
  | { url: string; licensed: boolean; provider: "geoapify" | "overpass" }
  | { error: string } {
  const geoapifyKey = process.env.AVALON_GEOAPIFY_PLACES_KEY?.trim();
  if (geoapifyKey) {
    if (!validGeoapifyKey(geoapifyKey))
      return { error: "AVALON_GEOAPIFY_PLACES_KEY es inválida. Revisa la variable privada de Vercel." };
    return { url: GEOAPIFY_PLACES_URL, licensed: true, provider: "geoapify" };
  }
  const configured = process.env.AVALON_RADAR_OVERPASS_URL;
  if (!configured) {
    if (process.env.VERCEL_ENV === "production") return {
      error: "Radar sin proveedor de búsqueda configurado. Crea una clave Geoapify Free y añade AVALON_GEOAPIFY_PLACES_KEY en Vercel; no usamos Overpass comunitario para prospección comercial.",
    };
    return { url: "https://overpass-api.de/api/interpreter", licensed: false, provider: "overpass" };
  }
  try {
    const u = new URL(configured);
    if (u.protocol !== "https:" || u.username || u.password) throw Error();
    return { url: u.href, licensed: true, provider: "overpass" };
  } catch { return { error: "La URL del proveedor de búsqueda no es válida." }; }
}

/** One bounded query to the provider, persisted through the idempotent ingest RPC (never approves). */
export async function searchAndIngest(db: SupabaseClient, area: RadarArea, runKey: string, campaignId: string | null = null, limit?: number): Promise<SearchOutcome> {
  const endpoint = radarEndpoint();
  if ("error" in endpoint) return { ok: false, status: 503, error: endpoint.error, blocked: "provider" };
  try {
    const geoapify = endpoint.provider === "geoapify";
    if (geoapify && area.radiusM > GEOAPIFY_FREE_MAX_RADIUS_M) return {
      ok: false, status: 400, error: "Geoapify Free limita cada búsqueda a 5 km para proteger la cuota gratuita. Reduce el radio.",
      blocked: "provider",
    };
    // Geoapify reads a fixed vendor host. The server-only API key is never
    // embedded in a client URL, emitted in an error, or stored in the CRM.
    const request: RequestInit = geoapify
      ? {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.AVALON_GEOAPIFY_PLACES_KEY!,
          },
          body: JSON.stringify(geoapifyPlacesRequest(area, limit)),
          signal: AbortSignal.timeout(12_000),
          cache: "no-store" as const,
        }
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "User-Agent": "AvalonCoreAgency-LeadHunter/2.0 (https://avaloncoreagency.com; human-initiated)",
          },
          body: new URLSearchParams({ data: buildAreaQuery(area, limit ?? (endpoint.licensed ? 1000 : 200)) }),
          signal: AbortSignal.timeout(endpoint.licensed ? 65_000 : 16_000),
          cache: "no-store" as const,
        };
    const res = await fetch(endpoint.url, request);
    if (res.status === 429) return { ok: false, status: 503,
      error: "El proveedor limitó las consultas (429). No se realizan reintentos automáticos que gasten créditos." };
    if (res.status === 401 || res.status === 403) return { ok: false, status: 503,
      error: geoapify
        ? "Geoapify rechazó la clave (401/403). Revisa su activación y restricciones en MyProjects; no se muestran negocios falsos."
        : "El proveedor de búsquedas rechazó la solicitud (401/403). Verifica su permiso de uso." };
    if (!res.ok) return { ok: false, status: 503, error: `El proveedor respondió ${res.status}. No se muestran resultados inventados.` };
    if (Number(res.headers.get("content-length") ?? 0) > 8_000_000) return { ok: false, status: 503, error: "Respuesta del proveedor demasiado grande; reduce el radio." };
    const body = await res.json() as { elements?: unknown; features?: unknown };
    const places = geoapify
      ? normalizeGeoapifyPlaces(body)
      : toIngest(body.elements, area.label);
    const { data, error } = await db.rpc("crm_radar_ingest", { places, run_key: runKey, campaign: campaignId });
    if (error) return { ok: false, status: 503, error: error.code === "PGRST202" ? "La migración del radar (20261102190000) no está aplicada en este entorno." : "No se pudieron guardar los resultados." };
    return { ok: true, run: data };
  } catch {
    return { ok: false, status: 503, error: "No se pudo consultar el mapa (tiempo agotado o red). No se muestran resultados inventados." };
  }
}
