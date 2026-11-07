# AVALON OMEGA: progress by mission

Format per mission: **IMPLEMENTADO** (code exists and where) · **VERIFICADO** (what was actually tested) · **BLOQUEADO** (what stops it) · **COSTOS** · **SIGUIENTE ACCIÓN**.

"In #N" means prepared in a branch or PR and **not in production**. Nothing here is declared complete unless it is merged and verified.

Current phase: **P0 (stabilization)**. Snapshot 2026-11-07. Local head `36f3775` (+ docs), **not pushed** (B1).

## P0 delivered in this Omega session

1. **Client 360° profitability was wrong in production.**
   - The bug: the page summed only the first 100 sales and 200 expenses and labelled the result "Rentabilidad registrada".
   - The fix: the full ledger is read page by page, and profit is shown only when complete; otherwise a labelled partial subtotal and the reason. KENJI's #100 regressions went from 0/9 to 9/9.
   - Commit: `36f3775`.
2. **The HQ executive view could publish a 500-row sample as a 7-day total.** It now reports an exact COUNT or null, plus a separate sample. KENJI's regression passes. Commit: `8a2fe67`.
3. **PR #132's description was wrong.** It said the radar migration was not included; the 5 files are actually byte-identical to #143. The description is corrected (merge #143 first).
4. **#149 CodeQL high alert** diagnosed, with the exact fix posted on the PR.
5. **Preview root cause proven.** The variables for all environments carry the production URL into Preview. The fix is an owner step (B2), and the guard stays. A build without Supabase vars was verified to succeed.
6. **Integration matrix** (`AVALON_OMEGA_INTEGRATIONS.md`), blockers (`AVALON_OMEGA_BLOCKERS.md`), test log (`AVALON_OMEGA_TEST_RESULTS.md`).

## Missions

| # | Mission | IMPLEMENTADO | VERIFICADO | BLOQUEADO | COSTOS | SIGUIENTE ACCIÓN |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | PR audit + matrix | Matrix + merge order | Files, CI, mergeability and overlaps via REST before B1 | Graphify not connected; GitHub lost (B1) | $0 | Owner reviews the merge order |
| 2 | Central AI engine | In #132: registry, model selection, failover, per-hour/day limits, retries, tokens/$0 ledger, 429 quota detection, PII/secret guard, concurrency lease, idempotent run ids, resume, circuit breaker, kill switch + suspension | Real Groq/Cloudflare calls; forced-429 failover; resume without new calls (0352) | DB ledger needs `20261106090000` (B4); no per-user limits | $0 (free tiers) | **P1 done locally:** intake priority queue (`priority:p0–p3` label or `[P0]` title, oldest first, 3 per round; priority persisted). Per-manager budgets already enforced (6/h, 30/day per manager). Next: per-user limits once app users call the engine |
| 3 | Five managers working | In #132: real executors (SHIN security, HARU CRM, SORA integrations, KENJI QA, REN dev) on Actions; order labels task → in-progress → diagnosed / needs-implementation / implemented / verified / blocked / failed / needs-owner | Routine on #134; intake on #135–#147; REN PRs #138, #145 | B3 (Actions cannot open PRs); B6 (control vars) | $0 | State map: received/queued = `avalon:task` (history `received`→`classified`), running = `avalon:in-progress`, then diagnosed / needs-implementation / implemented / verified / blocked / failed / needs-owner. Enable B3 |
| 4 | One Higgsfield 3D HQ | In #132 (one office, 10 stations, 3 optimized GLBs) + #150 (Codex: iPhone cameras, verifiable states) | Chromium screenshots and perf JSON (0350); not Safari | B2 (no Preview), B11 | 0 Higgsfield credits | Fix B2, then review on an iPhone |
| 5 | Radar | Geoapify + research + prequalification in `main`; owner approval in #143 | PGlite 5/5 approval tests; production: 85 pending, 0 approved | B4 | free Geoapify | Owner approves #143 + migration |
| 6 | CRM + Client 360° | **Pagination fix `36f3775`** (local) | KENJI 9/9, client-finance 14/14, `npm test` 384/384 | B1 (push); browser E2E runs in CI | $0 | Push → `sales-core` E2E green → merge with #132 |
| 7 | Calendar | `shared_calendar` in production | not re-tested in Omega | Google OAuth not configured (optional, owner) | $0 | P2 |
| 8 | Website Designer | Builder pages in #141 | CI green on #141 | SQL review of #141; Puck not evaluated | — | P3 |
| 9 | E-commerce (Stripe test) | Stale draft #44 | — | No test keys; no signed webhook route in `main` | — | P3 (test mode only) |
| 10 | CRM Creator | Builder page in #141 | — | Tenant model not designed | — | P3 |
| 11 | AI Receptionist / Chatbots | `ai_chatbots_module` migration in #141 | — | pgvector not evaluated; no Flowise dependency | — | P3 |
| 12 | Marketing Hub | Route in `main` | — | — | — | P3 |
| 13 | Creative Bridge | HMAC receiver + SHA-256 importer in `main`; GLB self-containment check in #132; gallery in #151 | 12/12 creative tests (0352) | #87/#112/#116 need staging Auth + SQL review (`CLAUDE.md`) | 0 credits | Review #151; keep reference ≠ imported ≠ approved |
| 14 | Dev Bridge | In `main`; #148 UX; #96 conflicts | CI green on #148 | B2; #96 needs a rebase | $0 | Review #148, rebase #96 |
| 15 | Security | Advisors re-run; guard verified; secrets scan in CI (`security.test`) | See `AVALON_OMEGA_TEST_RESULTS.md` | B5, B10, B12 | $0 | Owner: branch protection + leaked passwords |
| 16 | Costs | AI $0; Higgsfield 0 | ≥52 failed Preview builds (waste, B2) | B8: 3 Supabase branches active since Nov 2–3 | possible branch-compute charges | Owner decides on B8 |
| 17 | Tests / Preview | Guard kept; no-DB Preview build proven | local build exit 0 without vars | B2, B11 | $0 | Owner unticks Preview (B2) |
| 18 | Autonomy / continuity | Omega docs + root `PROJECT_STATE.md`; ledger #134; patch file | — | B1 | $0 | Restore GitHub, push, then continue with P1 (ops center) |
