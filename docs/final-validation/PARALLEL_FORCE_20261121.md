# Codex Parallel Force — independent checkpoint — Refs #292

21 November2026. Source of truth: live GitHub refs inspected before work, exact immutable pins, isolated evidence. No production SQL/read, production data, remote RLS, users, credentials, billing, DNS, paid resources, excluded features or Samuel portal were changed or inspected for this audit. No merge/deploy.

## Coordination and source reconciliation

main remains207ed3a3dc8fdae5dd949a7361733e441c530519. Open/closed/recent merged PRs were inspected. Current reviewed heads:

| PR | Head |
| --- | --- |
| #294 RC | 55133cd42e4133b6dbbe0f409113e6c3f03f7333 |
| #298 FV2 layer | 860288ccff13417cad433753697ac67d9e831bcd |
| #297 Kanban V2 | 66a3b537add94babf36b1e0eeac82282c2637fb5 |
| #265 security | d0bd58263367a3acae829a81123bfd149629ac5e |
| #293 planning | f2cc24f40338c7faaf66544b39b9365f8e92cb00 |
| #276 acceptance docs | 909a5707afc3edc4f5446335146c6d924a6e41bf |
| #295 previous QA | 5b5c7591fc23424f9c840a06c5b561eba29a2ac1 |

Samuel #296 is excluded. Guardian is excluded. #298 is authored by the implementation owner; it was rerun here rather than accepted from its report. #299 is the separately approved four-file mobile correction, published at effe680cf111d94fc9b63b1c241e9ae6edeff02e;3/3 triggered workflows SUCCESS (Auth Review44907761998,security44907762011 including CodeQL/dependency gates,OS modules44907762042). It is draft and not merged.

## Corrections owned by Codex

1. **QA reference drift:** #295 pinned #289@5b5942b, before the human-check correction. New manifest reconstructs #298 (which already contains corrected RC/quotes/contracts/finance/Kanban), #265 and #293. No original negative human gate was deleted or weakened. The five negatives now pass on current source. Original historical findings remain dated context.
2. **False coverage in RPC-error probe:** explicitly permit a valid synthetic human verdict and require exactly one RPC, so the failure case genuinely reaches the database. Consent and oversize probes retain the consent-first/no-provider contract. No backend change.
3. **Independent auth/human chain:**28 real-validator chain cases,6 actual owner-authorizer negatives, a five-identity commercial negative fixture, and a dedicated pointer/touch/keyboard Kanban test. Tests invoke actual source with synthetic transports. No real secrets/providers.
4. **Security audit false negative (separate branch):** original #265 scanner omitted implicit PUBLIC EXECUTE and PUBLIC regrants. Three first fixtures failed red; separate local security correction now passes13 text/current-source gates and1 PGlite privilege-oracle test. Tracks direct/inherited grants and future global/schema defaults in statement order; changes no SQL/permissions. See separately prepared security PR. Publication of that additional package was rejected by automatic approval review for lack of exact-payload public publication approval; no alternate upload used.

## Reproduced current finding for Claude

**PF-A11Y-001, P1 / FAIL:** Won alertdialog has `aria-modal=true` but Tab can leave it and reach background content. Tested by actual keyboard after a refused move. Source#297 has Escape handling and autofocus, but no focus containment for this dialog. The source is active Claude work, so the component is not patched here.

Reproduction: synthetic owner/opportunity in Proposal, no verified contract → pointer drop into Won → API409 with `won_requires_contract` → dialog opens → Tab three times → focus escapes to the background SUMMARY “Filtros avanzados”. Expected: focus cycles inside the modal and returns to the opener after close. Independent `tests/final-validation/kanban-browser.cjs` remains red at this assertion. Proposed fix: use a reviewed accessible dialog primitive or trap/restore focus, including Shift+Tab/Escape; do not relax the contract gate. No production exploit/data loss is asserted. Handoff posted to the existing PR coordination mechanism: https://github.com/avaloncoreagency/Avalon-code/pull/297#issuecomment-7063416194.

The first local test expected the old HTTP400; current #297 intentionally returns409 plus a stable business code. That fixture expectation was corrected to the verified current contract; it was not reported as a product regression. Other desktop moves, Lost cancel/reason, recovery, compact cards, error persistence, stale writes,390px swipe/hold-drag/tap pass. Radar is explicitly disabled in the dedicated fixture. Physical Safari remains NOT_RUN.

