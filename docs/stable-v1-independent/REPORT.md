# Codex independent hardening — Stable V1

2026-11-22 · Refs #303 / #304 / #310 · **NO-GO; two reproduced financial defects.**

Reference: Claude #321 at `82637e6e871f697368a3a52e68bfc69871b191b2`. GitHub now reports #321 merged; `main@cb1d65b73636407e2c4ddc1dacaf3aebb98adda3` has the identical tree `15e9a58ef41e6934f1004395be3fd07c57ce55ab`. Both refs were rechecked before handoff. This is independent local acceptance of that tree, not production certification.

## Scope and ownership

Separate worktree and branch `codex/stable-v1-independent-hardening`. The 35 open PRs returned by GitHub plus #321 were checked for changed paths. #318/#319/#320 are merged; their Knowledge/Sales documentation is already incorporated. #301/#302 are historical QA inputs, not acceptance evidence for this source SHA. #310 has the verified `owner:miguel` label.

Reservations and complete file matrix: [ownership.json](ownership.json), registered in #304 comments 7087697833 and 7087788292. No collisions with the new test/report/workflow paths. Runtime, existing tests, authentication, all SQL migrations and Samuel's portal remain unchanged. No agent-private chat or automatic receipt by Claude is claimed.

Graphify indexed `cb1d65b7` and matched the tested source tree. Recall returned no published applicable knowledge; current files and execution are the evidence. Static results were navigation only.

## A. Security and integrity findings — CODEX → CLAUDE

### AVL-STABLE-001 — P0 integrity: non-finite money accepted by financial RPC

**Status: HANDOFF TO CLAUDE.** This severity follows the founder's definition of P0 as data-integrity risk. It is not an unauthenticated intrusion or demonstrated production compromise.

- Affected path: `supabase/migrations/20261119150000_crm_attributed_conversions.sql`, `public.crm_attribution_record(jsonb)` and the `gross_collected` constraint.
- Required actor: authenticated owner with `crm_private.finance_access`, an associated client, approved revenue-share terms and a verified signed contract. Outsider denial still passes.
- Reproduction on the reference SHA: call the real RPC in disposable PGlite with a valid synthetic fixture and `gross_collected: "NaN"`, `excluded_amount: "0"`. The function inserts a conversion. `crm_attribution_summary` then returns `unverified: "NaN"` for USD.
- Cause: PostgreSQL numeric accepts NaN; the cast succeeds, NaN passes `gross_collected > 0`, and the RPC's range checks do not exclude it. The generated commission and aggregate become non-finite.
- Existing control: the Server Action rejects this input with a decimal regex; that is not a database boundary because the granted RPC can be called directly by the authorized finance actor. No outsider bypass was observed.
- Failing acceptance: `financial-boundaries.database.cjs` → `financial RPC rejects non-finite gross...` → `NaN`. Infinity and negative Infinity are already rejected.
- Minimal proposal: reject `amt::text` and `excluded::text` in `('NaN','Infinity','-Infinity')` before insertion. The proposed replacement was executed **only in a disposable test DB** by `proposed-finite-guard.database.cjs`: six non-finite inputs rejected, no inserted rows, valid $1,000.01 minus $200.01 at 5% remains $40.00.
- Integration: Claude should supply a new forward-only migration, preserving existing migrations, plus a suitable finite-value table constraint. Existing stored non-finite values require an authorized aggregate review and explicit remediation; their existence in production is UNKNOWN. Do not silently replace amounts.
- Acceptance: the unpatched rejection regression becomes green on Claude's new SHA, valid decimals and permissions remain correct, and upgrades are tested without destructive cleanup.

### AVL-STABLE-002 — P1: valid legacy commissions cannot progress after upgrade

**Status: HANDOFF TO CLAUDE.**

