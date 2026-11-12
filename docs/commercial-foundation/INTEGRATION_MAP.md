# Commercial Foundation — integration and overlap map

**Repository:** `avaloncoreagency/Avalon-code`.

| Need | Canonical source | Action in PR #167 | Outstanding |
|---|---|---|---|
| Service catalog | CRM `crm_service_catalog` and Service Factory PR #54 | Owner-only descriptions/pricing proposal | Review/approve canonical offers |
| Solution Planner | PR #59 | Independent margin estimate without writes | Integrate after review and owner approved costs |
| Proposals | PR #90 | No competing proposal table | Review private printable proposal flow |
| B2B Discovery | CRM Intelligence PR #160 and specialized PR #168 | Human playbook | Do not overwrite specialized templates |
| AI Comms | Existing hub and PR #164 | Industry knowledge *guidance*, pure access policy | Source ingestion, provider tests and approved knowledge |
| Funnels | Existing Growth PR #155, merged | Static campaign briefs | No live B2C funnel reuse |
| Lead Router | Not implemented B2C | Pure fail-closed eligibility evaluator | Tenant/contractor isolation, consent, routing, delivery, audit |
| Revenue | CRM sales and payments | Verified owner overview | Cash reconciliation and actual-cost accounting |
| Campaign spending | Meta Ads provider not connected | No external calls | Official permissions, budgets and approval |
| QA | GitHub workflows | New synthetic tests and 40-case plan | Full hosted/live acceptance |

## Do not cross these boundaries
- `crm_leads.audience = agency_b2b` is fixed by CRM Intelligence; do not insert homeowners from ads.
- Existing public funnel is B2B intake. Do not edit it to distribute B2C data to contractors.
- Existing admin financial totals are distinct from contractor invoices and cash collections.
- No new autonomous managers, HQ 3D or AI engines in this scope.

## Integration checklist
1. Re-read current main, branch heads and PR descriptions (avoid stale notes).
2. Review migration ledger before writing SQL.
3. Identify existing project, service and client keys; reuse instead of shadow copies.
4. Keep new B2C delivery feature disabled until Privacy/Legal/Owner approval and RLS tests.
5. Compare SHA-specific CI plus browser acceptance, then seek explicit merge approval.

## Rollback
No migrations or external provider writes in PR #167; reverting the PR removes its private guidance/tooling while leaving canonical CRM records unchanged.