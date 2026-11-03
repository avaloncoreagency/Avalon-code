# Creative continuity — incremental extension of PR #87

Dependency: feat/avalon-creative-delivery-20261103 at e663777. This stacked PR does not replace its protocol, SQL, machine identity or libraries. Main audited at e27a10f; Graphify 80c99cf is stale. Business data belongs in Supabase/private manifests, never public Issues or this repository.

## Private checkpoint CLI
Store a manifest conforming to schemas/creative-bridge/manifest.schema.json OUTSIDE the Git checkout. Required identity: canonical GitHub Issue, stable project_ref, primary owner, agent, branch, exact head SHA, CI metadata, next action. delivery reuses #87's strict CreativeDelivery parser; null delivery means unassigned. A project_ref must equal delivery.source_ref. States/CI in a private file are reported by its author, not independent verification of deployment or permissions.

A synthetic unassigned starting example is tests/fixtures/creative-manifest.synthetic.json. Copy it outside the checkout, replace its synthetic SHA/branch with verified code and keep private business details out of Git.

Commands (no package.json changes):
```
node scripts/creative-bridge/checkpoint.cjs validate /private/manifest.json
node scripts/creative-bridge/checkpoint.cjs plan /private/manifest.json
node scripts/creative-bridge/checkpoint.cjs event /private/manifest.json /private/event.json
node scripts/creative-bridge/checkpoint.cjs handoff /private/manifest.json claude EXACT_SHA 'Run acceptance'
node scripts/creative-bridge/checkpoint.cjs emit-delivery /private/manifest.json /private/delivery.json
```
Files are mode 0600, atomically renamed under an exclusive file lock. Existing exports are not overwritten. Inspect abandoned locks before removal. Source mismatches, agent conflicts, conflicting replay and invalid schemas fail closed. The handoff changes responsibility only by explicit command and preserves history. Compare actual remote head before continuing; this offline CLI does not fetch Git or claim another agent accepted a task. overlaps() reports competing tasks touching common areas, never merges them.

The emitted delivery is consumed by EXISTING creative:validate / creative:submit from #87. Validation/export do not register anything. Its signed receptor and transactional RPC are the only registration authority. register() is orchestration with an injected authorized transport, not a Supabase permission bypass. Keep source_ref stable on every retry: #87 SQL makes replay idempotent even after a local crash. Local saved receipts avoid additional submissions. SQL/HTTP tests use synthetic Auth, not accounts in hosted Supabase.

Unassigned manifests create NO lead. Persisting unassigned projects inside Avalon libraries is pending a reviewed owner/RPC extension because #87 requires a company. Do not send a made-up business name to bypass that requirement. Ambiguous matches remain #87 conflicts/manual review. The existing UI/SQL handles library↔lead/client links and never creates a sale or marks a demo won. No shared UI was edited here.

## Visual resources
visual.ts defines a provider port; it has NO default network client and cannot assume assistant tools are installed in Next.js. prepareVisual quotes only. generateVisual requires explicit per-request budget approval, matching fresh quote, finite cost and max credits. Production implementations must enforce durable idempotency by request.id and keep all provider credentials server-side. No live provider start was executed in this PR.

Read-only Higgsfield catalog discovery on 2026-11-03 confirmed image models z_image/recraft_v4_1; this is an observation, NOT a pinned catalog, price, credential or promise those models remain available. Re-query capabilities and quote at use time. No generation/credits spent.

Asset lifecycle: pending → generating → ready/failed/cancelled; failed can be retried to pending explicitly; terminal ready/cancelled cannot be silently changed. Ready needs storage reference and SHA-256; video additionally needs a durable reduced-motion fallback. HTTPS temporary URLs are not storage identities. Metadata is author-reported: an importer must actually copy bytes to authorized storage, validate type/size/hash and approve media before rendering. Lazy loading, alt text, poster/fallback and reduced-motion UI are integration obligations, not proof that bytes were imported by this manifest tool. Failure of one resource does not block the project's reference registration.

