# Avalon CRM Intelligence V2 — Release gate and recovery plan

**Prepared 2026-11-12. Owner approval is NOT implied.** Applies to the open draft PR #168, not to production. The owner-only operating model is exactly two owners; keep managers, staff and HQ outside this release.

## Evidence and current boundaries

- Main already contains PR #160 and PR #159 (merge `65609bf5a02d7aa41f2f6512737e3a4688784bed`).
- The corresponding Vercel Production deployment was reported READY. **A healthy build is not evidence of a working CRM database.**
- Supabase Production project `ltbwzcrxeuczdhhtbqgm` has exactly two `agency_memberships.role='owner'` records (read-only check, 2026-11-12).
- Production has no `crm_lead_assessments`, `crm_lead_scores`, `crm_contracts`, or `crm_radar_run_places` tables (read-only `to_regclass` checks).
- Supabase Production migration history includes renamed/versioned applied entries for `ai_engine`, `radar_owner_approval`, `project_bridge` and `code_exchange_with_anon_disabled`. The timestamps differ from some corresponding repository filenames.
- **Do not blindly run `supabase db push`:** first reconcile applied migration identities against SQL and live schema so prior work cannot be re-applied or treated as missing.
- Security Advisor: four authorized-but-sensitive anonymous SECURITY DEFINER endpoints require a manual privilege review; 36 authenticated definers; pg_net installed in public; leaked password protection disabled. Advisor findings alone do not prove exploitability.
- Prior PR #159 CodeQL alert details reported as 1 HIGH and 7 MEDIUM were not returned by the available GitHub connector. A green CodeQL workflow does not prove these have been remediated. Owner must review GitHub Security → Code scanning.

## Gate 1: source and security

1. Confirm PR #168 HEAD SHA, diff and no parallel edits against `main`.
2. Review all eight historical CodeQL alerts with rule, path, severity and disposition. Do not dismiss as false positives without documented reasoning.
3. Require green CRM, Auth, Sales, Security, Project Bridge and typecheck/build on the exact candidate SHA.
4. Check that the sample API and browser bundles never contain service-role credentials.
5. Review `SECURITY DEFINER` EXECUTE grants. Do not revoke the intentionally public inquiry/bridge endpoint without a dependency check.
6. Confirm leaked-password-protection and `pg_net` issues have explicit owner-approved remediation plans.

## Gate 2: database / staging rehearsal

1. Obtain a tested recoverable database backup. Check the backup age and restoration process rather than assuming a paid point-in-time recovery feature.
2. Export a migration identity map from the live `supabase_migrations.schema_migrations` table; compare *contents and dependencies*, not just filenames.
3. Use an isolated staging database with representative **synthetic** records. Never point Preview at `ltbwzcrxeuczdhhtbqgm`.
4. Review and rehearse, in dependency order, the **unapplied** scripts in `supabase/migrations/`:
   - `20261110140000_radar_search_runs.sql`
   - `20261111100000_crm_intelligence.sql`
   - `20261112090000_crm_titan_backend.sql`
   - `20261112100000_crm_titan_documents.sql`
   - `20261112110000_growth_funnel_public.sql` (public intake consent and abuse-prevention review required)
   - Project Bridge permission hardening from separate draft PR #169, after verifying no conflicting migration
5. Carefully review dependencies: new CRM intelligence tables are required before the Titan backend; contract evidence depends on CRM attachments and signed verification transitions; Radar search runs depend on Radar core.
6. Query security and performance advisors after rehearsal; compare against baseline.
7. Confirm exactly two owners may read/write new tables and an anonymous/non-owner user cannot.
8. Verify races: concurrent edits, repeated jobs, idempotent Radar searches, duplicate warnings, contract finalization, and public opt-in consent. Do not fake live provider results.

## Gate 3: acceptance tests

- Run the 13 industry-specific questionnaires in English and Spanish on desktop and iPhone.
- Prove every industry stores and retrieves versioned answers, supports conditional questions, unknown answers, and does not silently overwrite another owner.
- Test score-2 evidence, calibration and legal flags. No promise of revenue or ROI.
- Verify a recommendation for paid ads is blocked when license review is pending, a restriction is present, or client capacity is zero. Revalidate decisions server-side.
- Verify existing human-accepted/edited suggestions remain auditable if old evidence disappears, with a **human-review warning**, not silent activation.
- Execute Radar ZIP 33311 then ZIP 33009 with a **licensed configured business-provider key** and confirm live `run_id` scopes, source attribution and no stale data. The PGlite ZIP regression is not a substitute.
- Verify Radar lead qualification/approval before CRM conversion.
- Test `Won`/sale/client conversion denied without a manually verified signed contract, including direct REST calls and stale versions.
- Execute isolated real Preview session with synthetic owner accounts and check browser/network errors.

## Gate 4: authorization before production

Owner approval must explicitly identify:
1. Exact PR/commit to merge and exact production project.
2. Each migration in order, including its data safety/rollback plan.
3. Operational downtime window (if any) and notification strategy.
4. Who is responsible for reviewing signed contracts, permissions and newly public intake functions.
5. Whether any service upgrade or API usage incurs charges; do not incur new costs without agreement.

**Do not merge or apply any migration until those approvals and gates are satisfied.** Automatic Vercel Production deployment on main means a merge can release code immediately.

## Recovery / rollback

- Prefer staged, backward-compatible schema changes and compensating forward migrations; never delete client history to roll back a feature.
- Record existing `main` SHA, Vercel production deployment ID, DB migration status and backup reference before release.
- If the new app fails: route traffic to the last verified compatible deployment *only if it is safe with the new DB schema*, and stop further migrations.
- If a migration fails: stop, preserve forensic details and snapshots, consult the database operator, and use a reviewed forward-fix or tested restore. A Vercel rollback **does not** roll back Supabase.
- Do not remove historical CRM, contract or Radar records; retain audit and version trails.

## Verdict

**Prepared for release review, not authorized for production.** Local/PGlite CI and Preview READY establish useful technical evidence, not that the CRM works on the live production schema.
