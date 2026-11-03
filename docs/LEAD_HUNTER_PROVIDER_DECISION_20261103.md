# Avalon Lead Hunter — licensed provider decision (3 November 2026)

## Decision for the MVP
**Geoapify Places + Geocoding**, selected only by `AVALON_RADAR_PROVIDER=geoapify` and server-only `GEOAPIFY_API_KEY`.
Keep the existing Overpass data adapter for explicitly owned/licensed endpoints and bounded development only. Do **not** use public Overpass, Nominatim or OSM tile servers for unattended commercial discovery.

Official sources checked:
- Geoapify free commercial plan, no card, 3,000 credits/day: https://www.geoapify.com/pricing/
- Geoapify Places storage and attribution: https://www.geoapify.com/places-api/
- Geoapify request schema and supported categories: https://apidocs.geoapify.com/docs/places/
- Geoapify raster map tiles (requires a distinct browser-exposed, domain-restricted key): https://apidocs.geoapify.com/docs/maps/
- Overture Places open-data option: https://docs.overturemaps.org/guides/places/
- Foursquare Places PAYG terms expressly forbid contacting businesses as prospects: https://foursquare.com/legal/terms/apilicenseagreement/
- OSM community tile restrictions: https://operations.osmfoundation.org/policies/tiles/

## What this PR implements
1. An explicit Geoapify Places adapter for business categories and bounded circle searches, max **40 results per request** (at most 2 Places credits by Geoapify's 20-result granularity), no automatic pagination or retries.
2. Name, coordinates, category, OSM provenance, business website/phone/email *only when present*; identity reuses the OSM ID when provided for cross-source deduplication. Every record has `source_kind=osm` and `license` with ODbL + Geoapify credit.
3. Existing `crm_radar_ingest` accepts prospects as **pending** only. Human approval remains the only route into the 13-stage pipeline. No stars are inferred from an absent website/contact.
4. Server-only key, owner-authenticated routes, 30-second manual search brake, 429 stops with clear errors, 12-second upstream timeout; no credentials committed.
5. Search and geocoding stay disconnected in production unless **both** variables above are deliberately set. No new services, external API calls, users, vendors or charges are enabled by committing this code.

## Map-layer status — PR #56 already merged
The street-map 403 is **not** fixed by changing the discovery API. PR #56 merged into main and removed the blocked community OSM tile fallback; it preserves a safe radar grid when no licensed tile provider is selected.
Geoapify's map tile URL requires a browser-visible API key. Restrict that key to Avalon domain and ensure #56's URL validator and attribution explicitly support the selected provider before enabling map tiles. Do not put the server-only Places key into NEXT_PUBLIC variables. In the meantime, use the safe grid fallback. Review OSM and Geoapify attribution on the radar screen before going live.

## Licensing and compliance gates
- Geoapify's free plan allows commercial projects, but not unlimited traffic or guaranteed zero blocks. Stay within quota/rate limits, obey required visible attribution, monitor usage, and respect ODbL when storing/redistributing OSM-derived datasets.
- **Do not use Foursquare Places API** for outbound lead generation: its current license forbids contacting businesses as prospects. Avoid scraping Google Maps/Google Places data to populate CRM lists.
- Overture Maps Places is a longer-term fallback (published permissive data on S3/Azure). Build geographically bounded snapshots with source licenses, refresh dates, categories from the updated 2026 `taxonomy/basic_category` structure, dedupe and provenance before relying on it.
- No emails, calls, schedule or campaigns should start automatically. Consent, no-contact status, and lawful business communication must be verified. Geoapify can omit phone, email, websites: missing fields are **unverified**, never evidence that services are absent.

## Manual activation after owner account setup
1. Create Geoapify Free account using company details; read terms and attribution. No subscription/payment required for free tier, but limit warnings and upgrade requests can still occur.
2. Configure **server-only** `GEOAPIFY_API_KEY` and `AVALON_RADAR_PROVIDER=geoapify` in an **isolated Preview** first. Do not paste keys in issues, chats, logs or repository files.
3. Confirm REN's PR #56 compatibility/attribution before enabling live use. Do not promote or merge until lead owner login, 429 handling, deduplication, source attribution, and isolated staging E2E are checked.
4. Test a small, explicit area and compare returned results to the CRM: no duplicates, no invented contacts, no unsanctioned outreach. Capture usage and request counts in provider dashboard.
5. Roll back by removing `AVALON_RADAR_PROVIDER` or unsetting the API key (production then fail-closed; existing records remain intact). No SQL migrations required.

**No vendor offers an unconditional guarantee against rate limits. The durable architecture separates independent place-data, geocoding and map-tile providers.**

## Defensive provider contract (3 Nov 2026)
- Explicitly reject empty coordinates and invalid OSM identifiers instead of creating false (0,0) businesses.
- Cache geocoding by selected provider; validate Geoapify server key before cache hit and preserve attribution on cached responses.
- Require GeoJSON response; reject upstream redirects and unexpected formats, and never mark an incompatible nonempty Places payload as a successful empty import.
- Configurable Overpass URLs reject known public/community hosts, loopback/internal and unsafe host formats. This is not proof of data licensing, nor a distributed rate limiter.

## Geoapify credential harmonization and geocoding safety
- The Geoapify Places server key can be configured as `GEOAPIFY_API_KEY` (PR #67) or `AVALON_GEOAPIFY_PLACES_KEY` (PR #65). When **both** are configured, they must be identical; conflicting keys fail closed rather than silently charging one account. Production discovery still requires `AVALON_RADAR_PROVIDER=geoapify`; storing a key alone does not enable lookups.
- The geocoder uses Geoapify `x-api-key` **server-side header** rather than URL query parameters. Forward geocoding rejects missing/blank coordinates, malformed GeoJSON and out-of-range points.
- Production will **not** query public Nominatim unless a geocoder endpoint is explicitly configured. Use Geoapify when the account is ready or an owned/licensed geocoder. The OSM community Nominatim endpoint can be used only for bounded manual development tests under its policy.
- The open PR #65 also changes search, geocoding and tile code. **Review and reconcile #65 and #67 together**; do not merge both independently without resolving the overlapping files and key naming. Keep the map's browser key `NEXT_PUBLIC_AVALON_GEOAPIFY_MAP_KEY` separate from any Places server key.
