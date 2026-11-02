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

## CP-05 — Connected-environment inspection
- Supabase project listing returned exactly one connected project: `ltbwzcrxeuczdhhtbqgm` (main project). No isolated test project available.
- GitHub PR-triggered workflow-run lookup for commit `1314fb95e1c888c3d6c787d066108ba24929dcbd` returned no runs; CI pass not established.
- Do not run RLS tests against the only connected project.
- Creating a second hosted Supabase project may incur charges; obtain a quoted price and explicit consent before provisioning.
- The existing workflow is not a substitute for a lockfile or a passing build.

## CP-06 — Safe stop condition
- No founders' Auth accounts or invitations created.
- No migration applied, no production deploy, no merge.
- Remaining work requires isolated test infrastructure and real execution evidence; do not mark completed based on code review alone.

## CP-07 — Avalon OS audit (2026-11-02, branch `feature/avalon-os-hud-modules`)
- Work branch created from PR #4 head `24ad6e5` (`feature/sprint-01-miguel-google-auth`); PR #4 CI green at that commit.
- PR stack: #1 auth-rls→main (draft), #4 Miguel auth→#1, #5 profile menu→#4 (draft, superseded by the new HUD top-right profile menu), #6 Samuel CRM→#4 (draft, untouched).
- Supabase prod `ltbwzcrxeuczdhhtbqgm`: only `agency_memberships` (RLS, 2 owner rows, authenticated SELECT only); 2 migrations applied; 3 auth users. Advisor: `auth_leaked_password_protection` disabled (WARN).
- Supabase branch `thdgrczotqapnvcjefoi` exists (PR #1). Not used without approval.
- Vercel `avalon-core-agency`: no production deployment yet; previews READY. **`avaloncoreagency.com` is on Vercel DNS but not attached to this project** — `/admin/*` on the main domain needs a routing decision (attach domain, rewrites from the public-site project, or `admin.` subdomain).
- Preview env vars for APP_ORIGIN / AUTH_PASSWORD_LOGIN_ENABLED / AUTH_FLOW_SECRET are scoped to `feature/sprint-01-miguel-google-auth` only.
- Sandbox limitation: npm registry unreachable from the agent environment; lint/typecheck/tests/build are verified in GitHub Actions instead.

## CP-08 — HUD + five modules implemented (not deployed)
- See `docs/AVALON_OS_MODULES.md` for scope, operational vs pending, migration and rollback.
- No production SQL, no merge, no deployment, no CRM files touched.
- CI evidence (commit `a9556be`, PR #7): lint ✓, typecheck ✓, 39/39 unit + static security tests ✓, production build ✓, SSR integration 7/7 checks ✓ (Avalon Auth Review CI run 41402663604); PostgreSQL 16 RLS/trigger suite ✓ (run 41402663593).
- Vercel preview READY: `avalon-core-agency-ef2fbov0r-avalon-core-agency.vercel.app` (SSO-protected; branch has no APP_ORIGIN/AUTH_* preview vars, so sign-in fails closed there).
- Integration test found and fixed a real defect: HEAD count queries report a missing table as success; counts now use a 1-row GET.

**Resume here:** owner decisions in `docs/AVALON_OS_MODULES.md` (migration approval, domain routing, preview env vars, leaked-password protection).

## CP-09 — Sales core: one sale → client, work orders, departmental projects, tasks (not applied)
- Branch `claude/upbeat-galileo-grbelq` = PR #31 head `4856ae5` + `main` `99d5d3c` merged (auth conflicts resolved: main's login code, integration's Preview origin).
- Migration `20261102170000_avalon_sales_core.sql` prepared; **not applied** to any Supabase project or branch. Production ledger read-only check: 4 versions, identical to repo.
- Nova Restaurant E2E automated at DB level (`tests/sales.database.cjs`) and in the browser against the production build (`tests/sales.browser.cjs`); double click creates one sale.
- Full detail, verification table and pending decisions: `docs/SALES_CORE.md`.

**Resume here:** approve applying `20261102170000` to an isolated Supabase branch → advisors → Preview validation; then dashboard KPIs, calendar of due dates, module screens showing `client_id`.
