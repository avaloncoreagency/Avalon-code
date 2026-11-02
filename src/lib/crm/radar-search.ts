import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAreaQuery, toIngest, type RadarArea } from "./radar";

export type SearchOutcome = { ok: true; run: { run_id: string; found: number; inserted: number; updated: number; replayed: boolean } } | { ok: false; status: number; error: string; blocked?: "provider" };

/** Provider endpoint: licensed/owned when configured; community Overpass only outside production. */
export function radarEndpoint(): { url: string; licensed: boolean } | { error: string } {
  const configured = process.env.AVALON_RADAR_OVERPASS_URL;
  if (!configured) {
    if (process.env.VERCEL_ENV === "production") return { error: "El radar necesita un proveedor de mapas propio o con licencia comercial en producción (AVALON_RADAR_OVERPASS_URL). No se usa el servidor comunitario para prospección comercial." };
    return { url: "https://overpass-api.de/api/interpreter", licensed: false };
  }
  try { const u = new URL(configured); if (u.protocol !== "https:") throw Error(); return { url: u.href, licensed: true }; }
  catch { return { error: "La URL del proveedor de mapas no es válida." }; }
}

/** One bounded query to the provider, persisted through the idempotent ingest RPC (never approves). */
export async function searchAndIngest(db: SupabaseClient, area: RadarArea, runKey: string, campaignId: string | null = null, limit?: number): Promise<SearchOutcome> {
  const endpoint = radarEndpoint();
  if ("error" in endpoint) return { ok: false, status: 503, error: endpoint.error, blocked: "provider" };
  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "AvalonCoreAgency-LeadHunter/2.0 (https://avaloncoreagency.com; human-initiated)" },
      body: new URLSearchParams({ data: buildAreaQuery(area, limit ?? (endpoint.licensed ? 1000 : 200)) }),
      signal: AbortSignal.timeout(endpoint.licensed ? 65_000 : 16_000), cache: "no-store",
    });
    if (res.status === 429) return { ok: false, status: 503, error: "El proveedor de mapas limitó las consultas (429). Inténtalo más tarde." };
    if (!res.ok) return { ok: false, status: 503, error: `El proveedor de mapas respondió ${res.status}. No se muestran resultados inventados.` };
    if (Number(res.headers.get("content-length") ?? 0) > 8_000_000) return { ok: false, status: 503, error: "Respuesta del mapa demasiado grande; reduce el radio." };
    const body = await res.json() as { elements?: unknown };
    const places = toIngest(body.elements, area.label);
    const { data, error } = await db.rpc("crm_radar_ingest", { places, run_key: runKey, campaign: campaignId });
    if (error) return { ok: false, status: 503, error: error.code === "PGRST202" ? "La migración del radar (20261102190000) no está aplicada en este entorno." : "No se pudieron guardar los resultados." };
    return { ok: true, run: data };
  } catch {
    return { ok: false, status: 503, error: "No se pudo consultar el mapa (tiempo agotado o red). No se muestran resultados inventados." };
  }
}
