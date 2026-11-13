# Avalon OS — CRM TITAN production release gate

**Captured:** 2026-11-12, 15:18 America/New_York; updated during this QA session.
**Repository:** `avaloncoreagency/Avalon-code`. **Release candidate:** PR #170, `release/crm-titan-final-20261112` -> `main`.
**Production DB:** `ltbwzcrxeuczdhhtbqgm`. **Existing isolated Supabase QA branch:** `wupvuwmqfcvmjqycmnvg`.
**Scope:** owners-only, CRM Intelligence / TITAN, Customers 360, Calendar, Funnel intake and release safety. No manager/offices reactivation.

## Gate status

- [x] PR #166 merged into `claude/crm-intelligence` at `428875ec`; previous CI tested its source tree.
- [x] 13 CRM-facing frontend files copied onto `main@65609bf5` to form a reviewable candidate, with no production write.
- [x] CRM Intelligence and TITAN backend functions present in isolated QA database, **absent in production**.
- [x] Historical migration versions and names compared (details below).
- [x] Follow-up consent-version validation migration applied to **isolated** QA and checked by function definition inspection. It has not been applied to production.
- [x] Anonymous public inquiry subject-restoration migration applied only to **isolated** QA and inspected; regression test added.
- [x] Synthetic Radar tests added for ZIP 33311 then 33009 (distinct run IDs, no stale replay or cache collision), with **no provider calls**.
- [x] CRM scoring rules `score-2` mark ten new industries as `review` until a human validates applicable licensing/advertising policies; the recommendations engine does not propose paid campaigns when legal status is `review` or `restricted`.
- [ ] PR #170 all current GitHub checks green at the *current* commit.
- [ ] Production migration drift reconciled and schema/permission preflight signed off.
- [ ] Security review/authorization for public functions and Auth settings signed off.
- [ ] Two human owners run authenticated acceptance testing on Preview with isolated DB.
- [ ] Merge to `main` and release authorized. Do not infer this step from a green Vercel build.

## 1 — Exact database drift

GitHub `main` currently contains **31** SQL migration files before this release candidate. The production Supabase migration ledger contains **26** entries.

- **12** migrations share the same version and name.
- **10** share the same name, but their migration version is different.
- **9** GitHub migration *names* have no exact-name entry in production.
- **4** production migration names have no exact-name source file; these MAY be equivalent prior changes and must be compared by object/DDL, not marked missing blindly.

### Same name, different version

| Repository migration | Production ledger version |
|---|---|
| `20261103192500_radar_source_research` | `20261103192843` |
| `20261103205000_radar_scheduler_core` | `20261103211927` |
| `20261103224500_radar_profile_prequalification` | `20261103215714` |
| `20261104120000_manager_execution` | `20261104163843` |
| `20261104130000_project_client_canonical` | `20261104163904` |
| `20261104140000_radar_rules_decisions` | `20261104163931` |
| `20261105090000_manager_missions` | `20261104172854` |
| `20261106090000_ai_engine` | `20261112135942` |
| `20261106100000_radar_owner_approval` | `20261112140014` |
| `20261108100000_project_bridge` | `20261112141905` |

### No exact-name production history

- `20261103113000_crm_client_workspace`
- `20261103223000_staff_profiles_notifications`
- `20261109160000_code_exchange`
- `20261110140000_radar_search_runs`
- `20261111090000_code_exchange_disabled`
- `20261111100000_crm_intelligence`
- `20261112090000_crm_titan_backend`
- `20261112100000_crm_titan_documents`
- `20261112110000_growth_funnel_public`

### Remote-only names

- `20261103205807_crm_client_workspace_finance_access`
- `20261103212000_radar_scheduler_extensions`
- `20261103213432_staff_profiles_global_notifications`
- `20261112142022_code_exchange_with_anon_disabled`

**Do not conclude all 9 are missing functionality.** Some may have been applied under a different name. However, `public.crm_lead_assessments`, `public.crm_growth_funnels`, `public.crm_my_capabilities()`, `public.crm_client_finance_summary(uuid)` and `public.crm_growth_funnel_submit(jsonb)` were **directly verified absent from production**, and present in the isolated branch.

Supabase's `main` branch state is `MIGRATIONS_FAILED`, despite the project being online. A green Vercel production deployment does not make the schema compatible.

**Root-cause log verified:** Supabase `workflow_run_logs` recorded `ERROR Remote migration versions not found in local migrations directory.` at **2026-11-12 20:46:23 UTC**, and a prior occurrence at 14:42:25 UTC. This is a migration ledger/source mismatch, not evidence of a missing React build. Re-running a deploy with the same mismatched set would not repair it. Correct the migration history through supported, audited reconciliation after verifying actual DDL, not by blind renaming or dropping tables.

