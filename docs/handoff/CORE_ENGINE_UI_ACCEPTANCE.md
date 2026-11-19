# Core Engine UI — 2026-11-17 (America/New_York)

## Code integration and production safety

#221 was ready and merged with expected head 0ab152aa804d04fc2c4489743f3303619fb90500 into main 3631edda10f4ed9d88010ac37aaf46cc80493fb3. All applicable checks succeeded, including checks and Nova Restaurant browser E2E. Supabase Preview was skipped, not a test success.

Read-only list_migrations before and after: 41 entries; last 20261114165206 crm_client_agreement_drafts_release. No crm_core_engine. No SQL, permission or account changes. Vercel dpl_9XhCGkTFer57AYRJDFLVcqVyezMr READY at the merge SHA. Error/fatal runtime lookup for this deployment in the checked 15-minute window returned no groups; this is not complete production acceptance.

## UI contract

Own branch codex/core-engine-ui. Existing core-engine-server.ts adapter extended with bounded reads, record-to-sale scoping and optimistic catalog writes; existing RPCs and SQL remain the authority. New server actions recheck owner identity each call, consume that adapter and return sanitized coreEngineMessage outcomes. No new API, migration or data store.

Sale detail: document/void invoice; verify/reverse payments; agree/accrue/pay/cancel commissions with reasons/evidence. Paid only records an external payment. Forms retain input on failure and require confirmation for irreversible business transitions. Read lists bounded at 100 with total counts, no aggregate computed from them.

Client360: complete ledger by currency, gated by verified finance capability. Unavailable migration preserves existing summary; denied finance is not replaced with invented zeros. Catalog: new terms and explicit attributable approval, existing version predicate preserved; trigger owns offer version increments. No production price, commission or activation decisions made.

## Hydration #191

Client360 attachment gallery formatted timestamps in a client component independently on server and browser, despite fixed timezone. Labels now arrive preformatted from the server; browser uses the same serialized bytes. Synthetic browser regression varies zone/language and deliberately changes client Intl output before repeated ?ok=saved loads. This removes that mismatch surface; original intermittent incident is not proven to originate there. Keep #191 open unless failure is reproduced and tied to a specific component.

## Evidence / limits

Baseline 653 unit tests, typecheck, lint and build approved; focused SQL tests and final SHA CI results recorded in PR. Chromium startup locally blocked by socket/ptrace EPERM, no bypass. Added existing Sales browser extension for real UI against synthetic Auth/REST and isolated PGlite: invoices, payment verification/reversal, commission lifecycle, offer approval invalidation, client ledger ES/EN at 390/1440. Not real Supabase accounts or physical Safari/iPhone.

Next action: pass final-SHA CI and review own PR; activation in production still requires separate backup/migration/finance-access approval per CRM_OPERATIONAL_RELEASE.md §4. New broader BACKEND_READY request is a development-only continuation; do not deploy this UI or apply SQL from that request.


## Verified failure and follow-up

First own-SHA CI (8d2d6cc) executed all new financial interactions but failed the retained pageerror assertion on Calendar ?date=2026-11-22 with React #418 (job 134135649768, run 44110835701). No blind rerun. Calendar labels now use explicit month/weekday tokens and server-provided initialToday; unit regression prevents runtime ICU wording from affecting hydration. Follow-up bfac2b9 has new checks, root incident remains open pending repeatable causal reproduction.

Local production-schema acceptance passed after binding Next explicitly to 127.0.0.1 (avoids unavailable network-interface discovery) and reusing the existing stop-child helper (prevents waiting for an already-exited child). One blocked attempt and interrupted hanging cleanup are not counted as passed tests. No assertions or schema markers removed.

## Recovery reconciliation — 2026-11-19

Current main 5f99d05 includes Claude's Commercial Core 360/Quoting Studio. Merged that exact main into this development branch, preserving quote counters, quote links, client editing, canonical product links and lead stage. Only conflict: ClientOverview props/financial panel; retained leadStage plus LedgerPanel and unavailable fallback. No files of Samuel #233 changed relative to main (except the pre-existing shared Sales workflow inherited unchanged from main).

The prior asynchronous CodeQL alert identified operation-controlled verification dispatch. Fixed by explicit handler registry with uniform server ledger capability and record/sale scope, no inherited operation keys or default mutation table. No suppressions or weakened SQL authorization. Local evidence on reconciled candidate: 691 unit tests, TypeScript, lint (0 errors/one pre-existing img warning), build and 9 Core/CRM-flow/Sales SQL tests passed. CI/CodeQL must approve the reconciled remote SHA before the alert is considered resolved.

Production read-only now has 45 migrations, including installed Core Engine and Quoting Studio; no SQL/permissions/accounts changed by this reconciliation. Preview configuration remains blocked by automatic review. No paid provider activated. #191 remains open unless the intermittent hydration failure is causally reproduced/resolved; date labels are a mitigation, not a guarantee.
