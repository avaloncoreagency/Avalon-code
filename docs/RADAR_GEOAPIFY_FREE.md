# Urgent: repair Titan Radar 403 with Geoapify Free (commercial allowed)

Date: 2026-11-02. Stage this PR and PR #56 first; do not bypass Supabase Preview→production guards. Goal: zero **new subscriptions** (existing Vercel/Supabase + Geoapify Free).

## Why 403 happened (two distinct causes)

1. **Blocked map pictures:** previous Radar fetched `tile.openstreetmap.org` without Referer due to Avalon's `Referrer-Policy: no-referrer`. OSM volunteer tile policy requires Referer. Some 403s are **returned as picture tiles with HTTP 200**. PR #56 removes this source and shows functional fallback radar grid. Do not restore direct OSM community tiles or proxy around policy blocks.
2. **Business discovery disabled in production:** `radarEndpoint()` intentionally refuses community Overpass in production without an approved licensed/owned search provider. This branch adds **Geoapify Places** as an explicitly configured, free-commercial-use alternative. **Without a valid provider key, searching new businesses will still report a configuration blocker**. The grid still shows existing leads.

## Pick provider, pricing and legal basis

Official provider: https://www.geoapify.com/pricing/ and https://apidocs.geoapify.com/docs/places/

- Geoapify Free: **3,000 credits per day**, up to **5 requests/second**, **no credit card required**. Commercial use allowed with attribution to Geoapify and OSM, within its terms and applicable restrictions. Shared daily credits cover maps, Places, geocoding. Geoapify's terms reserve the right to suspend or charge for excess usage: **monitor quota** in MyProjects. Do not assume unlimited use, zero cloud egress or SLA.
- Places API: **1 credit per up to 20 results**. Avalon explicitly clamps **60 results max (~3 Places credits)** per manual/saved campaign run and **5 km max radius** for Geoapify Free. Its geocoding uses a single query with cache and a 1.1 s minimum interval per app instance. Manual search throttled to once per owner per 30 seconds per app instance; campaigns de-duplicated hourly. These per-instance limits do not guarantee a strict daily hard ceiling across Vercel serverless replicas. No scheduler/bulk search is enabled.
- OSM data ODbL means we must keep attribution and respect public-business-data use. Missing web/phone/email does NOT imply absence of a website, nor prove a need for our services. Owner approval is mandatory before CRM pipeline conversion.
- Do not use Stadia Maps Free, MapTiler Free, or OSM US public tiles to operate a **commercial** agency: those free offerings have non-commercial limits (or require written permission). Do not rely on public Overpass for regular commercial lead hunting.

## Setup (owner must create their free provider project)

1. Open https://myprojects.geoapify.com/ → register, choose **Free ($0)**, confirm no paid plan/upgrade or billing method is selected.
2. Create **two API keys in the same free project** if the dashboard permits:
   - **Private Places + geocoding key** for server calls. Set the Vercel encrypted env var **`AVALON_GEOAPIFY_PLACES_KEY`** to that key for the approved environment. **Never prefix NEXT_PUBLIC**. Do not commit, copy into an issue/chat or show it in logs. Suitable restrictions: approved Vercel egress IPs if a stable egress solution is in use; many serverless environments do not have one. For server-only calls ensure the provider's allowed key settings permit backend requests.
   - **Public map tile key** for browser requests. Restrict its **HTTP referrers / allowed origins** to actual Avalon domains and the Vercel Preview domain that is being tested. Set **`NEXT_PUBLIC_AVALON_GEOAPIFY_MAP_KEY`** (intentionally public and exposed to browsers). This creates `https://maps.geoapify.com/v1/tile/dark-matter/{z}/{x}/{y}.png?apiKey=PUBLIC_KEY` automatically, with Geoapify/OSM/OpenMapTiles attribution. Restrict key usage to map tile service if the provider allows. Never use private Places key as the browser key.
3. Remove any old `NEXT_PUBLIC_AVALON_MAP_TILES` URL pointing to blocked community tile services. If a different approved provider URL is intentionally configured, it takes precedence over Geoapify's public tile key. To use Geoapify as the default, **leave that old custom variable unset**.
4. In **Vercel Preview**, ensure Supabase points to isolated staging project **`jasgumggzgoqbemtcmno`**, not production `ltbwzcrxeuczdhhtbqgm`. The strict build-time guard must remain. Redeploy Preview so NEXT_PUBLIC is compiled.
5. Sign in as a staging synthetic owner. Visit `/admin/workspace/crm/hunter` (or Lead Hunter section) and confirm **no requests** to `tile.openstreetmap.org`. Geoapify tiles should render the dark city map and show "Powered by Geoapify".
6. Choose **1 mi or 3 mi** (3 mi ≈ 4.83 km), select industry **Dentistas**, click **Buscar negocios**. The server requests Geoapify Places and geocoding using server key; an OSM-sourced result gets `osm:node/id` or `osm:way/id` for deduplication. Assert prospective business is genuinely returned, stored as *pending*, not automatically called or approved.
7. Approve one synthetic prospect deliberately; verify conversion idempotently to CRM pipeline. Test repeat scan, missing key, incorrect key (401/403), 429 quota, network timeout and map tile error fallback. Verify the **same company** isn't duplicated by a second scan.
8. Monitor daily provider credits. **No automatic upgrade**. After Preview verification and owner review, approve the scope of production deployment explicitly. Test real account login/RLS separately; a CI green badge does not prove provider responses work with actual keys.

## If key is not configured or the free tier is exhausted

- No silent fallback to commercial use of volunteer OSM tiles/Overpass.
- Visual radar grid, saved leads, existing CRM stages and human approval remain usable.
- Provider diagnostic is shown in the Radar instead of a fake count.
- Error 401/403 shows provider-key restrictions; 429 shows quota without automatic re-requests.
- Commercial API discovery is blocked honestly until a key is configured or a licensed self-hosted service becomes available.

## Sources/terms (verify before launch)

- https://operations.osmfoundation.org/policies/tiles/
- https://www.geoapify.com/pricing/
- https://www.geoapify.com/terms-and-conditions/
- https://apidocs.geoapify.com/docs/maps
- https://apidocs.geoapify.com/docs/places/places/
- https://www.geoapify.com/places-api/
- https://wiki.openstreetmap.org/wiki/Overpass_API
