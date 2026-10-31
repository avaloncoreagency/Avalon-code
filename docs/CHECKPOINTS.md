# Avalon OS — checkpoint log

## CP-00 — Baseline preserved
- Production baseline: `main` at commit `4c55c5054db1d91d10ff338dbd345ba62745f2ff`.
- All Auth/RLS changes isolated in `feature/avalon-auth-rls`.
- Draft PR: https://github.com/avaloncoreagency/Avalon-code/pull/1
- No PR merge, no intentional production deployment, no database migration.

## CP-01 — Auth implementation staged
- Browser/server Supabase SSR clients, cookie refresh middleware, login and sign-out.
- Membership check gates the placeholder private dashboard.
- Founders: Miguel and Samuel; each to be an equal `owner` after separate identity verification.
- Access roles in SQL are provisional and require isolated tests.

## CP-02 — CI build gate staged
- Branch-specific GitHub Actions workflow added: `.github/workflows/auth-review.yml`.
- Workflow runs TypeScript and Next.js build with placeholder public config.
- Workflow uses temporary `npm install --no-package-lock` because no lockfile is in the repository; reproducible `npm ci` is a merge blocker.
- CI status is **unverified**. A workflow file existing is not evidence of a passing run.
- Local runtime has Node.js/npm but cannot resolve github.com to fetch dependencies.

## CP-03 — Database safety gate
- Supabase production migration list was empty on inspection.
- Security advisor returned zero current lints; unapplied SQL is NOT covered by this check.
- No separate isolated development database has been established.
- No SQL has been executed or migrations applied to the connected Supabase project.
- RLS matrix in `docs/AUTH_RLS_REVIEW.md` must be executed against a test database.

## CP-04 — Release gates (NOT cleared)
1. Create or designate a genuinely isolated test database (confirm any cost first).
2. Generate migration via Supabase CLI; apply only to test DB and run RLS negative/positive tests.
3. Obtain a pinned dependency lockfile and successful CI build/typecheck.
4. Confirm GitHub repository privacy and whether Vercel automatically builds preview branches.
5. Verify invite-only Auth settings, redirect allowlist, and user onboarding flow.
6. Explicit approval before real user creation, invitations, production SQL, PR merge or deployment.

**Resume here:** resolve CP-04 items in order. Do not skip gates or mark them complete without evidence.
