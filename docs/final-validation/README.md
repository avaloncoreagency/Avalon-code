# Final validation — Refs #292

2026-11-20 · main207ed3a · owner Miguel / executor Codex; Claude owns intake, CRM and backend fixes. **Pilot BLOCKED.** This additive PR changes only QA/release documentation. No application, migration, Auth/RLS, Guardian or employee portal implementation is changed. No production merge/deployment/SQL/configuration was performed.

## Current checkpoint and source freshness

During this audit Claude replaced the HS256 role design. Current reviewed source pins are #288@87a993168b8f72ecc9d9b19a44b4eab9c09123e5, #289@5b5942b88c2531f4113217cc3a360e0554821215, #265@d0bd58263367a3acae829a81123bfd149629ac5e, #284@a7d8f46b8b40a9f2627842da3ceb6f5793b3def6, #278@c10309a3582d514d8dc975f9fa3ca0a44f8b1784 and #293@f2cc24f40338c7faaf66544b39b9365f8e92cb00. The manifest is authoritative for test reconstruction.

New #294 integrates Claude's release candidate separately. Its report is source evidence, not independently reproduced acceptance. This harness does not duplicate that PR or edit its branch. #290's assertion of no overlap missed the workflow modified by both #288/#289: reconstruction keeps the union of path filters and **all four** SQL/definer suites. It stops on any unreviewed conflict.

The prior HS256 compatibility concern and reused-role warning are **SUPERSEDED for the new design**, not current defects: no intake role/JWT is now created. Their original reproduction and tested old SHAs remain in `HISTORICAL_HS256_CHECKPOINT.md` and `tests/final-validation/historical/role-reuse.cjs`; do not run that old probe as acceptance of the replacement design. No production change was needed or made to retire a design that was never activated.

## FV-001 — P1 confirmed server human-check omission

Current Funnel action calls `intakeCall('funnel', request)` → `crm_public_funnel_intake` with a server token, **without** invoking human verification. Independent execution of the actual transpiled action and actual intake adapter uses only a synthetic scoped token and mocked headers/limiter/Supabase/challenge verifier. Missing, invalid, expired, replayed and provider-unavailable scenarios each reach the wrapper RPC with human verification calls=0. These are synthetic server-boundary tests, not actual Cloudflare requests or a hosted exploit. Consent/length rejection and honest RPC-error response pass separately.

Expected: when human verification is configured, a rejected or unavailable challenge must stop before intake/RPC; a valid funnel-specific action and expected hostname is needed. Preserve visitor drafts, do not echo tokens. Claude owns the action/form correction. Acceptance: `node tests/final-validation/intake-boundary.cjs .` exits zero for all negative cases, and the approved isolated positive path succeeds once. This gate remains deliberately red; do not remove/weaken it. A wrapper token blocks direct anonymous RPC calls but cannot itself attest that its caller checked a human.

## Replacement token wrappers

Current #289 removes project signing-key dependency and stores only SHA-256 of a revocable server-only `AVALON_INTAKE_TOKEN`. Independent `token-boundary.cjs` executes the actual review SQL in disposable PGlite with tiny synthetic internal functions. It checks BOTH wrappers against missing/short/wrong/overlong/revoked tokens; a valid token works; anon cannot invoke the original RPCs or read private rows/token hashes. Claude's existing full-migration SQL test separately verifies rotation and inquiry storage.

This proves isolated SQL semantics, not hosted configuration, token secrecy in deployed logs, real session behavior or proof of human verification. No new secret was created/configured. Rollout remains approval-gated: reviewed backup, SQL/hash registration and app env must be coordinated; fallback direct mode is a documented unactivated state, not a secure bypass closure. Authenticated callers are deliberately denied by the review wrapper; owner behavior on public forms should be explicitly accepted in staging.

