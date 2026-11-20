# Guardian initial implementation · Refs #258

20Nov2026; base main5f99d05. Pure offline L1/L3/L4 diagnostic functions, six bounded runbooks and an adapter proposing an **existing** product ChangeRequest. No second incident database, monitor, repair engine, page, scheduler, API or credentials. Not an autonomous24/7 service.

## Storage and authorization boundary
Existing `os_projects.settings.client_hud.requests` holds product incidents, checklist, owner-authored notes and status history; project version and os_audit retain persistence/concurrency. `proposeProductRequest` emits a form-shaped proposal for existing saveProductOperation and never calls it. It validates canonical project/client IDs, expected version, existing request ID and malformed saved data. Actual future server integration must recheck owner membership and canonical client relation, reread current version and use the existing version-predicated writer. Pure Context values do not authenticate anyone; do not expose this as an unauthenticated API. No clients are given Avalon owner access.

Observations are limited to5,10min freshness, explicit status codes, UUIDs and matching scope. No ticket body is interpreted. Commands, URLs, credentials and repair instructions from free text are ignored; unknown codes reject. Private records and observation receipts stay private, never in GitHub Issues. The functions do not fetch URLs, resolve DNS or execute commands, so no URL supplied by a ticket can initiate an SSRF probe. A future network adapter needs allowlisted registered resources, redirect/DNS/private-IP restrictions, fixed quotas and independent security review; it is NOT implemented here.

## Levels and permissions
| Level | Implemented now | Approval |
|---|---|---|
| L0 | Versioned runbooks/documentation | Read-only |
| L1 | Classify supplied authorized observations offline | No infrastructure writes |
| L2 | Repair sequence represented in synthetic tests only | No live repair executor; prior scoped owner approval required |
| L3 | Persistent-failure diagnosis and PR/reproduction next action | No auto-commit/merge/deployment |
| L4 | Permission alerts and rollback requests always escalate | Owner/security intervention; no automatic recovery |

A single failure means another observation is needed, not a confirmed outage. Two distinct consecutive failures separated by at least1s indicate persistent **observed** failure; they do not identify a root cause. Healthy observation is recovery_unverified. `verifyRecovery` needs two later healthy observations from a different observer, same exact scope and distinct receipt IDs; returns VERIFIED_FOR_OWNER_REVIEW with `closeAuthorized=false`. Trusted provenance/authorization of those receipts is a future adapter responsibility. This JSON contract alone cannot attest that a check really ran. No incident closes because a model said repaired.

## Six initial runbooks
1. **Availability:** owner-authorized observation of registered website; record timestamp/status, take at most a second bounded observation; persistent5xx/timeout→L3, otherwise unverified. Read deployment/log references; no repair/restart.
2. **Contact form:** use a synthetic test form in isolated staging, validate fields/consent/server confirmation and persisted receipt/replay. No messages to real contacts. Reproduce error, assign existing app owner and verify corrected form independently; missing telemetry→BLOCKED.
3. **Deployment:** compare exact expected SHA, environment and existing provider build log; READY alone is insufficient. Auth/runtime errors require an authorized browser test. Do not redeploy blindly; prepare PR and rollback proposal.
4. **Authentication:** distinguish logged-out denial from service failure; no passwords/tokens in evidence. Use authorized synthetic owner and outsider sessions only. Permission alert→L4. No account creation, MFA bypass, permission changes or retry flood.
5. **Rollback:** select reviewed previous artifact/version and verify its hash, schema compatibility, database/Storage restore plan and explicit owner approval. AlwaysL4; no rollback executor in this slice. Test only a disposable fixture.
6. **Recurring error:** group exact structured failure codes and scoped receipt IDs; bounded observations, no body parsing. Stop after evidence threshold; propose causal reproduction/PR, not infinite retries. New independent healthy observations permit owner review, not automatic closure.

## Synthetic reproduction and limits
`node --test tests/omega-guardian.test.cjs` exercises classification, scope denial, malicious text, stale/duplicate receipts, version conflict, no self-verification and all existing product request transitions. A simulated repair moves requested→approved→in_progress→fixed, then fails verification until checklist and independent owner-authored test evidence exist, then verified→closed. Existing settings/history are preserved and duplicate request IDs rejected. No remote persistence, real customer request, browser, outage probe or physical Safari was tested by these pure functions. Actual product writer behavior remains under Claude's tests and ownership.

## Future observation wiring
Use an event from an authorized monitor/owner/ticket → retrieve minimal exact-client/product evidence → offline diagnosis → existing request proposal → owner-reviewed repair at approved level → separate verifier → owner closure. No recurring monitor, ChatGPT automation or external AI call created. Incidents share the Orchestrator handoff fields but cannot grant it additional permissions. Log action ID, target version, result and author before escalating; never credentials or arbitrary raw logs. Per-client retention and contractual response times require owner-approved policy; no24/7 SLA is promised.

Rollback: remove additive helper/tests/docs; no production or storage mutation to undo. Next action: Claude/integrator reviews adapter compatibility and trusted receipt source before UI integration; owners approve any future L2 executor separately.

## Reconciliation checkpoint —20Nov2026

Claude merged #255 into main445143fe26f8b954422a458464385d1d562e13cb during this task. This branch merged that exact main without conflicts, preserving his recovery and48 local migration filenames matching the current ledger versions for the three newest records. Prior45-source-file notes above describe the initial5f99 checkpoint, not the current reconciled candidate. No Claude PR was merged by this task. New helpers remain additive; exact-head CI must approve after reconciliation.

## Independent review patch — #263 (20 Nov 2026)

Recovery verification is intentionally **runbook-specific**. Generic HTTP `healthy` receipts can only produce `VERIFIED_FOR_OWNER_REVIEW` for an `availability` incident whose original observations exclusively contain `http_5xx` or `timeout`. An availability incident containing `permission_alert`, `rollback_requested`, `auth_denied`, deployment, form or already-healthy outcomes remains `UNVERIFIED`. Other runbooks (authentication, rollback, contact_form, deployment, recurring_error) always require their own reviewed domain checks and cannot be cleared by HTTP probes alone. This does not create a domain-specific verifier; these cases remain blocked until one is approved.

The existing independent-observer, unique-receipt, time, tenant/project checks remain intact; input receipts are still caller-supplied and not authenticated in this offline helper. `closeAuthorized` remains false. No infrastructure actions, endpoint, token or remote test was added. Regression cases cover unauthorized evidence as well as mixed HTTP failure types. The PR is a stacked review candidate against #261, not a production release.

Additional guard (#263): an availability outage is `persistent_failure` after two ordered failures at least one second apart even when the failure type alternates between `http_5xx` and `timeout`. A single unconfirmed failure cannot produce `VERIFIED_FOR_OWNER_REVIEW` from later healthy receipts. These boundaries are covered by additive synthetic tests; a real service, authenticated receipt source, and independent hosted tests remain pending.
