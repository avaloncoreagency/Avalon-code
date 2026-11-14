import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAreaQuery, toIngest, type RadarArea } from "./radar";
import {
  GEOAPIFY_PLACES_URL, GEOAPIFY_FREE_MAX_RADIUS_M, validGeoapifyKey,
  geoapifyPlacesRequest, normalizeGeoapifyPlaces,
} from "./radar-geoapify";
import { dailySearchLimit, quotaMessage, quotaState, utcDayStartIso, type QuotaState } from "./radar-quota";

export type SearchOutcome = { ok: true; run: { run_id: string; found: number; inserted: number; updated: number; replayed: boolean; refreshed?: number; known?: number } } | { ok: false; status: number; error: string; blocked?: "provider" | "quota" };

/** Searches already recorded today (UTC). Null when the radar tables are unavailable, so callers never invent a figure. */
export async function radarQuota(db: SupabaseClient): Promise<QuotaState | null> {
  // GET one row rather than HEAD: a missing PostgREST table can look like a successful HEAD 404.
  const { count, error } = await db.from("crm_radar_runs").select("id", { count: "exact" }).gte("started_at", utcDayStartIso()).range(0, 0);
  if (error || count === null) return null;
  return quotaState(count, dailySearchLimit(process.env.AVALON_RADAR_DAILY_SEARCH_LIMIT));
}

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
    return { error: "Radar sin Geoapify configurado. Crea una clave Free y añade AVALON_GEOAPIFY_PLACES_KEY en Vercel; nunca usamos servidores comunitarios como respaldo." };
  }
  try {
    const u = new URL(configured);
    if (u.protocol !== "https:" || u.username || u.password) throw Error();
    return { url: u.href, licensed: true, provider: "overpass" };
  } catch { return { error: "La URL del proveedor de búsqueda no es válida." }; }
}

/** One bounded query to the provider, persisted through the idempotent ingest RPC (never approves). */
export const RADAR_QUERY_KINDS = ["coordinates", "postcode", "address", "place", "map", "campaign"] as const;
export type RadarQueryKind = (typeof RADAR_QUERY_KINDS)[number];

/** Search descriptor stored on the run (persistent history: what was searched, where and how). */
export function searchDescriptor(area: RadarArea, kind: RadarQueryKind, provider?: "geoapify" | "overpass") {
  return { kind, lat: area.lat, lon: area.lon, radius_m: area.radiusM, label: area.label, industries: area.industries,
    ...(provider ? { provider } : {}) };
}

/** Fixed failure codes stored on a failed run (never the provider's raw message). */
export type RadarFailureCode = "provider_rate_limited" | "provider_auth" | "provider_http" | "provider_timeout" |
  "provider_parse" | "provider_network" | "provider_too_large" | "ingest_failed";

export function failureCode(cause: unknown): RadarFailureCode {
  const name = (cause as { name?: string } | null)?.name;
  if (name === "TimeoutError" || name === "AbortError") return "provider_timeout";
  if (cause instanceof SyntaxError) return "provider_parse";
  return "provider_network";
}

