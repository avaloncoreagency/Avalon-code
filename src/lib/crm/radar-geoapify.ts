import type { IndustryId, RadarArea } from "./radar";

/** Geoapify Places categories, sourced from the provider's documented taxonomy (Nov 2026).
 * This module is pure: no keys, external calls, browser access or database mutations.
 */
const CATEGORY_MAP: Record<IndustryId, readonly string[]> = {
  restaurants: ["catering"],
  dental: ["healthcare.dentist"],
  clinics: ["healthcare.clinic_or_praxis"],
  beauty: ["service.beauty"],
  auto: ["service.vehicle.repair", "service.vehicle.car_wash"],
  retail: ["commercial"],
  realestate: ["office.estate_agent", "service.estate_agent"],
  hotels: ["accommodation.hotel", "accommodation.motel"],
  fitness: ["sport.fitness"],
  professional: ["office.accountant", "office.consulting", "office.it", "office.lawyer", "office.insurance"],
};
const DEFAULT_CATEGORIES = [
  "commercial", "catering", "healthcare.clinic_or_praxis", "healthcare.dentist",
  "office", "service.beauty", "service.vehicle.repair", "accommodation.hotel", "sport.fitness",
] as const;
export const GEOAPIFY_PLACES_LIMIT = 40; // 2 Places credits max, at the 20-result billing granularity.

export function geoapifyCategories(industries: readonly IndustryId[]): string[] {
  if (!industries.length) return [...DEFAULT_CATEGORIES];
  const result = new Set<string>();
  for (const industry of industries) {
    for (const category of CATEGORY_MAP[industry] ?? []) result.add(category);
  }
  return [...result];
}

export function buildGeoapifyRequest(area: RadarArea, requestedLimit?: number) {
  if (
    !Number.isFinite(area.lat) || area.lat < -90 || area.lat > 90 ||
    !Number.isFinite(area.lon) || area.lon < -180 || area.lon > 180 ||
    !Number.isSafeInteger(area.radiusM) || area.radiusM < 100 || area.radiusM > 80467
  ) throw new Error("Área del radar inválida");
  const categories = geoapifyCategories(area.industries);
  if (!categories.length) throw new Error("No hay categorías válidas");
  const limit = requestedLimit === undefined ? GEOAPIFY_PLACES_LIMIT :
    Math.max(1, Math.min(GEOAPIFY_PLACES_LIMIT, Math.trunc(Number(requestedLimit) || GEOAPIFY_PLACES_LIMIT)));
  return {
    categories,
    filter: { type: "circle" as const, lon: area.lon, lat: area.lat, radius: area.radiusM },
    bias: { type: "proximity" as const, lon: area.lon, lat: area.lat },
    limit,
    lang: "es",
  };
}

type IngestPlace = {
  source_ref: string; source_kind: "osm"; name: string;
  lat: number; lon: number; industry: string; category: string; location: string;
  phone: string; email: string; website: string; source_label: string; license: string;
};
const asObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
function first(obj: Record<string, unknown>, keys: readonly string[], max: number): string {
  for (const key of keys) {
    const value = clean(obj[key], max);
    if (value) return value;
  }
  return "";
}
function website(value: unknown): string {
  const raw = clean(value, 500);
  if (!raw) return "";
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : "https://" + raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href.slice(0, 500) : "";
  } catch { return ""; }
}
function email(value: unknown): string {
  const raw = clean(value, 254);
  const at = raw.indexOf("@");
  const dot = raw.lastIndexOf(".");
  return raw && at > 0 && at === raw.lastIndexOf("@") && dot > at + 1 && dot < raw.length - 1 &&
    !/[\s<>"\\]/.test(raw) ? raw : "";
}

/** Only ingest verifiably OSM-sourced Geoapify places; source and terms remain visible in the CRM.
 * Use an OSM ID when provided to dedupe against old Overpass results, otherwise a stable place ID.
 */
export function normalizeGeoapifyPlaces(input: unknown, areaLabel: string): IngestPlace[] {
  const body = asObject(input);
  const features = body?.features;
  if (!Array.isArray(features)) return [];
  const result: IngestPlace[] = [], seen = new Set<string>();
  for (const feature of features.slice(0, GEOAPIFY_PLACES_LIMIT)) {
    const props = asObject(asObject(feature)?.properties);
    const datasource = asObject(props?.datasource);
    if (!props || !datasource || datasource.sourcename !== "openstreetmap") continue;
    const name = clean(props.name, 200);
    const raw = asObject(datasource.raw) ?? {};
    const geometry = asObject(asObject(feature)?.geometry);
    const coords = Array.isArray(geometry?.coordinates) ? geometry.coordinates : [];
    // Do not treat missing/blank coordinates as zero (Number(null) === 0).
    const coordinate = (value: unknown) =>
      typeof value === "number" ? value :
      typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
    const lat = coordinate(props.lat ?? coords[1]), lon = coordinate(props.lon ?? coords[0]);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    const osmType = raw.osm_type;
    const rawOsmId = raw.osm_id;
    const osmId = typeof rawOsmId === "number" ||
      (typeof rawOsmId === "string" && /^\\d+$/.test(rawOsmId))
      ? Number(rawOsmId) : Number.NaN;
    const mapping: Record<string, string> = { n: "node", w: "way", r: "relation" };
    const ref = typeof osmType === "string" && mapping[osmType] &&
      Number.isSafeInteger(osmId) && osmId > 0
      ? `osm:${mapping[osmType]}/${osmId}`
      : typeof props.place_id === "string" && /^[0-9a-f]{16,120}$/i.test(props.place_id)
        ? `geoapify:${props.place_id}` : "";
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    const categories = Array.isArray(props.categories) ? props.categories.filter((v): v is string => typeof v === "string") : [];
    const category = clean(categories.find(c => c.includes(".")) ?? categories[0] ?? "", 120);
    const location = clean(props.formatted, 200) ||
      clean([props.address_line1, props.city].filter(x => typeof x === "string").join(", "), 200) ||
      clean(areaLabel, 200);
    result.push({
      source_ref: ref, source_kind: "osm", name, lat, lon,
      industry: clean(category.replace(/[._]/g, " "), 120) || "Negocio",
      category, location,
      phone: clean(first(props, ["phone", "contact:phone"], 40) || first(raw, ["phone", "contact:phone"], 40), 40),
      email: email(first(props, ["email", "contact:email"], 254) || first(raw, ["email", "contact:email"], 254)),
      website: website(first(props, ["website", "contact:website"], 500) || first(raw, ["website", "contact:website"], 500)),
      source_label: "Geoapify · OpenStreetMap",
      license: "ODbL · © OpenStreetMap contributors · Powered by Geoapify",
    });
  }
  return result;
}
