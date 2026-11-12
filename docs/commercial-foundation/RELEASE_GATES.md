# Commercial Foundation — Release gates

## Installed in draft PR #167
- Owner-only pricing and commission estimate page (local computation, no data writes).
- Read-only commercial catalog (proposed prices, not sellable SKUs).
- Owner-only sales playbook, industry discovery and AI knowledge briefs.
- Static campaign drafts, no external Meta integrations.
- Read-only overview using `crm_sales_metrics` and existing canonical CRM counts.
- Pure B2C decision policy and case state machine; synthetic owner-only router simulator.
- **New additive owner-only B2C policy/request/audit schema in migration file**, not yet applied to any remote database.
- Negative regression tests and `QA_ACCEPTANCE.md`.

## Explicitly unfinished
- Owner-approved prices, contracts, margins and valid legal referral/commission arrangements.
- Service Factory #54, Planner #59 and proposal #90 integration; they have their own outstanding review.
- B2C schema and RLS are drafted for isolated PostgreSQL tests; deployment verification, legally reviewed privacy/consent, public intake, idempotent delivery, tenant-specific contractor access, human reassignment and billing remain unfinished.
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
4. `NODE_PATH=tests/qa/node_modules node --test tests/commercial-b2c.database.cjs`
5. `npm run typecheck`
6. `npm run lint`
7. `npm run build`
8. Verify GitHub Actions by exact SHA and review any failed steps.
9. Preview isolated from production, iPhone and browser owner checks.

## Rollback
This PR now includes a **new additive SQL migration file**. It has NOT been applied to production. Do not merge/deploy that migration without review and backups. Reverting this PR before deployment removes the pending code and SQL without touching remote data. If later applied, rollback is a separate owner-authorized database change: preserve/export all B2C records first, assess FK references and retain audit evidence before dropping tables. Never run destructive rollback automatically.