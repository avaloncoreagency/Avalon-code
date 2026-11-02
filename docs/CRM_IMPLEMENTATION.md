# Avalon CRM — implementation and verification

Date: 2026-11-01, America/New_York. Work branch: `feature/avalon-crm-foundation`. Review: PR #6, base `feature/sprint-01-miguel-google-auth`.

## Status by phase

| Phase | Implemented | Tested locally | Remote status / next step |
|---|---|---|---|
| 0 Audit | Reviewed every PR #6 file, existing Suite/auth/migrations; corrected demo pipeline sum | lint, typecheck, build, original 23 unit tests | Existing auth integration assertion is stale; coordinate with Miguel |
| 1 Leads | Create/read/edit/archive/restore; keyboard Kanban; paginated table/search/stage/owner/source/date filters; ordering; amounts, probability, priority, follow-up, loss reason, notes and audit | Domain tests, real PostgreSQL constraints/RLS, production HTTP CRUD/version conflict, browser creation/stage change/reload | Requires approved CRM migration |
| 2 Calendar | Monthly/weekly/daily views; internal events, lead association, owner, participant names, status/cancellation, timezone display, schedule conflict trigger | Offset/DST validation, PostgreSQL overlap/adjacency, HTTP persistence, browser section rendering | Google adapter disconnected; no OAuth/sync |
| 3 KPIs | Persisted authorized cohort counts, stage breakdown, conversion, open/won/average estimates, activity counts, overdue follow-ups, owner/source breakdowns and filters | Formula/empty-cohort tests; production HTTP -> PostgreSQL aggregate results | Requires approved CRM migration |
| 4 Hunter | Manual entries, strict CSV parsing/import, uniqueness, industry/location/opportunity filters, explainable completeness score, review/approval, atomic/idempotent conversion and provenance | CSV malformed/bounds/quotes tests; PostgreSQL approval/transaction tests; HTTP import -> approve -> convert | Search provider adapter disconnected; no scraping/outreach |
| 5 AI meters | Manual consumption snapshots, unit, billing period, limit, percent, updated time, source, configurable threshold, explicit No conectado | Domain/manual-source enforcement, PostgreSQL insert, HTTP save, browser rendering | No automatic data source authorized |

“Implemented/tested” means executable code verified in an isolated local environment. It does NOT mean activated in Supabase or production. Missing schema is an explicit unavailable state, never a silent demo fallback.

## Reproduce

Use Node 22.18.0 and the committed lockfiles:

```sh
npm ci
npm ci --prefix tests/qa
npm run lint
npm run typecheck
npm test
npm run build
NODE_PATH=./tests/qa/node_modules node --test tests/crm.database.cjs
# Linux: install browser first; macOS uses installed Chrome by default.
node tests/qa/node_modules/playwright/cli.js install --with-deps chromium
CRM_BROWSER=1 NODE_PATH=./tests/qa/node_modules node --test tests/crm.integration.cjs
```

`CHROME_PATH` may override the browser executable. Tests start localhost services with synthetic credentials, provision a disposable PostgreSQL WASM database and run the real production Next server. The HTTP bridge emulates the subset of PostgREST used by the app; it does not replace PostgreSQL constraints or RLS. It is not a real Supabase Auth/PostgREST deployment, and does not prove OAuth or Vercel Preview configuration. The database tests separately switch Postgres roles for owner, second owner, outsider and anonymous requests. Browser screenshots are written outside the repository to `../evidence`.

Added CRM-only CI runs the same checks without real account credentials. The unchanged `npm run test:integration` still stops at `tests/auth.integration.cjs:143`, expecting `/Espacio preparado/` on CRM. Proposed change for Miguel to review: select the expectation by slug, using `/Leads &amp; Pipeline|Leads & Pipeline/` for `crm`, keeping the other module assertions. No shared auth test has been modified.

## Persistence and authorization

New tables: `crm_stages`, `crm_leads`, `crm_activities`, `crm_events`, `crm_prospects`, `crm_usage`, `crm_audit`. Alert settings are stored with each usage snapshot (`threshold`, `limit_value`) rather than duplicated into a second configuration table.

The verified existing model is ONE agency. All existing owners share its CRM; admin/operator/nonmember/anonymous requests have no CRM access. `agency_key='avalon'` is a constrained scope marker, not a new membership system. This schema must not be used for multiple agencies until Miguel introduces a trusted tenant membership model and policies are migrated accordingly. No `none/view/edit/manage` permissions exist yet.

Every endpoint reuses `getAuthorizedMember` and the SSR cookie client. Pages retain Suite authorization. Mutation requests check the configured APP_ORIGIN, validate a strict field allowlist, cap request bodies, and use database RLS. No service key is used. `version` prevents lost updates through HTTP. Tables have no DELETE grant; archival/cancellation preserve history. Audit writes use a narrowly scoped private definer trigger with an explicit current-owner check; clients cannot write audit history. All other application functions use invoker permissions. Stage configuration is read-only to application users and can be extended through reviewed migrations.

