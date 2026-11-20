# OMEGA Orchestrator · Refs #257

Base5f99d05,20Nov2026. Additive typed compiler and synthetic verification; **not a second execution engine**. No app page, API, schedule, credentials, provider call or activation flag added. Default compiler state PAUSED.

## Existing real system
`src/lib/agents/runner.ts` calls `crm_agent_mission_start`; `crm_agent_missions`, `crm_agent_runs`, `crm_agent_task_links` and the versioned capability registry already persist missions, steps, dependencies, actor, attempts, timestamps, result and evidence. SQL-native executors perform bounded diagnostics; HARU also has an internal followup-task writer. `crm_agent_settings` owns limits/kill switch; owner RPCs and RLS own authorization. `src/lib/office/manager-work.ts` supplies on-demand count reports. `scripts/ai-engine/managers.cjs` can run isolated test diagnostics. These are real deterministic functions, not five autonomous programmers or connected private chats. No replacement of their implementation.

The OMEGA compiler only maps explicit diagnostic tasks to the existing read capabilities of HARU, KENJI, SHIN and REN. SORA/Radar and the internal task writer are excluded. `compileMission` is a validation/planning helper, NOT authentication: future server integration must bind `authorizedBy` to `requireOwner` and use an owner-scoped DB client. No service_role override. Client-scoped missions are blocked because current SQL diagnostics aggregate the agency; no fake tenant isolation.

## Universal contract and state mapping
MissionPlan contains version1, stable mission ID, objective, authorizer UUID, optional client, priority, createdAt, tasks/departments/dependencies/acceptance, zero external spend, max20 steps/max1 attempt and next action. Hash idempotency binds normalized intent; changed scope/criteria generate a different key. The existing SQL records remain the durable authority; metadata not supported by that schema stays in a private review handoff, never a public Issue. No new persistence service.

| Logical state | Current truth / transition |
|---|---|
| RECEIVED / PLANNED | Validated plan only, no claim of execution |
| ASSIGNED | Existing queued SQL run, not active AI |
| RUNNING | Existing SQL running state only |
| VERIFYING | Completed SQL diagnostics with matching per-step receipts; acceptance still pending |
| COMPLETED | Separate exact-mission, all-criteria review receipt required |
| BLOCKED / FAILED | Missing executor, invalid scope, failed dependency or real SQL result |
| WAITING_APPROVAL | Manual departmental task; compiler refuses automatic dispatch |
| PAUSED | Default/disabled/global pause or explicit policy |
| CANCELLED | Logical requirement; current SQL lacks a mission cancellation RPC, integration remains pending |

IndependentReview is a contract, not a signed/authenticated attestation. No production caller trusts arbitrary JSON. A future adapter must retrieve trusted review records and verify reviewer capability/scope/freshness. Current tests create the review only after an independent SQL oracle checks results. No self-approval; no inference that diagnostic success means a business task/customer delivery passed.

## Event path and emergency control
One owner-authorized event → compile bounded DAG → explicit existing startMission RPC → SQL persists and processes bounded steps → independently verify → handoff. No polling loop, retry loop or provider discovery. Compiler never invokes the RPC itself. Existing DB kill switch blocks runs before execution. Pausing this new planner does not cancel an already-running SQL transaction. Per-mission cancel, durable extended metadata, human approval store and dynamic provider budgets require an agreed extension by the engine owner. No schema/permission/scheduler mutation is proposed here.

## Eleven departments and shared knowledge
`departmentSequence` supplies eleven **manual** templates with distinct deliverables: strategy, sales, operations, product, finance, legal, cloud/security, orchestration, Guardian, QA and knowledge. A sequence containing one returns WAITING_APPROVAL, never COMPLETED. Logical PM is coordinator, not a twelfth running model. Templates are on-demand contracts; no external chats are invoked.

Pass minimal versioned source IDs/hash, classification, freshness, approved decision ID and required output, not duplicated whole conversations. Cache by source SHA/version, invalidate on source change; do not reuse historical decisions as current. Private client data/credentials remain in authorized private storage. Technical public Issues contain sanitized reproduction only. Handoff fields: objective, authorizer/department, actual status, deliverable references, evidence, dependencies, pending decisions and next action. No undocumented API or new remote memory system.

## Providers and costs
Provider descriptors mean adapter availability only: subscription products are MANUAL; unverified APIs UNKNOWN; OpenRouter UNAVAILABLE. No balances queried or invented; measured token/spend/cost remain **no medido**. Paid or external-model actions have no executor in this compiler. Reuse existing AI guards if an approved adapter is later connected; explicit budget/permissions/staging/owner activation must all pass.

Official mechanisms reviewed20Nov2026: https://developers.openai.com/api/docs/guides/agents and https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt . Agents are explicitly built/invoked through supported tooling; independent Project conversations are not assumed API-addressable workers. No cookies, private endpoints, scraping or changes to the user's four ChatGPT automations. No new SDK/dependency installed.

## Reproduce
`node --test tests/omega-missions.test.cjs` and `NODE_PATH=./tests/qa/node_modules node --test tests/operations/mission.database.cjs`. The latter creates a disposable disk-backed PGlite DB, applies existing migrations, compiles three diagnostic steps, uses existing startMission, checks no business writes, replay-once, owner2 reads after DB reopen, outsider denial and kill switch. This is **local PostgreSQL-compatible/synthetic**, not hosted Supabase or two real account logins. No browser surface was changed. CI workflow is path-scoped, contents:read,10min cap, no secrets/schedule, outdated-run cancellation.

Rollback: remove additive planner/templates/tests/workflow; no business records or remote resource changes to undo. Next action: engine owner reviews compatibility and extended metadata/approval/cancellation gaps before any app adapter or live activation.

## Reconciliation checkpoint —20Nov2026

Claude merged #255 into main445143fe26f8b954422a458464385d1d562e13cb during this task. This branch merged that exact main without conflicts, preserving his recovery and48 local migration filenames matching the current ledger versions for the three newest records. Prior45-source-file notes above describe the initial5f99 checkpoint, not the current reconciled candidate. No Claude PR was merged by this task. New helpers remain additive; exact-head CI must approve after reconciliation.
