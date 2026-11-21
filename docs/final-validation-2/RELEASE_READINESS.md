# Release readiness — Avalon OS candidate (Final Validation 2.0)

2026-11-20 · Prepared by **Claude Code**, the implementation owner, at the owners' request. **This is not an independent QA result.** Codex should re-run it from #295 with updated pins. Verdict: **NOT READY for clients.** CI is green, but owner approvals, migrations, configuration and an isolated Preview are still missing.

## Candidate

| Item | Value |
|---|---|
| Base | `main@207ed3a` |
| Release candidate | PR #294 (`claude/release-candidate-20261120`). Exact SHA in the PR and in the final report |
| Included PRs | #288 (`87a9931`) messages + review · #289 (`cf7a493`) Turnstile quote/funnel + token-gated intake · #278 (`c10309a`) contract PDF · #284 (`a7d8f46`) finance labels · #297 (`66a3b53`) Kanban v2 |
| Excluded on purpose | Guardian (#261/#267/#287), Samuel's staff portal (#233/#296), Radar (hibernated), #293 Orchestrator (separate review) |

## Status per system

| System | Status | Evidence |
|---|---|---|
| Inquiry history + per-message review | IMPLEMENTED_IN_BRANCH / CI_VERIFIED (#288) | `inquiry-history.database`, `fv2-migrations.database`, inbox E2E |
| Human check on quote and funnel | CI_VERIFIED (#289) | `quote-antibot.test` (incl. Codex FV-001 and its consent-first probe), Codex `intake-boundary` 5/5 on the RC |
| Direct RPC lockdown | IMPLEMENTED_IN_BRANCH, review SQL **not applied** | `intake-role.database`, `fv2-intake-matrix.database` |
| Pipeline Kanban v2 | CI_VERIFIED (#297, except browser E2E pending) | `sales.browser` (desktop + 390 px emulated touch), `crm.integration` |
| Commercial chain (Nova Test Business) | VERIFIED locally (PGlite) | `fv2-commercial-chain.database` |
| Capacity 1/5/10/25/50 clients | VERIFIED locally (PGlite). Timings are informational | `fv2-capacity.database` → `capacity-measurements.json` |
| Orchestrator #293 (planning only) | VERIFIED read-only: 17/17 of its own tests on `f2cc24f` | No change made to Codex's branch |
| Isolated Preview | **BLOCKED** | See below |
| Physical iPhone/Safari | **NOT_RUN** | Only Chromium with emulated touch |

## Public form security matrix (20 cases)

| # | Case | Covered by |
|---|---|---|
| 1 | Human with valid token | `quote-antibot.test` (ok path, quote + funnel) |
| 2 | Missing token | `quote-antibot.test` FV-001, `fv2-intake-matrix.test` |
| 3 | Invalid token | same |
| 4 | Expired token | `quote-antibot.test` (`timeout-or-duplicate`) |
| 5 | Replayed token | same; single-use is enforced by Cloudflare, so instant distributed replay is not provable locally |
| 6 | Wrong hostname | `quote-antibot.test`, `fv2-intake-matrix.test` (suffix attack) |
| 7 | Wrong action | `quote-antibot.test` (login→quote), `fv2-intake-matrix.test` (quote→funnel) |
| 8 | Cloudflare error | `fv2-intake-matrix.test` (network, timeout, 5xx, bad JSON) → `unavailable` |
| 9 | Storage failure | `inquiry-history.database` (never reported ok, nothing half-written) |
| 10 | Direct RPC call | `intake-role.database`, `fv2-intake-matrix.database` (after the review SQL); token absent from client code: `fv2-intake-matrix.test` |
| 11 | Direct funnel call | `fv2-intake-matrix.database` (`crm_growth_funnel_submit` denied to anon after the SQL) |
| 12 | Rate limits | per IP (server), per e-mail 3/24 h and global **30/h** (SQL): `fv2-capacity.database` |
| 13 | Honeypot | `public-inquiry.database`, `inquiry-history.database` |
| 14 | Spanish form | `inquiry-history.database`, `fv2-intake-matrix.database` |
| 15 | English form | `fv2-intake-matrix.test`/`.database` |
| 16 | Typed values recovered | `quote-antibot.test`, `fv2-intake-matrix.test` |
| 17 | Undeclared consent | stored as null, never invented; malformed rejected (`inquiry-history`, `fv2-intake-matrix`); funnel without consent rejected before Cloudflare |
| 18 | Duplicate messages | idempotent within 24 h (`inquiry-history`, `fv2-intake-matrix`) |
| 19 | Distinct messages from one sender | both kept on one prospect |
| 20 | Concurrent submissions | `fv2-intake-matrix.database` (PGlite queues one connection; it is not true parallelism). Real multi-session: Codex `concurrent-postgres.cjs` in CI |

Rollback: the direct path reopens **only** through the documented explicit `GRANT`. Re-applying the review SQL keeps it closed (`fv2-intake-matrix.database`).

## Migrations and SQL (none applied to production)
1. `supabase/migrations/20261120160000_public_inquiry_message_history.sql`
   - Tested on an empty DB and **over a populated older schema** (`fv2-migrations.database`).
   - Legacy messages stay `null` (never reconstructed). Prospects are untouched.
   - Review is owner-only with append-only history; operators are refused.
2. `docs/sql/public-intake-role-review.sql`
   - Applies cleanly after (1) and is idempotent.
   - Order: deploy the app with `AVALON_INTAKE_TOKEN` → apply the SQL → insert the token hash. Doing it in the wrong order makes every website form fail closed.

Both need separate owner authorization and a **verified backup**.

## Pending configuration (names only, never values)
- Turnstile: `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_EXPECTED_HOSTNAME`.
- Intake: `AVALON_INTAKE_TOKEN` (server-only, 32–256 characters), plus its SHA-256 inserted in `crm_private.intake_tokens`.
- Funnel fingerprint (optional): `AUTH_FLOW_SECRET`.

## Isolated Preview — resources (read-only check, 2026-11-20)

| Resource | Status |
|---|---|
| Supabase branches on the production project | 3 listed: `main` (status `MIGRATIONS_FAILED`, ACTIVE_HEALTHY), PR #205 preview (2026-11-16), PR #19 `release/avalon-os-production-candidate` (2026-11-02) |
| Concurrent preview limit | **Reached.** The Supabase bot ignored #294 for that reason. The two old previews take the slots |
| Alternative with no extra spend | Owners delete the stale #205/#19 previews or reset one to the candidate schema. This is a remote change and needs owner approval. Then bind Preview to the isolated URL/key only |
| Vercel | Team on Pro (per Codex #295). Previews are skipped by the ignored-build step. Incremental cost **unknown, not measured** |
| Guard | `blocked_unsafe_preview_database` stays enabled |

## Measured capacity (PGlite, one run, this machine; not hosted Supabase)
See `capacity-measurements.json`.
- With 50 clients, every listed query stayed in the single-digit to low-double-digit milliseconds in-process.
- Correctness was asserted: exact counts, disjoint pagination over 3 pages, repeated names remain distinct clients, both owners see the same data.
- Larger cases (100 sales / 200 costs per client) are covered by the existing `client-finance` / Clients 360 tests.
- **Finding:** website inquiries are capped globally at **30 per hour**; the 31st gets "throttled" and nothing is stored. Owner decision: raise the ceiling before a campaign, or keep it as anti-abuse protection.

## Risks
- **P0**
  - Production still has the direct anonymous intake RPCs until the SQL is applied.
  - Messages from website inquiries in production are not stored until migration `20261120160000` is applied.
- **P1**
  - No isolated Preview.
  - No physical iPhone/Safari run.
  - Legal review of the contract template (#286) is pending.
  - No approved prices in `crm_service_catalog`.
  - Global inquiry limit of 30/h.

## Rollback
- **App:** revert the merge of #294; each PR is also independent.
- **SQL:** each file ships its own rollback block. Restoring direct intake requires the explicit grants, which reopen the bypass.
- **Kanban v2:** pure UI/API; no schema change.

## Pending approvals
- **Legal:** contract template (#286).
- **Commercial:** prices, consent version, global inquiry limit.
- **Miguel and Samuel:**
  - merge of #294;
  - SQL application with backup;
  - configuration values;
  - Preview resource cleanup;
  - pilot sign-off on a real iPhone.