For reference only, official Supabase custom-role connections and scoped grants are documented at https://supabase.com/docs/guides/database/connecting-to-postgres and https://supabase.com/docs/guides/database/postgres/roles . They are an alternative design option, not another implementation. No arbitrary app secret can substitute for an accepted project JWT signing key. The historical HS256 design was locally serialized but never remotely accepted here.

Cloudflare reference: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ . Server Siteverify is mandatory; a widget alone is insufficient. A mocked timeout-or-duplicate response is not proof of instant distributed replay prevention.

## Reproduce without cloud writes

1. From this QA checkout run `node scripts/final-validation/stage.cjs <fresh-directory>`. It reconstructs the exact manifest sources in a detached worktree and prints harness SHA, source SHAs and candidate tree.
2. In that disposable directory install existing lockfiles: `npm ci`, `npm ci --prefix tests/qa`. Run units/typecheck/lint/build. Then `NODE_PATH=./tests/qa/node_modules node --test tests/final-validation/*.test.cjs tests/final-validation/identities.database.cjs tests/public-inquiry.database.cjs tests/inquiry-history.database.cjs tests/intake-role.database.cjs tests/growth-funnel.database.cjs tests/sales.database.cjs tests/core-engine.database.cjs`.
3. Execute mandatory gates separately: `node tests/final-validation/intake-boundary.cjs .` (currently fails) and `NODE_PATH=./tests/qa/node_modules node tests/final-validation/token-boundary.cjs`.
4. The workflow also runs true concurrent psql sessions against an ephemeral localhost PostgreSQL service, and existing Chromium suites against the synthetic HTTP/PGlite harness. The concurrency script refuses non-ephemeral/non-loopback targets. PGlite alone is not true multi-session concurrency. No paid resource or production token is used.

CI records the exact harness SHA and immutable source pins. A candidate merge SHA can differ by timestamp/author; compare its tree and source pins. Never silently follow moving heads. Changing an upstream source requires review and new pins. GitHub token permissions are contents:read; no deployment or secret scope.

## Executed evidence

Initial combined application tree `f959b67dc290f5a34701587cbc7256324e3091a6` at local commit69134b5: **761/761** root units; types/lint/build pass (0 lint errors,2 pre-existing warnings); **15/15 +16/16** reused isolated SQL tests; **3/3** independent synthetic probe units; **1/1** five-identity SQL denial test. Additional HTTP/integrity tests **4/4** passed with browser flags off: these prove synthetic HTTP schema compatibility/diagnostics, **not** browser quote/PDF/iPhone acceptance despite their inherited test titles. Original failures reproduced before correction are preserved in the historical checkpoint.

After Claude's source update, local reconstructed candidate `9e76a444e34d351e572408eb93d326c0e0bd1837`, tree `3e8ad55bf062ce16ebc96cab2c1d07f868d1b7c7`, is used for targeted intake/identity/probe revalidation. **12/12** targeted current intake/identity/probe tests passed; the independent token-wrapper gate passed and all five human-check cases still failed. Full current candidate CI results must be read on this PR's exact head; older green source runs are not substituted. Final runtime results accompany the report.

Local Nova Restaurant browser was attempted normally: Chromium failed before UI assertions with `socket() failed: Operation not permitted` and ptrace denied. No bypass/relaunch flags added. Local mobile/browser evidence BLOCKED; physical iPhone/Safari NOT_RUN. CI Chromium is emulation, never physical Safari. Performance/provider costs/tokens: **no medido**.

#293@f2cc24f: four triggered GitHub workflows completed successfully (Auth Review, security, OS modules, OMEGA). Local 743 units/types/lint/build + persistent mission SQL passed on identical tree a34f3a8. Supabase Preview skipped. Exact-SHA Vercel deployment dpl_5nep4D6VBoXaexpcDm87WzVdtEwG CANCELED with ignored-build-step link; no functional Preview claim. External executors remain paused.

## Read-only security and safe Preview

