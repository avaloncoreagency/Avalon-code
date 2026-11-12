import type { L } from "./types";

/**
 * Industries offered in the diagnosis selector. Adding one = add an entry here (and, optionally, a specialized section
 * list in templates.ts). No database change is needed: answers store the industry key and the template version.
 */
export const INDUSTRIES: { key: string; label: L; specialized: boolean }[] = [
  { key: "hvac", label: { es: "HVAC / Aire acondicionado", en: "HVAC / Air Conditioning" }, specialized: true },
  { key: "barber", label: { es: "Barbería", en: "Barber / Barbershop" }, specialized: true },
  { key: "smoke_shop", label: { es: "Smoke Shop", en: "Smoke Shop" }, specialized: true },
  { key: "roofing", label: { es: "Techos (Roofing)", en: "Roofing" }, specialized: true },
  { key: "fencing", label: { es: "Cercas (Fencing)", en: "Fencing" }, specialized: true },
  { key: "tattoo", label: { es: "Estudio de tatuajes", en: "Tattoo Studio" }, specialized: true },
  { key: "landscaping", label: { es: "Jardinería (Landscaping)", en: "Landscaping" }, specialized: true },
  { key: "plumbing", label: { es: "Plomería", en: "Plumbing" }, specialized: true },
  { key: "cleaning", label: { es: "Servicios de limpieza", en: "Cleaning Services" }, specialized: true },
  { key: "restaurant", label: { es: "Restaurantes", en: "Restaurants" }, specialized: true },
  { key: "electrical", label: { es: "Contratistas eléctricos", en: "Electrical Contractors" }, specialized: true },
  { key: "general_contractor", label: { es: "Contratistas generales", en: "General Contractors" }, specialized: true },
  { key: "other", label: { es: "Otra / personalizada", en: "Other / Custom Industry" }, specialized: true },
];

export const INDUSTRY_KEYS = INDUSTRIES.map(i => i.key);
export const isIndustry = (k: unknown): k is string => typeof k === "string" && INDUSTRY_KEYS.includes(k);
export const industryLabel = (k: string | null | undefined, lang: "es" | "en") =>
  INDUSTRIES.find(i => i.key === k)?.label[lang] ?? (lang === "es" ? "Sin industria" : "No industry");
