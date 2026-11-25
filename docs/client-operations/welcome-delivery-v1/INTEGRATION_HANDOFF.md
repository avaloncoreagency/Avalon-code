# Integration handoff — Claude Code / Content only
Mission: **AVL-OPS-CLIENT-001** · Version **1.0** · Status **DOCS PREPARED / APP INTEGRATION NOT_RUN**.

The 12 complete bilingual documents are linked in [README.md](README.md) and machine-indexed in [manifest.json](manifest.json). This is a **copy for a developer**, not an instruction to modify files outside Claude's assigned area. Content was produced by Client Operations; actual product/contract/client facts must be provided privately during issuance.

## Existing implementation (reuse, do not duplicate)
| Source doc | Existing technical owner & path | Integration rule |
|---|---|---|
| WP-001 & welcome copy | Claude · `src/lib/comms/email.ts` / `renderClientWelcome` | Use verified recipient/service/representative; include only actually issued documents; invoice copy only if a real valid invoice exists |
| Four OB-* | Claude · `src/lib/onboarding/model.ts` / `checklistFor(product)` | Enrich instructions only; don't invent `ChecklistItem.key`, a new DB state, or an independent client record |
| Five MN-* | Claude · `src/lib/docs/manual.ts` / `buildManual`, `renderManualPdf` (generator `avalon-manual-2`) | Adapt only to features actually delivered. Private PDF snapshot, hash, owner authorization; no passwords |
| EM-001 | Claude · `renderClientWelcome`, `renderLifecycle`, `renderDocumentDelivery` | Keep one approved outbox and frozen content. Emails about materials, approval and maintenance lack a confirmed native event `kind`; editorial only until separately scoped |
| DEL-001 | Claude · `deliveryBlockers()` | Existing gate covers checklist, QA, HTTPS URL, manual, contract link, recipient. Verify signed contractual validity, UAT, go-live authorization, postrelease and secure credentials separately |

## Confirmed integration gaps requiring independent decisions
1. **Marketing deliveries without public URL:** existing `deliveryBlockers()` requires a real HTTPS `liveUrl` even for campaigns/strategy deliverables. Need Product + Claude rule by service, not fabricated URLs or bypasses.
2. **Contract link is not signed legal acceptance:** `contractLinked` cannot certify valid assent or signatory authority. Legal #286 and real contract version must be checked.
3. **Approval != publication:** separate client UAT decision, deployment GO, deployed SHA, postrelease smoke and delivery receipt. Do not treat a preview/build as delivery.
4. **Contact channels:** the documented support/email default is already in implementation; outgoing SMTP readiness, business phone and hours must be verified in live settings before messages. No 24/7 SLA assumed.
5. **Content vs product manuals:** remove any feature that is not in a real client's product; provide verified screenshots, actual URL, role matrix and vendor settings only privately when issued.
6. **Legal:** MSA v1.2 is attorney-review-required, not approved for new external commitments; consult the release matrix from Legal and #286.

## Acceptance checklist for importer
- [ ] Compare current `main` and open Claude PRs first; do not modify overlapping implementation on this branch.
- [ ] Review editorial language ES/EN and correct only needed content drift; preserve 10 event subjects and bodies.
- [ ] For each `manifest.json` row decide: existing renderer supports it / editorial-only / requires separate product proposal. No silent new kind, enum, migrations or paid service.
- [ ] Render at least one synthetic example per supported service, both languages, verifying legal placeholders absent, no private content, no misrepresented features.
- [ ] Block sending without owner approval, actual SMTP, real recipient, valid stage and required contract evidence.
- [ ] Securely issue any customer-specific manual only after product acceptance; maintain hash/private ACL.
- [ ] Obtain legal review and exact SHA QA independent before integration/production. Capture what was **actually tested**.
- [ ] Return a gap report to PM with URLs, SHA, tests, approvals and explicit pending decisions.

**No code, DB, SMTP, customer record, contract or production operation is performed by this docs-only delivery.**
