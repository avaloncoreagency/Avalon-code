# Avalon Product Control — PR #175 / Review candidate

**Product decision:** Claude Code, Codex and authorized tools create customer products externally. Avalon only registers references, receives reviewed deliveries, stores available files, organizes clients and tracks maintenance. No product creation or new external provider connections are implemented here.

## Current architecture

- No global `Biblioteca` navigation. Existing `/admin/workspace/library/**` routes remain for legacy imports, sealed versions, secure previews, token management and backups. They must NOT be deleted during menu cleanup.
- Website Designer / E-commerce Designer / CRM Creator / Marketing Hub display their own company-grouped product portfolios, manual registration, product detail and module-scoped delivery intake.
- Communication Hub remains the only primary communications module, grouping AI Receptionists and Chatbots by verified CRM lead reference.
- The existing owner-gated `os_projects` and Project Bridge records remain the source of truth. The system never treats `status=active` or HTTPS URL as evidence of actual uptime, deployment, a sale or a payment.
- An owner may register a project with URL alone; then use the existing ZIP importer on its *versions* page if archive files are available. ZIPs are processed under owner authorization/RLS, never executed.
- Existing Claude/Codex `avb_` scoped Project Bridge tokens admit ZIP deliveries to the owner-reviewed inbox. The owner can optionally link a pending upload to an existing product BEFORE processing to create a new version on the SAME product ID. Without linking, the processed import creates a new unlinked product that must later be assigned a client.
- External Higgsfield URL-only signed automatic registration is NOT operational: see `docs/CREATIVE_BRIDGE_SETUP.md`. Never present a reference-only handoff as a live installed product.
- Product issues use the backwards-compatible `client_hud` JSON persisted under optimistic project version writes. Existing requests remain readable. Issue kind, severity P0-P3, owner assignee, reproduction, expected/actual, HTTPS evidence, notes, checklist and reopen are implemented. Downloaded AI repair briefs remain owner-gated and contain untrusted customer content as JSON, not executable instructions.

## Important release gates

1. **Do not merge or deploy without owner approval.** Claude owns migration reconciliation and security. This PR has no applied migrations or production writes.
2. New ZIP categories `receptionist`, `chatbots`, `marketing` are disabled unless `AVALON_PRODUCT_CONTROL_EXTENDED_UPLOADS=true`. The API AND owner UI enforce this. The separate review-only SQL proposal is `docs/sql/product-control-bridge-categories-review.sql`. It MUST be verified against the actual isolated schema and coordinated with Claude BEFORE becoming a forward-only migration. Do not set the flag until the SQL migration is approved and applied.
3. **Automatic ZIP intake has limits.** It only creates an authenticated, pending import with a verified server token. A human owner must review and process. It does not contain a verified external customer identity on receipt, and it does not publish.
4. Manual URL registration is a reference, not hosting or uptime checks. The CRM relationship via `client_lead_id` is a lead reference; `os_projects.client_id` for a confirmed sale remains a distinct relationship managed through Sales Core and must be reconciled with Claude's CRM Titan changes.
5. The original reusable Bridge does not safely execute or build uploaded Next.js/React code. ZIP exports may be stored but not published without a separately approved isolated build pipeline.
6. Actual authenticated iPhone Safari / both owner accounts, complete browser ZIP→new-version→AI-brief E2E and real external tool-to-Avalon delivery have **not** been performed in production.
7. Until product checks and project changes are tested, declare each record state unknown and keep existing PR #175 as draft.

## Owner workflow (once validated and released)

1. Navigate Website Designer → **Mis Websites** (or the respective module).
2. **Registrar producto** with the exact CRM company ID and the verified external HTTPS URL; no passwords.
3. Open the product HUD; review its URL and use **Versiones y archivos** to import a ZIP as a *new version* of this product.
4. Create an **Error o mejora**, add steps, priority, assignee and checklist, then download the IA repair brief.
5. Ask Claude/Codex to correct the external product. Once its new version is available, use the same project ID for the next ZIP delivery and owner review. Prior sealed versions stay intact.
6. If Claude/Codex has an explicitly provisioned scoped Project Bridge token, it can submit the ZIP to that module's API inbox; the owner must link to the existing product before approval, or the system will create a separate unlinked project.

## Coordination and rollback

- Claude owns security, Supabase production migration history, backups, REN cleanup and CRM Titan. No schema writes, production data, or active workflows were modified by this feature.
- Revert PR #175 code to restore the old UI without deleting files/projects; do not drop any table or bucket.
- All claims require exact-head CI and isolated Preview evidence; 320px/390px and real Safari QA are distinct checks.


## Client 360 identity guard

The registration UI now accepts the verified `crm_clients.id` of an existing confirmed client, not just a legacy `crm_leads.id`. If both are supplied the server compares `crm_clients.origin_lead_id` to the lead ID and rejects mismatched associations. It never creates a sale, receipt or payment. The canonical `os_projects.client_id` FK remains the authoritative link into Client 360; legacy lead-linked projects remain accessible. Portfolios prefer client FK grouping and link directly to the Client 360 page, preserving older lead-group behavior.

This requires the existing Sales Core schema already present in production; it does not apply DDL. Owner-only and database RLS remain required.

## Distinguish repair from verification

New issues support `blocked → in_progress` and `fixed → verified → closed` transitions. The `verified` transition requires a dated, owner-authored manual test note with at least 15 characters; a mere code commit cannot advance the status. This is recorded user evidence, not an independently verified functional test. Legacy `done` remains valid and reopenable for backwards compatibility.

## Portfolio pagination

Website, E-commerce, CRM Creator and Marketing portfolios use exact server counts and stable 50-record pages (`page=1..1000`) without changing legacy callers of `listProjects`, which remain capped at 100. The search box filters the **loaded page**, not the entire database; server-wide search would require a separate bounded index/query contract. Communication Hub retains its existing 60-record page behavior. Any 1000-page upper bound is explicit and must be revisited when product volumes justify it.

## Final UX notes

- Confirmed Client 360 links in each product record target `/admin/workspace/crm/clients/[id]`; legacy lead links target `/admin/workspace/clients/[id]`.
- External creator and reference-vs-pending modes are visible in the product record. Stored project row version is labelled **record version**, not falsely called a sealed code backup.
- The CRM Creator's primary registration no longer asks for a starter blueprint; previously built internal editor routes remain for backwards compatibility only.

## Communication Hub client identity

The single Communication Hub agent intake form also lets an owner choose an existing verified `crm_clients.id` (beside the historical lead reference). The shared server action validates both against the CRM origin lead; it never creates a sale or an AI call. The same Product HUD, issue workflow, files and delivery inbox are reused for both Chatbot and Receptionist.
