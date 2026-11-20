# Avalon Client Operations — reusable templates v1

**Status:** PROPOSED. **Refs:** #271, #46, #49, #237. This is a template, not a client record or confirmation of passing checks. Store completed copies **privately**, never commit client-specific content to a public repository.

## 1. Onboarding intake (website / e-commerce / CRM)

### Business and approvals
- [ ] Confirm existing canonical `crm_clients.id`; investigate apparent duplicates without linking by name
- [ ] Confirm relationship: prospect / contracted / historical / synthetic
- [ ] Identify decision-maker, delivery contact and approved communication method
- [ ] Verify quote/contract **version**, scope, exclusions, fees and payment terms
- [ ] Record explicit approval evidence in approved private system; don't assume signed/payment from a status label
- [ ] Record authorized delivery owner and client approval contact
- [ ] Confirm data/privacy, retention, material rights and confidentiality needs

### Shared content/assets
- [ ] Request brand logo (vector if available), colors and usage permissions
- [ ] Request approved business description, services, prices if relevant and FAQs
- [ ] Request approved photos, gallery and testimonials with necessary consent/licenses
- [ ] Confirm verified business hours, address/service area and contact details
- [ ] Obtain copy translations/languages, accessibility considerations and mobile priorities
- [ ] Confirm existing domain/platform ownership, delegated permissions and vendor payer
- [ ] Document unknowns, source-of-truth owner and due date **privately**

### Website-only
- [ ] Agree sitemap, page descriptions, CTA and form destinations
- [ ] Confirm SEO goals, analytics/consent scope and hosting responsibilities
- [ ] Confirm desired booking/contact flow; don't assume integration live

### E-commerce-only
- [ ] Confirm SKU/variant catalog, approved inventory/pricing and photos
- [ ] Confirm shipping, returns, tax handling and who signs off
- [ ] Confirm authorized payment provider/merchant ownership and PCI responsibilities
- [ ] Agree sandbox transaction/refund/notification acceptance cases

### CRM-only
- [ ] Define canonical client/lead/sale/work-order relationship and pipeline stages
- [ ] Define user roles, allowed access scope and authorization requirements
- [ ] Confirm data provenance, import consent, deduplication and export policy
- [ ] Define report/KPI source and integration contract; unavailable = UNKNOWN
- [ ] Agree negative authorization/RLS and cross-client reference tests

**Onboarding result:** READY / CONDITIONAL / BLOCKED. **Evidence ref:** [private link]. **Owner:** [assigned]. **Pending decisions:** [private list].

## 2. Project management card (private template)

| Field | Required source |
| --- | --- |
| Project name and type | Approved scope and existing `os_projects` mapping |
| Canonical client reference | `crm_clients.id`, confirmed without name matching |
| Lead / sale / work order refs | Existing record only when legitimately associated |
| Scope baseline and version | Approved quote/contract, private |
| Operational / technical owner | Named and authorized |
| Milestones and dates | Agreed with client; mark estimates separately |
| Dependencies and blockers | Assigned owner and decision |
| Status | No inference from sale/payment or product URL |
| Deliverables / change requests | Versioned `client_hud` where applicable |
| Acceptance criteria | Observable and explicitly agreed |
| QA evidence and deploy SHA | Exact artifact and independent checks |
| Support / payer / exit plan | Approved terms and provider responsibility |

**Task template:** `ID | title | owner | description | dependency | due date (confirmed/estimated) | acceptance criteria | evidence | state`.

**Change request template:** `CR-ID | baseline | current behavior | requested difference | defect vs extra scope | cost/time/security impact | approver | decision | release/QA receipt`.

**Review record template:** `artifact version | reviewer role | date | issues | decision: approved/changes/rejected | evidence`; silence isn't approval.

## 3. Delivery & acceptance checklist

### Universal technical gate
- [ ] All contractual deliverables compared to approved scope
- [ ] QA evidence attached to exact version/SHA, not a different candidate
- [ ] Critical paths pass in isolated environment and recover from errors
- [ ] Mobile and accessibility checked; physical iPhone Safari only if actually tested
- [ ] Owner/outsider and cross-client permissions tested where applicable
- [ ] Secrets, client materials and access transfers use approved private channels
- [ ] No P0/P1 defects remain; deviations evaluated and approved without security bypass
- [ ] Backup/recovery plan, domain ownership and paid resource eligibility confirmed

### Website
- [ ] Approved content, links, contact forms and CTA work
- [ ] Responsive, TLS/domain, SEO basics, accessibility and performance checked against scope

### E-commerce
- [ ] Catalog/variants, stock, cart and sandbox checkout verified
- [ ] Shipping/taxes/returns and transaction messages reviewed by merchant
- [ ] Payment account ownership and delegated provider permissions confirmed

### CRM
- [ ] Pipeline, CRUD, permissions, stage changes and client product links verified
- [ ] Import/deduplication, audit, data export and restore within scope verified
- [ ] Cross-client isolation and non-owner denial demonstrated in isolated DB

### Release, acceptance and support
- [ ] Client UAT done and dated approval from authorized person stored **privately**
- [ ] Explicit separate deployment approval received
- [ ] Post-deployment independent smoke test recorded at actual deployment artifact
- [ ] Admin/access handoff, docs, known limitations and support boundary delivered
- [ ] Ticket routing, warranty/maintenance, vendor billing and offboarding responsibilities assigned

**Final gate:** PASSED / BLOCKED / UNKNOWN. **Evidence location:** private record. **Client acceptance:** documented separately under reviewed legal conditions.

## 4. Pilot preparation: appointment-business website

- [ ] Identify verified decision-maker and real vs synthetic status
- [ ] Verify whether test record already exists; **do not mutate** without new approval
- [ ] No fabricated URL, assets, commercial agreement, stage or dates
- [ ] Website scope proposed and approved before implementation
- [ ] Request brand/copy/photos and verified hours/contact
- [ ] Draft project can have empty URL; `pending_delivery` does **not** mean published
- [ ] QA + UAT on exact version; owner-authorized go-live only after sign-off

**Pilot state at SOP creation:** PREPARATION ONLY / NOT BUILT. **Contract, budget, actual identity verification, integration availability, hosted preview and Safari result:** UNKNOWN / PENDING.

## 5. Pilot lessons-learned form

`date | stage | friction | measured effort (if known) | evidence | severity | proposed fix | owner | approval required | status`.

Never label a proposed improvement as tested, integrated or rolled out.
