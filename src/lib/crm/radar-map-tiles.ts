/**
 * Basemap tiles are independent of OSM-derived prospect data. The OSM Foundation's
 * volunteer tile server can return "blocked" pictures with HTTP 200, so Leaflet's
 * tileerror event is not a reliable way to detect a policy block.
 *
 * Never silently use volunteer OSM tile servers for this commercial application.
 * A separately authorized HTTPS tile service must be configured by the owners.
 */
export function resolveRadarMapTiles(configured?: string): string | null {
  const template = configured?.trim();
  if (!template || !["{z}", "{x}", "{y}"].every(part => template.includes(part))) return null;
  try {
    const url = new URL(template.replace(/\{[zxy]\}/g, "0"));
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    // Explicitly prevent the previously blocked community endpoint (and legacy subdomains).
    if (/^(?:[abc]\.)?tile\.openstreetmap\.org$/i.test(url.hostname)) return null;
    return template;
  } catch {
    return null;
  }
}
