/** Small, user-initiated geographic prospect search. No automated map scraping. */
export const RADAR_ZONES = [
  { id: "miami", name: "Miami · Downtown", lat: 25.7743, lon: -80.1937 },
  { id: "miami-beach", name: "Miami Beach", lat: 25.7907, lon: -80.1300 },
  { id: "fort-lauderdale", name: "Fort Lauderdale", lat: 26.1224, lon: -80.1373 },
  { id: "orlando", name: "Orlando", lat: 28.5383, lon: -81.3792 },
  { id: "tampa", name: "Tampa", lat: 27.9506, lon: -82.4572 },
  { id: "new-york", name: "New York · Manhattan", lat: 40.7410, lon: -73.9890 },
  { id: "los-angeles", name: "Los Ángeles · Downtown", lat: 34.0522, lon: -118.2437 },
  { id: "houston", name: "Houston", lat: 29.7604, lon: -95.3698 },
] as const;
export const RADAR_SERVICES = [
  { id: "website", name: "Sitio web" },
  { id: "receptionist", name: "Recepcionista IA" },
  { id: "crm", name: "CRM / Seguimiento" },
  { id: "ecommerce", name: "E-commerce" },
] as const;
/** Bounded linear email check: avoids regex backtracking on untrusted contact data. */
export function isValidRadarEmail(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 5 || value.length > 254) return false;
  const at = value.indexOf("@");
  if (at < 1 || at !== value.lastIndexOf("@")) return false;
  const dot = value.lastIndexOf(".");
  if (dot <= at + 1 || dot === value.length - 1 || value.includes("..")) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 32 || code >= 127 || code === 34 || code === 92 || "<>()[],;:".includes(value[i])) return false;
  }
  return true;
}

export type RadarService = typeof RADAR_SERVICES[number]["id"];
export type RadarZoneId = typeof RADAR_ZONES[number]["id"];
export type RadarOSMElement = {
  type?: string; id?: number; lat?: number; lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};
export type RadarPlace = {
  key: string; name: string; industry: string; location: string;
  phone: string; email: string; website: string; mapUrl: string;
  lat: number; lon: number; score: number; opportunity: string;
  websiteUnlisted: boolean; service: RadarService;
};
export function parseRadarSearch(zone: string | null, service: string | null, radius: string | null) {
  const found = RADAR_ZONES.find(z => z.id === zone);
  const selected = RADAR_SERVICES.find(s => s.id === service);
  const meters = Number(radius);
  if (!found || !selected || ![800, 1500, 2500].includes(meters)) return null;
  return { zone: found, service: selected.id, radius: meters };
}
/** Exact known coordinates and hardcoded tag rules. No user-provided Overpass code. */
export function buildRadarQuery(lat: number, lon: number, radius: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
      lat < -90 || lat > 90 || lon < -180 || lon > 180 ||
      ![800, 1500, 2500].includes(radius)) throw new Error("Área inválida");
  const around = "(around:" + radius + "," + lat + "," + lon + ")";
  return '[out:json][timeout:12];(' +
    'nwr' + around + '["name"]["shop"];' +
    'nwr' + around + '["name"]["amenity"~"^(restaurant|cafe|fast_food|bar|clinic|dentist|doctors|veterinary|car_wash|car_repair|beauty|pharmacy)$"];' +
    'nwr' + around + '["name"]["office"];' +
    ');out center 120;';
}
const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
function first(tags: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const text = clean(tags[key], 500);
    if (text) return text;
  }
  return "";
}
function safeWebsite(input: string) {
  if (!input) return "";
  try {
    const url = new URL(input.startsWith("http") ? input : "https://" + input);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href.slice(0, 500) : "";
  } catch { return ""; }
}
function businessType(t: Record<string, string>) {
  return clean(t.shop || t.amenity || t.office || "negocio", 120).replace(/_/g, " ");
}
export function radarOpportunity(service: RadarService, websiteUnlisted: boolean, industry: string) {
  if (service === "website")
    return websiteUnlisted
      ? "Sitio web no registrado en la ficha de OpenStreetMap. Confirmar si tiene página antes de ofrecer diseño web."
      : "Negocio con sitio web registrado. Revisar calidad, velocidad y posibles mejoras antes de contactar.";
  if (service === "receptionist")
    return "Negocio de atención al público (" + industry + "). Verificar por llamada si necesita una recepcionista IA; el mapa no confirma sus herramientas.";
  if (service === "crm")
    return "Negocio (" + industry + "). Preguntar cómo gestiona consultas y clientes; el mapa no permite saber si usa CRM.";
  return "Negocio (" + industry + "). Comprobar si vende online antes de proponer una tienda e-commerce.";
}
export function normalizeRadarResults(
  values: unknown, service: RadarService, location: string
): RadarPlace[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const places: RadarPlace[] = [];
  for (const raw of values.slice(0, 200)) {
    const p = raw as RadarOSMElement | null;
    if (!p || !["node", "way", "relation"].includes(p.type ?? "") ||
        !Number.isSafeInteger(p.id) || !p.id || p.id <= 0) continue;
    const tags = p.tags ?? {};
    if (typeof tags !== "object" || Array.isArray(tags)) continue;
    const name = clean(tags.name, 200);
    const lat = p.lat ?? p.center?.lat, lon = p.lon ?? p.center?.lon;
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const key = p.type + "/" + p.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const website = safeWebsite(first(tags, "website", "contact:website", "url"));
    const websiteUnlisted = !website;
    if (service === "website" && !websiteUnlisted) continue;
    const phone = clean(first(tags, "phone", "contact:phone", "mobile"), 40);
    const emailRaw = clean(first(tags, "email", "contact:email"), 254);
    const email = isValidRadarEmail(emailRaw) ? emailRaw : "";
    const industry = businessType(tags);
    const street = [clean(tags["addr:housenumber"], 20), clean(tags["addr:street"], 110)].filter(Boolean).join(" ");
    const address = [street, clean(tags["addr:city"], 70)].filter(Boolean).join(", ");
    const score = Math.min(100, (websiteUnlisted ? 30 : 0) + (phone ? 30 : 0) +
      (email ? 15 : 0) + (address ? 15 : 0) + 10);
    places.push({
      key, name, lat: lat as number, lon: lon as number, industry,
      location: address || location, phone, email, website, websiteUnlisted,
      score, opportunity: radarOpportunity(service, websiteUnlisted, industry),
      mapUrl: "https://www.openstreetmap.org/" + key, service,
    });
  }
  return places.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 50);
}

