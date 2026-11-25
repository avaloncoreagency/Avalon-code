# AVL-OMEGA-FINAL-001 — release checkpoint

24 November 2026 (America/New_York). Candidate: **PR #349 only**, remote branch `codex/ascension-001`. Local integration worktree: `codex/omega-final-001`. Publication remains **NO-GO**. No production changes or remote schema writes in this checkpoint.

## Recovered source and ownership

Recovered #349 at `00467d08fb225e0f5cdd03ea7233e8d7f4d79b99` (12/12 workflows successful **only for that SHA**). Reconciled without conflicts with `main@89a996995a0b207724187bc9b9ef4336962d1d3c`, preserving #348 lifecycle mail, #350 signed-agreement linkage and #351 versioned manual design. Staff #332/#333, Commercial Nexus #338/#339, consolidated #341, compatibility #342, messaging #343 and invitations #345 remain in the existing candidate. #330/#344 are already in main. #346, #352 and #353 were inspected as distinct QA/editorial contributions; they are not assumed approved or distributed.

Graphify main index matched `89a99699`; it does not describe unmerged Staff. Recall returned unsupported, so current Git files and tests were used. Current user assignment makes OMEGA responsible for authorization and commercial logic; ALPHA retains documents/renderers and Samuel retains functional Staff acceptance. Reservations: #304 comments 7149056815 and 7149088982.

## Security correction

A local synthetic PostgreSQL/PGlite test reproduced an enrolled owner's AAL1 direct CRM read (one row returned where none was allowed). New migration `20261125005906_enforce_enrolled_mfa_data_access.sql` enforces the existing opt-in MFA policy in CRM/OS owner helpers, Staff activity and the definer lead projection. Verified factors require AAL2; no verified factor preserves existing access. AAL2 does not grant memberships or override suspension.

The only new definer function is a no-argument boolean broker over the caller's own MFA factors, with empty search_path and restricted EXECUTE. Existing business helpers remain invokers. Auth factors remain unreadable to authenticated clients. Existing login membership/grant discovery is preserved to allow the MFA challenge.

Regression covers owner CRM read/write and privileged sales RPC, Staff dossiers/messages/work calendar/lead RPC, missing/invalid AAL, unverified factor, A/B isolation, suspended session and no-membership AAL2. The existing history suite covers pagination and commission privacy. Synthetic dump/restore verifies table RLS/ACL/policy counts and AAL1 denial/AAL2 permission after reload. This is **not** certification of Supabase production backup recovery.

## Isolated Preview preflight (read-only)

Confirmed existing OMEGA project `xrjzyimuiychftodyolb`, non-default branch, `with_data=false`, ACTIVE_HEALTHY. Ledger has 63 versions, candidate has 68. All ten Staff tables have RLS. Catalog confirms missing history RPC/helper, company settings, onboarding, outbox, contract agreement columns and new MFA helper. No customer rows or secrets were read.

Missing migrations, in execution order after separate approval and fresh catalog/ledger comparison:

1. `20261124140000_client_experience.sql` — existing ALPHA schema, company settings, onboarding, documents/outbox.
2. `20261124190000_outbox_lifecycle_kinds.sql` — existing lifecycle types, depends on 1.
3. `20261124192749_staff_own_commercial_history.sql` — existing Staff projection/index.
4. `20261124200000_contract_agreement_link.sql` — existing immutable contract snapshot linkage.
5. `20261125005906_enforce_enrolled_mfa_data_access.sql` — new MFA correction.

Before applying, verify exact file hashes against the approved SHA, no concurrent schema owner, no prior version or conflicting definition. Abort on drift; do not repair timestamps/ledger or reapply blindly. Apply only to the named isolated project, then inspect RPC signatures, RLS/grants and run synthetic negative tests. None is authorized for production by this document.

## Acceptance evidence

Local evidence: `npm test` 892/892, build including type validation PASS; lint zero errors/four existing warnings. Five focused database suites passed 17/17; the expanded MFA regression plus synthetic restoration passed separately. Browser/Auth passed 6/6: Agent Portal, Staff, Client Experience, legacy-schema compatibility and SSR session/MFA flows. Agent Portal/Staff ran responsive checks from 320 through 1440 px. Exact final CI is attached to the PR at its final SHA; do not inherit the baseline's green checks. Chromium emulation is not physical Safari. SMTP external delivery, hosted MFA and actual production backup restore remain NOT_RUN.

## Release / rollback