The existing self-only membership/profile RLS does not expose an agency directory. Assignment uses an existing membership UUID, defaulting to the signed-in owner. A friendly shared member selector requires coordination with Miguel's directory/permission work; no shared read permissions were expanded here.

## Definitions and limits

- Currency: USD estimated commercial value only, never booked/received revenue.
- KPI cohort: non-archived leads by **creation** date (inclusive UTC dates), optional owner/source. Conversion = won / cohort leads. Open = sum in open stage kinds. Won = sum of won estimates. Average = sum of all cohort estimates / cohort size. Activities are those attached to cohort leads, not independently filtered by activity completion date. Overdue = open lead follow-up instant before now. Empty cohort returns zero.
- Lists/board/calendar are paginated at 50 rows; counts and page scope are explicit. Audit detail shows latest 100 changes; notes currently show the first 50 newest activities. KPI queries read batches of 500 with an explicit 50,000-row ceiling; exceeding it fails visibly rather than showing truncated totals. For larger datasets, replace scans with reviewed aggregate RPCs and cursor pagination.
- Calendar date/time inputs use the browser's displayed IANA zone and are stored as timestamptz. Display zone is selectable; use “Cargar periodo” after changing the date/view to fetch a bounded period. Cancelling events releases the time slot. Overlap check applies to the same owner or identical normalized participant names (comma separated); names are not verified identities, so spelling variations or owner-name vs participant-name aliases require human review. The database trigger serializes event writes. Multi-session race/load testing on native PostgreSQL is still recommended; PGlite is single-session.
- CSV: UTF-8/BOM, comma delimiter, escaped quotes, CRLF and quoted newlines; 200 rows / 500 KB. Required company/source/opportunity. Entire batch is one insert transaction; any duplicate rejects the whole batch. Email duplicate matching is case-insensitive; no-email records use normalized company+contact. No fuzzy phone matching or invented enrichment. Conversion runs under a row lock, requires approved state, creates one lead, and records its ID; repeat conversion is idempotent.
- Prospect score is **record completeness**, not predicted commercial fit: email 25, phone 15, industry 15, location 15, documented opportunity 30. Reasons are shown.
- Usage records are cumulative **manual snapshots** per provider/unit/period; edit a snapshot instead of adding multiple entries for the same period. No cross-unit sums. Missing/zero limit has no calculated utilization. Threshold alerts are on-screen only. No API tokens or subscription balances are stored.

## Integration capability review

Documentation consulted on 2026-11-01:

- OpenAI's [Analytics API](https://learn.chatgpt.com/docs/enterprise/analytics-api) describes workspace-scoped reporting and required access. Availability must be confirmed for the actual workspace; it is not a universal personal Codex credit-balance endpoint.
- Claude's [usage and cost documentation](https://platform.claude.com/docs/en/manage-claude/usage-cost-api) distinguishes Console admin credentials and Enterprise analytics access, and recommends the Analytics API for new integrations. Actual organization access has not been provisioned.
- Higgsfield's [credit documentation](https://higgsfield.ai/creator-hub/help-center/credits/how-credits-work) documents account balance and usage-history surfaces. This review did not establish an authorized programmatic balance endpoint for this account. Do not infer one from generation APIs.
- Supabase [RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) informed explicit grants, policies and invoker functions. Changelog was reviewed, including explicit Data API exposure changes; table privileges are explicitly granted in the draft migration.

`src/lib/crm/integrations.ts` defines separate calendar, prospect-search and usage-provider contracts. Disabled adapters report disconnected and throw on operations. They perform no network requests. Future implementations require separate credentials/test authorization and provider-specific contracts.

## Approval and release gates

1. Review `20261102085430_crm_core.sql` and obtain **explicit permission** before applying it to `thdgrczotqapnvcjefoi`. Read-only inspection confirmed this is the non-default testing branch; no remote migration was applied.
2. Verify Preview environment really targets that branch, APP_ORIGIN matches Preview, and no production credentials are present. Vercel's successful prior status alone does not verify those values. No deployment was requested or performed here.
3. Coordinate Miguel's stale auth integration assertion, directory selector and existing dependency advisories (npm ci reported 14 moderate advisories). Package versions and lockfile for the application are unchanged; no blanket audit fix.
4. Run a full Supabase staging smoke test and native PostgreSQL concurrency/load checks after approval. Real founder login, live Google OAuth, external calendar sync and external usage APIs are not claimed tested.
5. Keep PR draft until these release gates are resolved. No merge, real users, invitations, permissions, external messages or existing data were changed.
