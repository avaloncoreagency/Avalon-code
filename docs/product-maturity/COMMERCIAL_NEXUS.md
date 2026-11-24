# AVALON-CRM-NEXUS-001

Base: main `f5f10a2c45b3f8487d3f1cf82adc86941d6ec2e6`. Canonical work: #337, coordination #304. This is an incremental consolidation, **PARTIAL**, not deployment or human commercial acceptance. #330 is already merged; its engine, Auth, staff, permissions, SQL and finance remain Claude's area.

## Operator route
Open the existing opportunity profile `/admin/workspace/crm/lead/{UUID}` (from its Pipeline record). **Camino comercial / Commercial journey** shows evidence without writing state. Its recommendation opens the existing contact form, discovery, quotes, contract, quote closing or recorded sale. Multiple accepted quotes require explicit selection; latest updated is not presumed commercially authoritative. Client 360 links by `origin_lead_id`, never by company name. It remains the existing entry to projects, tasks and collections. The Kanban/drawer, profile identity, search/filter/context and versioned mutations are unchanged.

The section loads exact counts separately from its bounded previews (10 quotes/sales). Accepted quotes are queried independently, so one outside the first page is not silently discarded. Deleted quotes are excluded; if the soft-delete column/provider is unavailable, show partial information, not an empty result. Existing contract evidence is reused. The recommendation is **advice**, not permission to close: Sales Center still verifies acceptance, versions, signature and idempotency. No sale, client, payment or stage is created by rendering/navigating.

Errors remain partial/unknown. A saved `next_action` is reported, not inferred. No percentage of commercial completion is stored. A verified contract does not prove a sale; a recorded sale does not prove collection. No money is aggregated by this section.

## Stage map (existing five groups; no transition policy changes)
| Group | Internal stages | Advice, not mandatory transition |
|---|---|---|
| New | new, researched | Record available identity/contact; retain origin in existing profile |
| New | contact-pending | Schedule follow-up in existing editor |
| Conversation | contacted, replied | Record contact/needs in the existing form |
| Conversation | qualified, meeting, diagnosed | Complete existing discovery; calendar/activity stay independent evidence |
| Conversation | nurture | Schedule long-term follow-up, not loss |
| Proposal | proposal, negotiation | Review linked quotes and revisions; select accepted evidence explicitly |
| Won | won | Without sale, inspect discovery/quotes/contract; with sale, open that sale. Rendering never closes another sale |
| Lost | lost | Review history/reason and use existing explicit recovery; never recommend another commercial follow-up |

Quote/sale evidence takes precedence over ordinary stage advice; losses and unavailable data remain explicit. Custom stages retain their existing identity and closed kind. No stage is automatically moved, no won gate is replaced.

## Reproductions and fixes
1. Calendar baseline includes `lost`/`won` follow-ups: actual page rendered with a synthetic query adapter reproduced it. Fixed standard stage filters before limit, plus canonical closed stage IDs (including custom stages) excluded before query limit. A defensive presentation filter remains. Existing tasks/orders/events are not removed.
2. Calendar baseline omitted the leads query from its error state. Actual page with synthetic denied leads reproduced the missing warning. Fixed partial warning for tasks/orders/leads/stage lookup; stage lookup failure does not invent active follow-ups. Exact counts expose capped operational lists instead of implying a full total. Calendar still has bounded results; this is **not full calendar pagination**.
3. **Claude handoff / BLOCKED:** `sales/new/page.tsx` caps quotes at 200, sales quote IDs at 1000, then applies search and slices to 50 in memory. `nexus-journey.test.cjs` evaluates the actual `toClose` expression with 199/200/201 synthetic candidates: the target becomes unfindable only beyond 200. Backend/list query should filter before pagination and use canonical sale exclusion, not larger arbitrary limits. Also review deleted quotes in that candidate query. No finance file or SQL was modified. Existing close RPC remains authoritative against duplicates.

