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
**Production (owner-approved after testing the Preview, 2026-11-02):** backup of the touched rows in schema
`backup_20261102` (crm_stages, agency_memberships, migration ledger); `20261102170000` then `20261102180000`
applied, md5-verified from commit `3bfd07d`, ledger versions identical to the repo; `pg_net` enabled only for
the fetch and dropped afterwards. Verified: 13 stages, 6 departments, 6 services (no prices), 5 rules on,
0 business rows created, all 21 `crm_*` tables with RLS. PR #34 merged to `main` as `bb2fe16`. Without them, sales/clients/tasks screens show an honest
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

1. Done: Preview validated by the owner, production migrated, PR #34 merged (`bb2fe16`).
2. Owner settings still open: enable "Dependency graph" (Dependency review check) and Supabase Auth
   "Leaked password protection" (pre-existing advisor WARN); set catalog prices/default assignees in CRM → Configuración.
3. Next phase: public website lead capture into Lead Hunter (review queue, anti-spam), then departments.

## 7. Radar 2.0 — Omega 5.0 increment (issue #40, builds on PR #39)

Branch `claude/upbeat-galileo-grbelq` = `main` (bb2fe16) + PR #39 (mobile dock, radar MVP) + this increment.

| Item | State | Evidence |
|---|---|---|
| Found businesses persisted & deduped (`crm_prospects` + `source_ref`) | done (isolated DB) | `tests/radar.database.cjs` |
| Need matrix per service with method/evidence/confidence | done | same |
| Explainable 1–5★ from verified evidence only; separate confidence; audited override | done | same + browser (0 evidence → Sin calificar; 4 verified → 4★) |
| Do-not-contact blocks approval; approval required before pipeline (existing `crm_convert_prospect`) | done | DB + browser |
| Real map (Leaflet + OSM tiles), cyan sweep (reduced-motion aware), tier color + shape + text markers, synced list/sheet | done | `tests/sales.browser.cjs`, `radar-results-mobile.png` |
| Free search: geocoder (human-initiated, cached, 1.1 s) + tap map + my location; radius presets 1–50 mi or custom mi/km | done | `tests/radar.test.cjs` |
| Inbox views: Encontrados, Nuevos, Sin calificar, Calificados, Aprobados, En pipeline, Descartados, No contactar; Mejores oportunidades de esta zona | done | browser |
| Campaigns/runs tables (start paused, bounded) | schema only | DB test |
| Scheduler (cron) running campaigns | **blocked** | needs a licensed/owned places endpoint (`AVALON_RADAR_OVERPASS_URL`) + `CRON_SECRET`; community Overpass forbids automated sweeps |
| Overture / licensed provider adapters | pending | owner decision on provider + cost |
| AI usage center (ChatGPT/Codex, Claude, Higgsfield) | pending | existing `crm_usage` manual records; no official read APIs connected |
| Public website, departments polish | pending | next phases |

Limits (honest): community Overpass ≤ 5 km radius, 30 s between searches per owner, blocked in production
unless `AVALON_RADAR_OVERPASS_URL` is set. Larger radius (≤ 50 mi) only with a licensed/owned endpoint.

Migration `20261102190000_radar_core.sql`: **not applied anywhere**. Staging `kmpmvwbtqaggkjjxfayh` no
longer exists (Supabase removed PR #12's branch); only PR #19's branch `wupvuwmqfcvmjqycmnvg` remains.
The branch-scoped Preview vars of this branch still point at the removed staging DB → Preview cannot log in
until an isolated DB is chosen (owner decision).

Next exact task: owner chooses (a) isolated DB for Preview and (b) map/places provider; then campaign runner
(`/api/radar/cron` with CRON_SECRET, advisory lock, budget) and AI usage center.

## 8. Lead card history (owner request, 2026-11-02; rebased on main 2026-11-03)

`main` already ships a drag-and-drop `LeadBoard`; it is kept (not duplicated). Its **Ficha** opens a history
drawer per lead: stage changes written by trigger (with time in previous stage), notes, scheduled
activities and files (≤ 5 MB, type allowlist + signature check, 25 MB/lead, immutable, owner RLS,
download as attachment + `nosniff` + sandbox CSP). Migration `20261102210000_pipeline_board.sql`:
**not applied anywhere**. Evidence: `tests/pipeline-board.{test,database}.cjs`, `tests/sales.browser.cjs`.

## 9. Avalon OS 2.0 — Oficina / Office (2026-11-03)

Route `/admin/workspace/crm/office` (6th CRM tab; Dashboard shortcut). Owner-only (server `requireOwner`
on the page, `getOwnerSession` on every route, same-origin check on writes).

| Item | State | Evidence |
|---|---|---|
| Live isometric HQ (dollhouse view, SVG): glass façade + skyline (day/night by local hour), lounge, glass meeting room, desks, plants; every member and the 5 AI managers seated at a desk; zoom/pan; keyboard accessible; badges only from stored data; wall screen with live counts; 30 s refresh | done | `office-desktop.png` |
| Directory from `agency_memberships` (all roles) via `office_directory()`; new members appear without code changes | done (isolated DB) | `tests/office.database.cjs` |
| Profiles + photo written only by the person themselves (no invented portraits; neutral monogram otherwise) | done (isolated DB) | DB + browser |
| Member stats from `crm_tasks` (assigned / open / overdue / completed / projects), recent activity from `crm_timeline`; definitions shown; no productivity score | done | `tests/office.test.cjs` |
| Assign task from a profile (existing `crm_tasks`, existing RLS) | done | browser |
| Private messages (sender/recipient-only RLS, immutable, read-once receipts, linked lead/client/sale/project/task must exist, 200/h bound); 20 s refresh, no Realtime dependency | done (isolated DB) | DB + browser (desktop → iPhone width) |
| AI managers REN/SHIN/HARU/SORA/KENJI: profiles + request inbox; status **Sin conexión**; requests are only "registrada" or "cancelada", never "ejecutada"; no generated replies | done | DB + browser |
| Office stats panel + filters (period, role, department, person) + 14-day completed sparkline | done | browser |
| Higgsfield imagery | **blocked by sandbox network** | budget approved; 1 test image generated (0.25 credits) but `d8j0ntlcm91z4.cloudfront.net` is denied → cannot be downloaded into the repo |
| Spatial Luxury retheme of the whole app (central tokens: obsidian/navy/cosmic violet/ice/lavender/titanium/champagne; neon removed from module styles) | done | screenshots in `tests/sales.browser.cjs` |
| Motion layer: page-content entrance on navigation, press feedback, card depth on hover, staggered KPIs, Kanban drag feedback; `prefers-reduced-motion` disables it | done | visual |

Not built (honest): AI execution backend (managers cannot run anything), presence/availability source,
push/e-mail notifications for messages, "incidents" (no incident entity exists yet).

Migration `20261103100000_office.sql`: **not applied anywhere**. Until applied, the Office shows owners
(from `crm_owner_directory`), stats and activity; profiles, photos, messages and manager requests show
"migración pendiente".

Higgsfield (checked 2026-11-03, read-only): MCP reachable from Claude Code; balance 2,000 credits, team
plan; candidate models `soul_location` (environments) and `soul_cast` (consistent characters). Per-image
price not exposed by the API at first check. After owner approval (2026-11-03): preflight 0.25 credits per
`gpt_image_2_5` image, ~1 per `soul_cast` portrait; one isometric HQ image generated (0.25 credits). The result
host `d8j0ntlcm91z4.cloudfront.net` is blocked by this environment's network policy, so no further assets were
generated until it is allowed. Total spent: 0.25 credits.
