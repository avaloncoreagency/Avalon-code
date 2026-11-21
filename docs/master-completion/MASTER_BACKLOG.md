# Avalon Master Completion: master backlog and checkpoint

2026-11-21 · Claude Code (lead engineer). This is a checkpoint so another session can resume without starting over.

**Integration branch:** `claude/master-integration-20261121`. The exact SHA is in its PR. Base: `main@207ed3a`.

Statuses used: PROPOSED · IMPLEMENTED_IN_BRANCH · VERIFIED (local tests) · CI_VERIFIED · BLOCKED · NEEDS_OWNER_APPROVAL · NOT_RUN.

None of this is merged, deployed or applied to production. Tests written by Claude are **not** an independent audit.

## Sources actually read
- `AGENTS.md` and `docs/dev-bridge/COOPERATION.md`.
- PRs: #294, #298, #297, #293, #290, #282, #281, #280, #279, #278, #276, #268, #265 and #295.
- `docs/product-studio/BACKLOG.md`, `docs/client-operations/*`, `docs/knowledge/*`, `docs/sales-marketing/*`, `docs/final-validation-2/*`.
- ChatGPT conversations are **not accessible**. Any requirement that exists only there is **UNKNOWN**; none were invented.

## Integration (Phase C)

All of these merged into the integration branch **with no conflicts**:
- **#294** (includes #288, #289, #278, #284 and #297);
- **#298** QA tests;
- **#265** Cloud & Security audit;
- **#293** Orchestrator (planning only);
- documentation PRs **#268, #276, #279, #280, #281, #282, #290**.

Left out on purpose:
| PR | Reason |
|---|---|
| #295 (Codex harness) | Its workflow pins outdated SHAs and fails by design until Codex updates the pins |
| #296 / #233 | Samuel's staff portal |
| #261 / #267 / #287 | Guardian (suspended) |
| #260 / #277 | Superseded by #293 |

## Backlog by department

