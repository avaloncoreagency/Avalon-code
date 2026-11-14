# Avalon Contracts — release checklist (draft)

**Branch:** `feature/client-contract-pdf-20261114` · **PR:** #187 · **Version:** ACA-MSA-1.1-2026-11

## Purpose and truthful status
Avalon Contracts adds an owner-only **Generate Contract** action to CRM → Clients → Client 360. Each submission records the legal contracting party, verified-in-CRM client name, project-specific SOW, fees, commissions and service schedules. It stores an immutable JSONB snapshot with its SHA-256 checksum and generates a private, downloadable PDF. It **does not sign, accept, send, charge, or activate** any contract. The separate CRM lead contract workflow remains authoritative for a verified signed agreement before a lead may become Won.

Avalon Core Agency has **not been formed as an LLC/corporation**. The brand is not by itself a legal person. Owners must select a truthful contracting form: one natural person, two natural persons signing individually, or a genuinely formed business entity. Enter the real legal name(s), *not* just “Avalon Core Agency.” If conducting business under another name, check Florida fictitious-name (DBA) requirements **before** operating. Do not assert a partnership or split of ownership without independent verification; under Florida law, joint operation for profit can form a general partnership even without a filing. Registration and liability facts require local counsel.

Relevant official sources (verify current statute when using):
- [Florida fictitious names / Section 865.09](https://www.flsenate.gov/Laws/Statutes/2026/865.09)
- [Florida partnership formation / Section 620.8202](https://www.flsenate.gov/Laws/Statutes/2026/620.8202)
- [Florida electronic transactions / Section 668.50](https://www.flsenate.gov/Laws/Statutes/2026/668.50)
- [Florida interest and usury / Section 687.02](https://www.flsenate.gov/Laws/Statutes/2026/687.02)

## Included terms for lawyer review
1. B2B scope, SOW precedence and explicit change orders.
2. Client cooperation, milestones, review period and reasonable defect cure.
3. Setup/recurring fees, separately approved ad spending, payment disputes, modest **simple** late interest capped by law, written notice/cure, noncritical-work suspension, termination and final accounting.
4. No guaranteed leads, revenue, SEO ranking, ad account approval, AI accuracy or uptime; commercially reasonable quality warranty for specifically scoped work.
5. Background IP retained, transferable paid custom work assigned only when specified, documented third-party licenses.
6. Limited, reciprocal liability allocation, confidentiality, approved subprocessors, account ownership, data security, third-party platform risks, disputes and notice.
7. Product-specific schedules for websites, e-commerce, CRM, Ads, SEO, AI receptionists, AI chatbots, lead generation and automations.
8. Special review: privacy/TCPA, call recording, FTC claims, platform advertising, exclusive lead routing, consumer protection, merchant-of-record duties, commission attribution, enforceability of fee-shifting and forum clauses.

**No legal clause can promise immunity from suit or collection risk.** Counsel must evaluate validity and regulatory requirements for actual clients and industries. The draft PDF is watermarked as unapproved/unsigned.

## Technical architecture
- UI: `/admin/workspace/crm/clients/[id]/contracts`, with legal-form choice and project SOW.
- Write action checks owner membership and real CRM client ID and validates all inputs.
- New immutable `crm_client_agreement_drafts` table, owner-only RLS, no UPDATE/DELETE grant, per-client checksum deduplication.
- Snapshot stores the **exact frozen legal clauses and service schedules** with the data. JSONB canonicalization permits hash validation after key reordering.
- Download endpoint checks owner session + both UUIDs + matching client + checksum before returning private no-store PDF; no public file URL.
- No new paid providers, external API, mailing, e-signature, payments, or change to CRM signed-contract state.

## Completion / release gates
- [ ] Check HEAD against current `main` and concurrent Codex/Claude PRs; reconcile conflicts, particularly Client 360 page.
- [ ] All project CI checks green on exact final commit.
- [ ] Isolated migration tested on a clean synthetic database with select/insert owner allowed, anon/non-owner denied, UPDATE/DELETE denied, duplicate writes handled.
- [ ] Real PDF parsed/rendered and inspected, including long text, accented Latin names, many sections and multi-page output.
- [ ] Sign in to isolated Preview as each owner; save, reload, download, repeat, and check cross-client privacy; verify iPhone Safari.
- [ ] Actual legal contracting party/name, address, notices, governing venue, insurance and service annexes checked by qualified Florida lawyer.
- [ ] Explicit owner authorization for merge and separate production migration only after backup/rollback verification.

**Do not deploy, sign, email, invoice, or publish the agreement as legally approved until all gates are met.**
