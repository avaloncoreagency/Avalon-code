# Avalon Dev Bridge — cooperation protocol for Miguel, Samuel, Codex and Claude

**Scope:** read-only coordination, isolated branches, reviewable handoffs. GitHub Issues + PRs + exact commit SHAs are the shared source of truth. Two different ChatGPT/Codex/Claude sessions **do not share their private chat history**. They can, however, reconstruct and continue committed work from the same repository.

## What changed for both owners
- The owner-only `/admin/dev-bridge` page shows both workspaces, **unassigned PRs**, overlap of changed paths, live CI and related Higgsfield work. Unassigned != inactive. Never infer ownership from a branch name, AI model, commit author, or the agent's claim.
- The private page refreshes every five minutes while visible; the app-level cache is also five minutes. GitHub Actions `Dev Bridge sync` runs hourly **best effort** after this PR is integrated into `main`. GitHub's scheduler can delay/skip; no always-on sync is promised.
- `npm run bridge:brief -- --read-only` asks GitHub for a new read-only snapshot and prints a bounded JSON summary: verified main SHA, open PRs grouped by **actual Issue owner labels**, unassigned PRs, overlapping file paths and Higgsfield bridge PRs. This can reuse an existing `gh auth login` or a GitHub token in the agent's environment (`GH_TOKEN` or `BRIDGE_GITHUB_TOKEN`) with read access. An assistant's connector authorization is **not automatically available** in a local shell. Never paste tokens in prompts, commits, logs, JSON handoffs or public Issues.
- The brief and dashboard distinguish GitHub Actions tests (`PASSED`, `FAILED`, `PENDING`, `UNKNOWN`) from Vercel deployment state. A Vercel Preview that fails closed because it points at production Supabase is **not** a unit-test failure, and passing tests is not browser QA.

## No-token private dashboard (safe partial information)
Because Avalon's GitHub repository is currently public, the owner-only UI can query GitHub's public REST endpoints without a configured Vercel GitHub token. This **limited read** uses three bounded calls (open Issues, open PRs, main SHA). It shows identities that have explicit Issue labels and a list of unassigned work, while marking CI, changed-file overlap, mergeability, migrations and resume as **UNKNOWN**. The public fallback does **not** provide a valid handoff package. Authenticated full detail still requires a scoped server-side GitHub token; agents may use their existing `gh auth login` for `bridge:brief`. A public repository may be made private later; then the anonymous fallback becomes UNKNOWN and no authorization is silently bypassed. Public reads are cached for 15 minutes to respect GitHub rate limits. Synthetic HTTP tests explicitly disable this external read.

## Every session: start from the same checkpoint
1. Open this document, `AGENTS.md`, and `docs/dev-bridge/AI_CONTEXT.md`. `PROJECT_STATE.md` is explicitly **historical**, not evidence of current deployment or code. Issue #8 is the closed historical Dev Bridge implementation.
2. Check the clean local worktree (`git status --porcelain`) and fetch the current remote state (`git fetch origin`). Compare `origin/main`, your branch, and any PR head by **full SHA**. Never reset/force-push the other's branch.
3. Run `npm run bridge:brief -- --read-only`. If GitHub is unavailable, report `BLOCKED / UNKNOWN`, inspect historical docs only, and **do not resume or modify another person's work based on cached data**. A connected GitHub MCP can be used for equivalent live read-only inspection instead of the CLI.
4. Identify one small task, its exact source PR and Issue, changed files, CI status, dependencies and overlaps. If ownership is `UNKNOWN`, ask for a canonical Issue with a unique `owner:miguel` or `owner:samuel` label; **do not claim the work belongs to that owner** until recorded.
5. Work in a separate branch or git worktree from the verified SHA; add tests and open a PR referencing the Issue. Prefer a new PR over editing either person's branch. Never auto-merge, deploy production or change RLS/Auth/secret/billing/client data.


## Automatic PR preflight (read-only)
A new `.github/workflows/dev-bridge-pr-preflight.yml` runs on every same-repository PR open/edit/commit. It reads the PR's linked Issue metadata and changed file names using a short-lived **read-only** GitHub Actions token. It reports the exact head SHA, explicit owner label, and whether the Issue has a literal `Next action:` line; it warns about shared auth/suite/schema paths and truncated file lists. Missing labels or old closed Issues produce `NEEDS_HANDOFF` advisory metadata, **not automatic assignment or a merge**. The check does not block legacy PRs while they are being organized. For safety, it does not run an external fork's checkout with internal credentials, nor put full Issue bodies into public Actions summaries. No customer data, passwords, OAuth scopes or new Vercel infrastructure are required.

## One small durable handoff per PR
The author or authorized owner uses a **canonical GitHub Issue**, with one owner label, a `module:...` label, branch, head SHA, linked PR and a literal line:

`Next action: <one reproducible action, owner, acceptance evidence>`

The PR body must include `Refs #<issue>` or `Closes #<issue>`, risk, tests on the **exact PR SHA**, Preview status, and overlap notes. `npm run bridge:handoff -- --issue N --as samuel --state Ready --publish` is available **only with authorized GitHub Issues write scope and after passing CI**; the inverse is `--as miguel`. This writes a small public metadata comment, **not client details or secrets**. `Ready` is a reported handoff; `Accepted` requires explicit acceptance by the resuming owner.

A receiving agent runs `npm run bridge:resume -- --issue N --as samuel` (or `miguel`) after live GitHub verification. It generates a validated package with a worktree command pinned to the source SHA. If more than one PR claims the same Issue, ownership is ambiguous or the SHA advanced, stop, inspect and regenerate intentionally. Do not erase local changes.

## Higgsfield intersects the same workflow
Higgsfield has **two different outputs**, not one magic integration:
1. **Visuals for Avalon itself:** Codex/Claude must commit or import real authorized image/video/UI files and code into the requested Next.js route, open a normal visual PR, and verify desktop/mobile Preview at its exact SHA. A Higgsfield prompt or generated preview is **not** installed UI.
2. **Products for a client:** After a real finished website, ecommerce or CRM, prepare the strictly validated handoff described in PR [#87](https://github.com/avaloncoreagency/Avalon-code/pull/87). Its intended `website`, `ecommerce` and `crm_creator` destinations share the Avalon library and CRM identity. Until that PR's reviewed SQL, isolated staging Auth and dedicated HMAC keys are configured and E2E proven, registration remains **inactive**. A `reference_only` receipt links a source URL; it does not copy binary assets/source code or publish a client's site.
For a Higgsfield-related PR, record the safe **source job ID (not personal details)**, changed code paths, target module, exact SHA, E2E evidence and one pending action in the canonical Issue. Do not put client names, tokens or private URLs in the public repository.

## Costs, ownership and rollback
This uses existing GitHub Actions, no new subscription. Hourly checks may consume the repository's Actions quota; disable or revert the scheduled workflow if budgets become material. Public repo: do not publish customer or sensitive internal data. The UI and briefing are read-only. A rollback reverts this feature branch/PR; no Supabase migration, Auth/roles/secret, Vercel production deploy, or asset generation is performed here.
