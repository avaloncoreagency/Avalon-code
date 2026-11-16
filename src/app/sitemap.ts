import type { MetadataRoute } from "next";

/** Only public pages: the landing and the eight solution pages, each in Spanish and English. No private route. */
// Kept literal (no imports) so the sitemap stays a self-contained, testable module. Mirrors SERVICE_ORDER.
const SERVICES = ["website", "ecommerce", "crm", "receptionist", "chatbots", "marketing", "funnels", "automation"];

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = "https://avaloncoreagency.com";
  return [
    { url: `${origin}/`, changeFrequency: "monthly", priority: 1, alternates: { languages: { es: `${origin}/`, en: `${origin}/?lang=en` } } },
    { url: `${origin}/?lang=en`, changeFrequency: "monthly", priority: 0.8, alternates: { languages: { es: `${origin}/`, en: `${origin}/?lang=en` } } },
    ...SERVICES.flatMap(k => {
      const es = `${origin}/soluciones/${k}`, en = `${es}?lang=en`;
      return [
        { url: es, changeFrequency: "monthly" as const, priority: 0.7, alternates: { languages: { es, en } } },
        { url: en, changeFrequency: "monthly" as const, priority: 0.6, alternates: { languages: { es, en } } },
      ];
    }),
  ];
}
