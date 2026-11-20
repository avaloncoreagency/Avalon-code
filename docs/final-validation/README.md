# Final validation — Refs #292

2026-11-20 · QA owner Miguel / executor Codex; Claude owns intake/CRM/backend fixes. This PR adds only independent tests, a pinned-source reconstruction script and release documentation. No application, migration, Auth/RLS, provider, Guardian or employee portal implementation is changed. No production acceptance or automatic merge/deployment is authorized.

## Reproduce

Use `node scripts/final-validation/stage.cjs <fresh-directory>` from this checkout. The manifest pins main and six source PRs by full SHA; the script creates a detached disposable integration. It stops on unexpected conflicts. The sole known #288/#289 workflow conflict is resolved by preserving the union of path filters and **all four** SQL/definer suites. The #290 matrix's claim of no overlap does not cover this shared workflow. Source branches stay untouched. A merge commit can differ by author/time; source SHAs and resulting tree/content are the evidence, not an invented deployment SHA.

In the disposable candidate install the existing lockfiles (`npm ci`, `npm ci --prefix tests/qa`). Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; then `NODE_PATH=./tests/qa/node_modules node --test tests/final-validation/*.test.cjs tests/final-validation/identities.database.cjs tests/public-inquiry.database.cjs tests/inquiry-history.database.cjs tests/intake-role.database.cjs tests/growth-funnel.database.cjs tests/sales.database.cjs tests/core-engine.database.cjs`.

**Two mandatory acceptance probes intentionally fail on the pinned source.** Execute each separately: `node tests/final-validation/intake-boundary.cjs .` and `NODE_PATH=./tests/qa/node_modules node tests/final-validation/role-reuse.cjs`. Do not weaken assertions or treat a green unit suite as release approval. The workflow runs these even after an earlier step fails. A source correction requires explicit review and new pins; this suite must not silently follow moving branches.

`concurrent-postgres.cjs` is reserved for the disposable localhost PostgreSQL CI service and refuses other targets. Unlike PGlite's queued connection, it launches two real psql sessions. Browser tests use the existing isolated REST/PGlite harness and Chromium. They do not verify hosted Supabase Auth, real owner sessions, Safari, customer tenant isolation or production behavior.

## Confirmed handoff defects

### FV-001 / P1 — Funnel omits server human verification
At #289@789eb2d the Funnel action creates the intake client and calls `crm_growth_funnel_submit` without calling `verifyHumanToken`. In the independent mock probe, missing/invalid/expired/replayed tokens and provider unavailability each produce `human=0`, `intake=1`, `rpc=1`, `status=ok`. These are mocked server-boundary observations, not five real Cloudflare requests or a hosted exploit. Valid consent and size checks still apply and are independently tested.

Expected: with human verification configured, every rejected/unavailable challenge stops **before** intake-client/RPC access; an accepted funnel-specific action and expected hostname is required. Preserve typed values on retry and do not echo tokens. Claude must fix his action/form using the existing verification contract; Codex does not introduce an endpoint or edit his backend. Acceptance: negative server probe passes, a valid synthetic funnel works once in isolated staging, and direct anonymous calls to both privileged RPCs are denied there after separately approved grants/configuration.

### FV-002 / P2 — Reused intake role privileges are not checked
The actual review SQL succeeds for a fresh role. With a synthetic pre-existing `avalon_intake` holding SELECT on a private fixture, that permission remains after the script. A malformed/pre-existing role can therefore violate the stated 'no table privileges' guarantee. This is a review-script risk, **not** a demonstrated production exposure: read-only production metadata reported this role absent. Claude should fail closed on unexpected existing privileges/memberships or propose an audited cleanup requiring approval. Acceptance: rerun fresh and pre-existing-role cases, including role attributes/memberships, and show no excess privileges; do not revoke production permissions blindly.

### FV-003 / P1 release blocker — project signing compatibility not established
Local HS256 signature tests prove serialization, not Supabase acceptance. `AVALON_INTAKE_JWT_SECRET` must match a project signing secret still accepted by Auth/PostgREST; an arbitrary application secret will fail. A shared project signing secret can mint broader roles if compromised even when this code emits a 60-second restricted token. Do not describe the signing credential itself as least privilege. No secret was requested/configured, and no production JWT was minted or submitted.

Official references: https://supabase.com/docs/guides/auth/signing-keys and https://supabase.com/docs/guides/auth/jwts . Review legacy-key state and validate the custom-role exchange only in approved isolated staging. A user-token `/auth/v1/user` check alone is not proof of custom-role PostgREST behavior. Consider a reviewed dedicated restricted database credential with only the two EXECUTE grants, or another official server integration with an independently constrained role; changing connectivity/credentials is Claude's design task and needs owner approval. Imported asymmetric project signing keys alone do not reduce authority to a single role.

Cloudflare server validation is mandatory: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ . Tokens expire after 300 seconds and replay validation has documented consistency limits; the mocked timeout-or-duplicate case is not proof of instant distributed replay prevention.

## Read-only cloud checkpoint and safe Preview proposal

Production metadata: 48 recorded migrations, last `20261120130358_project_bridge_rls_initplan`; 91 public tables / 91 RLS enabled. The #288 message-history migration is **not** applied. Both intake functions are SECURITY DEFINER with an empty search_path. `crm_public_inquiry` is executable by anon/authenticated; `crm_growth_funnel_submit` by anon. These are known public intake paths, not evidence that every advisor warning is exploitable. Review-only grants have not changed production. RLS coverage alone does not prove every policy/storage/API boundary safe.

