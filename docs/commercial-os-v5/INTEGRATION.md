# Commercial OS V5 — integration report and contract for Codex

2026-11-21 · Claude Code. Branch `claude/commercial-os-v5-20261121`. The exact SHA is in the PR.

**Base:** `main@ff8191d`, then these were merged in order:
1. #305 (`320a21e`);
2. #307 (`d5c5932`), which is stacked on #305;
3. #306 (`7a4cee4`).

All three merged with **no conflicts**. The branches of #306 and #307 were not edited. This is only an integration that has been prepared: there is **no merge to `main`, no deploy and no remote SQL**.

Statuses used: VERIFIED (by a local test, which is not independent QA) · IMPLEMENTED_NOT_VALIDATED · PROPOSED · BLOCKED · NOT_RUN.

## What was reused and what was added

| Phase | Result | Status |
|---|---|---|
| 1. Double scroll in the CRM | Root cause found. `#main > *` keeps `transform` filled by its entrance animation, so the `position:fixed` drawer was anchored to that ancestor instead of the viewport. `focus()` without `preventScroll` then scrolled the document (measured 2843 → 102 px). **Fix:** a portal to `<body>`, plus `lockPageScroll()` (restores the position and compensates the scrollbar). `scrollTop = 0` and `focus({preventScroll})` run only when the lead id changes. The opener is captured on the first render. Uses `dvh`, safe areas and contained overscroll. | VERIFIED: `tests/lead-drawer-scroll.browser.cjs` (desktop 1440 + mobile 390 **emulated**) |
| 2. #307 improvements | Integrated without being rebuilt: sticky header, 8 events per page, filters with counts, collapsible sections, a focus trap that skips hidden controls. The #307 test was updated to the new lock mechanism without losing coverage. Also removed: the "Otro campo" edit entry that every note generated, caused by `last_interaction_at`. The audit rows are kept. | VERIFIED |
| 3. Clients 360 → Lead | `createClientRecord` no longer falls back to creating a client without a lead; it fails closed with `schema_pending`. The RPC is already in production (`20261119143838`). Acceptance case "Chino Barber Demo": exactly one New lead, and zero sales, invoices, payments, contracts, commissions, conversions or projects. | VERIFIED (PGlite) |
| 4. Sale → opportunity | **Defect found:** `crm_confirm_sale` accepted the lead of another company and moved it to Won. Fixed in three layers: the server action (error `sale_lead_other_client`); a DB trigger in migration `20261121180000` (**review-only**); and the form, where an existing client shows only its canonical opportunity or a repair path. | VERIFIED (PGlite + typecheck). Form UI: IMPLEMENTED_NOT_VALIDATED in a browser |
| 5. Commissions owed to Avalon | Migration `20261121181000` (**review-only**). Lifecycle: `reported → client_paid_verified → attribution_verified → eligible → invoiced → paid`, plus `disputed` and `void`. Every step needs evidence and a version, and is appended to `crm_attribution_events`. The summary separates unverified, eligible, invoiced, paid and disputed amounts. `crm_commissions` (payouts made BY Avalon) is not touched. | VERIFIED (PGlite: $10,000 at 5% = $500.00) |
| 6. Quoting Studio | 18 service configurators and pure estimators for the AI Receptionist and the AI Chatbot. Without a verified rate the result is N/D. They apply the provider's billing increments and minimums, never double count, and give Low/Base/High scenarios. | VERIFIED (unit tests + quotes E2E) |
| 7. Invoices and contracts | **Existing protections verified:** a verified signed contract cannot be modified (`contract_guard`); PDFs are immutable, with a real sha256; users have no UPDATE/DELETE grants on invoices; voiding requires a reason. **Gap:** creating invoice drafts with PDF and corrective documents. | Draft invoices: PROPOSED (see below) |
| 8. Commercial requests | #306 integrated: the need is asked first, the text is compact, the full original text is kept, and the chatbot is offered as a proposal. | VERIFIED (#306 tests) |

## Contract for Codex (Sales and Requests UX, independent QA)

- **Base for your PR:** the head SHA of this PR. Do not edit `lead-timeline.*`, `src/lib/ui/page-scroll-lock.ts`, `src/lib/sales/attribution.ts`, `src/lib/quotes/*` or the new migrations without coordinating first.
- **Shared file, edited minimally:** `src/components/sales/sale-form.tsx` (the "Linked opportunity" block). Codex owns the rest of the UX. If you redesign the block, keep these three rules:
  1. with an existing client, send `lead_id` = its `ClientOption.lead.id` or nothing;
  2. never list leads of other companies;
  3. show the error `sale_lead_other_client`.
- **Data contract for a sale:**
  - `ClientOption = { id, label, lead: { id, label } | null }`; the page resolves it from `crm_clients.origin_lead_id`.
  - `leads` (new-client mode) contains only leads not owned by any company.
- **Errors:**
  - `sale_lead_other_client` (new);
  - `schema_pending` (a missing RPC or migration);
  - `conflict` (the attribution version changed);
  - `finance_denied`.
- **Commissions:**
  - Read `crm_attribution_summary(p_client)`. Keys: `unverified`, `eligible`, `invoiced`, `paid`, `pending` and `disputed`, each as a string per currency.
  - Change states only with `crm_attribution_advance(p_conversion, p_to, p_evidence, p_expected_version)`.
  - **Never** add `gross_collected` to Avalon revenue, and never mix this ledger with `crm_commissions`.
- **Invoices:** for now, only externally issued invoices are recorded (`issued`/`void`). Do not present a "draft invoice" or "send invoice" action until the proposal below is approved.
- **Independent QA:** please run:
  - `tests/lead-drawer-scroll.browser.cjs` (`CRM_BROWSER=1`);
  - `tests/client-opportunity-link.database.cjs`;
  - `tests/attribution-lifecycle.database.cjs`;
  - `tests/quote-estimators.test.cjs`;
  - `tests/quotes.browser.cjs` (`QUOTES_BROWSER=1`).

## Proposal (not implemented): invoice drafts
Additive table `crm_invoice_drafts` with these rules:
- **Editable:** draft only.
- **Issue:** `crm_invoice_issue(draft, version)` requires the finance capability. It creates the immutable `crm_invoices` row plus a PDF with sha256.
- **Corrections:** a corrective document references the original. Issued invoices are never edited or deleted.
- **Discarded drafts:** stay in the history marked `discarded`.

This needs owner decisions on numbering, legal fields per state and taxes. Owners: Miguel + Samuel (+ an accountant).

## Owner decisions and blockers
- Apply `20261121180000` and `20261121181000` to production, with a backup. **Deploy dependency:** the Results page uses `crm_attribution_advance`; without the migration it shows `schema_pending`.
- Revoke the old `crm_attribution_transition` once migration `20261121181000` is applied (it allows `reported → verified` without the intermediate steps).
- Verified prices and rates for the catalog and the estimators. Today everything shows N/D, by design.
- Draft invoices (above), Florida legal review (#286), physical iPhone Safari (**NOT_RUN**; only Chromium emulation).
