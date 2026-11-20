# Avalon Core Agency — Client Operations SOP v1.0

**Status:** PROPOSED / review only. **Owner:** Client Operations. **Issue:** #271. **Scope:** websites, e-commerce, custom CRM. **Source baseline:** `main@207ed3a3dc8fdae5dd949a7361733e441c530519` (2026-11-20).

## Purpose and operating guardrails

Manage a client from first authorized conversation through delivery, acceptance, support and offboarding without confusing commercial progress with technical completion. This is a **human procedure**, not a deployed workflow, executed automation, customer portal, legal agreement or proof that integrations exist. Miguel and Samuel approve financial, contractual, client-data and deployment decisions.

**No client information or credentials in this public repository.** Store client-specific requirements, contracts, assets, approvals, domain information and support tickets only in approved private systems. Do not ask clients to send passwords; use delegated access and scoped secrets. Never add fictional URLs, fees, revenues, customer records or acceptance receipts.

## Canonical record mapping — reuse rather than duplicate

| Meaning | Existing canonical reference | Operational rule |
| --- | --- | --- |
| Business/client | `crm_clients.id` | Do not deduplicate by company name; creating a profile is not proof of sale |
| Lead / opportunity | `crm_leads` (stage stored at `stage_id`) | Preserve lead stage history; no automatic `won` just for creating a client |
| Confirmed sale | `crm_sales` and `crm_sale_lines` | Confirmation belongs to existing server-side sale gate; signed contract is not payment |
| Work order | `crm_work_orders` | Reuse sale-line idempotency, not a second work-order system |
| Project/product | `os_projects` with canonical `client_id` | A `draft` without URL means *not built*; saved external URL means *reference*, not verified publication |
| Tasks and audit | Existing `crm_tasks`, `crm_timeline`, and project HUD operations | Don't launch a parallel task database or self-certified audit |
| Client-facing sign-off | Private approval evidence, method to be reviewed by Legal | Internal checklist alone is not legally sufficient |
| Maintenance and tickets | Existing client-product requests where appropriate | Do not claim autonomous Guardian, SLA or 24/7 availability until verified |

**Implementation provenance:** #237 documents already merged linkage and draft/URL changes (#241, #242, #243, #246, #247). Reverify current code, hosted authorization and deployment before treating that functionality as accepted. #49 describes a future Delivery Engine; this document does **not** imply its completion.

## Responsibility matrix

| Phase / gate | Responsible (R) | Accountable approval (A) | Consult (C) |
| --- | --- | --- | --- |
| Discovery and qualification | Sales & Marketing | Designated commercial owner | Client Operations |
| Scope, pricing, proposal | Business Strategy / Sales | Miguel or Samuel per agreed authority | Finance, Product Studio |
| Contract / privacy / rights | Legal & Compliance | Authorized signer(s) | Client Operations |
| Onboarding and scheduling | Client Operations | Assigned project owner | Product Studio, client contact |
| Technical design/implementation | Product Studio | Technical delivery owner | Cloud & Security |
| Independent QA / UAT | Quality Assurance; client for UAT | Authorized acceptance signatory | Client Operations |
| Deployment | Technical owner | Express owner/client authorization as applicable | Cloud & Security |
| Handoff / maintenance / closure | Client Operations | Assigned project owner | Guardian only when implemented |

Responsibilities are **proposed**, not current staffing assignments.

## Lifecycle and gates

### G0 — Qualify prospect (Sales)

Capture only permitted details: company/business contact, industry, objectives, pain, capacity, decision-maker, target date, budget range if volunteered, existing tools, consent and communication preferences. Check existing CRM references before making a new entity.

**Pass:** commercial fit and next step documented. **Block:** uncertain identity, disallowed outreach, duplicate unresolved, or no decision-maker.

### G1 — Discovery, quote and contract

Record scope, deliverables, exclusions, revisions included, client dependencies, proposed milestones, project fees, recurring charges, third-party payers, change-control, support boundary, data duties and acceptance criteria. Finance and Strategy must approve prices; Legal validates contract language. For commission-based offers, define verifiable attribution, adjustments, payable events, disputes and audit rights before promise/signature. No invented percentages.

**Pass:** versioned and accepted scope, reviewed contractual terms and internal financial authorization. Silence is not approval.

### G2 — Onboarding and content readiness

Use `ONBOARDING_AND_DELIVERY_CHECKLISTS.md`. Request brand logos, copyright permission, copy, images, approved business facts, service/product catalog, contact details, domain owner, integration requirements and delegated access. Track missing materials with owner and due date; never insert real data from this document.

**Pass:** essential inputs sufficient to plan work and explicit list of remaining dependencies.

### G3 — Kickoff and work planning

Assign accountable operational and technical owners. Create a project plan linked to a canonical client and, when applicable, existing sale line and work order. Plan tasks, deliverables, dependencies, review slots, risk, estimated cost, acceptance evidence, rollback and support ownership. Unconfirmed dates remain estimates.

**Pass:** owners and baseline requirements identified, blockers tracked and implementation authorized.

### G4 — Produce and review