Keep the current production deployment and schema unchanged until independent QA/Security, Samuel's Staff acceptance and the owners' explicit exact-SHA GO. Before a release, record the existing deployment ID and a verified recoverable backup covering DB and separate Storage objects. A synthetic PGlite snapshot does not satisfy that gate.

Application rollback: restore traffic to the recorded previous deployment, then verify access. Preserve additive Staff data/audit; never DROP tables as an automatic rollback. Do not remove the MFA gate merely to fix login; that reopens the demonstrated bypass. If the gate causes an unexpected outage, stop rollout, investigate in isolation and obtain a reviewed correction. Disabling invitations or restoring a real backup requires the approved runbook and target.

## Checkpoint matrix

| ID | Module / result | Status | Evidence or blocker / next action |
|---|---|---|---|
| O00 | Recovery, ownership and reservations | VERIFIED | Live GitHub #303/#304/#349 and listed contribution PRs; dedicated worktree |
| O01 | Reconcile candidate with main | PARTIAL | Clean merge; final exact-SHA CI/review still required |
| O02 | Agent Portal | PARTIAL | Existing portal preserved; hosted UAT and Samuel acceptance pending |
| O03 | Auth/MFA | PARTIAL | Reproduced and corrected locally; hosted AAL1/AAL2 NOT_RUN |
| O04 | RLS/permissions | PARTIAL | Synthetic negative tests; remote gate not installed |
| O05 | Invitations/SMTP | BLOCKED | Existing templates/Edge preserved; SMTP settings and authorized QA mailbox required |
| O06 | Migrations/Preview | BLOCKED | 5 missing migrations; read-only catalog confirmed, mutation approval pending |
| O07 | QA-AP-001 / QA-CO-002 | PARTIAL | Dependencies present/tested locally; hosted schemas still missing |
| O08 | Backup/restore/rollback | PARTIAL | Synthetic restore PASS; real backup and restore evidence unavailable |
| O09 | Independent Staff review | BLOCKED | Request Samuel plus QA/Security on final SHA; author tests are not independent review |
| O10 | Agent Portal production GO | BLOCKED | No exact-SHA owners GO; no production action |
| O11 | CRM / Clients 360 | PARTIAL | Existing canonical flow recovered; full new commercial acceptance pending |
| O12 | Quotes / Sales Center | PARTIAL | Existing #330 preserved; synthetic sales DB tested, complete release review pending |
| O13 | Invoices | PARTIAL | Existing implementation preserved; historical invoice print/download UAT pending |
| O14 | Collections/refunds | PARTIAL | FIN-002 findings recovered; correction tracked separately from frozen release candidate |
| O15 | Commissions | BLOCKED | FIN-001 policy not approved; no financial rule inferred |
| O16 | KPIs | PARTIAL | Finance page recovered; private workbook's 27 cases/20 definitions not fully available in repository |
| O17 | Messages/calendar | PARTIAL | Existing Staff RLS/suspension tests passed; hosted acceptance pending |
| O18 | Frontend/performance | PARTIAL | Existing responsive suites; physical Safari and full ES/EN acceptance pending |
| O19 | ALPHA integration | PARTIAL | Preserved merged contributions; #352/#353 content remains subject to approval |
| O20 | Joint commercial QA | NOT_RUN | Requires stable shared SHA, hosted schema, QA identities and ALPHA coordination |
| O21 | Later releases | NOT_RUN | No deployment approvals |
| O22 | Technical closure | PARTIAL | Exact-SHA evidence and remaining gates must remain visible |

## Consolidated human gates

- **Preview SQL:** owner approval for the five exact files and named isolated target; unlocks QA-AP-001/QA-CO-002 and hosted MFA. No production authority implied.
- **SMTP:** owner privately configures Authentication → Emails → SMTP and approved sender in the isolated project; identify an authorized QA mailbox. Never paste App Password in GitHub/chat. Receipt and headers establish delivery/SPF/DKIM, not configuration claims.
- **Restore:** owners identify the real recoverable backup and authorize isolated restoration without exposing customer data; essential for production GO.
- **Samuel / QA / Security:** review final SHA and hosted evidence; earlier approval covers earlier code only.
- **Financial policy:** owners + Legal define accrual, eligible collection basis, refund/reversal handling and payout/financing; technical changes cannot invent those rules.
- **Publication:** owners' explicit GO naming SHA, target and operations after gates. No blanket work permission substitutes for it.