// ── Radar 2.0 (issue #40): free area, configurable radius, optional industries ──
export const PUBLIC_MAX_RADIUS_M = 5000;      // community Overpass: small human-initiated areas only
export const LICENSED_MAX_RADIUS_M = 80467;   // 50 mi with an owned/licensed endpoint
export const RADIUS_PRESETS_MI = [1, 3, 5, 10, 25, 50] as const;
export const INDUSTRIES = {
  restaurants: { name: "Restaurantes", filters: ['["amenity"~"^(restaurant|cafe|fast_food|bar)$"]'] },
  dental: { name: "Dentistas", filters: ['["amenity"="dentist"]', '["healthcare"="dentist"]'] },
  clinics: { name: "Clínicas", filters: ['["amenity"~"^(clinic|doctors|veterinary)$"]', '["healthcare"]'] },
  beauty: { name: "Salones de belleza", filters: ['["shop"~"^(beauty|hairdresser|cosmetics|massage)$"]'] },
  auto: { name: "Talleres", filters: ['["shop"~"^(car_repair|tyres|car)$"]', '["amenity"="car_wash"]'] },
  retail: { name: "Tiendas", filters: ['["shop"]'] },
  realestate: { name: "Inmobiliarias", filters: ['["office"="estate_agent"]'] },
  hotels: { name: "Hoteles", filters: ['["tourism"~"^(hotel|motel|guest_house)$"]'] },
  fitness: { name: "Gimnasios", filters: ['["leisure"="fitness_centre"]'] },
  professional: { name: "Servicios profesionales", filters: ['["office"~"^(lawyer|accountant|insurance|financial|consulting|it)$"]'] },
} as const;
export type IndustryId = keyof typeof INDUSTRIES;
export type RadarArea = { lat: number; lon: number; radiusM: number; industries: IndustryId[]; label: string };

