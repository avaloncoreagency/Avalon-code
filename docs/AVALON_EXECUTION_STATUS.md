# Avalon — execution status (single source of truth for resuming work)

Last update: 2026-11-02 · Branch `claude/upbeat-galileo-grbelq` · Final PR:
[avaloncoreagency/Avalon-code#34](https://github.com/avaloncoreagency/Avalon-code/pull/34) → `main`

## 1. What is integrated in this branch

| Source | Status here | Notes |
|---|---|---|
| `main` 99d5d3c (password-login hotfix) | merged | main's login code; integration's Preview origin kept |
| PR #31 / #21 integration (HUD, CRM, auth) | base of the branch | #21's Graphify docs cherry-picked |
| PR #24 CRM home + order, #25/#26 auth CI | already contained | content-identical or superseded (verified per file) |
| PR #19 release candidate | already contained | its only unique patch (email normalization) is in login |
| PR #32 phase-0 security | merged | crm_core byte-identical to production, CRM RLS SQL suite, Dependabot |
| PR #13 / #15 / #16 security hardening | merged | opt-in TOTP MFA, auth rate limiting, hardened cookies, Security Center |
| PR #20 13-stage pipeline | consolidated | re-sequenced as `20261102180000_crm_pipeline_13.sql`; its duplicate `crm_clients` dropped in favour of the single client model |
| PR #34 sales core | this branch | sales → client → work orders → departments → projects → tasks |
| PR #6, #12, #17 | ancestors / superseded | nothing unique left |

Graphify: no Graphify tool was connected in this session (UNKNOWN); Git + tests were used.

## 2. Phase status

| Phase | State | Evidence |
|---|---|---|
| 0 Integrate & stabilize | **done** | §1; 127 unit + all DB/HTTP/browser suites green locally |
| Ghost CRM ("en desarrollo por Samuel") | **fixed** | root cause: `main` had no `/admin/workspace/crm` route → `[module]` placeholder. `tests/navigation.test.cjs` |
| 1.1 Lead Hunter | operational (Samuel) | prospects, CSV import, dedupe, approve → pipeline (`crm_convert_prospect`) |
| 1.2 Pipeline | operational; 13 stages after `180000` | Kanban, keyboard stage move, follow-ups, stale view, recorded conversion |
| 1.3 Ventas | **done** | atomic idempotent `crm_confirm_sale`; Nova Restaurant DB + browser E2E |
| 1.4 Clientes 360° | **done** | edit, contacts, activities/follow-ups, sales, payments, projects, tasks, history |
| 1.5 Calendario | **done (internal)** | events (Samuel) + agenda of task due dates, deliveries, follow-ups |
| 1.6 Tareas | **done** | mine / assigned by me / overdue / all / closed, comments, history |
| Avisos, Actividad, Configuración CRM | **done** | per-owner inbox; audited timeline; catalog + automation switches |
| Dashboard | **done** | "Pulso comercial" from real data; Registrar venta shortcut |
| 2 Public website | not started | public domain is a separate deployment (see CP-07); next phase |
| 3 Departments | partial | 5 module HUDs exist; they receive projects from sales via `os_projects.client_id` |
| 4–6 Ops center, automations, tracking | partial | rules + timeline + alerts sweep exist; technical ops = Security Center |

## 3. Tests (local, final commit of this session)

`npm run lint` ✓ · `npm run typecheck` ✓ · `npm run build` ✓ · `npm test` 127/127 ✓ ·
`npm run test:integration` ✓ · `tests/sales.database.cjs` 4/4 ✓ · `tests/crm.pipeline.database.cjs` ✓ ·
`tests/crm.database.cjs` ✓ · `tests/unified.database.cjs` ✓ · `tests/crm.integration.cjs` (+browser) ✓ ·
`tests/sales.browser.cjs` (Nova + Dashboard→CRM→every page + lead→sale→client→calendar→history) ✓ ·
PostgreSQL 16: full chain + `crm_pipeline.test.sql` ✓, `crm_core_rls.test.sql` (crm_core scope) ✓, `os_modules_rls.test.sql` ✓.
CI: see PR #34 checks (sales-core, crm, auth-review, os-modules, security).

## 4. Database ledger (read-only check, 2026-11-02)

Production `ltbwzcrxeuczdhhtbqgm` and isolated branches `kmpmvwbtqaggkjjxfayh` (PR #12),
`wupvuwmqfcvmjqycmnvg` (PR #19): `053022`, `053452`, `070500`, `085430` — identical to the repo.
**Staging (`kmpmvwbtqaggkjjxfayh`, owner-approved 2026-11-02):** `20261102170000` and `20261102180000`
applied, each in one transaction, from the files at commit `3bfd07d` (md5 verified before execution:
`5c8dd658…`, `28a5f6c2…`) with the exact repo versions recorded in the ledger. Security advisors: only the
expected WARN "authenticated can execute SECURITY DEFINER" for the 5 owner-checked RPCs; no RLS findings.
Two SYNTHETIC owners (`miguel.preview@example.com`, `samuel.preview@example.com`) + owner memberships.
**Production:** still pending — not applied (owner decision: wait for staging validation). Without them, sales/clients/tasks screens show an honest
"migración pendiente" notice; CRM core (leads, hunter, calendar) keeps working.

## 5. Preview (resolved for this branch with owner approval; guard unchanged)

Vercel project `avalon-core-agency`: this branch has no branch-scoped Preview env vars, so it inherits
`NEXT_PUBLIC_SUPABASE_URL` (targets production+preview+development = production DB). The guard in
`next.config.ts` aborts such builds (`BUILD_UTILS_SPAWN_1`, deployment `dpl_773uAjq5zj286STGBqGtMv3DBD9P`).
This is intended and must stay. Resolution approved and applied (option 1); branch-scoped Preview vars
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `AUTH_FLOW_SECRET` (sensitive) now exist
for `claude/upbeat-galileo-grbelq` only. Options that were offered:
1. Reuse isolated Supabase branch `kmpmvwbtqaggkjjxfayh`: apply `170000` + `180000`, create two synthetic
   owner users + memberships, set branch-scoped Preview vars for `claude/upbeat-galileo-grbelq`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `AUTH_FLOW_SECRET` (sensitive).
2. Create a new Supabase branch for PR #34 (billable compute) and do the same.

## 6. Resume here

1. Owners log into the Preview with the synthetic credentials (shared outside Git) and run the journey.
2. Owner decision on production: backup → apply `170000` then `180000` → merge PR #34 → verify.
3. Next phase: public website lead capture into Lead Hunter (review queue, anti-spam), then departments.
