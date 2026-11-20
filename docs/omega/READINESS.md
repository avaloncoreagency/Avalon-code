# OMEGA P0/P1 — independent evidence gates · Refs #256

Base main5f99d05, 20 November 2026. No production, staff, financial or hydration implementation changes.

`node scripts/omega/readiness.cjs <private-evidence.json>` reviews receipts offline. It does not fetch providers, deploy, run SQL, infer credentials or authorize a release. Exit2 = blocked, exit1 = malformed input. The caller supplies trusted evidence; this is not cryptographic attestation. Every required receipt must have the exact candidate SHA, an isolated environment, one unambiguous successful observation and a timestamp within24h. Hosted two-owner persistence, tenant isolation and backup/restore are separate required evidence; unit green cannot replace them. Schema/body correspondence must be independently reviewed: equal migration counts are insufficient. No savings/latency claims.

## Verified current differences
- GitHub main and Graphify both5f99d05. #254 head93aafb1 has all three workflows successful, including its full browser step (inspect exact job logs before changing any existing test). Historical local managers timeout remains in its report, not a verified current CI failure.
- Read-only production ledger now48 entries, last20261120130358 project_bridge_rls_initplan. main has45 local files ending crm_quoting_studio. Newly recorded remote migrations: os_product_delivery_guard, public_inquiry_services_guard, project_bridge_rls_initplan. Claude's active branch contains matching named source files, with different local timestamps. This is a source/deployment reconciliation requirement, not proof that production is broken. No migration was applied by this task. Do not blindly change the production marker on main; Claude owns reconciliation.
- Claude branch8f8c390 includes recovery of #227/#249–252/#254, product delivery, pipeline and React418 changes. Do not merge those again from Codex or edit those paths. Samuel#233 remains excluded. No claims of acceptance based on Vercel READY.

Next action: Claude/integrator reconciles exact candidate source/schema/deployment receipts. Codex supplies independent negative gates and synthetic tests; owners accept hosted operation only after the evidence is complete.