/** Validates a free area. `licensed` raises the radius ceiling; nothing user-provided reaches the query text except numbers and whitelisted ids. */
export function parseRadarArea(p: { get(k: string): string | null }, licensed: boolean): RadarArea | { error: string } {
  const lat = Number(p.get("lat")), lon = Number(p.get("lon"));
  const value = Number(p.get("radius")), unit = p.get("unit") === "km" ? "km" : "mi";
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return { error: "Elige un punto válido en el mapa o busca una ciudad." };
  if (!Number.isFinite(value) || value <= 0) return { error: "Indica un radio mayor que cero." };
  const radiusM = Math.round(unit === "km" ? value * 1000 : value * 1609.344);
  const max = licensed ? LICENSED_MAX_RADIUS_M : PUBLIC_MAX_RADIUS_M;
  if (radiusM < 100) return { error: "El radio mínimo es 100 m." };
  if (radiusM > max) return { error: licensed
    ? "El radio máximo es 50 millas (80 km)."
    : "Con el servidor comunitario de OpenStreetMap el radio máximo es 5 km (3,1 mi). Para radios mayores configura un proveedor propio o con licencia." };
  const industries = (p.get("industries") ?? "").split(",").filter((x): x is IndustryId => Object.hasOwn(INDUSTRIES, x)).slice(0, 10);
  const label = clean(p.get("label"), 120);
  return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6, radiusM, industries, label };
}

export function buildAreaQuery(a: RadarArea, limit = 200) {
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon) || !Number.isSafeInteger(a.radiusM) || a.radiusM < 100 || a.radiusM > LICENSED_MAX_RADIUS_M) throw new Error("Área inválida");
  const around = `(around:${a.radiusM},${a.lat},${a.lon})`;
  const filters = a.industries.length
    ? a.industries.flatMap(id => INDUSTRIES[id].filters)
    : ['["shop"]', '["amenity"~"^(restaurant|cafe|fast_food|bar|clinic|dentist|doctors|veterinary|car_wash|car_repair|pharmacy)$"]', '["office"]', '["healthcare"]', '["tourism"~"^(hotel|motel|guest_house)$"]', '["leisure"="fitness_centre"]'];
  const timeout = a.radiusM > PUBLIC_MAX_RADIUS_M ? 60 : 15;
  return `[out:json][timeout:${timeout}];(` + filters.map(f => `nwr${around}["name"]${f};`).join("") + `);out center ${Math.min(Math.max(limit, 1), 1000)};`;
}

/** Normalized place ready for crm_radar_ingest (no scoring: stars come only from verified evidence). */
export function toIngest(values: unknown, label: string) {
  if (!Array.isArray(values)) return [];
  const out: { source_ref: string; source_kind: "osm"; name: string; lat: number; lon: number; industry: string; category: string; location: string; phone: string; email: string; website: string; source_label: string; license: string }[] = [];
  const seen = new Set<string>();
  for (const raw of values.slice(0, 1000)) {
    const p = raw as RadarOSMElement | null;
    if (!p || !["node", "way", "relation"].includes(p.type ?? "") || !Number.isSafeInteger(p.id) || !p.id || p.id <= 0) continue;
    const tags = p.tags ?? {};
    const name = clean(tags.name, 200);
    const lat = p.lat ?? p.center?.lat, lon = p.lon ?? p.center?.lon;
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const ref = `osm:${p.type}/${p.id}`;
    if (seen.has(ref)) continue;
    seen.add(ref);
    const emailRaw = clean(first(tags, "email", "contact:email"), 254);
    const street = [clean(tags["addr:housenumber"], 20), clean(tags["addr:street"], 110)].filter(Boolean).join(" ");
    out.push({
      source_ref: ref, source_kind: "osm", name, lat: lat as number, lon: lon as number,
      industry: businessType(tags), category: clean(tags.shop || tags.amenity || tags.office || tags.healthcare || tags.tourism || tags.leisure, 120),
      location: [street, clean(tags["addr:city"], 70)].filter(Boolean).join(", ") || label,
      phone: clean(first(tags, "phone", "contact:phone"), 40),
      email: isValidRadarEmail(emailRaw) ? emailRaw : "",
      website: safeWebsite(first(tags, "website", "contact:website", "url")),
      source_label: "OpenStreetMap", license: "ODbL · © OpenStreetMap contributors",
    });
  }
  return out;
}

/** Visual tier: color + shape + text, never color alone. */
export function tierStyle(stars: number | null) {
  switch (stars) {
    case 5: return { color: "#39ff88", label: "★★★★★ Diamante" };
    case 4: return { color: "#a3e635", label: "★★★★☆ Oro" };
    case 3: return { color: "#facc15", label: "★★★☆☆ Plata" };
    case 2: return { color: "#fb923c", label: "★★☆☆☆ Bronce" };
    case 1: return { color: "#f43f5e", label: "★☆☆☆☆ Exploración" };
    default: return { color: "#64748b", label: "Sin calificar" };
  }
}
