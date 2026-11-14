# Avalon OS — Efficiency and Credit Budget Map (2026-11-14)

## Source-of-truth snapshot
- GitHub main: `991e72ddd160b0ea5970897bac76d53b669a9fa9`.
- Graphify index: same commit; 4,511 indexed nodes, 9,519 edges, 336 graph communities.
- Graph nodes are static code/document entities, **not** 4,511 running services. Do not remove nodes solely to reduce node counts.
- Review PR #181 (existing 67-PR triage) before parallel cleanup. Do not duplicate its scope.
- This plan is not production evidence, a billing ledger or proof of achieved savings.

## Domain ownership — one source of truth per concept
| Domain | Canonical component / direction | Expensive actions to audit |
| --- | --- | --- |
| AI routing & cost | `src/lib/ai-engine/`; one dispatch/usage ledger | live model-list requests, generation, retries/failover, prompt size |
| CRM, Leads and Clients 360 | existing CRM tables/actions only | repeated calls, duplicate scoring, AI on read paths |
| Radar / Geoapify | existing CRM radar runs and Geoapify adapter | repeat ZIP searches, map tile requests, enrichment loops |
| Communication Hub | one client/project identity for chatbots and receptionist | speech minutes, prompt/context sizes, provider calls |
| Marketing / Funnels | existing campaign and lead-routing records | repeated conversion checks, paid ads/API usage |
| Websites / E-commerce / CRM Creator | `os_projects`, versions, files and Project Bridge | builds, external generation, duplicated ZIP uploads |
| Creative Bridge / Higgsfield | existing signed external media handoff | image/video credits, retries, previews |
| Dev Bridge / CI | GitHub commit/PR metadata, cached snapshots and CI | frequent polling, repeated full installs/builds, redundant runs |
| Office / Managers | retained data and code; no autonomous execution | schedule/cron, AI calls, repeated Github writes |

## Spending policy (requires owner review before activation)
1. Keep all five managers suspended and inactive; automated GitHub intake stays disabled.
2. Never run OpenRouter as a model router or fallback. No auto-merge, production migration or billing changes.
3. AI generation is opt-in, on explicitly authorized synthetic/public/aggregated data only.
4. One coding agent owns one Issue, one branch and one PR; secondary reviewers read only changed files.
5. Keep security checks, Auth/RLS and dependency scanning. Optimization must not bypass security gates.
6. Display UNKNOWN for provider balances until real billing/provider evidence exists.
7. Fail closed on budget exhaustion, missing credentials and unavailable authorization.

## First technical milestone — PR #186
- Strict default provider allowlist Groq / Cloudflare, with Oracle only after verification.
- Max 3 provider chat attempts per task lifetime; resume cannot evade cap.
- Model inventory cache 30 minutes per provider in persisted Store; invalidate on TTL expiry.
- Focused offline regression tests. No paid API calls or production changes.
- This is not a claim that the user will save a specific percent of Claude, Codex, GitHub or Higgsfield credits.

## Subsequent staged opportunities
### P1. Runtime baseline (read-only)
Collect provider request counts, provider-reported tokens, prompt+completion sizes, retries, failures, and real billing if authorized. Separate **Cloudflare/Groq model quotas** from **Claude/Codex coding subscriptions**, **Higgsfield credits**, **Vercel builds**, **GitHub Actions minutes**, **Supabase queries/storage**, and **Geoapify use**. No invented zeros.

### P2. Reduce waste without quality loss
- Audit and avoid repeated AI calls for identical deterministic inputs; never cache personal data across customers.
- Move reproducible scoring, lead qualification, transformations, routing and deduplication to deterministic code.
- Cache reusable and stable public model metadata and public geocoding with bounded TTL and tenant-safe keys.
- Constrain AI output tokens and context by task tier; pass diffs and file slices rather than repo dumps.
- Detect duplicate submissions and reuse immutable task outcomes by idempotency key.
- Batch safe independent reads; avoid duplicate database round trips and repeated client hydration.
- Put user-visible status behind existing observability; no pretending background jobs are running.

### P3. CI and deployments
- Measure workflows by SHA, trigger and duration first; preserve required `checks` branch protection.
- Keep paused workflows manual; do not delete security weekly schedule.
- Where equivalent checks actually overlap, use cached installs or share artifacts before removing redundant jobs.
- Use paths filters for expensive *nonrequired* workflow suites, without bypassing mandatory checks.
- No deployment to production until isolated preview and owner acceptance.

### P4. Visual assets
- Retain existing Higgsfield assets. Use preview thumbnails, responsive images, reduced-motion support and lazy loading.
- Never regenerate visual assets, speech or video for a routine preview without owner confirmation.

## Measurement and acceptance
For each comparable task category record **baseline and after**:
- provider API calls, repeated calls, tokens, retries, median/p95 latency and errors;
- GitHub Actions job minutes and Vercel build count;
- Geoapify requests and duplicate search rate;
- Higgsfield generated credits; costs only if official usage data exists;
- correctness, Auth/RLS, failures and rollback result.

Savings percentage = 100 * (baseline - after) / baseline; report only when baseline > 0 and task mix comparable.
Do not count skipped legitimate work as savings. If speed improves but correctness regresses, reject change.

## Rollback
Revert PR #186 if model selection, offline tests, capability filtering or fallback breaks. Keep owner approvals and automated manager shutdown untouched.
