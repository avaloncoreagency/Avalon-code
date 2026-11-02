# Avalon unified release candidate — 2026-11-02

## Sources and integration

Candidate: `integration/avalon-release-unified-20261102`.
Verified main: `bb2fe167d295f7fedddad77b7188636c3bf435e6` (PR #34 merged).
Integrated PR #41 at `303148ecfc081ac72593ecbac8836a91cb8ad40c`, including #39 mobile work and #42 E2E correction; integrated PR #43 at `987effa3642a92b146d5eda450b8f64ba1894fd8`.
Both integrate without content conflicts. Preserve existing sales, tasks, client 360, 13 pipeline stages, Titan Radar, public inquiry, product HUDs, security and Dev Bridge. Historical branches were not merged again; the prior integration matrix remains in AVALON_EXECUTION_STATUS.md.

New fixes: make OS security route enumeration portable across Windows/POSIX; force LF for SQL migration files so immutable migration checksums survive Windows checkout. No SQL logic or security assertion was removed.

## Executed locally on the combined tree

- npm ci, including tests/qa: succeeded.
- lint and typecheck: succeeded.
- unit tests: 135 passed, 0 failed.
- bridge tests: 13 passed, 0 failed.
- Next production build: succeeded.
- auth HTTP integration: 1 passed, including owner/nonmember, recovery and MFA checks.
- PGlite suites (CRM, unified modules, sales, pipeline, radar, public inquiry): 9 passed, 0 failed.
- Browser acceptance: 2 passed, 0 failed: CRM CRUD/stage/reload/390px and Nova sale across three departments, with isolated PostgreSQL and real Next server.

Local evidence is stored outside Git under the parent work directory as unit-results.txt, bridge-results.txt, build-results.txt, auth-integration-results.txt, database-results.txt and browser-results.txt. Synthetic tests use an isolated database and do not establish live Supabase authentication acceptance.

## Release gates / exact next action

1. Inspect candidate CI and browser logs; fix any failure without weakening assertions.
2. Recheck isolated Supabase branch availability and migration ledger. PR #42 identifies `jasgumggzgoqbemtcmno`; do not reuse the deleted `kmpmvwbtqaggkjjxfayh` URL or assume either is currently valid.
3. Configure branch-scoped Preview URL/key together through the secure environment manager; preserve Next's production-database guard and deployment protection. No paid resources authorized.
4. Verify real owner login and end-to-end radar approval → lead → sale → client/projects/tasks, then company/product improvement requests, desktop and mobile on that exact preview commit.
5. Report authenticated preview links, outstanding integrations and migration/backup/rollback plan before requesting production approval.

Production, remote data, owner grants and provider integrations were not changed in this work. Previous reports of operational status are historical evidence, not fresh acceptance for this candidate. No background continuation is promised.

## Preservation and publication

The user explicitly authorized integration and a pull request targeting main on 2026-11-02. Publication is limited to the candidate branch and PR; main and production remain gated.

The CRM, sales and migration directories are identical to Claude PR #41 at the commit above. Its complete history is retained as a parent of the integration commit. Browser acceptance covers persisted pipeline moves, sale confirmation, payments, client edits and follow-ups, task status changes, Radar evidence/approval/transfer, campaign controls, public quote submission and mobile navigation.

PR #44's Stripe sandbox adapter is excluded: its own review still requires invoice RLS, webhook idempotency and integration validation. It is not a completed CRM feature and must not weaken the accepted release gates.