## Gates and rollback
No migrations, Auth, RLS, grants, users, secrets, hosted data or production changed. #87 SQL remains review-only and must be tested in isolated staging after independent review. Signed HTTP receipt, real asset import, authenticated Preview/mobile and real owner acceptance remain activation gates. CI does not prove them. Rollback this extension by reverting its new files; private checkpoints can be retained for audit. Never roll back by dropping client projects or histories. Main and other authors' branches are untouched.

## Persistent lifecycle and administration (second increment)
`/admin/creative-bridge` is an isolated owner-only page, using the existing Suite, libraries and CRM. Its POST `/api/creative-bridge/projects` accepts only four explicit operations: create unassigned draft, link existing CRM lead, persist checkpoint, link an already confirmed sale of the SAME client. UUID/role authorization is verified server-side and in PostgreSQL, Origin must match, payload is bounded, errors are generic. Direct machine and anonymous access is denied; machine registration of identified companies still uses #87. No free-text request executes code.

PROPOSAL `docs/sql/creative-continuity.sql` must follow #87's registration proposal, ONLY after review and isolated testing. It adds invoker RPCs, not a second project/customer table, owner grant, machine identity or Storage service. Existing `os_projects.settings` holds the checkpoint/assets and up to 100 immutable event digests; existing version and audit triggers retain history. A 16 KB manifest bound prevents unbounded metadata. Identical event replay returns the current receipt; conflicting events, stale versions, reassignment to another lead, ambiguous client identity and cross-client sales fail. Archival is respected. Sale linkage never inserts payments, changes sale status or fabricates a purchase. The original sales flow remains responsible for pipeline transitions. Check the sale's CURRENT state in its original module; a saved reference is not a promise it will never be cancelled.

All three libraries list the same `os_projects` rows; lead/company HUD and Client 360 keep their existing backlinks through `operations.client_lead_id` and `client_id`. Reusable templates need a DISTINCT source_ref per client implementation; the template/source identity is never reused to overwrite another client's association. UI lists latest 100 creative projects/active leads/confirmed sales explicitly; use the main CRM for records outside that selection. Owners can create a new lead in the existing CRM and select it afterwards. No duplicate lead is created for unassigned work.

### Approved local media importer
```
node scripts/creative-bridge/import-asset.cjs /private/manifest.json ASSET_ID /private/approved.png --approve-public-use
```
This command performs a real filesystem copy ONLY for media approved for PUBLIC use. It checks file signature and 12 MB bound, hashes bytes, stores immutable content-addressed files under public/creative-bridge, atomically updates the private manifest and rejects symlink escapes, mismatched types, SVG/HTML and conflicting ready content. PNG/JPEG/WebP and MP4 containers are accepted; this is NOT a codec transcoder or malware scanner. Video requires an existing ready image fallback. Explicit approval is an operator declaration; do not import private client material. Review Git diff before committing the public file. Nothing is uploaded, generated, deployed or charged automatically.

The new owner page renders approved local image paths with lazy Next Image. Video has controls, no autoplay, preload=none, image poster and CSS reduced-motion fallback. External storage references without local approved paths are displayed as metadata rather than fetched automatically. Failed resources remain visible as failed and do not break registration. Importing local bytes is tested with a synthetic PNG; real Higgsfield output requires an authorized export, which was not performed.

### Advancing code safely
```
node scripts/creative-bridge/checkpoint.cjs advance /private/manifest.json OLD_SHA NEW_SHA 'Run CI for the new source'
```
The CLI requires NEW_SHA to be actual local Git HEAD and records its branch. Core refuses a stale OLD_SHA, retains history and resets CI to UNKNOWN. A late new event for the old source is rejected. Existing receipted projects retain their identity; save the new checkpoint with a fresh event ID and current DB version. Do not create a second source_ref to retry a failed save.

### Verification and activation boundary
Tests cover isolated SQL registration and complete lifecycle; actual Next HTTP and mobile browser through synthetic Auth/PostgREST + PGlite; body/Origin/owner checks; importer/CLI; and existing signed delivery HTTP. Every table/role/user in those fixtures is synthetic. No hosted SQL, credentials, owner accounts or publication was changed. Automated libraries on a deployed Avalon require independently reviewed #87 SQL, reviewed continuity RPCs, configured low-scope machine integration and a verified isolated Preview. Those are activation gates, not permissions this code can infer. Do not mark a deployment/asset ready from CI alone.
