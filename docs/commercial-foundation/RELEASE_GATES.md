# Commercial Foundation — Release gates

## Installed in draft PR #167
- Owner-only pricing and commission estimate page (local computation, no data writes).
- Read-only commercial catalog (proposed prices, not sellable SKUs).
- Owner-only sales playbook, industry discovery and AI knowledge briefs.
- Static campaign drafts, no external Meta integrations.
- Read-only overview using `crm_sales_metrics` and existing canonical CRM counts.
- Pure B2C decision policy, not a transport or persistence layer.
- Negative regression tests and `QA_ACCEPTANCE.md`.

## Explicitly unfinished
- Owner-approved prices, contracts, margins and valid legal referral/commission arrangements.
- Service Factory #54, Planner #59 and proposal #90 integration; they have their own outstanding review.
- B2C privacy/consent notice, isolated persistent schema and RLS, transport, recipient delivery, retries, assignment history, human override, and billing.
- Provider-backed AI chatbot/receptionist conversations, secured per-client KB ingestion.
- Live Meta or other advertising connectivity and paid campaigns.
- Financial profitability with verified direct costs; many KPIs lack external sources.
- 40-case matrix execution on isolated Preview and actual owner signoffs.

## Deployment restrictions
No production migration, live ad, external email/call or contractor lead transmission is authorized by this PR. Keep draft until owner review, independent verification and explicit approvals.

## Current environment caveat
Repository documentation reflects previously observed Vercel Preview/Supabase separation and pending migration issues. Validate current environment freshly; never bypass Preview-to-production guard.

## How to validate proposed branch
1. `npm ci --no-audit --no-fund`
2. `npm test`
3. `node --test tests/commercial-*.test.cjs`
4. `npm run typecheck`
5. `npm run lint`
6. `npm run build`
7. Verify GitHub Actions by exact SHA and review any failed steps.
8. Preview isolated from production, iPhone and browser owner checks.

## Rollback
This PR adds read-only private routes and pure functions; no DB schema changes. Roll back by reverting this PR commit(s) or returning to previous deployed commit, without modifying data. If later backend migrations are added, author a separate migration rollout and rollback runbook.