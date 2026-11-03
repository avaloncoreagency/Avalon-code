# Avalon Office — independent worker for five managers (isolated staging)

## What the code now does
The existing Office registers `office_agent_requests` but does NOT run free-form instructions. ChatGPT Automations are a separate product and enabling them does not connect them to Avalon. The five managers in `src/lib/office/managers.ts` still report disconnected until a verified execution backend is connected.

PR #102 adds two connected, truthful capabilities:

1. **On-demand:** a verified owner opens `/admin/workspace/crm/office/manager-work` and runs five pre-defined, read-only queries using the owner's Supabase session and RLS. Nothing claims to be an AI assistant.
2. **Scheduled (after reviewed activation):** one GitHub Actions workflow each hour executes five pre-defined count checks directly against an **isolated staging Supabase** using credentials protected by a GitHub Actions environment. A sidecar `office_manager_runs` table saves exact timestamps, results, failure codes and four-minute leases. The Office can show latest recorded executions through a read-only owner API. This survives closing the browser and does **not** require a privileged key in the Next.js app.

A fixed request command `AVALON_MANAGER_CHECK_V1` can be queued via the Office; the worker will process at most four such requests per manager each round. **Free-form requests are not executed**. Never pass arbitrary request text to a shell, an LLM with write privileges, SQL or a workflow.

## Setup gate — explicit owner/security approval required

**No schedule can execute while this is a draft PR.** GitHub scheduled workflows execute on the default branch only; do not merge merely to activate it.

1. Verify a healthy **isolated Supabase staging project**, not production `ltbwzcrxeuczdhhtbqgm`. The existing shared staging project from PR #41 previously reported `MIGRATIONS_FAILED`; check the migration ledger with its owner and do not reset or mutate shared data blindly.
2. Review and apply `supabase/migrations/20261103100000_office.sql` (if absent) and `20261103211000_office_manager_runs.sql` to staging **only**. The new table is RLS-protected and readable by verified owners. Only the staging service role may insert/update runs and call the two claim/finish RPCs. Test anonymous/non-owner rejection.
3. Create/protect a GitHub Actions **environment** named `avalon-staging-managers`. With the owner's explicit authorization, configure:
   - Environment secret `AVALON_STAGING_SUPABASE_URL` = isolated staging URL `https://<staging-ref>.supabase.co` (no trailing slash).
   - Environment secret `AVALON_STAGING_SERVICE_ROLE_KEY` = **staging-only** service key. This is privileged, never place it in code, Vercel, `NEXT_PUBLIC_*`, PRs, issues or chat; rotate/revoke if leaked.
   - Environment variable `AVALON_MANAGER_STAGING_SUPABASE_REF` = exact isolated project ref. The runner checks host/ref equality and **hard-denies** production ref.
   - Optional required reviewers and a spending cap on the GitHub environment.
4. After independent review and a separately approved merge, trigger `workflow_dispatch` in staging for one manager; confirm exact-count results in the database and UI with a synthetic owner, no-owner and anonymous negatives, and no duplicate on immediate repeat.
5. Only after the test passes, permit the scheduled run `7 * * * *` (one GitHub Actions workflow checks all five every hour). GitHub may delay or pause scheduled runs and can consume runner minutes. Watch execution history and configured budgets; don't claim guaranteed uninterrupted 24/7 execution.

## Reliability and security
- **No privileged key in the Next.js app.** The GitHub Actions runner makes authenticated requests to one exact allowed staging Supabase host using `redirect:"error"`; its key lives in a protected environment.
- **Idempotency:** database unique key per manager+UTC hour or per owner-created request, plus atomic claim and four-minute lease. Crashed jobs can be retried at most twice by a new run, never silently marked complete.
- **Results are honest:** count queries must all pass or the run is marked failed; a lease past expiry is shown as stalled; one owner may see only RLS-authorized data from the history endpoint.
- **No unsafe prompt execution:** free-form Office requests retain `registered` until a separately authorized coding/execution service is built. Only system-defined diagnostic requests may run.
- **No direct production writes:** nothing in this PR touches remote Supabase, merges branches, modifies Vercel production, or configures real secrets.
- **No autonomous coding yet:** this worker runs operational diagnostics, not Codex/Claude or an LLM; it cannot implement arbitrary free-form development requests. A future coding broker needs a GitHub App with restricted repo scopes, sandboxed execution, queue claim/lease, approval-gated PR creation and separate release permissions.

## Acceptance checklist
- [ ] CI `lint`, `typecheck`, `npm test`, `next build`, SQL migration/security tests and isolated browser E2E on **the same SHA**.
- [ ] Stage migrations verified by querying schema/owner-only RLS and RPC execution grants.
- [ ] Owner and anonymous API negative tests; redaction in logs and responses.
- [ ] One scheduled run for **each of five managers** stored as `completed` with source `staging_service_worker`.
- [ ] Fixed command queued from Office → claimed once → result saved → visible after refresh; free-form command NOT executed.
- [ ] No false active indicator if a manager was never run, failed or stalled.
- [ ] Conflict reconciliation with Office PRs #78/#82; owner review before merge/production deployment.
