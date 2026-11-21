# V5 independent drawer checkpoint — Refs #292

Source #307: d5c5932bb7ea09ef99d7141c19bb86a46cf90d6d. Main ff8191d; #305320a21e, #3067a4cee4, verified remotely before work. This is a partial QA checkpoint, not completed Premium Sales UX or integrated Commercial OS acceptance.

## V5-SCROLL-001 — FAIL

Real Next production build with synthetic Auth/REST and disposable PGlite. Twenty-one leads and long synthetic stage history. Radar disabled; no provider/production writes. Build/types succeeded (existing lint warnings). Twelve requested position/viewport probes reproduce a background jump on opening the drawer. Coordinate clicks eliminate Playwright locator auto-scroll as the explanation:

| Width | Actual window.scrollY before → after opening |
| --- | --- |
|1440|1549 →102;1236 →102|
|1280|1549 →102;1245 →102|
|390|1659 →74;1460 →74|
|320|1723 →74;1720 →74|

Drawer top is visible and its scrollTop starts at0; the background position is lost. Source suggests focus() without preventScroll before locking document overflow; this is a hypothesis, not a validated fix. Investigate focus({preventScroll:true}), drawer reset on lead identity change, explicit scroll/focus restoration and CSS containing blocks. Claude owns the reserved component/style; neither is edited here.

The requested top/middle/end probe labels describe initial requested document scroll; the test falls back to a visible lead if no card is in the viewport. Actual positions above are authoritative. It does not certify all16 requested acceptance scenarios. Each probe stops at the first failure: wheel/close/reopen assertions after that point were NOT_RUN. Touch, attachments, note refresh, full-history accessibility and physical Safari remain NOT_RUN. Do not claim them from a passing build.

Reproduce: npm ci; npm ci --prefix tests/qa; npm run build; install the pinned Playwright Chromium; NODE_PATH=tests/qa/node_modules node --test tests/v5/drawer-scroll.browser.cjs. EVIDENCE_DIR controls the local evidence folder. Test intentionally remains red. Remote CI for this new checkpoint NOT_RUN; no acceptance claimed.

Handoff: https://github.com/avaloncoreagency/Avalon-code/pull/307#issuecomment-7065385625 . Sales backend/data/action contract and exclusive paths requested in #305#issuecomment-7065340700, not yet received. No sales KPI, commission or invoice mutation invented. #306 must be reused; quote engine remains excluded.

Next action: Claude supplies corrected drawer SHA plus stable Commercial OS SHA/data contract and reserved paths; Codex reruns the independent gate and implements sales presentation only after that prerequisite. No merge, deployment, SQL/RLS, real data, paid service or staff portal change.