- Affected paths: `20261121181000_crm_attribution_lifecycle.sql`, `20261121182000_crm_attribution_legacy_guard.sql`, and `src/lib/sales/attribution.ts`.
- Reproduction: migrate a fresh synthetic DB only up to the pre-V5 schema; create reported, verified and paid conversions through the original authorized RPC. Apply all three V5 migrations in order. All historical columns survive and `version=1` is initialized. Attempt the UI-supported `verified → invoiced` step through `crm_attribution_advance`.
- Observed: SQLSTATE `23514`, constraint `crm_attribution_attribution_evidence` rejects the update. Legacy rows have null `client_payment_verified_at` and `attribution_verified_at` and empty new evidence fields. The client-payment constraint would also be unsatisfied.
- Cause: the function and UI explicitly allow invoicing from legacy `verified`, but the new constraints require evidence those old rows never had. Disabling the old RPC correctly prevents a bypass, leaving this legitimate path blocked.
- Control preserved: old paid rows remain immutable, the migration does not delete data, and direct legacy RPC calls are denied.
- Failing acceptance: `financial-boundaries.database.cjs` → `legacy populated upgrade...`. The test checks preservation before failing at invoicing.
- Suggested correction: define an explicit audited path for a legacy record to collect the missing real payment/attribution evidence, and align UI transitions with it. Alternatively, a deliberately approved legacy classification may preserve old verification semantics, but must not fabricate evidence, weaken constraints for new rows, or silently mark anything paid. This policy choice belongs to Claude and the owners.
- Acceptance: legitimate migrated verified records can complete the documented path; missing evidence still blocks new records; historical paid/reported rows, version checks and append-only events remain intact.

## B. Performance

No runtime optimization was justified by this bounded measurement; no claimed percentage improvement.

- Existing capacity test, 1/5/10/20/25/50 synthetic clients: exact counts and disjoint pagination passed. At 50 clients: list 3.8 ms, name search 1.4 ms, finance summary 4.9 ms. One local PGlite run; not hosted Supabase or a concurrent load benchmark.
- Local production build: shared first-load JS 103 kB. Build 87.25 s with already installed pinned dependencies; not a clean-install comparative benchmark.
- New browser matrix: 25 navigations, `domContentLoaded` 102–431 ms, no document-width overflow. Local Chrome, loopback server, reduced motion and external browser requests blocked. These are not mobile network, LCP, INP or physical-device measurements.

## C–E. Quality, commercial QA and independent implementation

Added four isolated test files: disposable fixtures, financial boundary/upgrade/failure tests, sandbox-only finite-guard proposal, and five-width browser coverage. Added a narrowly scoped, read-only CI workflow with no secrets, no schedule and an eight-minute limit. No shared code fix or database migration is claimed.

Verified controls include cross-company sale rejection, atomic client→lead registration, outsider RLS, immutable documents, commission sequencing, duplicate sales replay, quotation PDFs, delivery states and rollback on failures. The new injected event-write failure rolls back the conversion and its version. Two queued requests at the same version yield one event and a version conflict; **PGlite serializes one connection, so this does not prove multi-session locking**.

The unit baseline has 803 passing tests. The selected financial/commercial DB batch has 26 passing tests; the additional CRM/contracts/delivery batch has 14. These are 40 DB tests actually executed, not a claim that all database suites ran.

Auth HTTP integration passed: SSR cookies, expired-session refresh, logout, callback replay denial, trusted owner membership, MFA and throttling. Quote browser acceptance passed actual wizard/PDF/download/status/contract flows. Drawer acceptance passed scroll preservation, open-at-top, keyboard tabs and focus checks. The new matrix passed pipeline, client, inbound, quote and results pages at 320/375/390/768/1440 px, without page exceptions. Two representative screenshots were also visually inspected.

## G. Evidence and reproducibility

Machine-readable local run receipts and SHA-256 log digests: [evidence.json](evidence.json). Local raw logs and screenshots are retained outside the repo in `outputs/independent-stable-v1` of the Avalon workspace. Synthetic data only.

| Check | Actual result |
|---|---|
| `npm test` on reference tree | 803 pass / 0 fail / 0 skipped |
| `npm run typecheck`; `npm run lint` | Exit 0; existing warning retained |
| `npm run build` | Exit 0, including hydration bundle postcheck; existing CSS warnings retained |
| Selected + extended DB commands in evidence.json | 26 + 14 pass / 0 skipped |
| `node --test tests/auth.integration.cjs` | 1 integration suite pass / 0 skipped |
| Browser command below | 3 suites pass / 0 skipped, flags actually enabled |
| `security-workflow-pins` + `definer-gates` | 8 pass; static audit 53 executable definers, 0 unclassified/ungated |
| New financial command below | Exit 1: 7 TAP tests, 4 pass / 3 fail / 0 skipped; one failure is the parent of failing NaN subtest, so **two distinct defects**, not three |
| Focused lint for new files | Exit 0 |
| Exact-source GitHub CI | 11 returned PR-triggered workflows SUCCESS for `82637e6`; this connector view is not a proof of all events or production |

