# Avalon OS — shared agent instructions

## Current shared development rule — Dev Bridge / Higgsfield (2026-11-03)
**Before choosing a branch, coding or accepting any handoff, read `docs/dev-bridge/COOPERATION.md`.** Run a fresh read-only GitHub scan through an authorized connector or `npm run bridge:brief -- --read-only`; it can reuse an existing `gh auth login`. Source of truth is exact remote SHA + open PR + linked Issue with one verified owner label and `Next action:`. Unlabeled PR != inactive developer. Never claim access to another agent's private chat. Codex and Claude work on distinct branches/worktrees, reference the Issue and leave a verifiable test/next-step handoff. GitHub Actions PR preflight reports incomplete metadata automatically. Do not merge another owner's branch, change owner permissions or use production data to resolve a build failure.

**Historical caveat:** Sprint 01's Google-first, old feature branch and Issue #8 instructions further down this document are archival context, not current task or login policy. Current live implementation must be inspected in `main` before every change. Higgsfield draft PR #87 is **not an active media import**: reference_only is not a shipped site, CRM or visual. Never bypass isolated-Supabase Preview protection or silently enable paid asset generation.


## Product
Private operations suite for Avalon Core Agency built with Next.js App Router, Supabase Auth/Postgres and Vercel. Seven navigation modules: Dashboard, CRM, Website Designer, CRM Creator, AI Receptionist, E-commerce, Marketing Hub.

## Founders and authorization
Miguel (avalonagencymh@gmail.com) and Samuel (avaloncoreagencysm@gmail.com) are the only approved initial owners, each with identical owner privileges. Email is an onboarding identifier, NOT the sole authorization control. Authorize with verified Supabase Auth user IDs and trusted agency_memberships records. Never rely on editable user_metadata. Google OAuth is the first provider; other providers are future scope.

## Git rules
- Base Sprint 01 work on feature/avalon-auth-rls, not main.
- Miguel/Codex A: feature/sprint-01-miguel-google-auth; own auth, callback, login, auth tests.
- Samuel/Codex B: feature/sprint-01-samuel-suite; own dashboard, suite layout, module placeholders and UI tests.
- Never edit another agent's owned files without coordinating through a PR.
- Commit small checkpoints with descriptive messages; write a PR against feature/avalon-auth-rls, NOT main.
- Do not merge, deploy production, apply SQL to connected Supabase, create real users or send invitations without separate explicit approval.
- The repository may be public: never commit secrets, tokens, customer data or private keys.

## Required engineering quality
- Keep Next.js server authorization on all protected pages, routes and actions.
- Use Supabase SSR with server-side session validation and correct OAuth callback exchange.
- RLS on every exposed table; least-privilege grants; do not add client-side role mutation.
- Do not expose service_role or secret keys in NEXT_PUBLIC_*.
- Pin dependencies and commit package-lock.json; use npm ci in CI once available.
- Run typecheck, build and focused tests. Never claim tests passed unless logs show success.
- Use mock/synthetic data only until permissions are validated.
- Prefer existing dependencies and components. Avoid speculative infrastructure.
- If blocked, record exact error and minimal reproduction instead of repeatedly guessing.

## Credit efficiency
One task -> one primary coding agent -> one branch -> one PR. ChatGPT plans and consolidates. Codex executes focused tasks. Claude reviews security or unresolved issues selectively. Avoid duplicate coding, giant prompts, repeated context, unnecessary new tools and long generated boilerplate.

## Sprint 01 acceptance
1. Google sign-in redirects through Supabase OAuth and server callback.
2. Only verified founders with trusted owner memberships can reach private pages.
3. Signed-out, unapproved and failed-auth users cannot access suite data.
4. Seven named modules are navigable, initially with safe placeholder content.
5. Logout works; no secret leaks; typecheck/build/test evidence recorded.
6. Preview/release requires human approval; production unchanged.

## Dev Bridge workflow (Issue #8)
For bridge work, use feature/avalon-dev-bridge or an isolated continuation branch based on its verified head. The current user explicitly authorizes development-side implementation and PR publication; production and merges remain prohibited.
On session start: read docs/dev-bridge/AI_CONTEXT.md and PROJECT_STATE.md, identify the canonical Issue, fetch remote state, check owner advances, validate resume package, select a safe branch and run relevant baseline tests.
During development: reference the Issue in small commits, update task progress and shared decisions, preserve existing work and avoid unrelated refactors.
On session end: run checks, commit, update Issue and handoff, record blockers, generate a validated resume package and exact next action. If a provider is inaccessible, record UNKNOWN; never claim synchronization succeeded for it.

