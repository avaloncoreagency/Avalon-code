# AVALON OMEGA: integration map

Snapshot taken **2026-11-07 ~02:50 UTC** by Claude (lead architect, Omega). This is a dated snapshot, not live state. Before acting on it, re-check GitHub, Vercel and Supabase. A branch, PR title or commit author is not proof of who owns a change (see `AGENTS.md`).

## Base

| Source | Verified state | How it was verified |
| --- | --- | --- |
| GitHub `main` | `d2890bb` | `git fetch` + `git log origin/main` |
| Vercel Production | READY on `d2890bb` (`dpl_B7ycBhV3…`) | Vercel MCP `list_deployments target=production` |
| Supabase production `ltbwzcrxeuczdhhtbqgm` | 22 migrations, last `20261104172854 manager_missions`. `crm_ai_public_control` and the radar approval migration are **not** applied | Supabase MCP `list_migrations` |
| Graphify (`avalon-graph`) | **UNAVAILABLE in this session**: no Graphify tool is connected. Fallback used: scoped `git`/`grep` per `docs/graphify/AGENT_WORKFLOW.md` | — |
| GitHub access from this session | **LOST at ~02:55 UTC**: `git push` → 403, REST → "Your account was suspended", GitHub MCP → re-authentication required | see `AVALON_OMEGA_BLOCKERS.md` B1 |

## Open PR matrix (active set)

CI = GitHub Actions checks at the PR head. Preview = Vercel status.

| PR | Base | Area | CI | Preview | Overlaps | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| #132 `claude/upbeat-galileo-grbelq` | main | AI Engine, 5 managers, one HQ, executive view | green at `ee7e9bb` (only `ren-dev-task` fails, from the repo PR-permission setting) | READY | #150 (based on it), #141 (`office.tsx`, `dashboard/page.tsx`), #112/#116 (`import-asset.cjs`) | **Integrable after** #143 review and owner approval of the migrations. Local `36f3775` adds 2 Omega fixes (not pushed, B1) |
| #143 `claude/radar-owner-approval-0352` | main | Radar P0: owner approval before conversion | green | fails (guard, B2) | its 5 files are byte-identical inside #132 | **Merge first**, after SQL review. Its migration needs explicit approval to apply |
| #148 `shin/0352-b-dev-bridge-ux` | main | Dev Bridge UI evidence states | green | fails (guard) | #96 (`dev-bridge/page.tsx`) | Integrable after visual review; resolve against #96 |
| #149 `haru/0352c-manager-operations` | main | Manager operations panel | **CodeQL: 1 high** (`manager-operations-ui.ts:81`) | fails (guard) | none | **Needs a fix**: incomplete tag sanitization. Fix posted to the PR |
| #150 `feature/ren-hq-0352a-visual` | **#132 branch** | HQ 3D: iPhone cameras, verifiable states | partial (`hq-visual` ok) | fails (guard) | #132 (5 files, expected), #141 (`office.tsx`) | Depends on #132. Codex domain (`src/components/office/**`) |
| #151 `sora/creative-bridge-gallery` | main | Creative Bridge library per client | green | fails (guard) | #112 (4 files in `creative-bridge/`) | Integrable after review; #112 becomes obsolete or must rebase |
| #141 `feature/six-builders-chatbots` | main | Six workspaces + AI Chatbots | green | fails (guard) | #132, #150 (`office.tsx`), #87, #116 | Needs SQL review of `20261107090000_ai_chatbots_module.sql` and a merge order after #132/#150 |
| #145, #138 `ren/auto-*` | main | REN autonomous lint fixes (1 test file each) | green | — | #145 ↔ #87 (`creative-bridge.database.cjs`) | Small and integrable. Produced by REN with free providers |
| #137 | main | REN docs: HQ contract and P0 gates | — | fails (guard) | none | Docs only, integrable |
| #133 | main | HARU: 13-stage CRM contract, docs + test | — | — | none | Review, then integrable |
| #100 | `feature/staff-proyectos-finder` | KENJI tests: 101/201 finance + HQ run cap | — | fails (guard) | none | Its tests now **pass against `36f3775`**. Retarget to main after #132 |
| #128 | main | Radar → Leads → Sales | unstable | — | #87 (`lead-board.tsx`) | Re-check against #143 (approval now required) |
| #96 | main | Dev Bridge cooperation | **conflicts** | — | #148, #87, #129 | Rebase needed |
| #87 → #112 → #116 | stacked | Signed creative delivery | #87 **conflicts** | — | #151, #132, #141 | Blocked by `CLAUDE.md`: isolated staging Auth, SQL review and agent keys first |
| #129, #35–#37 | main | Dependabot (npm and actions bumps) | not reviewed here | — | #36 ↔ #37 (13 workflows) | Review separately; workflows are pinned by SHA today |
| #5–#31, #43–#109 (≈40) | various | Nov 2–4 work | stale | — | — | **Probably superseded** by the #126/#127 integrations. Closing them is the owner's call |

Migrations in open PRs: `20261106090000_ai_engine.sql` (#132), `20261106100000_radar_owner_approval.sql` (#132 = #143), `20261107090000_ai_chatbots_module.sql` (#141).

**Merging is not migrating.** Production migration versions (for example `20261104163843_manager_execution`) differ from the repository file names (`20261104120000_manager_execution.sql`), so production was migrated by hand and Git merges do not apply SQL. Every migration needs its own explicit approval.

## Recommended merge order (each step needs owner approval; nothing is merged by Claude)

1. #143: radar approval (SQL review → apply migration → merge).
2. #132: AI Engine + one HQ (+ `36f3775` once pushed). Apply `20261106090000` only when approved.
3. #150: Codex HQ refinements (rebase onto main after #132).
4. #148 and #151: independent UI.
5. #149: after the CodeQL fix.
6. #141: after SQL review, and after #132/#150 so `office.tsx` is merged once.
7. #145 and #138: anytime; then retarget #100 to main.

## External integrations

| Integration | State | Cost |
| --- | --- | --- |
| Groq (OpenAI-compatible) | **Real**: Actions secret `GROQ_API_KEY`; live calls verified in 0352 | $0 (free tier) |
| Cloudflare Workers AI | **Real**: Actions secrets; neuron cap 8000/day in code | $0 (free allocation) |
| OpenRouter | Implemented, **disabled by the owner** (`:free` + `max_price=0` guard) | $0 |
| Oracle | Prepared only | — |
| Geoapify | In `main` (public map key only, `NEXT_PUBLIC_AVALON_GEOAPIFY_MAP_KEY`); radar worker runs on pg_cron | free plan |
| Higgsfield | Creative Bridge receiver (HMAC) + importer (SHA-256, GLB checks) in `main`. **0 credits used in Omega** | — |
| Supabase | Production + 3 preview branches **ACTIVE_HEALTHY since Nov 2–3** (`nwiqg…`, `vvnyl…`, `wupvu…`) | branch compute may be billing (B9) |
| Vercel | Production READY; Preview builds fail on the isolation guard (B2) | Hobby/Pro limits not checked |
| Stripe | Test-mode PR #44 (stale, Nov 2). No keys configured | — |
| Google Calendar OAuth | Not configured (optional) | — |
| pgvector / Flowise | Not evaluated; no dependency added | — |
