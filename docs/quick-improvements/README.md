# CRM quick improvements — Refs #292

20 November2026. Own branch `codex/crm-quick-improvements-20261120`, based on verified main `207ed3a3dc8fdae5dd949a7361733e441c530519`. Local review only; publication requires the user's approval.

## Reviewed

Real Chromium with synthetic owner/Auth/PostgREST transport and disposable PGlite running existing migrations. Five areas at320px and390px: Dashboard, Leads Pipeline, Clients360, commercial inquiries and a client-linked website product. Ten full-page screenshots, per-screen overflow/target measurements and browser exception collection.

Current Claude Kanban V2 is #297@66a3b537add94babf36b1e0eeac82282c2637fb5; it appeared after the preceding baseline audit. It is not modified or claimed independently accepted by this quick-improvement task. Inbound work #288/#289/#294 and Samuel's #233/#296 are also reserved. Source is main, not a combined candidate.

The live changed-file lists of relevant open UI/integration PRs were inspected (#297,#296,#294,#288,#289,#236,#233,#245,#225,#205,#141,#151,#103,#158, plus historical dependency/overlap checks). The two edited client-overview files have no overlap with the checked active integration PRs. Dashboard/suite, pipeline, inbound, client-page/actions and backend changes are left to their existing integrators.

## Reproduced and corrected

1. Mobile client hero actions measured39px high; section shortcuts measured38px (15 controls in the fixture). At widths<=600px they now have minimum44px touch areas. Product shortcuts and the additional-options disclosure also have minimum44px touch areas. No desktop sizing, links, form submission or business logic changed.
2. The Spanish client overview showed the English label "Overview". It now reads "Resumen" in Spanish and retains "Overview" in English. Both are verified in the actual browser.

Only six CSS lines and one label are changed in production source. No permissions, migrations, financial/contract logic, accounts, employee portal, paused functionality or external service is changed.

## Executed checks

- Existing focused navigation/client/product tests: **49/49 PASS** (`crm-client-product-links`, `client-hud`, `navigation`, `product-client-identity-recovery`).
- Baseline five-area browser smoke: **1/1 PASS**, documenting the38/39px controls before the fix. An initial test selector mismatch was corrected in the synthetic harness; it was not an application defect.
- Final five-area browser smoke: **1/1 PASS**. All26 measured client/product controls have44px height. ES/EN labels pass.
- All five areas returned200 at both viewport widths; zero document-level horizontal overflow in the fixture; no browser page exceptions. Client overview fragment targets all exist.
- Client list search and inquiry no-match filtering pass. Canonical client→product link exists. Lead contact is retained. Replayed identical inquiry produces one prospect; repeated reads/filters create no extra client or lead. This does not claim idempotency of every product/client creation action.
- TypeScript, focused lint, production build and React hydration bundle verifier PASS. Build retained the inherited suite image warning. No new dependency was installed in the project or lockfile changed.
- Remote CI: **NOT_RUN**, because these changes are not published. Physical Safari/iPhone: **NOT_RUN**. Chromium small-screen/touch emulation is not physical-device acceptance. No hosted Preview or production mutation was performed.

Reproduce after the existing dependency installs and production build:

```
NODE_PATH=./tests/qa/node_modules QUICK_EXPECT_TOUCH_TARGETS=1 node --test tests/quick-improvements/mobile.browser.cjs
node --test tests/crm-client-product-links.test.cjs tests/client-hud.test.cjs tests/navigation.test.cjs tests/product-client-identity-recovery.test.cjs
```

Use native environment syntax on Windows. Install Playwright Chromium normally; no cloud keys are needed. Evidence defaults to `evidence/quick-improvements` (ignored from commits).

## Handoff and remaining work

- Dashboard has standalone inline links measuring16–19px and some shortcut links around40px in the fixture; shared dashboard/suite files overlap existing work, so no broad style change is made here.
- Pipeline still reflects main's pre-V2 card controls. Claude's #297 now owns that correction and touch/keyboard work; validate its exact SHA separately instead of duplicating it.
- Product editor breadcrumb is16px in the sampled page. It is documented for its module integrator; the rest of the tested route fits the viewport.
- Inbound is under Claude's active history/security work; basic route and filtering are tested without altering it.
- No broken client section links or document overflow were reproduced in these synthetic cases. No duplicate documentation was removed without evidence that it was obsolete.

Next action: owner reviews the four-file patch and authorizes publication of a small PR; then inspect CI on its exact SHA. No automatic merge or deployment.
