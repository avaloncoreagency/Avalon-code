# Avalon OS STABLE V1 — final departmental integration

2026-11-22 · Claude Code (integrator). Candidate: **PR #321**, branch `claude/stable-v1-20261122`; the exact SHA is in the PR. This file complements [`RELEASE_CANDIDATE.md`](RELEASE_CANDIDATE.md), which covers lineage, migrations, advisors and rollback.

**Statuses:** INTEGRATED AND VERIFIED · IMPLEMENTED IN BRANCH · PENDING INTEGRATION · PENDING VALIDATION · CONFIRMED DEFECT · BLOCKED BY APPROVAL · DUPLICATE OR SUPERSEDED · PAUSED · UNKNOWN / NO HANDOFF AVAILABLE.

"VERIFIED" means a local test or exact-SHA CI run by Claude. It is **not** independent QA: Codex has no credits, so that review is PENDING. STABLE V1 **is not authorization for production.**

## A. Integration report

| Department | Original work | Previous status | Change incorporated now | Evidence | Final status |
|---|---|---|---|---|---|
| Knowledge & Innovation | #268 (in `main`), #318, #319 | #318/#319 open; both modified `README.md` and `SOURCE_CATALOG.md` | Merged #318, then #319. The 5 conflicting blocks in `SOURCE_CATALOG.md` were resolved by **keeping both** the #318 lineage (historical cutoff, #300 merge) and the #319 cautions (no remote certification, KN-V3-01 link). `docs/pm-v3/knowledge/evidence-and-decisions.md` added. Relative links checked (0 broken) | Merge commits in #321; link check | INTEGRATED AND VERIFIED (documentation) |
| Sales & Marketing | #279 (in `main`), #320 | #320 open | Merged with no conflicts. Keeps: the 1–5 scale separate from Hunter 0–100, the ES/EN scripts, roofing/fencing discovery, consent and opt-out, CRM handoff. **WP-01 explicitly NOT SELLABLE** | `docs/sales-marketing/AVALON_SALES_001.md` lines 10 and 27 | INTEGRATED AND VERIFIED (documentation); campaigns PAUSED |
| Business Strategy | #280 (in `main`), Issue #273 | BS-005, BS-006, AVL-101 reported as updated | None. Those documents **are not in the repository** and were not reconstructed. Offer matrix: section B | `grep` with no results | UNKNOWN / NO HANDOFF AVAILABLE (BS-005/006/AVL-101) |
| Finance & KPIs | #284 (in `main`), Core Engine, FIN-002 | Wording audit pending | **Confirmed defect fixed:** the client ledger (`core-panels.tsx`) called "Beneficio / Profit" a figure built from unverified collections. It now reads "Recorded balance (not net profit)", with the same FIN-01 wording as Clients 360. No formula or ledger change. FIN-004/006/011 are not in the repository | `tests/finance-kpi-labels.test.cjs` (new test) | INTEGRATED AND VERIFIED; FIN-004/006/011 NO HANDOFF |
| Finance (old) | #225 (credit recovery) | Old and conflicting | Not merged. The only things it uniquely adds are an older AI credit center (with an unapplied migration and Higgsfield usage) and old landing components. Superseded by the CC360-K credit center; it would be a new feature during the freeze | Diff: 398 files, −17k lines | DUPLICATE OR SUPERSEDED |
| Client Operations | #281 (in `main`): SOP, gates G0–G7 | V2.3 kit and the "26 transitions / 11 negatives" case reported only in a Space | No change. The real flow (inquiry → lead → client → quote → contract → sale → project → delivery) is covered by executable tests: `fv2-commercial-chain`, `backbone-e2e`, `product-delivery`, `sales.browser`. **The "26/11" case is not asserted** because it has no evidence in the repository | Tests listed in section C | IMPLEMENTED IN BRANCH (code); V2.3 NO HANDOFF |
| Product Studio | #282 (in `main`): APS v1 | Checking modules against the standard | Fixes for keyboard, touch targets and EN/ES (see Frontend). No new platform | Section C | PENDING VALIDATION (physical iPhone) |
| Frontend / Ultimate | FE-STABLE-07/08 reported | Not verified | **Reproduced and fixed.** FE-07: CRM drawer and Office tabs had no arrow keys, no roving tabindex and no `tabpanel` link. FE-08: the custom radios in the public demos (shop, industry, calendar, tree) were all in the Tab order with inert arrows. Now they follow the WAI-ARIA APG pattern. Native radios were already correct. No 3D work, no Higgsfield, #226 not reopened | `tests/a11y-roving.test.cjs`; keyboard check in `lead-drawer-scroll.browser` | INTEGRATED AND VERIFIED |
| Legal & Compliance | #278 (in `main`), Issue #286 | Legal review pending | Term matrix (section D). **Finding for the attorney:** the SOW field `warrantyPeriod` does not override clause 09 (30 days) because clause 01 requires the SOW to *name* the clause it overrides. A value such as "90 days" could therefore mislead. The legal text was not changed | `src/lib/contracts/master.json` (`ATTORNEY_REVIEW_REQUIRED`) | BLOCKED BY APPROVAL (Florida attorney) |
| Cloud Security | #265 (in `main`), #302/#312 | Advisors 6 `anon` / 51 `authenticated` | Classification and gates (section E). Definer audit 0 ungated; PGlite RLS and finance tests | `RELEASE_CANDIDATE.md` §5 | PENDING VALIDATION (remote) |
| Quality Assurance | #276 (in `main`), earlier Codex evidence | PASS results on old SHAs | Acceptance matrix moved to the final SHA (section C). Old PASS results are not carried over | Section C | PENDING VALIDATION (Codex) |
| AI Orchestrator | #293 (in `main`) | Planning only | Checked: no executors; kill switch in effect; actions fail closed (`ai-engine`, `manager` and `orchestrator` tests in the suite). No agents or engines added | Unit + PGlite suites | INTEGRATED AND VERIFIED |
| Guardian 24/7 | #261, #267, #287 | Paused | Not merged and not activated | — | PAUSED |
| Staff portal (Samuel) | #317 (#296/#233 old) | Out of scope | Compatibility check only: **no shared files** with #321. Note for Samuel: its migration `20261117180500_staff_private_portal.sql` is dated **earlier** than migrations already in production, so it will be applied out of order. That needs his own review | `comm` of the diffs | Samuel's responsibility (not modified) |
| Project Manager | #303, #304 | Canonical backlog | This file + `RELEASE_CANDIDATE.md` as the handoff; a comment on #303/#304 links them. No third backlog was created | — | Delivered |

