import type { MetadataRoute } from "next";

/** Only the public pages: the Spanish landing and its English version. No private route is listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = "https://avaloncoreagency.com";
  return [
    { url: `${origin}/`, changeFrequency: "monthly", priority: 1, alternates: { languages: { es: `${origin}/`, en: `${origin}/?lang=en` } } },
    { url: `${origin}/?lang=en`, changeFrequency: "monthly", priority: 0.8, alternates: { languages: { es: `${origin}/`, en: `${origin}/?lang=en` } } },
  ];
}
