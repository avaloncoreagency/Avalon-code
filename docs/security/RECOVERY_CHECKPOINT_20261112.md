# Avalon Security Recovery — Checkpoints · 2026-11-12

**Scope:** security audit, owner-only authorization, Security Command Center, GitHub CI, Supabase migration inventory, isolated Vercel Preview.
**Integration:** draft [PR #165](https://github.com/avaloncoreagency/Avalon-code/pull/165) against `main`; previous PR #163 closed as superseded. **No changes in this PR have been merged into `main`.**

## Completed checks and code changes

- GitHub PR #159 and #160 previously merged into `main`. The Security Recovery branch was then recreated directly from `main`.
- Findings R-01..R-25 updated; the dashboard separates **open/blocked** risks from controls implemented but still needing validation. Database connectivity is no longer labelled as proof of RLS.
- Added reporting tests and workflow security checks. All external GitHub Actions in the reviewed workflows were pinned to immutable commit SHAs, with assertions that prevent new floating tags.
- Added `.github/CODEOWNERS` and `.github/SECURITY.md` for ownership and private vulnerability reporting. **These files do not enforce required reviews without a GitHub ruleset.**
- Isolated Preview configured with branch-specific Supabase URL and publishable key; prior exact Preview commit `b0ea01f6` deployed **READY**.
- Supabase production project status `ACTIVE_HEALTHY`; health advisors reported no entries at inspection.
- All **71 public tables** observed in production have RLS; `anon` has no direct SELECT grant.
- Security advisors: four public and 36 authenticated callable `SECURITY DEFINER` functions (some intentional). The access model is mixed: owner checks, token-scoped Bridge/Code Exchange RPCs and public quote submission.
- On isolated Supabase, three negative checks produced expected denials: `crm_owner_directory()` as `anon` → 42501; `crm_agent_security_posture()` as authenticated without owner identity → `crm_forbidden`; `os_bridge_api_import_status` with invalid token → `invalid_token`. **No client data was read or changed.**
- Migration inventory by name: GitHub 31, production 26, isolated Preview 32. See `MIGRATION_RECONCILIATION_20261112.md`.

## Outstanding release gates

1. Exact-HEAD CI and Vercel Preview must be green after the latest pinned-actions changes. A previous run exposed `tests/ai-engine-workflow.test.cjs` expecting the literal `@v4`; assertions were updated to expect SHA pins. **Do not assume a passing test without the actual new result.**
2. Enable leaked-password protection (if supported by plan) and verify Auth providers, signup restrictions, reset URLs, session policy and MFA in the Supabase Auth dashboard.
3. Enforce `main` protections through GitHub admin settings: PR requirement, independent review, required checks, Code Owner review, no force push or delete. GitHub ruleset API returned an empty list; classic protection API is inaccessible to this integration (403), not proven disabled.
4. Perform migration content reconciliation, backup restore drill and isolated full-RLS tests before production migration.
5. Test the two real owner accounts plus a non-member using isolated Preview; ensure AAL2 gating for enrolled MFA.
6. Inspect Vercel firewall in dashboard; its configuration API returned 404 and the firewall state is **UNKNOWN**.
7. `pg_net` is non-relocatable; do not attempt a direct schema move.
8. Review remaining low/medium dependency advisories and privacy policy for public repository.


## Checkpoint D: privilege defaults and Bridge scope (2026-11-12)

- Prepared forward-only migration `20261112190000_bridge_scope_hardening.sql`: `os_bridge_api_import_status` checks `import:create` before a state transition and preserves read-only polling. Synthetic PGlite regression added in `tests/project-bridge.database.cjs`. The SQL was compiled successfully in a rollback-only transaction against the isolated Supabase project; `scope_guard_compiles = true`.
- Prepared `20261112191000_future_public_default_acl.sql`: new objects owned by `postgres` stop inheriting implicit `anon` and `authenticated` grants. Tested the relevant DDL in a rollback-only transaction on the isolated project. These changes affect future objects, not existing client tables.
- `supabase_admin` has its own broad defaults in production. Attempting `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` using the available `postgres` connection returned SQLSTATE `42501`. A suitably privileged administrator must address this separately; this PR does not claim comprehensive default-grant hardening.
- Added static regression checks to `tests/security.test.cjs`. All changes remain in a draft PR; neither database has been permanently migrated by this operation.
- Before a release, confirm latest GitHub CI checks and the exact-commit Vercel Preview are READY, then plan migration replay on a fresh isolated baseline and reconcile the `main` migration history. The already-running production `main` is untouched.

## Scope boundaries

No change to production database tables, client data, RLS grants, Auth settings, GitHub `main` branch, WAF, secrets, payment plans or backups. No managers or automatic agents were enabled. The draft PR must not be represented as a completed production release.
