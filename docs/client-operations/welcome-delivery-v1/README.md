# AVL-OPS-CLIENT-001 — Portable customer operations package (ES/EN)
**Version:** v1.0 · **Editorial owner:** Client Operations · **Approval:** `PENDING_REVIEW` · **Transport:** DOCUMENTS ONLY, not a deployed app or sent email.

This directory is an **immutable-for-review GitHub snapshot** of 12 complete bilingual editorial documents prepared in ChatGPT Space. GitHub is the portable handoff for Claude Code; it does not imply automatic synchronization between chats or deployment. The source documents are general templates; **no client records, passwords, signing evidence or financial information** are included.

## Index
| Document ID | Type | Service | Languages | Version | Approval | File |
|---|---|---|---|---|---|---|
| WP-001 | welcome | all | ES + EN | 1.0 | PENDING_REVIEW | [welcome-package.es-en.md](./welcome-package.es-en.md) |
| OB-WEB-001 | onboarding | website | ES + EN | 1.0 | PENDING_REVIEW | [onboarding.website.es-en.md](./onboarding.website.es-en.md) |
| OB-ECOM-001 | onboarding | ecommerce | ES + EN | 1.0 | PENDING_REVIEW | [onboarding.ecommerce.es-en.md](./onboarding.ecommerce.es-en.md) |
| OB-CRM-001 | onboarding | crm | ES + EN | 1.0 | PENDING_REVIEW | [onboarding.crm.es-en.md](./onboarding.crm.es-en.md) |
| OB-MKT-001 | onboarding | marketing | ES + EN | 1.0 | PENDING_REVIEW | [onboarding.marketing.es-en.md](./onboarding.marketing.es-en.md) |
| MN-WEB-001 | manual | website | ES + EN | 1.0 | PENDING_REVIEW | [manual.website.es-en.md](./manual.website.es-en.md) |
| MN-ECOM-001 | manual | ecommerce | ES + EN | 1.0 | PENDING_REVIEW | [manual.ecommerce.es-en.md](./manual.ecommerce.es-en.md) |
| MN-CRM-001 | manual | crm | ES + EN | 1.0 | PENDING_REVIEW | [manual.crm.es-en.md](./manual.crm.es-en.md) |
| MN-MAINT-001 | manual | all | ES + EN | 1.0 | PENDING_REVIEW | [manual.maintenance.es-en.md](./manual.maintenance.es-en.md) |
| MN-SUPPORT-001 | manual | all | ES + EN | 1.0 | PENDING_REVIEW | [manual.support.es-en.md](./manual.support.es-en.md) |
| EM-001 | emails | all | ES + EN | 1.0 | PENDING_REVIEW | [corporate-emails.es-en.md](./corporate-emails.es-en.md) |
| DEL-001 | delivery | all | ES + EN | 1.0 | PENDING_REVIEW | [delivery-and-acceptance.es-en.md](./delivery-and-acceptance.es-en.md) |

## Use and precedence
- The documents **must not be sent to customers** before Miguel/Samuel editorial approval and Legal & Compliance review where applicable. Contract terms, warranty, retention, support SLA and terms of acceptance are governed only by the properly approved signed agreement.
- These are **bilingual documents, not evidence of delivered functionality**. A client-specific issued manual must be tailored to the actual product, approved scope and verified product version.
- Keep this material distinct from `src/lib/comms/email.ts`, `src/lib/onboarding/model.ts` and `src/lib/docs/manual.ts`, which Claude maintains. This branch changes no application, infrastructure or DB files.
- `corporate-emails.es-en.md` includes 10 event templates (20 bodies), some of which lack native renderer or outbox kind; **do not add migrations or dispatch without a separate reviewed design.**
- Invoice, contract signing and payment remain separate from onboarding and delivery. Delivery requires QA, actual deployment evidence, client UAT, authorized recipient, secure credential transfer and legal gate.
- Radar, AI Receptionists, commercial chatbots and OpenRouter remain suspended. No ads or paid services activated.
- For machine-readable indexing, see `manifest.json`. For Claude's precise reuse mapping and gaps, see `INTEGRATION_HANDOFF.md`.

## Sources and handoff
- [Operational Space hub](https://chatgpt.com/space/page_cc9b7099347c8191b85e09872ca8a6ab)
- [Space manifest for Claude](https://chatgpt.com/space/page_1d13575295108191b056c0ebce1448de)
- [PM coordination #304](https://github.com/avaloncoreagency/Avalon-code/issues/304#issuecomment-7148345604)
- [Legal release gate #286](https://github.com/avaloncoreagency/Avalon-code/issues/286)
- [Client experience #344](https://github.com/avaloncoreagency/Avalon-code/pull/344), [Lifecycle emails #348](https://github.com/avaloncoreagency/Avalon-code/pull/348), [Manuals #351](https://github.com/avaloncoreagency/Avalon-code/pull/351).

**Validation:** authored editorial copy ES/EN, source readback and GitHub snapshot; `NOT_RUN` for client send, UAT, physical Safari, real product manual issue, or integration into app. No presumed GO for merging or external use.