### Non-destructive reconciliation sequence

1. **Freeze concurrent database deployments**; identify the single release operator and record current Git SHA, DB ledger, extensions, function signatures, owner membership counts, grants and existing data counts. Do not store customer PII in logs.
2. **Create and verify a production backup/restore point** using Supabase's supported backup process. Record rollback ownership and duration; do not assume SQL `DOWN` scripts can undo data writes.
3. Compare remote schema objects/DDL and function bodies against the 31 source files, especially remote-only `crm_client_workspace_finance_access`, `radar_scheduler_extensions`, `code_exchange_with_anon_disabled`. Compare RLS and privileges, not only table names.
4. Construct a **version-to-object reconciliation manifest**. Mark a version as applied only when the production schema demonstrably contains the same changes. Never insert/delete rows in `supabase_migrations.schema_migrations` by guesswork, or use blanket `db reset`.
5. Identify truly additive outstanding changes and simulate the exact order against a clean restored copy or approved isolated branch. Validate with real PostgreSQL RLS tests, two distinct owner identities, and an outsider/anonymous identity.
6. Apply the reconciled migration release **one operator, one controlled window**, only after explicit owner approval. Recheck history, absent tables/RPCs, RLS policies, owner counts, and rollback readiness.
7. Run the real post-migration CRM smoke test before merging/activating UI. Keep all public funnel slugs in draft and managers paused until their separate approval.

Read-only preflight query (do not put owner emails or secrets in output):

```sql
select
  to_regclass('public.crm_lead_assessments') is not null as assessments,
  to_regclass('public.crm_growth_funnels') is not null as funnels,
  to_regprocedure('public.crm_my_capabilities()') is not null as capabilities_rpc,
  to_regprocedure('public.crm_client_finance_summary(uuid)') is not null as finance_rpc,
  to_regprocedure('public.crm_growth_funnel_submit(jsonb)') is not null as funnel_rpc;
```

## 2 — Security review of existing production (no grant changes made)

The Supabase Security Advisor currently flags:

| Finding | Current disposition |
|---|---|
| `crm_public_inquiry(jsonb)` anonymous SECURITY DEFINER | Reviewed intended public inquiry path. SQL has schema checks, honeypot, 3/e-mail/day and 30/hour global limits. Verify abuse monitoring before publishing |
| `crm_ai_public_control()` anonymous SECURITY DEFINER | Read-only public kill-switch state for worker agents; intentional but needs exposure review |
| `os_bridge_api_open_import(...)` anonymous SECURITY DEFINER | Token-hash and `import:create` scope required, 20/hour and idempotency; necessary for cloud import workflow; do not revoke without dependency audit |
| `os_bridge_api_import_status(...)` anonymous SECURITY DEFINER | Token hash and `import:read` or create scope required, bounded to caller's token; do not revoke without dependency audit |
| `pg_net` extension installed in `public` | Schema hygiene warning; moving extension is a separate database migration with dependency assessment |
| Leaked-password protection disabled | Supabase Auth security setting; enable through approved console workflow, then test both owners' sign-in and password resets |
| `finance_access` and `crm_radar_worker_config` RLS with no policy | Deliberate denial until accessed through reviewed server controls; do not create broad policies merely to remove the info finding |

The Advisor also reports 36 authenticated SECURITY DEFINER functions. A warning does **not** prove unauthorized access: audit owner checks, inputs, search_path, effective grants and data authorization per function before changing permissions. Do not grant broad table access to fix a missing RPC.

Relevant Supabase documentation:
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
- https://supabase.com/docs/guides/deployment/database-migrations

## 3 — Funnel consent security hotfix

The original `crm_growth_funnel_submit(request jsonb)` accepted omitted/empty `consent_version` because the comparison was conditional on a non-empty string. The release candidate adds an **append-only** replacement migration with this exact rule:

```sql
if v_consent_version = '' or v_consent_version <> f.consent_version then return 'invalid'; end if;
```

- The original timestamped migration stays unmodified. The follow-up migration uses a stable existing function signature and preserves its grants.
- The fix was applied to the **isolated Supabase branch** as migration `20261112204212_crm_growth_consent_version_required`; the function body was verified.
- The `growth-funnel.database.cjs` test now explicitly rejects missing, blank and outdated versions, and includes the matching version in all valid synthetic submissions.
- **Production has no funnel submission RPC yet**, so the current public site cannot exercise this new path.
- Do not activate anonymous funnel publishing merely because the validation is improved; separately approve legal consent wording and operations.