## Current coordination note (as of 2026-11-02; recheck before acting)
The Sprint 01 branch and Google-first statements above describe **historical workstreams**, not current implementation requirements. Current owner login is **email/password only in the UI**, with no new Google OAuth sign-in action. Legacy authenticated identities are a separate explicit security policy decision; all authorization still requires trusted UUID + `agency_memberships`, never email or provider alone.
The authoritative production code is `main` (PR #34 integrated the current CRM, sales, client 360°, security and existing Codex tools when last checked). Draft PR #41 contains Titan Radar and mobile updates, pending verification, staging and explicit publication approval. Old PR #21/#31 are historical integration tracks; do not cherry-pick them blindly or overwrite Claude's current branch. Always recheck current GitHub HEAD, the corresponding Vercel deployment and issue #23 before selecting changes.

## Graphify-first, token-efficient workflow (all coding agents)
Applies to Codex, ChatGPT and other repo-aware agents. Detailed playbook: `docs/graphify/AGENT_WORKFLOW.md`.
- Start with the current task, working branch and git HEAD. Compare Graphify's indexed commit with the branch HEAD; a graph from another branch or older commit is **navigation only**, never proof of current implementation.
- When Graphify is available, use `recall(profile="agent", render="compact", token_budget=800-1500, k<=8, include_turns=false)` for relevant decisions, then `graphify_rank_files(limit<=8)` or `query_graph(skeleton=true, budget=800-1500, k<=5)` to locate code. Scope to `avaloncoreagency/Avalon-code`. Expand only relevant symbols/files; inspect live source before editing.
- For behavior changes, consult `impact_and_risk` and `graphify_tests_for` when useful, then **run** appropriate tests. Static graph results never replace runtime verification, security review or CI.
- Avoid repository-wide dumps, redundant queries, overlapping agent implementations and repeated broad searches. Reuse file paths, SHAs and findings within the task. Check freshness once per task and again only if code changes materially.
- If Graphify is unavailable, stale, misses the needed code or costs more context than direct inspection, switch immediately to targeted git/GitHub lookups; do not loop or block progress.
- Limit exploration to a small number of targeted calls before choosing files. Report succinctly: files changed, tests actually run/results, open risks, next checkpoint; no invented token-savings percentages.
- Never send credentials, private customer data or secrets to graph queries, memory or agent logs. Graphify memory notes can require separate human review before other agents can recall them.


## Visual requests: Higgsfield -> Avalon delivery gate (2026-11-03)
- For any requested Higgsfield image/video, redesign, futuristic animation or creative update, read `docs/HIGGSFIELD_TO_AVALON.md` before coding. Generation is NOT delivery.
- The required deliverable is actual media/code incorporated into the relevant Avalon Next.js route and reviewable on isolated Preview. A prompt, link, concept, screenshot, completed Higgsfield job or green CI by itself is NOT a completed app change.
- If external media is inaccessible (expired CDN URL, download blocked or missing connector), report BLOCKED with the exact reason and do not claim installation; deliver only independently useful CSS/HTML improvements with truthful scope.
- Before paid generation, estimate cost and respect the explicitly approved budget; never spend without authorization. Never copy credentials to client, commit secrets, hotlink expiring signed URLs, weaken owner gating/RLS, or modify production.
- Every visual PR must state source/job ID or "no generated asset", actual route/files changed, desktop/mobile Preview proof on exact SHA, reduced-motion handling, tests executed, remaining blockers, cost and rollback. Without browser evidence, status remains "PR pendiente de aceptación visual".
- Coordinate shared shell changes by PR; do not overwrite other agents' branches or declare the entire suite redesigned after a partial change.

- For Higgsfield websites/ecommerce/CRMs built for a named client, target the existing module library (`website`/`ecommerce`/`crm_creator`) and preserve source site/job ID, stable HTTPS link and exact company identity. Register with Avalon only under an authorized owner session, using the client/product handoff in `docs/HIGGSFIELD_TO_AVALON.md`. Link an existing CRM lead or create a minimal new-stage lead, never a sale or fake contact. If no authorized app access, leave a machine-readable handoff and status PENDING REGISTRATION; do not claim automatic sync.

### Codex and Claude Code: signed delivery handback
- Once a Higgsfield website, ecommerce project or CRM creation is **actually completed**, has a stable authorized URL/repository and passed the requested checks, use the matching library classification and prepare the private JSON manifest specified in `docs/CREATIVE_BRIDGE_SETUP.md`.
- If the **agent's own** scoped bridge key and staging endpoint are configured, submit it with `npm run creative:submit -- /private/path/to/manifest.json`. This does not require a human owner login. Read the returned Avalon product/company paths, verify them in the authorized application, and report `reference_only` until visual QA; do not call a missing credential or disabled endpoint a success.
- Never use Miguel/Samuel owner cookies, Supabase service_role credentials, raw production secrets or an invented Higgsfield job ID to bypass the bridge. Store the manifest and integration secrets outside the repository; never attach customer data to a public PR.
- The signed registration bridge is **disabled by default** and its database SQL is **review-only** until an isolated staging test and separate security/production approval. A registered link does not automatically install generated images or code into Avalon; for private app visual work, ship an ordinary actual media/React/CSS PR and test the rendered Preview.