Use Node 22 and the existing lockfiles (`npm ci`, `npm ci --prefix tests/qa`) if dependencies are absent. No new packages were installed in this local cycle; matching existing dependencies were reused.

```sh
NODE_PATH=./tests/qa/node_modules node --test --test-concurrency=1 tests/stable-v1-independent/*.database.cjs
# Must remain FAIL until the actual upstream defects are fixed; do not skip, invert or mark TODO.

# After npm run build, use an absolute evidence path and the installed Chrome executable as appropriate.
NODE_PATH=./tests/qa/node_modules CRM_BROWSER=1 QUOTES_BROWSER=1 STABLE_BROWSER=1 \
BRIDGE_PUBLIC_READ_DISABLED=true AVALON_RADAR_EXTERNAL_ENABLED=false \
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
EVIDENCE_DIR=/absolute/private/evidence \
node --test --test-concurrency=1 tests/quotes.browser.cjs tests/lead-drawer-scroll.browser.cjs tests/stable-v1-independent/responsive.browser.cjs
```

The full `sales.browser.cjs` was **NOT_RUN** in this cycle because its harness explicitly enables Radar; selected commercial browser tests and the database chain were executed instead. No claim of total commercial browser acceptance. New financial CI is intentionally expected to fail on this unchanged runtime. The sandbox proposal passing cannot override that failure.

## H. Release assessment

| Area | Status | Limit / next evidence |
|---|---|---|
| Security | FAIL | Financial integrity defect AVL-STABLE-001; tested auth/outsider controls pass |
| Data integrity | FAIL | NaN aggregate and legacy progression; no live-data inspection |
| CRM | PASS | Tested local client/lead/sale relationships and drawer; not all hosted workflows |
| Finance | FAIL | AVL-STABLE-001/002 |
| Quotes | PASS | Local wizard, PDF, states and contract handoff |
| Contracts | PASS | Synthetic lifecycle/integrity tests; commercial legal acceptance separate |
| Frontend | PASS | Specified 25 route/width cases; full app visual approval not implied |
| Performance | UNKNOWN | Baseline measured; no hosted/concurrent performance budget validated |
| Accessibility | UNKNOWN | Keyboard drawer checks pass; full contrast/screen-reader audit NOT_RUN |
| Migrations | FAIL | Clean application passes, populated legacy financial continuation fails |
| Hosted Preview | NOT_RUN | No authenticated isolated hosted browser acceptance |
| Backup / Restore | NOT_RUN | Disposable DB replay is not a production backup restoration |
| Physical Safari | NOT_RUN | Chrome emulation only |
| Legal / prices | BLOCKED | Existing owner/legal approvals remain outside this engineering cycle |
| Real multi-session concurrency | NOT_RUN | Requires isolated multi-connection PostgreSQL |
| Samuel portal | UNKNOWN | Protected separate #317; no code or permissions changed |

## I. Project Manager handoff and recovery

P0 AVL-STABLE-001 → Claude: forward-only finite-money guard + constraint, current-data review under appropriate authorization. P1 AVL-STABLE-002 → Claude/owners: explicit legacy evidence policy and valid migration path. PM #303/#304 retains coordination; no new master backlog.

**Next action:** Claude publishes one correction SHA; Codex reruns these failing regressions and relevant existing suites against that SHA. Owners retain approval of any merge, SQL, deployment, commercial rates and legal release.

Recovery: source checkpoint is full SHA `82637e6...`; all additions are isolated in this branch. Revert this QA commit if integrated, without touching runtime or historical migrations. No production backup was needed or represented as created because production was not changed. No new paid services, model/API calls, secrets, invoices, client records, deployments or SQL connections were activated. CI uses existing GitHub Actions; billing/quota was not inspected, so no measured savings or unlimited capacity is claimed.
