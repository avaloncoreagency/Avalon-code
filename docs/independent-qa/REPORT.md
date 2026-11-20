# Independent QA checkpoint — #253

Base: `main@5f99d05ef86af41e8e3496689206a8e0ba436aaf`. Fresh Git fetch, connector commit and Graphify index agreed. Earlier PR base `53e5436` is older ancestry, not a competing current main. Twenty open PR changed-file lists checked; this PR adds independent paths only, does not touch Claude or Samuel's files.

## Findings by severity
- **P1 release gate — Radar zero-egress not certified in production.** Local candidate #250 (`bd13eac3c2a7417c530a6cb0f2f23c9b2a2d08b9`) passes five suspension tests and its existing CI workflows report success. Read-only remote inspection shows scheduler disabled but worker configuration enabled. Configuration does not prove execution/cost; do not activate or change it from QA. Require deployed SHA/flag/worker/schedule evidence and observed no-egress before accepting hibernation. Claude owns implementation.
- **P1 release gate — tenant boundary.** Current CRM is owner-operated single-agency (`agency_key='avalon'`), not customer login isolation. All examined CRM/product tables have RLS enabled; enabling RLS is not proof of policy correctness. Disposable database tests verify outsider denial and cross-client financial references. Do not onboard customers as owners.
- **P1 UX integrity — partial timeline can appear complete.** In `src/app/admin/workspace/crm/pipeline/route.ts`, only activity-query errors fail the request; ordinary history/file-query errors fall back to empty arrays without warning. Repro: mock history or files response `{data:null,error:{code:'08006'}}` while activities succeeds; GET returns success with empty subset. Proposed fix: distinguish each source failure and refuse completeness, preserve retry state. Do not edit claimed commercial modules in this QA change.
- **P2 data review — client/lead association.** Read-only aggregate diagnostics detected a client with no origin lead. This is an ambiguous relationship requiring owner review, not proof of a corrupt FK. Do not auto-link by name. Candidate #245 is separate work.
- **P2 attribution — unknown actor shown as System.** `LeadTimeline.who` falls back to `Sistema` on unavailable directory/user. Proposed honest unknown-author label. Server attribution itself passed synthetic tampering tests.
- **P2 recoverability — note+attachment partial retry.** Upload and note are separate writes; a note failure after upload leaves a valid attachment. Retrying unchanged form can upload again. Preserve receipt and retry only missing note.
- **P2 completeness — capped history without pagination.** 200/200/500 item caps need explicit limited-history state or cursor. Five-stage simplification is approved but remains to integrate in #236-owned board. See PIPELINE_HANDOFF.md.
- **P2 cost visibility — multiple quality workflows overlap.** Existing security weekly schedule is active in code; bridge sync/office-manager schedules are commented out. No provider bill was read, no financial savings claimed. New workflow is path-filtered, time-bounded, concurrency-cancelled and has no schedule or secrets. Review duplicated full build/browser execution before broadening triggers.

## Evidence and limits
`commercial-integrity.sql` runs REPEATABLE READ + READ ONLY, with 10s statement timeout and ROLLBACK. It returns only aggregate checks/coverage. Zero counts on empty finance tables cannot certify commercial readiness. No records, names, files, tokens or raw customer snapshots are included in this PR.

Local baseline: 685 unit tests; typecheck pass; lint 0 errors/2 existing warnings; production build pass. Focused existing DB suites: 9 pass (quotes, Core Engine, sales, pipeline). New isolated DB tests: 2 pass. New mocked HTTP tests: 4 pass. A first new negative expected generic RLS wording, but actual guard returned SQLSTATE 42501 / CRM forbidden; corrected the assertion to exact authorization SQLSTATE, not a permissive regex.

Radar candidate: 5 pass from its own worktree. An initial invocation used main as cwd and exercised the wrong source; not counted as candidate evidence. No runtime Radar/AI provider enabled.

Chromium/Chrome sales and quote suites are tracked separately; see final PR verification for results. No Safari real, hosted Preview session, actual payment gateway transaction, new provider resource or production mutation is claimed. No migrations applied, no merges or deployments performed.

## Next action
Codex checks final PR SHA CI; Claude/board owner reconciles the approved pipeline contract in existing branch; Miguel and Samuel complete MULTICLIENT_RUNBOOK.md pilot gates on an authorized isolated Preview. Keep status **NOT_READY for real-client pilot** until those gates have evidence.

## Provider observations (read-only)
- Supabase ledger: 45 migrations, latest `20261119210002`; two cron entries inactive; Radar worker config enabled. No campaign entries were returned. This is a point-in-time observation, not continuous supervision.
- Security Advisor reported `pg_net` in public, 6 anonymous executable SECURITY DEFINER functions and 51 authenticated executable SECURITY DEFINER functions. These are review warnings, not 58 proven vulnerabilities; intentional public/token endpoints exist. Existing local definer-gate suite passed 4 tests. Review permissions, body guards and rate limiting without automatically revoking legitimate RPC access. Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public and https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable and https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable.
- Vercel recent listing: Claude Preview `4c5bb80e8c969ffe3442b00e23dca74f7efab121` READY; preceding `b345dc54c6464ccc186f4697ffc93bb4f2de86c2` ERROR. Other candidate previews CANCELED. No new deployment was initiated and no hosted login was tested. A READY Preview on Claude's SHA does not validate this QA branch.
- Quoting Studio browser test passed locally with installed Google Chrome (Chromium engine), synthetic REST bridge/PGlite, desktop and mobile viewport. This is not Safari or an actual iPhone. Full Sales suite result recorded separately below.

## Commands
Use repository-pinned dependencies: `npm ci` and `npm ci --prefix tests/qa`. No provider credentials are needed for these suites.

```sh
npm test
npm run typecheck
npm run lint
NODE_PATH=tests/qa/node_modules node --test --test-concurrency=1 tests/independent-qa/*.cjs tests/quotes.database.cjs tests/core-engine.database.cjs tests/sales.database.cjs tests/pipeline-board.database.cjs
npm run build
NODE_PATH=tests/qa/node_modules SALES_BROWSER=1 QUOTES_BROWSER=1 node --test --test-concurrency=1 tests/sales.browser.cjs tests/quotes.browser.cjs
node scripts/independent-qa/verify-radar-pause.cjs /absolute/candidate/worktree bd13eac3c2a7417c530a6cb0f2f23c9b2a2d08b9
```

The Radar runner refuses an unexpected SHA, modified tracked files or a missing pause suite. It never fetches another branch or changes provider settings. Browser suites require a locally installed Playwright Chromium, or an explicitly supplied `CHROME_PATH`.

## Full Sales browser result: FAIL (baseline, not hidden)
On base `5f99d05ef86af41e8e3496689206a8e0ba436aaf`, `SALES_BROWSER=1` with installed Chrome failed after ~283s at `tests/sales.browser.cjs:839`: click on summary `Herramientas futuras · managers de IA` timed out waiting for visible/enabled/stable. The locator resolved a summary element but could not click. This is a reproducible acceptance blocker; cause not yet proven. Earlier screenshots include pipeline card/history, sales, client workspace, contracts, mobile routes and calendar, but they do NOT make the full suite green. Proposed next investigation: inspect ancestor visibility/tab state at that exact step and reconcile the existing office scene flow with the implementation owner; do not increase timeouts or remove the assertion without root cause. New workflow deliberately retains the full suite and may remain red until this upstream blocker is resolved. No blind rerun.
