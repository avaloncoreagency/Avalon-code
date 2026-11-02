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
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : "";
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
