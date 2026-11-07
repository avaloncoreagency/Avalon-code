# Avalon OS: project state (dated snapshot)

**As of 2026-11-07 ~03:00 UTC · Claude, AVALON OMEGA, phase P0.** This is a dated snapshot, not live state. GitHub, Vercel and Supabase are the source of truth; re-verify them before acting. `docs/dev-bridge/PROJECT_STATE.md` is the historical 2026-11-02 checkpoint and is kept unchanged.

| Item | State |
| --- | --- |
| `main` | `d2890bb` (Vercel Production READY on it) |
| Supabase production | 22 migrations (last `manager_missions`); radar approval and AI Engine migrations **not applied** |
| Claude branch `claude/upbeat-galileo-grbelq` | remote `ee7e9bb` (PR #132). Local `36f3775` + Omega docs, **not pushed**: GitHub access was lost mid-session (B1). `omega-p0.patch` in the repo root replays the local commits |
| Open PRs | ~60; active set and merge order in `docs/AVALON_OMEGA_INTEGRATIONS.md` |
| Previews | Fail for every branch except #132 because Preview inherits the production Supabase URL (guard working). Owner fix: B2 |
| AI | Groq + Cloudflare free tiers, $0; OpenRouter disabled by the owner |
| Higgsfield credits used in Omega | 0 |

## Where things are
- Progress by mission: `docs/AVALON_OMEGA_PROGRESS.md`
- Blockers and owner steps: `docs/AVALON_OMEGA_BLOCKERS.md`
- PR matrix and integrations: `docs/AVALON_OMEGA_INTEGRATIONS.md`
- Executed tests: `docs/AVALON_OMEGA_TEST_RESULTS.md`
- AI Engine design: `docs/ai-engine/AVALON_AI_ENGINE.md`
- Manager run ledger: Issue #134. Ownership split: Issue #142. Codex UI contract: Issue #144.

## How the other owner continues
1. Restore GitHub access (B1). From this checkout, `git push -u origin claude/upbeat-galileo-grbelq`. Without this checkout, apply `omega-p0.patch` on `ee7e9bb` with `git am`.
2. Check CI on #132, including the `sales-core` browser E2E for Client 360.
3. Follow the merge order in the integrations doc. Every migration needs its own approval.

Next action: owner resolves B1 and B2. Then Claude pushes `36f3775`, verifies CI, and starts P1 (operations center: intake priority queue + per-manager budgets).
