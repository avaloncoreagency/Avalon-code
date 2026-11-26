# AVL-CODEX-CONVERGENCE-001 — recoverable checkpoint

Executor Codex. Base main 894d73bc72fdc65a0af922a9b8c398680e889dfe. Candidate starts on #364 2c2661ff (dependent on #363 70404ddf), integrates #359 7458b5d2 and its #358 dependency 9f7c8973 in the isolated development branch. Original PRs/branches and main are untouched. This is PARTIAL, not a backend certification.

## Proven repair
Actual `getStaffState` returned `ok` for verified TOTP with currentLevel=aal1 and nextLevel=aal1. New regression failed before the repair. Staff with an enrolled factor now requires current AAL2 even if nextLevel is inconsistent or absent. Existing DB guards were already independently enforcing AAL2; no unrestricted database exposure is claimed. Inactive users, invalid membership and provider errors remain denied. No owner MFA policy change.

## Invitation integration
Clean development merge preserves Claude's pending-submit guard and exact Auth mail failure/rate-limit/unknown-outcome distinctions. No automatic resend. Errors expose safe ES/EN status rather than SMTP payloads. No invitation sent and no hosted function deployed.

Gmail 535 BadCredentials is transport authentication failure, not proof an email already exists. Corporate address requested in this mission is `avalonacoreagency@gmail.com` (different spelling from historical accounts): identity and SMTP authorization must be independently verified in the provider. Never guess which mailbox is authorized. If Gmail is the verified SMTP provider, its account owner enables Google 2-Step Verification, opens Google Account → Security → App passwords, creates a dedicated Supabase label and enters that generated credential ONLY into Supabase Auth → SMTP Settings → SMTP password, with the matching verified sender/user. Do not paste it in chat/GitHub or use the normal Gmail password. Managed-account restrictions may prohibit App passwords; that requires the mailbox administrator. No configuration change or live delivery is certified here. Real mail needs an explicitly authorized test recipient.

## Backup and restore gate (NOT_RUN hosted)
Before any production GO: an authorized operator records project/ref, ledger versions and approved snapshot timestamp; verifies the existing plan's backup/PITR coverage and retention. A Preview database is not that backup. Restore the approved snapshot into an already authorized isolated target; compare migration ledger, schema/functions/grants/RLS, storage-object inventory and application-level row counts without publishing records. Auth and Storage binaries require their documented separate recovery coverage. Exercise negative permission tests and a synthetic financial transaction there; record restore time and snapshot ID privately. Do not download production data into this public repo. No new paid target is authorized. Rollback must account for writes since the snapshot; never blindly restore over live customer changes.

## Boundaries and remaining work
- Commissions: FROZEN, no rates, calculations, attribution, settlement or recurring bonuses changed; no commission-flow certification. Existing source/tests retained.
- SQL proposals from #363/#364 ran only against disposable local PostgreSQL/PGlite. No hosted DDL/Auth/grants/RLS/credentials changed.
- Local seller SQL baseline: 2/2 pass. MFA + portal focused: 5/5. Integrated invitation + MFA: 12/12 pass. Full candidate lint/typecheck/build/unit/CI evidence must be read from exact PR SHA; do not inherit success from another commit.
- Finance outside commissions, direct REST/storage tests, full independent Claude-candidate acceptance, live SMTP, backups/restores and production drift are not certified by this increment. Continue through independent cases rather than claim the mission complete.

Next action: inspect exact-SHA candidate CI, execute staff REST/browser and non-commission payment/refund negative regressions, then reconcile main's later migrations before any integration GO. Claude must review the shared Staff mounting/auth and invitation integration. No merge to main or deployment authorized by this checkpoint.
