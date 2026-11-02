# Avalon Core Agency: company portfolios and product HUDs

## Implemented in this change
- All five service catalogues reuse ProjectsIndex: Website Designer, E-commerce Designer, CRM Creator, AI Receptionist and Marketing Hub.
- Searchable company cards, active/preparation counts, linked company names and explicit unlinked-project states.
- Company HUD at /admin/workspace/clients/[id]: CRM contact details, exact scoped project counts, 50-row pagination, service filters, product descriptions and shared company context notes using existing CRM activities.
- Product HUD at /admin/workspace/products/[id]: objectives, contracted scope, deliverables, target date, acceptance criteria, real saved-record metrics, manual checklist results, improvement requests, scoped audit trail, resource references and access to the existing specialized editor.
- Change-request states: requested -> approved -> in_progress -> review -> done; cancellation where appropriate. State changes are internal, not evidence an external AI ran.
- Authenticated Markdown work-brief export. Customer content is encoded as data, and the export does not start an agent or contain integration credentials.
- Dark responsive UI, per-service accent colours and checklists, Spanish/English copy, keyboard focus, reduced-motion support.

## Data and authorization
Existing CRM UUID references identify client groups. Names are never deduplication keys. Different CRM records are intentionally separate, even if their displayed company names match; a future canonical crm_clients migration needs explicit reconciliation.

No new tables, migrations, dependencies, paid resources, service-role keys, users, invitations or production settings are introduced. Product operations are stored in os_projects.settings.client_hud, preserving other module settings. Existing owner-only RLS and immutable audit triggers remain in force. All pages/actions/downloads recheck authorization. This remains an internal agency console, not a customer-facing multi-tenant portal.

Writes filter by project ID, module and optimistic version. Archived projects are read-only in the new operations actions. Authors/timestamps come from the authenticated server context, not the browser. Malformed saved state is not silently replaced. Payloads are capped below the existing settings JSON size constraint; 100 requests and 200 manual checks per product, with explicit rejection at capacity. Retain/export records before a future normalized-history migration; do not silently trim history.

Catalogue cards expose only the display fields required by the client-side filter, not full project settings. Catalogue statistics cover at most the existing 100 loaded projects and say so. Company counters are separate exact queries; company pagination is explicit. CRM selector lists up to 200 active records; existing settings still support UUID references.

## Verification performed locally
- 29 tests passed: grouping and reference separation, private-card payload minimization, input and link validation, malformed state, workflow transitions, immutable updates, dates, capacity, manual-result semantics, brief export and mocked server-action authorization/concurrency.
- Strict TypeScript check passed for the dependency-free domain module (local TypeScript 5.8.3).
- TypeScript syntax transpilation passed for all 9 changed/new TS/TSX files.

These are not full Next.js build, browser, live Supabase/RLS or real-owner login results. The working container cannot resolve github.com to clone/install the complete application. Baseline CI for a1a06cc already has auth-test failures; check the new commit's CI separately. Graphify was consulted for shared-component impact; its index was at main a3cd13d, not this branch.

## Deployment and limits
No deployment or production promotion is claimed by this change. Preview environment configuration was previously blocked and must be resolved through the approved controls, not bypassed.

External uptime, visits, collected sales, provider spend, automatic test execution, payment/order actions and automatic ChatGPT/Claude execution are NOT connected. The UI explicitly says so. Stored metrics, manual tests and requests are not represented as live provider telemetry. Existing tool editors remain the places where actual product content is edited.

Before release: full lint/typecheck/build, all regression suites, isolated database write/reload checks, mobile/desktop visual inspection, nonowner denial, concurrent edit conflict, wrong-project export denial, and a real owner session. Keep the last healthy deployment for rollback. Reverting this code must not delete saved settings or CRM notes.
