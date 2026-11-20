# Guardian v1 — signed receipt provenance preflight (review-only)

Issue #285; depends on draft Guardian PR #267, which depends on #261. This is **not** a live monitor, incident database, ticket writer, repair executor, production deployment or autonomous service.

## Threat and control
An offline `Observation` is caller-supplied data. A model, user or ticket cannot establish that a check actually ran simply by filling `observerId`, `code` and `observedAt`. The existing `verifyRecovery` checks scope/time/runbook requirements, **not** authenticated provenance. It must not be used alone to close, approve or claim a real recovery.

`preflightSignedRecovery` is an additive server-adapter candidate. It requires signed ORIGINAL failure receipts **and** signed subsequent health receipts. It validates:
- Registered, active monitor with matching owner-provided tenant/client, project, target, observer ID, key version and >=32-byte HMAC-SHA256 key.
- A deterministic, versioned domain-separated signature over incident ID, registered target ID, key version and all six structured observation fields. Invalid signatures fail closed using a constant-time comparison.
- Exact equivalence of the original incident's observations and the signed failure receipts; bounded arrays and distinct receipt IDs across the whole request.
- Existing Guardian recovery policy: confirmed persistent availability incident, 5xx/timeout-only failures, two later healthy checks from a different observer, tenant/project boundaries, timestamps and independence.
- No ticket text, URLs, shell commands, log bodies or model-generated approval instructions enter the signed payload or any execution path.

The only possible positive status is `SIGNED_EVIDENCE_CANDIDATE`; it always returns `closeAuthorized:false` and `replayLedgerVerified:false`. A negative or malformed batch returns `UNVERIFIED`. **Candidate is not a verified live recovery, incident closure, SLA outcome or deployment approval.**

## Stable v1 signing payload
UTF-8 JSON.stringify of this ordered array:
```text
[
  "avalon-guardian-receipt-v1",
  incidentId, targetId, keyVersion,
  observation.id, observation.clientId, observation.projectId,
  observation.code, observation.observedAt, observation.observerId
]
```
HMAC-SHA256 digest encoded as 64 lowercase hexadecimal characters. No secret is embedded in the signature or response; test fixtures use disposable synthetic keys only. Production signing and transport are NOT implemented.

## Server integration gates (all PENDING)
1. CLOUD & SECURITY must review authenticated monitor enrollment, tenant/asset ownership and per-monitor secret custody. Supply registry and target only from authoritative server-side storage. **Never accept a caller-provided registry, key, target or successful preflight claim as authorization.**
2. Add an append-only authoritative receipt ledger with globally unique IDs, persistent anti-replay/nonce enforcement, issuer identity, key rotation history, recorded timestamps and explicit retention. The present helper rejects duplicates **within a batch only**, not across API requests. Signing keys must remain server-side and private.
3. Register each monitor to one allowed target and check type. Constrain outbound probes with DNS/redirect/private-address protections, request quotas, timeouts, data minimization and fixed host allowlists. No network adapter exists here.
4. Implement separate domain-specific acceptance for login/authorization, forms, deploy integrity and rollback. Generic healthy HTTP evidence must **never** verify those runbooks.
5. Enforce verified owner membership, RLS, version-predicated writes, independent QA, manual approval and audit history before connecting to `saveProductOperation` or AI ORCHESTRATOR. A signed receipt is not a permission grant.
6. Run local isolated tests, CI on exact SHA and authenticated hosted Preview tests before considering release. No current commercial SLA or 24/7 monitoring claim.

## Current evidence and rollback
Offline synthetic tests: `node --test tests/guardian-trusted-evidence.test.cjs` after project dependencies are available. The test covers tampering, wrong target/incident/client/project, disabled/rotated/missing monitors, short keys, duplicates, missing receipts, self-verification and non-availability runbooks. Independent local preflight tests are not a deployed security attestation.

Rollback: remove the additive `trusted-evidence.ts`, its tests and this document. No migrations, secrets, external resources, customer data, app routes or permissions were changed.

Next action: reviewer validates exact-head test/CI, then CLOUD & SECURITY decides whether a dedicated server monitor/receipt registry and durable replay ledger can be designed safely without duplicating Dev Bridge or existing product requests.
