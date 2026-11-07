# AVALON OMEGA: test results

Only tests that were actually executed are listed, with the exact commit. "Synthetic" means generated fixtures (no client data, no production writes). Playwright/Chromium results are **not** Safari results.

## Phase P0 · 2026-11-07 (local checkout, branch `claude/upbeat-galileo-grbelq`)

| Commit | Command | Result | Notes |
| --- | --- | --- | --- |
| `ee7e9bb` (before) | KENJI `tests/kenji-hq-executive-run-cap.test.cjs` (from PR #100) | **fail 1/1** | "'received: 500' without an explicit truncation/unknown marker is a misleading 7-day total" |
| `8a2fe67` | same KENJI test | pass 1/1 | |
| `8a2fe67` | `node --test tests/hq-executive-caps.test.cjs` (new) | pass 4/4 | 500 = complete; 1,234 → exact COUNT + null totals + labelled sample; COUNT unavailable → null; missions over cap |
| `8a2fe67` | `npm test` | **383/383** | |
| `ee7e9bb`+`8a2fe67` (before the Client 360 fix) | KENJI `tests/sales-client-workspace-financial.test.cjs` (PR #100) | **fail 9/9** | parent page did not use `loadAllRows`; dossier summed `.limit(200)` costs |
| `36f3775` | KENJI #100 files: workspace-financial / second-page-denied / task-owner-negative / hq run cap | **9/9, 2/2, 2/2, 1/1** | includes 101st sale / 201st expense sentinels, RLS-denied sources, no-count server cap |
| `36f3775` | `node --test tests/client-finance.test.cjs` | pass 14/14 | new: a short page without a count is not proof of the end |
| `36f3775` | `npm test` | **384/384** | |
| `36f3775` | `npx tsc --noEmit`, `npx eslint` on changed files | clean | |
| `origin/main` `d2890bb` | `VERCEL_ENV=preview next build` **without** Supabase vars | exit 0 | proves Previews can build once B2 is fixed |
| `origin/main` `d2890bb` | `VERCEL_ENV=preview NEXT_PUBLIC_SUPABASE_URL=<production URL> next build` | fails with `Preview must use an isolated Supabase database, never production.` | guard intact |

**Not run here, and why:**
- `tests/sales.browser.cjs`, the browser E2E for Client 360, was not run. CI runs it on push in `sales-core.yml`, and pushing is blocked (B1). Run it before merging.
- No Safari or iPhone test was done.
- No production writes were made.

## Production checks (read-only) · 2026-11-07

- Supabase `crm_agent_runs`: 30 in 7 days (30 total). Missions: 5 in 7 days. The HQ cap bug was latent.
- Prospects: 85 `pending`, 0 `approved`. `kill_switch=false`, `automatic_enabled=true`.
- Supabase security advisors: same findings as 0352 (B5, B12; intentional `crm_public_inquiry`; 2 RLS tables without policies by design).
- Vercel Production READY on `d2890bb`.

## Earlier missions (for continuity)

- 0352, `ee7e9bb`: `npm test` 379/379, 46/46 PGlite database files, REN pipeline 2/2, lint 0 errors, CodeQL clean. Real Groq/Cloudflare calls at $0, with a forced-429 failover. Details are in PR #132 and Issue #134.
