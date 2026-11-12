# Avalon Security Recovery — Checkpoints 2026-11-12

Status: **PARTIAL / NOT READY FOR MERGE**. No production changes were made.

## Evidence gathered

- Read-only Supabase advisor scan: 2 RLS/no-policy INFO records (confirmed deny-all), 1 `pg_net` warning, 4 anonymous `SECURITY DEFINER` functions (public inquiry, read-only AI switch, 2 bridge token RPCs), 36 authenticated `SECURITY DEFINER` warnings, and leaked-password protection disabled.
- Read-only PostgreSQL inspection: 37 public definer functions. `anon` can execute 4; `authenticated` can execute 36. CRM/Office functions contain owner guards. Bridge and Code Exchange functions use token authorization or `os_private.is_owner()`; individual dynamic authorization checks remain outstanding. This is **not** a substitute for negative tests with an actual non-owner JWT.
- The two no-policy RLS tables have no direct SELECT grants to `anon` or `authenticated`.
- `crm_public_inquiry(jsonb)` validates payload size and fields, includes a honeypot, and enforces database throttles. Keep public quote intake operational while reviewing abuse.
- Repo visibility is public. GitHub security workflow was successful at integration commit `60d5b89`; CRM head `615ca83` had four successful workflow runs in the observed response. Those workflows ran before this PR.
- Vercel active firewall configuration query returned 404. **UNKNOWN**, not proof of an absent firewall.
- Vercel project latest deployment reported ERROR, consistent with the documented Preview isolation guard. A healthy production build was not established by this audit.

## Checkpoint A: completed

1. Reviewed source register, security dashboard, risk docs, CRM integration status, code quality workflow and recent PR metadata.
2. Compared advisor warnings to read-only PostgreSQL object access.
3. Classified intended restrictions separately from unverified and open risks.

## Checkpoint B: committed

1. Expanded `src/lib/security/findings.ts` to R-25 with dated evidence.
2. Updated `src/app/admin/security/page.tsx`: open-risk totals exclude already implemented controls, which now have their own count. Database connectivity is explicitly **not RLS validation**.
3. Added `tests/security-reporting.test.cjs` as a regression guard.

## Checkpoint C: required before merge

- Run `node --test tests/security-reporting.test.cjs tests/security.test.cjs`.
- Run `npm ci --ignore-scripts`, `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` in the exact PR head checkout.
- With an isolated Supabase instance, negative-test each privileged RPC (anonymous, non-owner, two distinct owners) and verify access isolation.
- Do not run invasive tests against production.
- Confirm the HTTP security headers against the eventual isolated Preview.
- Manually enable and verify leaked-password protection in Supabase Auth, subject to feature availability and owner approval.
- Inspect and protect GitHub `main` with an enforced ruleset, subject to repository plan and administrator rights.
- Reconcile the applied migrations against intended integration migrations, including `pg_net` dependencies, before any production migration.
- Review Vercel Preview DB settings: it must not point to production.
- Review WAF in the Vercel UI and record actual state; never infer disabled from API 404.
- Review current `npm audit` results and dependency update opportunities.

## Integration sequence

1. Keep this PR based on `claude/crm-intelligence` and rebase if its head changes.
2. Review/fix findings and obtain passing CI on this patch.
3. Integrate in order without duplicating module code: security patch to CRM branch, CRM PR #160 to integration, PR #159 to main, only after approvals and migration/deployment readiness.
4. No owners/employees/managers permissions changes in this patch.

## Non-goals

- No Auth policy, database grant, DNS, firewall, billing, secret, environment or production mutation.
- No automatic enabling of managers.
- No claims that advisor warnings were all vulnerabilities or that production was tested.
