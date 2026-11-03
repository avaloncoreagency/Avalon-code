/**
 * Daily search budget for the Geoapify Free plan. Pure functions (no server-only import) so they are unit-tested.
 * Geoapify Free gives 3,000 credits/day shared by map tiles, geocoding and Places; one Places lookup of up to
 * 60 results costs at most 3 credits. Avalon caps the number of searches per UTC day so a human can never burn
 * the shared allowance by accident. The cap is counted from persisted runs (crm_radar_runs), so it holds across
 * serverless instances and restarts. Figures are upper bounds computed from our own records, not provider telemetry.
 */
export const GEOAPIFY_FREE_DAILY_CREDITS = 3000;
export const GEOAPIFY_MAX_CREDITS_PER_SEARCH = 3;
export const DEFAULT_DAILY_SEARCH_LIMIT = 100;
export const MAX_DAILY_SEARCH_LIMIT = 500;

/** AVALON_RADAR_DAILY_SEARCH_LIMIT: integer 1–500. Anything else falls back to the safe default. */
export function dailySearchLimit(raw?: string | null): number {
  const text = (raw ?? "").trim();
  if (!/^\d{1,3}$/.test(text)) return DEFAULT_DAILY_SEARCH_LIMIT;
  const n = Number(text);
  return n >= 1 && n <= MAX_DAILY_SEARCH_LIMIT ? n : DEFAULT_DAILY_SEARCH_LIMIT;
}

/** Start of the current UTC day as an ISO string (Geoapify credits reset daily). */
export function utcDayStartIso(now: number = Date.now()): string {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

export type QuotaState = {
  searchesToday: number; limit: number; remaining: number; blocked: boolean;
  maxCreditsUsed: number; sharedDailyCredits: number;
};
export function quotaState(searchesToday: number, limit: number): QuotaState {
  const used = Math.max(0, Math.floor(searchesToday));
  return {
    searchesToday: used, limit, remaining: Math.max(0, limit - used), blocked: used >= limit,
    maxCreditsUsed: used * GEOAPIFY_MAX_CREDITS_PER_SEARCH, sharedDailyCredits: GEOAPIFY_FREE_DAILY_CREDITS,
  };
}

export function quotaMessage(q: QuotaState): string {
  return `Tope diario de Avalon alcanzado: ${q.searchesToday} de ${q.limit} búsquedas hoy. Cada búsqueda puede costar hasta ${GEOAPIFY_MAX_CREDITS_PER_SEARCH} de los ${q.sharedDailyCredits.toLocaleString("es")} créditos gratuitos diarios de Geoapify, compartidos con el mapa y la búsqueda de ciudades. Se reinicia a las 00:00 UTC.`;
}