## B. Main offers (Business Strategy) — no invented prices

| Offer | Available in the product | Inclusions / exclusions | Costs and margin | Delivery | Missing approvals | Status |
|---|---|---|---|---|---|---|
| Website (`desarrollo-web`; WP-01 candidate) | Website Designer, quotes with the "website" configurator, contract, delivery with evidence | According to the configurator and the SOW. Domain, third-party hosting and licences excluded | Prices N/D (catalog without approved prices). Margin: PROPOSED, no data | Product Delivery, gates G0–G7 | Price, margin, contract (#286), QA on iPhone, capacity | **NOT SELLABLE** |
| E-commerce (`tienda-online`) | E-commerce Designer, "ecommerce" configurator | Platform, apps and gateways are paid by the client | N/D | Product Delivery | Same as above, plus taxes and payments | **NOT SELLABLE** |
| Custom CRM (`crm-personalizado`) | CRM Creator, "crm" configurator | Third-party licences and source-data cleanup excluded | N/D | Product Delivery | Same as above, plus data migration | **NOT SELLABLE** |

## C. QA matrix (final SHA)

| Test | Command / procedure | Environment | Result | Owner / next step |
|---|---|---|---|---|
| Types / Lint / Unit / Build | `npx tsc --noEmit`, `npx eslint .`, `npm test`, `npm run build` | Local | See the evidence comment on #321 | Codex: rerun |
| SQL / RLS / ACL | `NODE_PATH=tests/qa/node_modules node --test --test-concurrency=1 tests/*.database.cjs tests/operations/*.database.cjs`; `node scripts/security/definer-audit.cjs` | Local PGlite | Idem | Codex |
| Case 1, clients | `tests/client-opportunity-link.database.cjs` (Chino Barber Demo: 1 New lead, 0 sales) | PGlite | Idem | — |
| Case 2, isolation A/B | Same test: `sale_lead_other_client` | PGlite | Idem | — |
| Case 3, commissions | `tests/attribution-lifecycle.*`, `tests/crm-attribution.database.cjs` (states, stale version, legacy RPC denied, `paid` only after `invoiced`) | PGlite | Idem | — |
| Case 4, inquiries | `sales.browser` → `inbound-ui` (original text kept, review without duplicates) | Local browser | Idem | — |
| Case 5, UI | `lead-drawer-scroll.browser` (A–E, wheel/touch, Escape/X, tabs by keyboard, Kanban afterwards) | Local browser, 1440 + 390 emulated | Idem | Physical iPhone: PENDING |
| Case 6, quotes | `quotes.browser`, `quote-estimators.test` (configurators, chatbot, N/D, contract) | Local | Idem | — |
| Case 7, security | `security.test`, `fv2-*`, `crm-attribution` (owner / non-owner / no finance access) | Local | Idem | Remote: PENDING (preview limit reached) |
| Case 8, mobile | `quick-improvements/mobile.browser`, drawer 390 | Emulated Chromium | Idem | **Physical Safari: PENDING** |
| GitHub CI | Checks on #321 | GitHub | See the PR | — |
| Hosted preview | Vercel: "Ignored"; Supabase: preview limit reached | — | **BLOCKED** (freeing a preview branch needs owner approval) | Owners |
| Independent QA | Codex on the final SHA | — | **PENDING** (no credits) | Codex |

## D. Contract terms (template `ACA-MSA-1.1-2026-11`, Florida)

| Term | Where | Status |
|---|---|---|
| Contracting party and signing authority | Clause 01/02; `agencyName`/`agencyLegalForm`/`client*` | PROPOSED (attorney) |
| Scope of work, deliverables, exclusions, milestones | Clause 01/03/04; SOW fields | PROPOSED |
| Fees, deposits, ad spend, taxes | Clause 05; `setupFee`/`monthlyFee`/`paymentSchedule`/`adSpend` | PROPOSED; amounts N/D |
| Late payment and cancellation | Clause 06/07 | PROPOSED |
| Warranty | Clause 09 (30 days) + `warrantyPeriod` | PROPOSED; **finding**: precedence between the two (see section A) |
| Maintenance | `supportMaintenance` (excluded by default) | PROPOSED |
| Liability, indemnity, force majeure | Clause 19/20/21 | PROPOSED |
| Privacy and confidentiality | Clause 16/17 | PROPOSED |
| Intellectual property | Clause 14/15 | PROPOSED |
| Commissions and attribution | Clause 12 + approved terms + verified signed contract (DB) | PROPOSED; the technical gate is VERIFIED |
| Versioning and PDF integrity | `templateVersion`, PDF sha256, signed contracts immutable | VERIFIED (technical) |
| Legal validity | — | **BLOCKED**: Florida attorney review (#286) |

## E. Security gates

| Gate | Status | Dependency |
|---|---|---|
| MIG-01: migrations `180000` → `181000` → `182000` | Full chain tested on PGlite; real Postgres validated for #311 (two migrations). Coordinated with the deploy | BLOCKED: backup plus a maintenance window approved by owners |
| INTAKE-01: anonymous intake (`crm_public_inquiry`, funnel) | Authorized exception, validated with honeypot, limits and Turnstile in the app | BLOCKED: decision on `AVALON_INTAKE_TOKEN` |
| FIN-01: finance and wording | Finance-capability RLS verified; wording fixed | Integrated |
| RLS-01: owner / non-owner / finance access | PGlite tests and definer audit (0 ungated) | Remote validation PENDING |
| RELEASE-01: release | — | BLOCKED: approval to merge, the window and Codex QA |

## F. Summary for the Project Manager (#303/#304)
1. **Already done:** #268, #276, #278–#284, #293, #300 (`main@ff8191d`).
2. **Integrated now:** V5 (#311/#314/#316 via #321), #318, #319 and #320.
3. **Improved:** reconciled Knowledge sources; keyboard accessibility in tabs and radios; FIN-01 wording.
4. **Fixed:** root cause of the recurring CI failure (stale version on Approve); FE-STABLE-07; FE-STABLE-08; misleading "profit" label.
5. **Do not merge:** #225, #226, #261/#267/#287, #296/#233, #305–#316 (already contained in #321).
6. **Still to test:** Codex on the final SHA; physical iPhone Safari; hosted preview; production migrations.
7. **Remaining blockers:** legal review (#286); prices and margins; draft invoices; `AVALON_INTAKE_TOKEN`; maintenance window; freeing the Supabase preview branch.
8. **For Codex:** checklist §7 of `RELEASE_CANDIDATE.md` plus section C of this file.
9. **Samuel only:** #317 (out-of-order migration timestamp), real invitation, login and MFA, backup restore.
10. **Miguel + Samuel decide:** merge #321; approve the window; prices; attorney; intake token; signups; `pg_net`.
11. **Conditions for GO:** exact-SHA CI green, Codex QA, physical iPhone, approved backup and window, legal review for any real contract, approved prices. **Current status: NO-GO for production; READY FOR OWNER REVIEW.**
