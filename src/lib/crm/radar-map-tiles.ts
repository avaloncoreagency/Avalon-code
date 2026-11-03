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
    if (/(^|\.)tile\.openstreetmap\.org$/i.test(url.hostname.replace(/\.+$/, ""))) return null;
    return template;
  } catch {
    return null;
  }
}

/** Geoapify Free: commercial use with attribution; the tile key is intentionally
 * PUBLIC and must be restricted to Avalon domains inside Geoapify MyProjects.
 * Never use a server-side secret in NEXT_PUBLIC_ variables.
 */
export function geoapifyFreeTileUrl(publicKey?: string): string | null {
  if (!publicKey || !/^[A-Za-z0-9_-]{8,160}$/.test(publicKey)) return null;
  return "https://maps.geoapify.com/v1/tile/dark-matter/{z}/{x}/{y}.png?apiKey="
    + encodeURIComponent(publicKey);
}
export const GEOAPIFY_FREE_TILE_ATTRIBUTION =
  'Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a>'
  + ' · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>'
  + ' · <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a>';