| ID | Department | Task | Status | Evidence / blocker |
|---|---|---|---|---|
| BS-01 | Business Strategy | BS-001 governance, catalog and plan for the first 10 clients | IMPLEMENTED_IN_BRANCH (document, #280) | Prices, margins and commissions: **NEEDS_OWNER_APPROVAL**. The only price source is `crm_service_catalog` (no prices approved) |
| BS-02 | Business Strategy | Quoting Studio connected to the catalog without a second source of truth | VERIFIED (existing) | `quotes.database`, `quotes.browser` |
| SM-01 | Sales & Marketing | Bilingual playbook + execution checklist | IMPLEMENTED_IN_BRANCH (document, #279) | Vertical, territory and permission to contact: owners |
| SM-02 | Sales & Marketing | Public inquiry: anti-spam, duplicates, suspicious messages kept but not converted | CI_VERIFIED (#288/#289) | `inquiry-history`, `fv2-intake-matrix`, `fv2-commercial-chain` |
| SM-03 | Sales & Marketing | Ads and real campaigns | BLOCKED by design | Not activated ($0 budget, no authorization) |
| CO-01 | Client Operations | SOP, checklists and gates G0–G7 | IMPLEMENTED_IN_BRANCH (document, #281) | Signatures, SLA and owners: PENDING |
| CO-02 | Client Operations | Chain lead → quote → contract → sale → client → project → delivery | VERIFIED locally | `fv2-commercial-chain`, `backbone-e2e`, `product-delivery`. Mapping in `docs/operations/ONBOARDING_CHAIN_20261120.md` |
| CO-03 | Client Operations | Synthetic Chino Barber pilot | VERIFIED (synthetic) | `sales.browser` (Kanban case). Real pilot **BLOCKED** (no contract, URL or approved price) |
| PS-01 | Product Studio | APS v1: inventory, components, quality | IMPLEMENTED_IN_BRANCH (document, #282) | APS-N02..N08 need a Preview and a real iPhone |
| PS-02 | Product Studio | Draft product without a website, delivery states with evidence | VERIFIED (existing) | `product-delivery.*`, `crm-client-product-links` |
| CRM-01 | CRM | Kanban v2: drag with mouse, touch and keyboard; two-line cards; Won/Lost rules | CI_VERIFIED (#297) | `sales.browser` (desktop + 390 px emulated touch). Physical iPhone: **NOT_RUN** |
| CRM-02 | CRM | Clients 360 shows the group and stage of the origin opportunity | CI_VERIFIED (#297) | — |
| CRM-03 | CRM | Sales: idempotent, contract-gated, one client | VERIFIED (existing + `fv2-commercial-chain`) | — |
| FIN-01 | Finance | Recorded balance vs profit/MRR labels (#284); "—"/"No data source" when the source is missing | CI_VERIFIED | `finance-kpi-labels`, `client-finance` |
| FIN-02 | Finance | Finance permission separate from being an owner | VERIFIED | `fv2-commercial-chain` (`finance_forbidden` for an owner without access) |
| FIN-03 | Finance | 12-month rolling budget and explicit scenarios | PROPOSED | No approved figures exist; implementing it without data would produce invented numbers. **NEEDS_OWNER_APPROVAL** |
| LEG-01 | Legal | Contract PDF: text safety, glyphs (#278) | CI_VERIFIED | `client-contracts-pdf` |
| LEG-02 | Legal | Explicit **support/maintenance** and **warranty period** fields in Exhibit A; when empty, the PDF says they are not included (never invented) | IMPLEMENTED_IN_BRANCH (this branch) | `client-contracts-pdf.test` |
| LEG-03 | Legal | Florida legal review of the template (#286) | **NEEDS_OWNER_APPROVAL / legal review** | — |
| SEC-01 | Cloud & Security | DEFINER audit (#265) | VERIFIED | `scripts/security/definer-audit.cjs`: 52 functions, 0 ungated |
| SEC-02 | Cloud & Security | Close the anonymous `crm_public_inquiry` / `crm_growth_funnel_submit` path | IMPLEMENTED_IN_BRANCH (review SQL) | `intake-role`, `fv2-intake-matrix`. Remote application: **NEEDS_OWNER_APPROVAL** + backup |
| SEC-03 | Cloud & Security | Capacity / isolation for 1/5/10/20/25/50 clients | VERIFIED (PGlite) | `fv2-capacity`. Not hosted Supabase |
| SEC-04 | Cloud & Security | Isolated Preview | **BLOCKED** | Preview limit taken by stale previews #205/#19. Freeing them needs owner approval |
| ORC-01 | AI Orchestrator | Planning only, no executors, kill switch, idempotent | VERIFIED read-only (#293, 17/17) | No real agents connected; REN/SHIN/HARU/SORA/KENJI do not execute anything |
| KN-01 | Knowledge | Index, catalog, glossary, decision register, templates (#268) | IMPLEMENTED_IN_BRANCH (documents) | Status per decision: PROPOSED until owners approve |
| QA-01 | QA | Acceptance matrix (#276) + Final Validation 2.0 (#298) | IMPLEMENTED_IN_BRANCH | Independent QA: **pending Codex** (no credits) |
| WEB-01 | Public website (Ultimate) | Integrated and stable | No reproducible defect found in this session | Visual acceptance on a physical iPhone: **NOT_RUN** |

## Owner decisions (not replaced by any automation)
- **Joint (Miguel + Samuel):**
  - merge the integration branch;
  - approve prices and the catalog;
  - consent version;
  - global limit of 30 inquiries per hour;
  - free the stale Supabase previews;
  - apply migration `20261120160000` and `public-intake-role-review.sql` with a verified backup.
- **Legal (Florida):** contract template (#286) and the support and warranty terms.
- **Infrastructure:** Turnstile keys, `AVALON_INTAKE_TOKEN`, isolated Preview.
- **Samuel:** staff portal (#296) stays outside this integration.

## Resume procedure
1. `git checkout claude/master-integration-20261121`.
2. Run the checks:
   - `npm test`
   - `NODE_PATH=tests/qa/node_modules node --test --test-concurrency=1 tests/*.database.cjs tests/operations/*.database.cjs`
   - `npm run build`
3. Run the browser suites with their flags: `SALES_BROWSER=1 CRM_BROWSER=1 QUOTES_BROWSER=1 CRM_INTEL_BROWSER=1`. **Without these flags the browser tests return immediately and "pass" without running.**
4. Independent review: Codex updates `docs/final-validation/source-pins.json` in #295 to this branch's SHA and runs `node tests/final-validation/intake-boundary.cjs .`.
