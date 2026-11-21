# Avalon — Employee portal production release gates (2026-11-21)

This document distinguishes a deployable build from a safe activation. No employee account is approved by merely deploying UI. Production database is project `ltbwzcrxeuczdhhtbqgm`; protected test database is `xrtgnmuiyqmtisdrzqcg`. Never switch Preview to the production database.

## Validated on fresh integration branch

- PR #317 built **from current main**, rather than merging the diverged #296. Owner-only auth, middleware, tests and Sales Core workflow are preserved.
- The branch uses scoped Vercel Preview variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` of the isolated Supabase branch. These must **never** be copied into Vercel production settings.
- The existing Supabase Preview has 49/49 upstream migration versions plus five isolated corrective migrations, and an additive staff schema. Repeated synthetic PostgreSQL tests passed author-only casefiles, owner inspection, participant-only direct messages and immediate revocation.
- At last inspection production has two owners, zero `operator` members and no `staff_portal_access` table.
- Migration `20261117180500_staff_private_portal.sql` creates six new RLS-protected `staff_*` tables and **does not** modify existing owner-only CRM/Office RLS.

## Release plan with abort conditions

1. Get PR #317's **eight CI workflows green at the exact HEAD** and verify an isolated Vercel Preview READY on that commit; confirm isolated project ID from Preview environment configuration.
2. **Backup gate (not yet satisfied):** verify the production project's available database backups / PITR, create an immediate restorable backup if applicable, and demonstrate restore to a *separate* test project using the operator's approved disaster-recovery workflow. Record recovery point and who tested it. Current connector cannot inspect or restore a database backup; do not infer recovery readiness from `ACTIVE_HEALTHY`.
3. **Auth E2E gate (not yet satisfied):** provision Supabase Auth accounts using the supported Admin Auth invitation flow, not manual INSERT into `auth.users`. Add pre-approved operator memberships only after owner verification. Exercise owner AAL1/AAL2, employee login, `/staff`, `/admin/staff`, direct requests/IDOR, message revoke and owner-visible dossiers. No real client records.
4. Validate schema against production preconditions using read-only SQL: `public.agency_memberships`, `crm_private.is_owner()`, `office_profiles`, `crm_clients`, `office_directory()`; confirm that no `staff_*` tables exist and migration version isn't applied. If any existing object conflicts, **abort**.
5. With approval and backup recorded, apply staff SQL via `Supabase.apply_migration` (production). Run post-migration query for each of six tables' RLS, policies and `anon` privileges. The migration is additive and should seed no staff users; assert that all staff table row counts are zero and there remain zero operators.
6. Merge reviewed PR #317 to main with exact-HEAD protection. Stage Vercel production **without assigning the domain**, run owner-login smoke tests against the staged deployment, then promote the verified production build. Ensure `/admin/staff` is owner-only and `/staff` rejects unactivated accounts.
7. Invite real employees only through a reviewed, owner-approved onboarding mechanism and grant individual clients after consent. No bulk auto-activation.
8. After smoke tests, close superseded PR #296 and issue #315 only when full reproducible migration history (not just patched branch) and Auth E2E are documented.

## Rollback

First rollback Vercel traffic to the last verified production deployment (record its deployment ID beforehand). For the *database*, avoid dropping new `staff_*` tables automatically, because doing so destroys any new messages, dossiers or permission history. Keep the additive schema unused while resolving any application issue. A destructive database rollback, if ever required, needs a separately reviewed recovery plan and verified backup. Do not rotate production secrets or alter owner memberships to troubleshoot staff login.

## Why no automatic publish to main yet

CI/build success does not prove the backup is restorable. The Supabase connector exposes schema/migrations but no backup restore inspection. The Vercel environment inventory also has no `SUPABASE_SERVICE_ROLE_KEY` or `AUTH_FLOW_SECRET` for a reviewed Admin Auth invitation flow; do not install broad admin secrets into `NEXT_PUBLIC_` or bypass the existing Turnstile/MFA gates to force the onboarding UI.
