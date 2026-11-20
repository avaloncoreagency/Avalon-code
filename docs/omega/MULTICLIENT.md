# Multiclient operating handoff · Refs #256

20 November 2026, America/New_York. Complements (does not replace) #254 MULTICLIENT_RUNBOOK and Claude's product delivery/pilot work. No new client/product/URL was registered.

## Existing relationships and boundaries

`crm_leads` is a commercial opportunity, `crm_clients` the canonical client, `crm_sales` a confirmed sale, `crm_work_orders` a delivery order and `os_projects.client_id` the canonical product/client link. One client can have many products; quotes, contracts, invoices and payments retain their existing foreign keys. Never duplicate a client to register a second website. A saved external URL is a reference, not an uploaded or deployed website. A draft may have no URL. The agency CRM is owner-operated (`agency_key=avalon`), not a customer-isolated SaaS. Miguel and Samuel's equal agency access must not be disguised as per-owner tenant isolation.

| Product field | Current source / acceptance |
|---|---|
| Client, type, name, project state | Existing canonical client ID, project module/name/status; choose existing client, no name-only match |
| URL and repository | Existing product reference metadata, HTTPS validation; absent until created |
| Hosting and domain | Current operations reference fields, not provider telemetry; no credentials |
| Responsible and delivery date | Existing operations metadata / work order; not inferred from login email |
| Support conditions | Contract/scope and existing product brief; future structured contract reference needs Claude's agreement |
| Versions/files | Project Bridge/Code Exchange existing authorized receipt and hash; URL alone is no backup |
| Incidents | Existing client_hud requests/history; Guardian proposes a structured request, not another CRM |

## Onboarding and exit

Discovery → exact client/opportunity review → reviewed quote/PDF → explicit accepted terms → authorized contract → confirmed sale (existing backend rules) → work order/project draft → product registration → synthetic QA → owner/client acceptance → authorized delivery → maintenance. A quote download never means sent/accepted. A won column never substitutes for a sale. Support creates a request linked to the exact client/product; private records remain inside Avalon. Exit requires owner-approved export of code, data and assets; verified restore, domain/resource transfer checklist and revocation plan, without deleting histories automatically.

## Capacity planning (not measured capacity or approved spend)

| Client count | Proposed boundary | Required gate |
|---|---|---|
| 1 pilot | Existing isolated test project; synthetic data first | Actual hosted owner sessions, restore, exact SHA and commercial hosting plan |
| 5 | Separate deployments/domains per product; client-owned or explicitly delegated resources | Inventory of owners, backups, usage and exit process per client |
| 20 | Separate high-risk databases; shared infrastructure only after proven tenant policy design | Load tests, egress/storage budgets, support/incident ownership |
| 50 | Reassess operations and support capacity; no promise existing quotas suffice | Measured concurrency, backup restore times and provider/contract review |

No accounts, projects, domains or tenants were provisioned. Do not give customers Avalon owner memberships. Per-client apps need their own authorization boundary and a reviewed data contract. Hosting need not depend on GitHub: existing direct Bridge/Code Exchange packages and authorized Vercel direct deployment remain valid paths; no second publisher.

## Plans, quotas and source dates

Connected organization details confirmed Supabase **Pro** on20Nov. Official pricing lists a $25/month starting plan, first project included, additional projects from$10/month; usage and add-ons vary. Included amounts published:8GB disk per project,100GB Storage and250GB egress; these do not establish Avalon's remaining capacity or invoice. Backup must include Storage separately: database restoration is not proof binaries are backed up. Costs, balances and remaining quotas: **no medido**. Source https://supabase.com/pricing (read20Nov2026).

Vercel list/get team returned identity but no plan/billing field, so effective commercial eligibility is **UNKNOWN**. Do not infer Pro from a team or READY deployment. Owner must confirm billing plan and commercial terms before client publication. Official Pro documentation lists a $20/month platform fee with one deploying seat, additional deploying seats$20; viewers have different rights. These are reference prices, not an approved subscription or bill. Source https://vercel.com/docs/plans/pro-plan and https://vercel.com/docs/plans/hobby (read20Nov2026). No upgrade or billing action taken.

## Chino Barber preflight (no website exists)

Owner-approved discovery: service menu, booking process, audience, service area, languages, hours, contact/consent requirements, existing brand assets and rights, photos/copy, desired outcome and approved support scope. Do not invent address, URL, prices, proof of clients or legal approval. Website brief: mobile navigation, accessible service sections, real booking/contact destination, clear submit/error feedback, consent and privacy review, SEO metadata and image budgets. CRM brief: authorized contacts, stages, follow-up owner, source, quote/contract and canonical product link; no fictional sale/payment.

Use an `.invalid` synthetic barber identity in the isolated environment. Test form validation, duplicate/replay handling, outsider denial, owner2 reads after fresh login, conflict without overwrite, mobile320/390 and desktop1440, ES/EN, public document privacy and rollback/restore. Record engine/device honestly; Safari/iPhone needs actual execution. Acceptance requires independent QA evidence, human sign-off, exact release SHA and authorized deployment; then a separate support runbook. Existing #254/Claude pilot checklists remain canonical for implementation details.

Next action: owners confirm Vercel plan/resource ownership and approve isolated hosted acceptance; Claude supplies current schema/deployment correspondence. Do not activate real-client pilot before those gates pass.

## Reconciliation checkpoint —20Nov2026

Claude merged #255 into main445143fe26f8b954422a458464385d1d562e13cb during this task. This branch merged that exact main without conflicts, preserving his recovery and48 local migration filenames matching the current ledger versions for the three newest records. Prior45-source-file notes above describe the initial5f99 checkpoint, not the current reconciled candidate. No Claude PR was merged by this task. New helpers remain additive; exact-head CI must approve after reconciliation.