An existing isolated release-candidate branch was ACTIVE_HEALTHY but had only **40 migrations**, ending `20261114164034_fk_lookup_indexes`, so it is not ready for this candidate's hosted acceptance. No new branch, account, permission, secret or deployment was created. Existing Vercel team plan metadata is Pro; remaining quota/incremental cost is **no medido**. No new paid resource is proposed automatically. A branch-specific env metadata read yielded no rows; it does not establish that global credentials are absent.

Proposed next step, requiring owner approval: reconcile the existing isolated branch to the reviewed candidate schema with a backup/restore plan; prepare authorized synthetic identities and scoped intake credentials plus official Turnstile test keys; bind Preview exclusively to its isolated URL/key. Keep `blocked_unsafe_preview_database` intact. Verify deployment SHA against candidate, real session refresh/negative RLS, direct anonymous RPC refusal, challenge failures, concurrency, storage isolation and recovery. Only then request human pilot acceptance. Local PGlite/mocks and ephemeral CI PostgreSQL need no new provider service; CI quota/cost remains unmeasured. READY deployment alone is not a functional test.

## Coverage and readiness

| Area | Current evidence | Status / missing proof |
| --- | --- | --- |
| Planning Orchestrator | #293 narrow boundary, 743 local units, types/lint/build, existing SQL persistence/replay/owner negative | READY FOR REVIEW for planning only; external executors BLOCKED |
| Intake history | Candidate SQL preserves separate messages, idempotent replays, reversible owner review, version conflicts, rollback on storage failure | PARTIAL; hosted schema/session and real concurrency pending |
| Quote antiBot | Existing server tests for action/hostname, invalid/replay/outage, values retained | PARTIAL; actual PostgREST role and hosted challenge pending |
| Funnel | Server probe reaches intake without human check | BLOCKED, FV-001 |
| Role/grants | Fresh-role isolated SQL positive/negative; reused-role probe fails | BLOCKED pending reviewed design and staging |
| CRM/sales/ledger | Existing unit and SQL synthetic journeys reused, no invented sale on rollback | PARTIAL; hosted workflow acceptance pending |
| Finance | Exact cents/pagination/currency/partial totals and label tests reused (#284) | PARTIAL; not an audit of real accounts or active subscriptions |
| PDF | Existing renderer bytes, text safety, pagination and snapshot tests reused (#278) | PARTIAL; browser preview/download needs candidate browser result |
| Multiclient | Both internal owners allowed; outsider and two non-member synthetic client identities denied internal inquiry reads | PARTIAL; no external customer tenant model/storage/API isolation proof |
| Mobile/Safari | Existing Chromium synthetic browser suites prepared | NOT_RUN for physical iPhone/Safari; no device claim |
| Recovery | Mission test closes/reopens isolated DB; failure rollback and existing bridge tests | PARTIAL; hosted backup/restore remains unverified |
| Safe Preview | Healthy existing branch, stale schema; no approved env connection | BLOCKED |
| Customer pilot | No hosted acceptance / owner sign-off | BLOCKED |

CI records exact harness SHA plus pinned sources. Current release is **not accepted for production**. Source PR green status is not the integrated candidate's result. No provider cost/token estimate is asserted.

## Five next actions
1. Claude: fix FV-001, with negative server tests and preserved drafts; publish corrected SHA.
2. Claude + owners: review restricted-role design, reused-role failure and HS256 compatibility; approve isolated setup only after its credential/rollback plan.
3. Codex: update source pins after reviewed fixes; all mandatory acceptance probes, true concurrent sessions and Chromium regressions must pass on that exact candidate.
4. Owners + Claude: authorize reconciliation of existing isolated Preview; run real independent sessions, denial/storage checks and recovery. Never point it at production.
5. Integrator: review #293 planning-only change, keep executors paused; accept a pilot only after hosted evidence and human sign-off.

Next action: Claude reproduces FV-001 with this pinned harness; acceptance is zero intake/RPC calls for every rejected or unavailable human check, then an approved isolated positive path. No automatic merge.

## Executed checkpoint (2026-11-20, America/New_York)

Manual composite commit `69134b511fbab29e0c54d704e2046b6b0ea89fce`, tree `f959b67dc290f5a34701587cbc7256324e3091a6`: **761/761** root unit tests, typecheck, lint (0 errors / 2 pre-existing warnings), build, **15/15** targeted PGlite tests. Additive independent probe unit tests **3/3** and five-identity inquiry access test **1/1** passed. Separate mandatory acceptance probes failed as described (all five funnel scenarios; reused role). These counts are separate suites, not hosted acceptance.

The reconstruction script was executed into a second fresh worktree. Result tree `f497463a79929a3d407ab62849514a35af56bb6d` differs from the manual composite only in ordering of the same workflow path filters/test arguments; all application and SQL source content is identical. CI will execute this pinned reconstruction and record its own exact harness SHA. No build is claimed for unreviewed moving heads.

Local Nova Restaurant browser execution was attempted normally and failed **before browser tests**: Chromium `socket() failed: Operation not permitted`, then `ptrace` denied. No bypass attempted. Local mobile visual/browser evidence is BLOCKED, physical iPhone/Safari NOT_RUN. Existing isolated synthetic session harnesses do not establish real Supabase session acceptance.

PR #293 head `f2cc24f40338c7faaf66544b39b9365f8e92cb00`: four triggered GitHub workflows completed successfully (Auth Review, security, OS modules, OMEGA); CodeQL/dependency checks successful. Supabase Preview skipped (no SQL changes). Vercel deployment `dpl_5nep4D6VBoXaexpcDm87WzVdtEwG` for that exact SHA is **CANCELED**, with ignored-build-step link. This is not a verified Preview or a unit CI failure. No new deployment requested.
