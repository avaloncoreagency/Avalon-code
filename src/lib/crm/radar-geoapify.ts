/**
 * Geoapify Places free-plan adapter for the private, human-initiated Titan Radar.
 * No paid API, no person/contact enrichment, no automatically-approved leads.
 * All records derive from actual Geoapify/OSM responses and keep attribution.
 * This file is imported server-side only; the Places key never reaches React.
 */
import { createHash } from "node:crypto";
import { isValidRadarEmail, type IndustryId, type RadarArea } from "./radar";

export const GEOAPIFY_FREE_MAX_RADIUS_M = 5000;
export const GEOAPIFY_FREE_MAX_RESULTS = 60; // <=3 Places credits per lookup
export const GEOAPIFY_PLACES_URL = "https://api.geoapify.com/v2/places";

const CATEGORIES: Record<IndustryId, readonly string[]> = {
  restaurants: ["catering.restaurant", "catering.cafe", "catering.fast_food", "catering.bar"],
  dental: ["healthcare.dentist"],
  clinics: ["healthcare.clinic_or_praxis"],
  beauty: ["service.beauty"],
  auto: ["service.vehicle.repair", "service.vehicle.car_wash"],
  retail: ["commercial"],
  realestate: ["office.estate_agent"],
  hotels: ["accommodation.hotel", "accommodation.motel"],
  fitness: ["sport.fitness"],
  professional: ["office.accountant", "office.consulting", "office.it", "office.lawyer", "office.insurance"],
};
const DEFAULT_CATEGORIES = [
  "commercial", "catering", "office", "healthcare.clinic_or_praxis",
  "healthcare.dentist", "service.beauty", "service.vehicle.repair",
  "accommodation.hotel", "sport.fitness",
] as const;

/** Only accept provider-generated access keys, not URLs, whitespace or code. */
export function validGeoapifyKey(key: string | undefined): key is string {
  return !!key && /^[A-Za-z0-9_-]{8,160}$/.test(key);
}
export function geoapifyCategories(industries: readonly IndustryId[]) {
  return [...new Set(industries.length
    ? industries.flatMap(id => CATEGORIES[id] ?? [])
    : [...DEFAULT_CATEGORIES])].slice(0, 24);
}
export function geoapifyPlacesRequest(area: RadarArea, limit = GEOAPIFY_FREE_MAX_RESULTS) {
  if (!Number.isFinite(area.lat) || !Number.isFinite(area.lon) ||
      area.lat < -90 || area.lat > 90 || area.lon < -180 || area.lon > 180 ||
      !Number.isSafeInteger(area.radiusM) || area.radiusM < 100 ||
      area.radiusM > GEOAPIFY_FREE_MAX_RADIUS_M) throw new Error("geoapify_area_invalid");
  const categories = geoapifyCategories(area.industries);
  if (!categories.length) throw new Error("geoapify_categories_invalid");
  return {
    categories,
    filter: { type: "circle" as const, lon: area.lon, lat: area.lat, radius: area.radiusM },
    limit: Math.min(Math.max(Math.floor(limit), 1), GEOAPIFY_FREE_MAX_RESULTS),
    lang: "es",
  };
}
type GeoPlace = {
  type?: string;
  properties?: {
    place_id?: string; name?: string; formatted?: string; address_line1?: string;
    city?: string; country?: string; lat?: number; lon?: number;
    website?: string; phone?: string; email?: string; categories?: string[];
    contact?: { phone?: string; email?: string };
    datasource?: { sourcename?: string; raw?: { osm_type?: string; osm_id?: number } };
  };
  geometry?: { type?: string; coordinates?: unknown };
};
type IngestPlace = {
  source_ref: string; source_kind: "osm" | "licensed"; name: string;
  lat: number; lon: number; industry: string; category: string; location: string;
  phone: string; email: string; website: string; source_label: string; license: string;
  opportunity: string;
};
const clean = (input: unknown, max: number) =>
  typeof input === "string" ? input.trim().replace(/\s+/g, " ").slice(0, max) : "";
const web = (input: unknown): string => {
  const text = clean(input, 500);
  if (!text) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return (url.protocol === "https:" || url.protocol === "http:") ? url.href.slice(0, 500) : "";
  } catch { return ""; }
};
function sourceRef(place: GeoPlace["properties"]) {
  if (!place) return null;
  const raw = place.datasource?.raw;
  const types: Record<string,string> = { n:"node", w:"way", r:"relation",
    node:"node", way:"way", relation:"relation" };
  const kind = types[String(raw?.osm_type ?? "")];
  if (kind && Number.isSafeInteger(raw?.osm_id) && (raw?.osm_id ?? 0) > 0)
    return { ref: `osm:${kind}/${raw?.osm_id}`, kind: "osm" as const };
  // Geoapify IDs can exceed crm_radar_ingest's source_ref length constraint;
  // hash the ORIGINAL provider identifier to retain stable cross-run identity.
  const placeId = clean(place.place_id, 500);
  if (!placeId || placeId.length < 10) return null;
  return { ref: "geoapify:" + createHash("sha256").update(placeId).digest("hex"),
    kind: "licensed" as const };
}

/** Invalid or unnamed features are dropped; never fabricate businesses or missing URLs. */
export function normalizeGeoapifyPlaces(payload: unknown, max = GEOAPIFY_FREE_MAX_RESULTS): IngestPlace[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const raw = (payload as { features?: unknown }).features;
  if (!Array.isArray(raw)) return [];
  const out: IngestPlace[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, Math.min(Math.max(max, 0), GEOAPIFY_FREE_MAX_RESULTS))) {
    if (!item || typeof item !== "object") continue;
    const f = item as GeoPlace, p = f.properties;
    if (!p || typeof p !== "object") continue;
    const name = clean(p.name, 200);
    const point = Array.isArray(f.geometry?.coordinates) && f.geometry?.type === "Point"
      ? f.geometry.coordinates : null;
    const lon = Number.isFinite(p.lon) ? p.lon : (point && typeof point[0]==="number" ? point[0] : NaN);
    const lat = Number.isFinite(p.lat) ? p.lat : (point && typeof point[1]==="number" ? point[1] : NaN);
    if (!name || typeof lon !== "number" || !Number.isFinite(lon) || lon < -180 || lon > 180 ||
      typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) continue;
    const source = sourceRef(p);
    if (!source || seen.has(source.ref)) continue;
    seen.add(source.ref);
    const emailRaw = clean(p.contact?.email || p.email, 254);
    const industry = (Array.isArray(p.categories) ? p.categories : [])
      .map(c=>clean(c,120)).find(Boolean) || "negocio";
    const website = web(p.website);
    out.push({
      source_ref: source.ref,
      source_kind: source.kind, name, lat, lon,
      industry, category: industry,
      location: clean(p.formatted || p.address_line1 || p.city || p.country, 200),
      phone: clean(p.contact?.phone || p.phone, 40),
      email: isValidRadarEmail(emailRaw) ? emailRaw : "",
      website,
      source_label: "Geoapify Places (OpenStreetMap)",
      license: "Geoapify · © OpenStreetMap contributors (ODbL)",
      opportunity: "Encontrado en fuente pública; confirmar necesidades antes de contactar.",
    });
  }
  return out;
}
