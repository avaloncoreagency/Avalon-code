import type { MetadataRoute } from "next";

/** The public landing is indexable; the private operating system and its APIs are not crawled. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api"] }],
    sitemap: "https://avaloncoreagency.com/sitemap.xml",
  };
}
