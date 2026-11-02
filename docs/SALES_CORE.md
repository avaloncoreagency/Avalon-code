# Avalon OS — Sales core (Operación Titán, Block B + first part of Block C)

Branch `claude/upbeat-galileo-grbelq`, based on `integration/avalon-preview-ready-20261102`
(PR #31 head `4856ae5`) with `main` (`99d5d3c`, production password-login hotfix) merged in.

## What a sale does now

`Registrar venta` (CRM → Ventas → Registrar venta) calls one RPC,
`public.crm_confirm_sale(request jsonb)`, which in **one transaction**:

1. Creates the client (stable `CLI-000001` code) or links an existing one / the client already
   created from the source lead. A normalized-name or contact-email match blocks duplicates.
2. Adds contacts without duplicating e-mails (one primary per client).
3. Saves the sale (`AV-YYYY-NNNNN`) with totals **recomputed in SQL** (lines, discount, tax, recurring/month).
4. Saves each sold line → one work order per line (`unique(sale_line_id)`).
5. Routes each service to its department via the configurable catalog and creates the module
   project in `os_projects` with the new FK `os_projects.client_id`.
6. Applies the service's task template (dated from the line start date), assigned to the line
   assignee → service default → seller.
7. Moves the source lead to the `won` stage.
8. Notifies both owners (sale) and each assignee (work order).
9. Writes a correlated timeline (`crm_timeline.correlation_id`) plus row-level `crm_audit`.

**Idempotency:** the form carries a server-issued `idempotency_key`; an advisory lock + unique
constraint make a double click, a retry or a back-button resubmit return the original sale
(`replayed: true`). Any validation error rolls back everything; the app then records
`sale.failed` with the error code for diagnosis.

**Money:** `crm_sales.total` is *contracted*; `upfront_amount` is *agreed*; only rows in
`crm_payments` are *collected* (guarded against over-payment and currency mismatch).
`crm_sales_metrics()` reports the three separately per currency.

## Screens (all server-authorized with `requireOwner`; actions with `ownerForAction`)

| Route | Purpose |
|---|---|
| `/admin/workspace/crm/sales` | Contracted vs collected, recurring/month, open work orders, overdue tasks, paginated sales |
| `/admin/workspace/crm/sales/new` | Existing/new client, contacts, ≤6 services, terms, live non-authoritative preview |
| `/admin/workspace/crm/sales/[id]` | Lines → work orders → project links, status/assignee, contract status, payments, timeline |
| `/admin/workspace/crm/clients` · `/[id]` | Client 360°: sales, collected, projects by department, work orders, tasks, alerts, next steps, contacts, origin lead, meetings, history |
| `/admin/workspace/crm/tasks` | Persistent tasks (mine / assigned by me / overdue / all / closed), comments, history, optimistic concurrency |
| `/admin/workspace/crm/notifications` | Per-owner inbox, urgent vs normal, idempotent alert sweep (overdue tasks, missed follow-ups) |
| `/admin/workspace/crm/activity` | Read-only Activity Center: date, user, client, module, event, result, operation filters |

The five-tab CRM order **Lead Hunter → Leads Pipeline → Ventas → Calendario → Tareas** is unchanged;
operations views live in a secondary row.

## Data model (migration `20261102170000_avalon_sales_core.sql`, **prepared, not applied**)

New: `crm_departments`, `crm_service_catalog` (editable, audited, task templates validated by a
check), `crm_automation_rules` (on/off switches), `crm_clients`, `crm_contacts`, `crm_sales`,
`crm_sale_lines`, `crm_work_orders`, `crm_payments`, `crm_tasks`, `crm_task_comments`,
`crm_notifications`, `crm_timeline`. Altered: `os_projects` + nullable `client_id` FK.

Security: RLS on every table, owner-only (`crm_private.is_owner()`); sales/lines/work orders/
timeline/notifications have **no client INSERT grant**; column-level UPDATE grants; definer
functions are owner-checked, `search_path=''`, no dynamic SQL, revoked from `anon`; the timeline
cannot be inserted/updated/deleted by any API role; notifications readable only by their recipient.

Seeded configuration only: 6 departments, 6 catalog services **without prices** (no invented
numbers), 5 automation rules. No users, memberships or business data.

## Verification (local, 2026-11-02)

| Check | Result |
|---|---|
| `npm run lint` / `typecheck` / `build` | ✓ |
| `npm test` (unit + static security guards) | 99/99 ✓ |
| `npm run test:integration` / `bridge:test` | 1/1 ✓ · 13/13 ✓ |
| `tests/sales.database.cjs` (PGlite) — Nova Restaurant, rollback, lead/client linking, tasks/alerts/automation switches | 4/4 ✓ |
| `tests/sales.browser.cjs` — production `next start` + Playwright: auth on 6 routes, Nova form, **double click → 1 sale**, duplicate client blocked, Client 360, payment, Samuel's inbox + task update on 390 px (no horizontal scroll), Activity Center | 1/1 ✓ |
| `crm.database` / `unified.database` / `crm.integration` (+ CRM browser) | ✓ |
| Full migration chain on PostgreSQL 16 (`psql ON_ERROR_STOP`) + `os_modules_rls.test.sql` | ✓ |

CI: `.github/workflows/sales-core.yml` (PG16 chain + PGlite suites + browser E2E with screenshots);
`crm.yml` also runs `sales.database.cjs`.

`tests/support/rest-bridge.cjs` is a test-only PostgREST subset that executes every request as
`authenticated` with the caller's JWT subject, so the real RLS/grants/RPCs answer.

## Supabase ledger (read-only check, 2026-11-02)

Production `ltbwzcrxeuczdhhtbqgm` (PostgreSQL 17) ledger = `20261102053022`, `20261102053452`,
`20261102070500`, `20261102085430` — identical to the repo. `20261102170000` is new; no rename
duplicates. Preview branches exist for PR #12 and #19 only; PR #31 has none.

## Rollback

Not applied anywhere. If applied to a branch and it must be undone: drop the new tables in reverse
dependency order, `alter table os_projects drop column client_id`, drop the `crm_private` helpers
and the five public functions. Existing CRM/module tables are not modified otherwise.

## Benchmark → decisions taken (brief)

From public product capabilities: HubSpot/Salesforce (deal → line items → one company record),
GoHighLevel/Odoo (sale confirmation spawns projects/tasks from templates), ClickUp/Monday (owner
views: mine / assigned by me / overdue), AgencyAnalytics (contracted vs collected must not be
mixed), n8n (switchable, logged automations). Applied as: single confirm-sale transaction,
catalog-driven routing with templates, FK-only client hub, per-owner inbox, rule switches with
audit, and an append-only correlated timeline. No third-party UI, brand or code reused.

## Pending / requires owner decision

1. **Apply `20261102170000` to an isolated Supabase branch** (billable; needs approval), run
   `get_advisors`, then decide on production with backup.
2. Set catalog prices/default assignees per service (left empty on purpose).
3. Dashboard KPIs from `crm_sales_metrics()` (dashboard is Samuel-owned; coordinate via PR).
4. ~~Calendar of due dates; 13-stage pipeline (PR #20)~~ — done, see docs/AVALON_EXECUTION_STATUS.md
   (the RPC already picks the first `kind='won'` stage, so it is compatible).
5. Departmental module screens still read projects from `os_projects`; they now carry
   `client_id` and can show the client link (next increment).