Production schema checkpoint: **48 migrations**, last20261120130358_project_bridge_rls_initplan;91 public tables with91 RLS enabled. #288 message-history migration is not applied. Both intake functions are SECURITY DEFINER with empty search_path; `crm_public_inquiry` allows anon/authenticated execute and `crm_growth_funnel_submit` anon execute. Current wrapper SQL is review-only and has not changed these grants. Advisor warnings need function-by-function authorization analysis; neither RLS coverage nor warning counts proves security.

An existing isolated release-candidate branch is ACTIVE_HEALTHY but has only **40 migrations**, ending20261114164034_fk_lookup_indexes, so hosted acceptance is BLOCKED by schema drift. No new branch/account/permission/config/deployment was created. Vercel team metadata reports Pro; remaining quota/incremental cost **no medido**. A branch-specific env metadata query returned no rows; no conclusion about global credentials is drawn.

Concrete proposal, pending owner authorization: use that existing isolated branch after reviewed backup/schema reconciliation; authorized synthetic owner A/B plus outsider/client A/B; official Turnstile test keys and a scoped revocable wrapper token; branch-only Preview URL/key. Keep `blocked_unsafe_preview_database` intact. Verify exact deployment SHA, both negative/positive RPC gates, real independent sessions, row/file/API denial, concurrency and restore before human pilot acceptance. Existing branch use may incur charges; do not assume it is free. Local PGlite/mocks and ephemeral CI service require no new provider resource; CI cost/quota unmeasured.

## Readiness

| Area | Status | Acceptance still needed |
| --- | --- | --- |
| Orchestrator planning | READY FOR REVIEW (#293) | Integrator review; live executors BLOCKED pending trusted authorization/evidence, no Guardian dependency |
| Intake history / owner review | PARTIAL | Current candidate UI/real concurrent sessions and hosted schema/session proof |
| Quote human check / token wrappers | PARTIAL | Approved isolated configuration, real challenge and direct RPC denials |
| Funnel | BLOCKED (FV-001) | Server challenge gate + draft recovery + isolated positive/negative proof |
| CRM, finance and ledger | PARTIAL | Synthetic unit/SQL regressions passed; hosted workflow and complete authorized data proof |
| PDF | PARTIAL | Renderer bytes/pagination/characters/snapshots tested; actual current browser preview/download proof |
| Internal owner sharing | PARTIAL | Synthetic owners share history; outsider and two non-member client identities denied internal reads |
| External customer multitenancy | NOT IMPLEMENTED / NOT VERIFIED by this harness | External CRM tenancy must not be inferred from two internal owners or mock clients |
| Storage and recovery | PARTIAL | Existing synthetic bridge RLS/version/ZIP/restore tests pass; hosted storage/backup recovery pending |
| Mobile and accessibility | PARTIAL | Chromium candidate evidence pending; physical Safari/iPhone NOT_RUN |
| Isolated Preview / pilot | BLOCKED | Schema/env authorization, exact-SHA hosted tests and human sign-off |

## Five priorities

1. Claude: correct FV-001 in his action/form, preserve drafts, publish tested SHA.
2. Codex: refresh reviewed pins; require all negative gates, real concurrent PostgreSQL and Chromium regressions on exact candidate.
3. Owners + Claude: approve backup/schema/token/test-key setup on existing isolated branch, with cost check and rollback. No production SQL.
4. Owners + QA: real independent sessions, API/file/row denials and recovery; confirm public-form behavior when already signed in; human pilot acceptance only after evidence.
5. Integrator: review #293 planning-only change without remerging #260/#277; keep external adapters paused until separate authorization/evidence gate exists.

Next action: Claude reproduce FV-001 using the pinned harness, then publish a correction with zero intake/RPC calls for rejected/unavailable human verification. No auto-merge.

The initial CI concurrency fixture returned unavailable because it lacked an agency owner; the real function explicitly rejects that state. The fixture now seeds one synthetic owner only in its guarded ephemeral database. This is a harness setup correction, not a Claude product defect or a weakened assertion. No blind rerun: new source pins and the corrected fixture require a new commit.
