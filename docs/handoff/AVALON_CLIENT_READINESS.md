# AVALON_CLIENT_READINESS — 2026-11-17, America/New_York

**Verdict: NOT_READY.** No real client, consumer, product, provider subscription or production data created. Development-only continuation from main 3631edda; separate PR from Core Engine UI #227 and public #226.

## Preserved and verified

- #221 merged at 3631edda, CI green at 0ab152a including checks and Sales browser. Production Vercel dpl_9XhCGkTFer57AYRJDFLVcqVyezMr READY. Migration ledger read before/after: 41, last crm_client_agreement_drafts_release, Core Engine absent. Timestamp differences (29 historical source filenames) are documented by Claude; no history repair or db push performed.
- #217 already integrated in main (767cb1c). Existing Project Bridge ZIP scanning, immutable/sealed versions, scoped tokens, restore, preview approvals and deploy target protections reused. #225 contains duplicate Core Engine plus Credit Center recovery; do not merge it wholesale. #205 credits still require reconciliation/permissions and is excluded from this increment.
- Canonical agency client_id links sale → work order → project. Existing client-consumer exclusion retained. External customer CRM deployments remain a separate security boundary: no portal for business customers is introduced and no owner role is handed to a client.

## New code

- Radar external requests fail closed unless server deployment variable AVALON_RADAR_EXTERNAL_ENABLED is exactly true. Default paused. Guards cover search/provider selection, geocoding, research POST/library, campaign run/reactivation and future worker code. Read-only inbox/history remain available. Browser does not start basemap tiles or automatic research while disabled.
- Read-only owner API reports switch state; it cannot change the switch. Reactivation requires the owner/operator to authorize deployment configuration. No client-controlled override, no public flag and no cached shared authorization.
- Compact System Readiness in existing CRM Settings. A successful schema read is NOT_VERIFIED for functional readiness; current owner server authorization and this deployment's disabled Radar switch have narrowly described evidence. No stored tokens, raw errors or fabricated cloud CI status. Overall NOT_READY until acceptance, backup and activation.
- AVALON_CLIENT_READINESS extends the existing Core Engine SQL pilot: approved synthetic prospect → idempotent lead → partial versioned diagnosis (includes unknown answer) → proposed terms → verified synthetic contract → sale/work orders → same client's external project imports → two sealed versions → restore as new version → invoice → verified payment → commission → expense → exact ledger and fresh owner session history. External fetch is replaced with a rejecting counter after DB setup. SQL isolation is real PGlite, Storage is a minimal stub; ZIP byte validation and API-token isolation are separate existing Project Bridge suites. This is NOT a hosted remote-session acceptance test.

## Read-only production observation

- cron job 1 avalon-radar-hourly, schedule 5 * * * *, active=false.
- avalon-radar-worker ACTIVE v10 (digest 6d6e7ad03574f9798c2a66437d26644dd93ab6c17fe5f94d47a22d037be824ee), worker config enabled=true, last_started_at 2026-11-10 20:05Z. Lease epoch; no claim about undocumented invokers or current request volume.
- **Production zero spend is NOT verified.** This PR is not deployed. Code changes do not mutate the existing Edge Function nor its configuration.
- Security Advisor categories: rls_enabled_no_policy (INFO), extension_in_public (WARN), anon_security_definer_function_executable (WARN), authenticated_security_definer_function_executable (WARN). Existing allowlist/definer tests audit actual gates; these warnings alone are not proof of an exploit. No production policy/extension change.
  - https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
  - https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
  - https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Matrix

| Area | State | Evidence / remaining acceptance |
| --- | --- | --- |
| Core Engine code | Implemented without production activation | #221 merged; 41-migration compatibility gate |
| Core Engine UI | Implemented, browser CI in review | #227; no SQL deployment |
| CRM / contracts / Clients360 | Verified isolated; hosted acceptance pending | Existing full Sales and Core SQL fixtures |
| Project Bridge | Verified isolated; remote import/restore pending | Existing database/token/ZIP/preview suites and same-client pilot |
| Dev Bridge | Metadata implementation; functional states remain unknown when sources absent | Existing tests/diagnostics; no private session claims |
| Creative Bridge | Reference and receipt contracts retained; end-to-end provider delivery not verified | No generation/spend; no URL alone is published |
| Code Exchange | Existing immutable/tokens model retained; fresh end-to-end recovery pending | Existing tests, no new mainline |
| Radar | Paused by default in candidate; production configuration unchanged | Four executable negative pause tests, cron inactive |
| Security / Auth / RLS | Existing regression coverage; hosted two-session and abuse review pending | No new memberships or RLS |
| Backups | Local Git recovery possible; production backup not independently verified | No backup resource created |
| Multiclient | Agency records canonical; consumer apps not provisioned | Cross-client UUID negative tests; separate consumer boundary mandatory |
| Paid providers | No activation or new calls | No generated media, no Stripe/AI/Geoapify usage |

## Required authorization / handoff

1. Owner: separately authorize suspension of the existing remote worker (disable its worker config and keep cron inactive, or deploy paused worker code). Do not execute from this development task.
2. Owner: backup and separately approve Core Engine migration + explicit finance permissions under CRM_OPERATIONAL_RELEASE.md §4. Do not invent prices or commissions.
3. Integrator: review #227 and this readiness PR, verify exact-SHA candidate and hosted independent owner/outsider sessions. Safari/iPhone and measured hosted performance remain unverified.
4. Existing customers must not be used as fixtures. No Chino website/CRM/account may be created in this operation.

Next action: Codex supplies passing exact-SHA CI and a recoverable bundle; Miguel/Samuel approve the separate production worker/migration and hosted acceptance steps. Until then, NOT_READY.