## Acceptance evidence and remaining work
| Cases | Evidence / status |
|---|---|
| Lead/diagnosis/contact/quote recommendation, multiple accepted quotes, verified contract without sale, recorded sale, loss, partial query | VERIFIED presentation fixtures, actual React server component; no hosted data |
| Active vs standard/custom closed follow-ups, partial lead-query failure, owner guard invocation | VERIFIED actual calendar page with synthetic query adapter; baseline control via `NEXUS_BASELINE_SOURCE` |
| Accepted terms, fixed/subscription/variable closure, contracts, idempotent closing, financial access | Existing `sales-center.database.cjs`: five tests PASS in disposable PGlite with repository migrations; not newly implemented here |
| Synthetic website + CRM, 33%, biweekly, $1,000 base → $330 due, no payment | Existing SQL acceptance PASS; no real quote read or changed |
| 320/375/390/430/768/1440, ES/EN, links/details/overflow | VERIFIED isolated rendered component in Chromium; screenshots from actual component, **not hosted Preview or physical Safari** |
| Capacity 199/200/201 Sales Center search | REPRODUCED defect, NOT fixed; handed to Claude |
| Inquiry→lead mutation, lost recovery mutation, custom-stage history, quote revisions, version conflicts, client uniqueness, project/task persistence | Existing suites reused where run; full mission-wide E2E matrix remains PARTIAL until candidate evidence is consolidated |
| KPI reconciliation, finance counters/payment filters, calendar complete pagination | NOT implemented by this increment; requires scoped follow-up/Claude coordination |
| Preview, actual owners, physical Safari | NOT_RUN; no production credentials or account manipulation |

Commands: `npm ci`; `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`; `npm run test:integration` **after build**; `NODE_PATH=./tests/qa/node_modules node --test tests/sales-center.database.cjs`; `NODE_PATH=./tests/qa/node_modules NEXUS_BROWSER=1 node --test tests/nexus-journey.test.cjs`. QA dependencies: existing `npm ci --prefix tests/qa`; install existing Playwright Chromium as needed. Set `NEXUS_EVIDENCE_DIR` outside Git for local screenshots. The new path-scoped CI uploads synthetic component screenshots for three days and uses a read-only GitHub token, no external service credentials. An initial auth run before build completion failed to start Next; rerun only after build, do not call it an Auth defect.

## Productization boundaries
Reusable core: canonical leads/stages, discovery, quotes/revisions, activities/calendar, client/project/task IDs and a read-only advice function. Keep authorization and query dependencies injected; tenant/staff authorization is **not** generalized here. Configurable future surfaces: stage labels, recommendation copy, service catalog, locale, permitted actions. Avalon-specific: owner identities, Dev/Creative Bridges, manager tools, credit center, Product Studio. No new tenant infrastructure, repositories, extracted customer data or broad refactor.

## Integration / rollback
One draft PR from `codex/commercial-nexus-001`; review only. No merge/deploy/migrations. Review the read-only queries and presentation with Claude; do not replace #330 or cherry-pick old integrated PRs. Rollback: revert this increment; there is no database change or data migration. **Next action:** Claude fixes the reproduced Sales Center candidate query within his reservation; then re-run exact-SHA closing/navigation acceptance and finish KPI/calendar capacity audit before declaring the entire mission READY_FOR_REVIEW.

## Executed local checkpoint
- `npm ci`, lint (three pre-existing warnings), typecheck and final production build: PASS. No production deployment implied.
- Five Sales Center PostgreSQL cases PASS, including exact 33% acceptance and no fabricated payment.
- Real Next HTTP Auth integration PASS after build (synthetic provider/UUIDs, password errors/throttling, cookies, MFA/owner/session controls).
- Existing Sales Center browser PASS on built Next + synthetic Auth/PostgREST/PGlite: accepted variable quote → close → settlement → payment → Client 360 with responsive checks. This fixture deliberately records a synthetic payment; the separate 33% SQL case verifies that a settlement alone creates none. Neither touches hosted data.
- Own component + actual calendar page: six tests PASS with `NEXUS_BROWSER=1`, 12 ES/EN viewport cases and synthetic screenshots. Baseline control reproduces both original calendar defects from the pinned main source.
- Full unit and additional SQL regression results must be read from the final PR evidence rather than inferred from this document.

Additional audit handoff (not modified): dashboard `crmLeads` currently counts every nonarchived lead but labels them active, including closed stages; project preview loads up to 500. Sales payment filter reads up to 500 sale IDs before paging. Keep finance access and currency grouping intact when addressing these; no arbitrary limit increases. These findings are code-audit evidence, not a hosted data reconciliation. Full KPI correctness remains PARTIAL.