## 4 — Public inquiry caller-identity hardening

Production's existing `crm_public_inquiry(jsonb)` SECURITY DEFINER briefly sets
`request.jwt.claim.sub` to an owner for its pending-prospect insert. The original
definition did not explicitly restore the anonymous caller's claim afterward.
This is unsafe for any caller executing multiple statements in one transaction.

- Appended `20261112204554_crm_public_inquiry_restore_caller_identity.sql` (no grants changed; existing quotas and honeypot unchanged).
- Applied and verified the replacement function only on isolated branch `wupvuwmqfcvmjqycmnvg`.
- Added a test that performs a public inquiry inside a transaction, checks the claim is empty again, and checks the caller still cannot read CRM prospects.
- **Production remains on the earlier function**; the hotfix must be included in a coordinated and backed-up migration rollout.

## 5 — Industry policy and commercialization safety

The 13 questionnaire templates are bilingual and specialized; the automatic financial score is a sales-prioritization tool, **never a license approval, marketing guarantee, or legal determination**.

- HVAC: DBPR license state already has dedicated manual verification/restriction flags.
- Smoke Shop: known restricted product categories are independently flagged; no paid-ad recommendation for restricted products.
- Barber: appointment/occupancy questions inform sales; license requirements and outreach consent still need manual review by jurisdiction.
- Roofing, Fencing, Tattoo, Landscaping, Plumbing, Cleaning, Restaurants, Electrical, General Contractors and Other: `industry_review_required` is a mandatory, conservative `review` flag. A numeric high grade cannot override it.
- When legal status is `review`, the recommendations engine shows an advisory to verify current policies, **not** the `evaluate_ads` paid-campaign suggestion. A `restricted` status also excludes that suggestion.
- Actual verification requires jurisdiction, license/permit evidence where applicable, proof of applicable consent, current platform rules and documented human sign-off. Do not fabricate that evidence.
- The generic profit cutoffs remain illustrative for the new ten sectors; they do not constitute benchmarked sector-specific profitability. Calibration requires real historical client data and explicit owner agreement.

## 6 — Human acceptance matrix (two owners, isolated Preview)

Run with accounts belonging to the two actual owners, one at a time and then concurrently; never use production customer contacts in test cases.

| ID | Flow | Pass condition |
|---|---|---|
| A01 | Login / logout / owner-only access | Both owners work; outsider returns 403; no session leak |
| A02 | New lead → full general discovery | Saved values survive reload, no duplicate lead |
| A03 | All 13 industries | Sector-specific questions, required fields and EN/ES labels work |
| A04 | Concurrent edits | Earlier draft cannot silently overwrite a newer owner answer |
| A05 | Contract approval | Won/sale blocked without verified signed contract |
| A06 | Commission | Approving another owner's commission or forging approval is rejected |
| A07 | Clients 360 finances | Financial permission RPC and SQL aggregate accurate; denied owner sees no amounts |
| A08 | Calendar | Appointment and follow-up links go to canonical CRM lead/client |
| A09 | Funnel opt-in | Captures once with current version, stale/empty version rejected, no sales/appointments |
| A10 | Radar ZIP 33311 then 33009 | Each run linked to distinct results, no stale cache/ZIP mixing, no outbound calls without approval |
| A11 | iPhone Safari + EN/ES | Responsive, keyboard, no hydration error `#418` |
| A12 | Data isolation | No agency Type A lead mixed with contractor/homeowner Type B lead |

**Automation coverage:** synthetic isolated PostgreSQL/RLS and browser E2E passed on prior integrated commit; this does not replace A01–A12 sign-off against an authenticated deployed Preview.

Synthetic ZIP 33311 → 33009 tests were added without external provider calls. **Radar remains paused** from prior owner instruction. Do not consume Geoapify credits or resume scheduled searches to pass A10; it remains pending an explicit unpause and suitable credentials.

## 7 — Publication order and recovery

1. Review this manifest and the latest PR checks.
2. Fix production migration state using the reconciled controlled release and verified backup.
3. Verify both owners' Auth access and per-owner finance visibility; keep public funnels off.
4. Sign off A01–A12 (except A10 if Radar still paused, explicitly mark deferred).
5. Merge PR #170 to `main` only with owner approval and green checks. Production Vercel may deploy automatically from main; coordinate with DB schema readiness.
6. Verify resulting production commit, Vercel deployment status, critical errors and persistence; rollback code if checks fail while preserving DB backup.

**No production migration, public grant, deployment or external campaign is authorized by preparing this manifest.**
