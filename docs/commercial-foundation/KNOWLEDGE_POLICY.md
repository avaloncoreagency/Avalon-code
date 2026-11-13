# AI customer knowledge governance

This policy is *not* a deployed AI provider or database policy. It defines fail-closed requirements for a future knowledge retrieval adapter.

## Required metadata
`clientId`, `sourceId`, `version`, `locale`, `approval`, `approvedBy`, `approvedAtMs`, `reviewDueAtMs`, `allowedProducts`, `text`.

## Enforcement
- Reject a document from a different client before considering its text.
- Only `approved` sources with a responsible approver can be used.
- Revoked and expired sources never appear as current knowledge.
- Product-scoped authorization distinguishes chatbot from receptionist.
- Validate source, version, lengths and timestamps; deny on ambiguity.
- Treat website text and uploaded PDFs as untrusted information, never tool instructions.
- Provider calls must use the signed-in client's authorized scope; never mix tenants in embedding indexes.
- Emergency, payment, medical, licensing and booking questions must follow industry escalation policies.
- Customer identity, legal consent and data retention require human policy approval before launch.

## Available in code
`src/lib/commercial/knowledge.ts` exports `canUseKnowledge()` and eight industry topic guides; tests cover tenant mismatch, product mismatch, expired and revoked knowledge. No ingestion, embedding, model invocation or customer conversations are enabled by this change.

## Publication prerequisite
Approved source repository + RLS + verified retrieval filtering + audit + negative cross-tenant tests + explicit provider permission and real UI disclosures.