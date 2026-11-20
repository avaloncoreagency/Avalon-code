# Avalon Orchestrator — activation and acceptance gates (review-only)

Refs #270. Complements draft PR #260 / Issue #257 and Guardian draft PR #261 / Issue #258. This document is **not** an activation request. Baseline main: `207ed3a3dc8fdae5dd949a7361733e441c530519` (2026-11-20). Recheck HEAD and ownership before integrating.

## Current verified boundaries

- The existing `src/lib/agents/runner.ts` uses `crm_agent_mission_start`; do not create a competing dispatcher or registry.
- Draft #260 offers `compileMission` and `missionHandoff` as pure, default-paused helpers. Its `MissionReceipt` and `IndependentReview` objects are **caller-supplied contracts, not authenticated evidence**. A constructed `COMPLETED` return is not an owner-approved business delivery.
- Draft #261 offers offline diagnostics, not authenticated monitoring, repair execution or incident resolution.
- Automated ChatGPT Project chats are not independently callable execution workers. Legacy REN/SHIN/HARU/SORA/KENJI automations are paused. Radar and OpenRouter must remain disabled.
- This isolated QA branch deliberately contains no application adapter, endpoint, migration, cron, paid model invocation, automatic retry or browser automation.

## Prerequisites before any live adapter calls the OMEGA planner

| Gate | Fail-closed criterion | Independent evidence |
| --- | --- | --- |
| Ownership / identity | Bind requester to a current, server-verified owner UUID and agency membership; never accept `authorizedBy` directly from client JSON. | Owner, second owner, outsider and signed-out negative tests |
| Scope | Reject client-scoped missions when only agency-wide SQL diagnostics exist. No service_role or cross-client bypass. | RLS and tenant isolation tests against the actual target schema |
| Capability | Resolve capability from the existing server allowlist and DB registry, not from arbitrary prompts. Radar/SORA, external models and task-writing capabilities remain excluded. | Negative capability and no-business-write tests |
| Durability | Read mission/run results from the owner-authorized persisted DB by exact mission UUID, immutable plan key and step IDs. No caller-supplied receipt or unverified URL is trusted. | Reopen/replay, duplicate, stale/mismatched/partial receipt tests |
| Independent review | Obtain reviewer identity, verified membership and exact plan/criteria/version from trusted storage; reviewer must not be the author/executor or a forged actor. `COMPLETED` needs acceptance recorded independently. | Self-review, forged receipt, stale review and missing-criterion negative tests |
| Approval | Require explicit human approval for any write, merge, release, client communication, secret, DNS, Auth/RLS, financial operation or paid provider call. Bind it to exact mission version, scope and expiry. | Wrong-scope, expired and revoked approval tests |
| Budget / concurrency | Default incremental spend US$0, max one concurrent pilot mission, bounded diagnostic steps and attempts; UNKNOWN provider spend blocks new paid work. | Quota exhaustion and race/concurrent-start tests |
| Kill switch | Confirm DB-level pause before starting and before each external side effect. Pause cannot guarantee cancellation of an already running SQL transaction; document safe unwind. | Disable-before-run, pause-mid-run and reactivation-denied tests |
| Event / retry | Authenticated event origin, dedupe/idempotency key, explicit deadline, finite attempts and failure quarantine. Do not retry non-idempotent actions or 4xx/Auth errors automatically. | Duplicate delivery, network timeout, exhaustion and unauthorized event tests |
| Audit / privacy | Append-only mission transitions and actor/action/version/receipt references; redact secrets and private client data. Keep public GitHub Issues sanitized. | Audit-chain, data-leak and retention checks |
| GUARDIAN | Escalate P0/P1 to GUARDIAN 24/7 without granting an incident text command execution rights; recovery verification must use independent trusted observations. | Injection, wrong-scope and false-recovery-negative tests |
| Release | QA verifies exact candidate SHA, isolation, backups/restore, mobile/Safari when applicable and the intended hosting plan before owner approval. | Hosted Preview and separate human acceptance proof |

No single green CI run is sufficient to satisfy these hosted and authorization requirements.

## Existing CI tripwire

Run `node --test tests/orchestrator-activation-gate.test.cjs` (also included by the existing `npm test` glob). It checks that no application/runtime source imports draft `src/lib/operations/mission-plan` or `department-templates` while their contracts remain untrusted. This small, static check is intentionally narrow: aliases, generated code, indirect calls and full authorization behavior are **not** proven secure by passing it. Changing the import path is not an acceptable workaround. Only replace the tripwire through a reviewed integration PR containing trusted server adapter and negative integration tests.

## Dependency and ownership sequencing

1. Engine owner reviews exact-head PR #260 with the existing SQL contract and current main, preserves the single mission executor and checks the consequences of #262 Radar hibernation.
2. CLOUD & SECURITY verifies caller authorization, real DB scope, kill-switch semantics, quota and backup/restore; GUARDIAN reviews event provenance and incident boundaries.
3. QUALITY ASSURANCE runs synthetic and isolated hosted tests on the integrated candidate; no real-client data, production mutations, subscription changes or external spend.
4. Miguel and Samuel approve any broader action category explicitly. Until then all status labels must say `PROPOSED`, `BLOCKED` or `PENDING` rather than `ACTIVE`.

## Acceptance for this specific PR

- [ ] New independent regression test passes at exact PR SHA.
- [ ] No runtime or SQL schema is altered.
- [ ] No permissions, external calls, scheduled task, credit usage or provider configuration change.
- [ ] PR references the canonical Issue #270 and clearly identifies unimplemented security gates.
- [ ] Reviewers do **not** equate synthetic completion with real deployment or human acceptance.

Rollback: revert the two new documentation/QA files. This rollback does not change live agents or production state.

Next action: An authorized integrator reviews this tripwire alongside #260; retain the fail-closed gate until a trusted owner-scoped adapter and hosted negative tests exist.
