# Planning compatibility #260 / #277 — Refs #291

20Nov2026 · base main207ed3a. This own review branch combines the exact sources #260@07d5950e and #277@851f7f62. No remote source branch was changed, no main merge/deploy, and no Guardian PR/code was imported.

## Reproduced failure
The original gate fails on `department-templates.ts imports ./mission-plan`. This is a pure library-to-library declaration edge for DEPARTMENTS / Department / MissionTask, not an app entry point or SQL invocation. Additionally, the original walk checked EXCLUDED_FILES only for directory recursion arguments: ordinary files were returned without consulting the set. The intended exclusion was therefore ineffective. Blanket exclusion would hide future unsafe dependencies, so it was not used as the correction.

## Change and negative acceptance
`scripts/operations/planning-boundary.cjs` inspects static import/export/require/dynamic/type references with TypeScript AST. It permits only the exact template→plan named-declaration edge. No namespace/default/reexport/call/extra-symbol exemption. Both draft files are scanned, not skipped. Their imports are restricted to the existing pure CAPABILITY policy and node:crypto for hashing; network, SQL/RPC, process environment and shell-like effects are tripwires. App, library **and component** consumers remain blocked, including type-only references. Fixtures preserve all original import patterns and add attempted activation/side-effect cases. This is a static tripwire, not proof against every dynamic-JS technique or an Auth/RLS/security attestation.

The compiler itself and existing SQL engine are unchanged. Plans remain PAUSED by default; synthetic tests can compile an explicit bounded DAG, invoke existing SQL in disposable PGlite, store/reopen/replay, reject an outsider and respect kill switch. Human department tasks remain manual. No paid provider, ChatGPT chat, Radar, new runner, API, scheduler or public runtime adapter was added.

## Gates that stay closed
Planning needs no Guardian signature service. A live adapter still requires trusted owner identity, independently verified durable receipts/approval, exact client scope, bounded budget/attempts, revocation/kill controls and negative hosted tests. Unsigned JSON handoffs are not authentication or execution authorization. Existing evidence contracts do not claim authenticity. Missing signed evidence remains BLOCKED when such evidence is required; no replacement signing service was invented. Do not pass null/default SQL steps from this planner or enable the existing internal writer implicitly.

Root red/green logs and exact SHA results accompany the report. No import was added to app/components; no SQL/Auth/production/secret or Guardian#261/#267/#287 change. Rollback: revert this additive planning integration, retaining the original activation block until a replacement is reviewed.

Next action: integrator reviews this standalone planning integration instead of merging #260/#277 separately; activate nothing. Accept live execution only after its separate owner/receipt/security gate is implemented and verified.