export async function searchAndIngest(db: SupabaseClient, area: RadarArea, runKey: string, campaignId: string | null = null, limit?: number,
  kind: RadarQueryKind = campaignId ? "campaign" : "map"): Promise<SearchOutcome> {
  // A run that already exists is replayed from our own record: the provider is NOT queried again (no credits spent).
  const known = await db.from("crm_radar_runs").select("id,found,inserted,updated,status").eq("idempotency_key", runKey).maybeSingle();
  // A recorded failure is not replayed as an empty success, and it is not retried automatically with the same key.
  if (known.data?.status === "failed") return { ok: false, status: 409, error: "Esta búsqueda ya falló y quedó registrada en el historial. Lanza una búsqueda nueva; no se reintenta automáticamente para no gastar créditos." };
  if (known.data) return { ok: true, run: { run_id: known.data.id, found: known.data.found, inserted: known.data.inserted, updated: known.data.updated, replayed: true } };
  const endpoint = radarEndpoint();
  if ("error" in endpoint) return { ok: false, status: 503, error: endpoint.error, blocked: "provider" };
  try {
    if (endpoint.provider === "geoapify") {
      const quota = await radarQuota(db);
      // Fail closed: no external provider call if the CRM cannot prove the quota remaining.
      if (!quota) return { ok: false, status: 503,
        error: "No se pudo verificar la cuota diaria de Geoapify en Avalon. No se consultó al proveedor ni se gastaron créditos; revisa la conexión o migración del Radar.",
        blocked: "quota" };
      if (quota.blocked) return { ok: false, status: 429, error: quotaMessage(quota), blocked: "quota" };
    }
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
    // A call that reached the provider and failed is recorded as a failed run (history + daily cap); best effort, a
    // database without migration 20261112090000 simply does not record it.
    const failed = async (code: RadarFailureCode, outcome: Extract<SearchOutcome, { ok: false }>) => {
      try { await db.rpc("crm_radar_record_failure", { run_key: runKey, search: searchDescriptor(area, kind, endpoint.provider), provider: endpoint.provider, code }); } catch { /* recorded best effort */ }
      return outcome;
    };
    if (res.status === 429) return failed("provider_rate_limited", { ok: false, status: 503,
      error: "El proveedor limitó las consultas (429). No se realizan reintentos automáticos que gasten créditos." });
    if (res.status === 401 || res.status === 403) return failed("provider_auth", { ok: false, status: 503,
      error: geoapify
        ? "Geoapify rechazó la clave (401/403). Revisa su activación y restricciones en MyProjects; no se muestran negocios falsos."
        : "El proveedor de búsquedas rechazó la solicitud (401/403). Verifica su permiso de uso." });
    if (!res.ok) return failed("provider_http", { ok: false, status: 503, error: `El proveedor respondió ${res.status}. No se muestran resultados inventados.` });
    if (Number(res.headers.get("content-length") ?? 0) > 8_000_000) return failed("provider_too_large", { ok: false, status: 503, error: "Respuesta del proveedor demasiado grande; reduce el radio." });
    let body: { elements?: unknown; features?: unknown };
    try { body = await res.json() as { elements?: unknown; features?: unknown }; }
    catch (cause) { return failed(failureCode(cause), providerFailure(cause, endpoint.provider === "geoapify" ? 12 : endpoint.licensed ? 65 : 16)); }
    const places = geoapify
      ? normalizeGeoapifyPlaces(body)
      : toIngest(body.elements, area.label);
    let { data, error } = await db.rpc("crm_radar_ingest", { places, run_key: runKey, campaign: campaignId, search: searchDescriptor(area, kind, endpoint.provider) });
    // Database without migration 20261110140000: the 4-argument function does not exist, so nothing ran. Fall back to the
    // original ingest (results persist; the run is simply not linked to its results until the migration is applied).
    if (error?.code === "PGRST202") ({ data, error } = await db.rpc("crm_radar_ingest", { places, run_key: runKey, campaign: campaignId }));
    if (error) return failed("ingest_failed", { ok: false, status: 503, error: error.code === "PGRST202" ? "La migración del radar (20261102190000) no está aplicada en este entorno." : "No se pudieron guardar los resultados." });
    return { ok: true, run: data };
  } catch (cause) {
    // Network failure or timeout before any answer: the request may still have reached the provider, so it is recorded.
    const outcome = providerFailure(cause, endpoint.provider === "geoapify" ? 12 : endpoint.licensed ? 65 : 16);
    try { await db.rpc("crm_radar_record_failure", { run_key: runKey, search: searchDescriptor(area, kind, endpoint.provider), provider: endpoint.provider, code: failureCode(cause) }); } catch { /* best effort */ }
    return outcome;
  }
}

/**
 * Each way the provider call can fail gets its own visible state. A timeout is not a network error and neither is a
 * malformed answer; none of them retries automatically (that would spend credits) or shows invented businesses.
 */
export function providerFailure(cause: unknown, timeoutSeconds: number): Extract<SearchOutcome, { ok: false }> {
  const name = (cause as { name?: string } | null)?.name;
  if (name === "TimeoutError" || name === "AbortError")
    return { ok: false, status: 504, error: `El proveedor no respondió a tiempo (${timeoutSeconds} s). No se reintenta automáticamente ni se muestran resultados inventados; vuelve a intentarlo en unos minutos.` };
  if (cause instanceof SyntaxError)
    return { ok: false, status: 502, error: "El proveedor devolvió una respuesta que no se pudo interpretar. No se guardó nada ni se muestran resultados inventados." };
  return { ok: false, status: 503, error: "No se pudo conectar con el proveedor de búsqueda (red). No se muestran resultados inventados." };
}