**Website:** page map, mobile-first UI, contact/lead forms, content, basic SEO, privacy, accessibility and performance according to agreed scope.
**E-commerce:** products/variants, catalog, inventory, sandbox checkout, authorized payment provider, fulfillment/returns, taxes and transactional messages with business-provided rules.
**CRM:** data model, lead stages, owner/staff permission scope, RLS, import permissions, deduplication, audit, exports/backups and integrations within contract.

At agreed milestones, present version/revision, compare against agreed acceptance, record feedback, owner and decision. A change request must show **expected vs actual scope, reason, cost, schedule, privacy impact and approval**. Defect correction is not automatically billable scope change. Do not enact a change before authorization.

**Pass:** implementation evidence at exact revision; agreed reviews complete or pending items explicitly blocked.

### G5 — Independent QA and UAT

Perform synthetic tests and read-only checking before customer-facing acceptance: navigation/responsiveness, accessibility, critical user paths, server-side authorization, client A/B data separation, external link safety, invoices/payments where applicable, error recovery and concurrency. Test payment **sandbox only**. For CRM, test RLS and non-owner denial in isolated environment. For live-device acceptance, test actual iPhone Safari; Chromium emulation cannot be described as real Safari. No P0/P1 defect release.

**Pass:** QA evidence associated with exact artifact/commit, client UAT and authorized sign-off; exceptions logged without mislabeling critical failures as accepted.

### G6 — Publication authorization and verified delivery

Before production: named deploy approver, correct domain/account ownership, environment and data isolation, DNS/email record precautions, backup/rollback preparation, budget and supplier eligibility; confirm deployment artifact exact SHA. **Publishing needs a separate express authorization.** A successful build or a stored HTTPS URL alone does not establish availability or client acceptance.

After deployment: independent smoke checks, TLS, forms, order flow when contracted, monitoring setup when actually connected, documentation, access handover via secure mechanism, and dated acceptance evidence.

**Pass:** deployed behavior verified and accepted, known issues/limitations handed over, support scope confirmed.

### G7 — Aftercare, support, renewal and exit

Track incidents with ticket, affected product/client reference, severity, reproduction, owner, authorization, logs from permitted sources, solution, independent verification and closure. Distinguish contracted maintenance from warranty, feature request and third-party outage. Set SLA only when Legal/Strategy authorize and real staffing/monitoring exists. Record renewal date, who pays providers and ownership for backups, domains and account access.

Offboarding: owner-authorized export/retention, domain and credentials transfer/revocation, future billing review, verified backups, and deliberate irreversible deletion only with separate approval.

**Pass:** support and retention responsibilities recorded; never silently delete data or cancel resources.

## Operational controls

- **States:** opportunity stage, contract status, sale status, payment status, project status, product publication status and ticket status are independent; do not derive one from another.
- **Change request:** `CR-ID | client/project UUID reference (private) | scope baseline version | request | classification defect/new scope | cost/time impact | approver | status | implementation/QA evidence`.
- **Decision log:** `date | topic | options | approver | decision | artifact version | follow-up`; private client details excluded from public logs.
- **Quality gates:** failure stops the next irreversible step. Unverified means **UNKNOWN**, never `passed`.
- **Cost gates:** no paid tools, new accounts, external outreach, production changes, automations or credits without owner approval.

## Pilot: appointment-based local business (anonymized reference)

**VERIFIED from the pilot brief:** The website has not yet been created. No website URL, approved scope, signed agreement, approved pricing, actual client status or delivery dates are established by this SOP.

**P0 decision only:** confirm whether this is a synthetic example, qualified prospect or legally contracted customer; check potential existing test record under authorized owner session without creating/deleting/changing it. Do not infer lead stage or a sale from a `crm_clients` profile.

**Proposed MVP if approved:** mobile-first homepage, services, approved photos, validated hours/contact, primary booking/contact CTA, basic SEO and accessibility. Booking/payment integrations are **out of scope unless separately approved**.

**Sequential gates:** discovery -> content checklist -> signed scope/contract if required -> design review -> approved development -> isolated QA -> customer UAT -> separately authorized deployment -> verified handoff -> support plan. Until a real site exists, project may be a **draft without URL**, never a fictional external reference or published product.

**Pilot acceptance:** canonical identity maintained; no duplicate lead/sale; required approvals stored privately; source and deployment evidence compared; genuine mobile/Safari and owner-access tests documented; contract/support obligations understood. No measured outcome claimed in advance.

## Handoff and review

This SOP complements #46 (Service Factory) and #49 (Delivery Engine) and does not supersede them, or the actual CRM/contract rules. PRODUCT STUDIO must approve production/quality standards. LEGAL & COMPLIANCE must approve service/acceptance/warranty language. BUSINESS STRATEGY and FINANCE must approve commercial terms and KPIs.

**Status:** PROPOSED; no production, CRM, Supabase, GitHub merges or deployments authorized by this document.

**Next action:** reviewers approve or request amendments in #271, then decide whether and how to integrate the SOP into the existing private Avalon UI in a separately scoped implementation issue.
