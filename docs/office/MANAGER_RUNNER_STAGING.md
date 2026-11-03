# Avalon Office — manager runner (staging-first, no paid AI)

## Actual behavior
The Office already stores owner-created free-form requests in `public.office_agent_requests`, but its existing trigger allows only `registered` and `cancelled`. There is **no connected AI executor** for arbitrary messages. Re-enabling ChatGPT Automations does not connect them to the Office.

This PR adds a **separate, bounded runner**:
- Five predefined, read-only count checks (REN, SHIN, HARU, SORA, KENJI).
- Staging-only private POST endpoint `/api/internal/office-manager-runner`, requiring a long bearer token, `VERCEL_ENV=preview` and an exact match between `AVALON_MANAGER_STAGING_SUPABASE_REF` and the selected Supabase URL. Production ref `ltbwzcrxeuczdhhtbqgm` is explicitly rejected.
- A sidecar table `public.office_manager_runs` with **owner-only RLS SELECT**. Writes are service-role only, via RPC with leases, unique run keys, max three attempts and token-checked finish. No changes to existing Office request trigger.
- Only a fixed owner-created command `AVALON_MANAGER_CHECK_V1` is eligible for queued execution; arbitrary user text is NEVER run as code or a model prompt.
- Github Actions can call all five jobs once per hour in isolated staging, using **one workflow** to minimize billable minutes.
- Office history shows timestamps and actual results, including failed/stalled jobs. It does not claim that ChatGPT coding agents are running.

### Critical limitation

**No background work runs just by merging these files.** The workflow schedule only runs from GitHub's default branch and might be delayed by GitHub scheduling. A code PR does not provision secrets, connect a live staging database, create a Supabase service key or bypass protected Preview. There is no autonomous code-writing model attached here; this is a controlled operations runner.

## Setup after security review and explicit owner approval

1. **Isolated Supabase:** Confirm a separate, healthy staging project (NOT production) with verified migration ledger. Apply the already prepared `20261103100000_office.sql` if missing and the new `20261103211000_office_manager_runs.sql` **only on that staging** after review and backup/rollback plan. Existing staging #41 previously reported `MIGRATIONS_FAILED`; do not reset or mutate that shared branch without coordinating its owner. Test owner read vs nonowner/anon and RPC execution restrictions.
2. **Vercel Preview (branch scoped only):** Configure `NEXT_PUBLIC_SUPABASE_URL` and matching publishable key for isolated staging (these are public but must match staging). Configure **server-only** `SUPABASE_SERVICE_ROLE_KEY` for staging, `AVALON_MANAGER_STAGING_SUPABASE_REF` for the same project and `AVALON_MANAGER_WORKER_TOKEN` (cryptographically random secret 32+ bytes). **Never add any of these secrets to NEXT_PUBLIC_ variables**, a PR, GitHub issue or chat. Vercel Production must have no worker configuration. Do not weaken the Preview→production DB guard.
3. **GitHub Actions environment:** Owner or admin must configure environment `avalon-staging-managers` and its scoped secrets `AVALON_MANAGER_PREVIEW_URL` (a HTTPS `*.vercel.app` staging Preview URL only), `AVALON_MANAGER_WORKER_TOKEN` (same bearer token as Preview), optionally `VERCEL_AUTOMATION_BYPASS_SECRET` if Preview authentication requires it. **Do not put a Supabase service role key in GitHub Actions.** Put environment protection and spending limits in place.
4. **Manual acceptance in staging first:** Trigger workflow by `workflow_dispatch` after an approved merge/workflow availability, or use an authorized test runner. Verify the workflow logs list five successful job statuses without client data. View `/admin/workspace/crm/office/manager-work` as synthetic owner; click Refresh history and confirm five individual records and metrics. Test an explicitly queued check, ensure only one result for repeated dispatch. Test anon/nonowner = 403, wrong bearer = 401, production = 503, stale job reported as stalled.
5. **Release gate:** PR review, exact SHA CI, PGlite/Postgres migration tests, isolated browser E2E, cost calculation, conflict review with Office PRs #78/#82. Owner separately approves any merge and production UI changes. **No automatic merge or production activation**.

## Failure modes and costs
- Missing secret, broken migration or protected Preview: runner fails closed; no service fallback to production.
- Same cron/manager/hour: unique run_key prevents duplicate execution. An interrupted run is eligible for at most two retries after its lease expires; beyond that, manually investigate.
- Failed count query: whole result is failed; no fabricated numbers.
- Existing free-form requests remain registered pending a future authenticated coding/execution worker. The fixed diagnostic command is never interpreted as general instructions.
- An hourly five-manager workflow runs about 720 times per 30 days. GitHub Actions runners can consume included minutes or create charges depending on plan; review quotas and budgets before enabling the schedule. It does **not** call an AI provider.
- Only timestamps and aggregate counts are stored, no contact details or passwords.

## How to expand to autonomous coding later
This staging worker is NOT a substitute for Codex/Claude agents. To execute free-form work requests safely, add an allowlisted task broker that opens PRs with a scoped GitHub App installation, commits tests, records SHA/CI, uses isolated runner sandboxes and strictly separates PR creation from merge/production. Do not pass free-form `office_agent_requests.body` directly to a shell, CI workflow, privileged SQL or an LLM with mutation permissions.
