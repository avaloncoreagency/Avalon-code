// Radar place search: classify what the owner typed BEFORE calling any provider.
// - Coordinates ("25.77, -80.19") are resolved locally: no provider call, no key needed, no cache.
// - Postcodes ("33101", "33101-1234", "SW1A 1AA", "28013") are sent as a postcode query, not as free text, so the
//   provider does not match a street number or a business with those digits.
// - Addresses (digits + words) and places (city/region names) are free-text queries.
// Caching rules (fix for stale results): only non-empty answers are cached, for a short time, and the key includes the
// query kind, so a temporary empty or failed provider answer is never served again as "no results".

export type GeocodeKind = "coordinates" | "postcode" | "address" | "place";
export type GeocodeResult = { label: string; lat: number; lon: number };

export const GEOCODE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// One number = optional sign, up to 3 integer digits, optional decimals (anchored, no ambiguous repetition → no ReDoS).
const NUM = /^[-+]?\d{1,3}(?:\.\d{1,12})?$/;
// US ZIP / ZIP+4, 4–6 digit numeric postcodes (ES, MX, FR, DE…), UK/CA style alphanumerics.
const POSTCODE = /^(?:\d{5}(?:-\d{4})?|\d{4,6}|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}|[A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i;

export function normalizeQuery(raw: string | null | undefined): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
}

export function parseCoordinates(q: string): GeocodeResult | null {
  // "lat, lon", "lat;lon" or "lat lon": split on the separators instead of one regex over the whole input.
  const parts = q.slice(0, 120).replace(/[,;]/g, " ").trim().split(/\s+/);
  if (parts.length !== 2 || !NUM.test(parts[0]) || !NUM.test(parts[1])) return null;
  const lat = Number(parts[0]), lon = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
  return { label: `${r6(lat)}, ${r6(lon)}`, lat: r6(lat), lon: r6(lon) };
}

export function classifyQuery(q: string): GeocodeKind {
  if (parseCoordinates(q)) return "coordinates";
  if (POSTCODE.test(q.trim())) return "postcode";
  if (/\d/.test(q) && /[a-záéíóúñü]/i.test(q)) return "address";
  return "place";
}

export function geocodeCacheKey(kind: GeocodeKind, q: string): string {
  return kind + ":" + q.toLowerCase();
}

/** Provider query parameters for each kind (Geoapify or Nominatim). The API key is added by the caller, server-side. */
export function providerParams(provider: "geoapify" | "nominatim", kind: Exclude<GeocodeKind, "coordinates">, q: string): Record<string, string> {
  if (provider === "geoapify") {
    const base = { text: q, format: "json", limit: "5", lang: "es" };
    return kind === "postcode" ? { ...base, type: "postcode" } : base;
  }
  return kind === "postcode"
    ? { postalcode: q, format: "jsonv2", limit: "5", addressdetails: "0" }
    : { q, format: "jsonv2", limit: "5", addressdetails: "0" };
}

/** Cache only real answers; an empty or failed lookup must be retried next time, never replayed. */
export function shouldCache(results: readonly GeocodeResult[]): boolean {
  return results.length > 0;
}

export function cacheFresh(entry: { at: number } | undefined, now: number): boolean {
  return !!entry && now - entry.at < GEOCODE_CACHE_TTL_MS;
}