## Executed results

| Check | Result / scope |
| --- | --- |
| Final combined #298 commercial chain/intake/migration/capacity plus original probes/identity, human chain and added authorization/commercial negatives below | 47/47 PASS; no skipped cases |
| Added owner authorization negatives | 6/6 PASS: expired identity,membership missing/outage,editable metadata forgery,MFA/error,verified subject |
| Added commercial/identity negative SQL | 1/1 PASS:2 owners,operator,2 non-members; populated sales/invoice/client/project reads denied; forged IDs cannot invoice/sell/read finance; owner without finance permission denied; empty client remains empty; same trade names remain distinct; normalized legal duplicate rejected |
| Mandatory Funnel negatives | 5/5 PASS,zero intake/RPC on rejection/unavailability |
| Independent token wrappers | PASS,missing/wrong/revoked tokens and direct anonymous original RPCs denied in isolated SQL |
| Independent scoped Kanban browser | 8/9 scenario checks PASS; PF-A11Y-001 FAIL (gate stays red) |
| Chromium quote/PDF/contract,Funnel,older-schema HTTP | 3/3 PASS;2 actual browser suites and1 HTTP compatibility suite |
| Full root units with local security overlay | 766/778 PASS,12 FAIL on Windows fixtures (POSIX fake executables/modes/symlinks,CRLF source assertion,planner separators). Do not report all-green; remote current combined CI remains required |
| Types/build/hydration verifier | PASS on reconstructed application source |
| Lint |0 errors,2 inherited warnings; focused new QA/scanner files clean |
| Native PostgreSQL concurrency | NOT_RUN locally; guarded CI service script prepared for inquiry replay and two-owner optimistic stage race |
| Hosted Preview / real Auth sessions / real Storage restore | BLOCKED / NOT_RUN |
| Physical iPhone/Safari | NOT_RUN |

The initial local reconstructed application commit is a650925c721339dc9f1975cf7f125964c12670cb,tree b7b65b2b92b7b336342e2ccff72633460478f6d2,plus the explicitly additive QA files and independently tested local scanner overlay. Reconstruct from the manifest; candidate merge timestamp/author can change, so compare source pins/tree. Evidence must state the overlays. #299's exact CI is not proof of this different candidate.

## Capacity, architecture and release limits

Reran1/5/10/25/50 synthetic clients with exact counts,empty searches,disjoint pagination,associated sales/projects and shared-owner access. Recorded PGlite client-list times5.1/2.5/1.7/1.9/4.9ms in that run; other measurements are in the execution log. Single in-process WASM timings exclude network,PostgREST,cold starts and production concurrency. No production capacity claim.

The global intake cap remains30/hour;31st returns throttled. This is an owner/product decision,not silently removed. Client A/B non-member identities being denied the internal agency CRM does not implement or certify externally delivered multitenant CRMs. Initial owners intentionally share the internal agency.

Current isolated SQL/source evidence protects owner membership,finance privilege and token wrappers. It does not establish live grants or storage exposure. No SQL was executed on production. Existing advisor counts are historical. New message-history migration and intake review SQL remain approval-gated; actual keys,backup/restore,token registration and isolated Preview configuration are not performed.

## Verdict and next actions

**NO-GO for hosted pilot/release.** Mobile#299 is READY FOR REVIEW with exact-head CI green. Planning#293 stays planning-only; no executors,Guardian dependency or authorization from unsigned receipts. Review consent-first intake/current pins,fix PF-A11Y-001 in Claude's component,approve publication of the additional QA/security packages,then require combined exact-head CI and authorized hosted acceptance. No production or automatic integration.

Next action: Claude fixes and tests modal focus on his branch; Codex reviews the new SHA and reruns the unchanged independent gate. Owners decide separately on additional public PR publication and isolated environment/configuration costs/backup. No paid resource is assumed free.

Publication checkpoint: automatic approval review also rejected this additional ten-file QA/workflow package because it exceeds the explicitly approved four-file PR. Both additional packages remain local; their publication requires explicit approval of the concrete payload and destination. No workaround or indirect upload was attempted. Existing #299 remains published and green.
