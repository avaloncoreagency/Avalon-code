# Avalon OS — Operation Stable V1: single release candidate

2026-11-22 · Claude Code (integrator). Branch `claude/stable-v1-20261122`. The exact head SHA is in the draft PR.

**Status values:** VERIFIED / FAILED / PENDING / BLOCKED / UNKNOWN. VERIFIED here means verified by Claude locally, with exact-SHA CI where stated. **It is not independent QA:** Codex has no credits, so that review is PENDING.

**Scope:** no feature work, only fixes and integration. There is **no merge to `main`, no deploy, and no remote SQL**. Supabase was queried read-only (migrations and advisors).

## 1. Lineage (verified on GitHub on 2026-11-22)

- `main` = `ff8191d`.
- The candidate is built on **#316** (`a640e67`, Codex). #316 sits on **#314** (`ed92f40`), which already contains:
  - #311 (Claude, up to `24d3f2a`);
  - #305, #306 and #307;
  - #313 (opens the collapsed composer in the E2E);
  - the #312 / #302 PUBLIC EXECUTE audit.
- #316 adds:
  - `20261121182000_crm_attribution_legacy_guard` (retires the legacy commission RPC and makes `paid` require `invoiced`);
  - the same E2E test adaptations as my #311 commits `3ad8e7c` and `f03e825`. Those two commits are therefore **not** re-merged.
- **On top: one commit, `d498652`**, the root-cause fix for the recurring CI failure (section 4).

## 2. Integrated features

| Area | What the candidate has | Status |
|---|---|---|
| Leads Pipeline | Kanban v2: pointer, touch and keyboard; two-line cards; Won/Lost gates. Lead drawer: portal to the viewport, always opens at the top, restores the page position, independent scroll, focus trap and focus return, filters and 8-item history, collapsible compose and attachments | VERIFIED: `lead-drawer-scroll.browser` (1440 + 390 emulated), `sales.browser` |
| Clients 360 | Company + exactly one New lead, atomic; fails closed with no orphan fallback; duplicates rejected | VERIFIED: `client-opportunity-link.database` |
| Sales | Only the client's own opportunity is used: enforced by the action, the DB trigger `180000` and the form | VERIFIED (PGlite + E2E) |
| Commissions owed to Avalon | Lifecycle with evidence and versions, an event log and separate summaries. `paid` only after `invoiced`. Legacy RPC disabled (`182000`). Kept separate from `crm_commissions` | VERIFIED (PGlite) |
| Quotes | 18 configurators; chatbot offered as a proposal (#306); receptionist and chatbot estimators show N/D without verified rates; nothing is activated | VERIFIED: `quote-estimators.test`, `quotes.browser` |
| Commercial requests | Need first; compact cards; full original text; review history; anti-spam and dedupe; EN/ES | VERIFIED: `sales.browser` (`inbound-ui`), `inquiry-presentation.test` |
| Contracts and invoices | Contract PDF and preview; signed contracts immutable; invoices can only be voided. Draft invoices are a separate proposal (`docs/commercial-os-v5/INTEGRATION.md`) | VERIFIED (existing guards); draft invoices BLOCKED (owner, accountant and legal decision) |

## 3. Tests on `d498652`

| Check | Result |
|---|---|
| tsc | VERIFIED: 0 errors |
| eslint | VERIFIED: 0 errors, 2 warnings that predate this candidate |
| Unit (`npm test`) | VERIFIED: 800 / 0 |
| PGlite + SQL (`tests/*.database.cjs`, `tests/operations/*.database.cjs`), including RLS, finance isolation, the full migration chain and the upgrade path | VERIFIED: 92 / 0 |
| Browser, with flags set and none skipped (`skipped 0`): `lead-drawer-scroll`, `quick-improvements/mobile`, `crm.integration`, `quotes.browser`, `crm-intelligence.browser`, `prod-schema-compat.browser`, `growth-funnel.http` | VERIFIED: 7 / 0 |
| `sales.browser` (Nova Restaurant end to end, Kanban, Clients 360, contracts, core engine, inquiries) | VERIFIED |
| Definer audit (stricter version from #302) | VERIFIED: 53 executable SECURITY DEFINER functions, 0 ungated |
| Supabase isolated preview branch (real Postgres): full migration chain | VERIFIED for #311; for this SHA it is PENDING CI |
| Exact-SHA GitHub CI | PENDING |
| Physical iPhone Safari | PENDING (no device; Chromium emulation is not Safari) |
| Independent QA by Codex | PENDING (no credits) |

## 4. Defects fixed in this candidate

**Recurring CI failure** (`isolated` / Independent QA, on `3ad8e7c`, `f03e825` and earlier `9e99c58`): "approved · v" never appeared.

- **Root cause:** `CoreForm` renders its success status *before* `router.refresh()` delivers the new tree, and the "Approve" action is bound to the row version of the previous render. Clicking in that gap sends a stale version, which the optimistic-concurrency check correctly rejects. Slower CI runners always land in the gap.
- **Proof:** with a 2.5 s delay injected on the RSC refresh, the old helper failed exactly as CI did and the new one passed.
- **Fix:** the E2E waits for the refresh response before the next action and asserts that no alert appeared.
- **Product note:** an owner who clicks Save and then Approve very quickly gets an honest conflict message, not a silent overwrite. That is safe; better UX (P2) would disable the actions until the refresh lands.

Fixed earlier and included here: drawer scroll root cause; derived "Otro campo" history noise; orphan clients; cross-company sale; misleading `sale_lead_missing` error; non-versioned commission transitions.

## 5. Database: migrations and security

**Production** (`ltbwzcrxeuczdhhtbqgm`, read-only) has 49 recorded migrations; the repository has 52 files.
- 7 repository files were recorded remotely under renamed names (e.g. `crm_client_agreement_drafts` → `crm_client_agreement_drafts_release`). These are equivalent and the history is consistent.
- `radar_scheduler_extensions` exists only remotely (extensions applied via the console). **Drift: UNKNOWN content.** Recommendation: export its definition into the repository.
- **Pending in production, in this order:**
  1. `20261121180000_crm_sale_lead_company_guard`;
  2. `20261121181000_crm_attribution_lifecycle`;
  3. `20261121182000_crm_attribution_legacy_guard`.

  All three are additive and forward-only, and none rewrites historical rows. **BLOCKED on owner approval and a backup.**
- **Cutover dependency:** `182000` makes the old `crm_attribution_transition` fail on purpose. The current production Results page uses that RPC, so **apply the three migrations and deploy this app in the same window.**

**Supabase advisors** (read-only, production):

| Warning | Classification |
|---|---|
| 6 `anon` SECURITY DEFINER: `crm_public_inquiry`, `crm_growth_funnel_submit`/`_view`, `crm_ai_public_control`, `os_bridge_api_open_import`/`_import_status` | Authorized and reviewed exceptions, listed in `tests/security.test.cjs`: public form, public funnel, read-only Actions kill switch, token-gated bridge. Not a demonstrated vulnerability. Closing anonymous intake behind `AVALON_INTAKE_TOKEN` stays BLOCKED (owner decision) |
| 51 `authenticated` SECURITY DEFINER | Each one checks `is_owner`, a capability or a token internally: definer audit 0 ungated, plus PGlite tests with an outsider and an owner without finance access. A warning, not a defect. Residual risk: any authenticated non-owner gets `crm_forbidden`. **Recommendation:** keep public signups disabled |
| `pg_net` in schema `public` | A warning. Moving the extension is a remote change: BLOCKED (owner), low priority |

## 6. Do not merge (duplicated or superseded)
- **#305, #306, #307, #313, #311, #314, #316:** their content is already in this candidate. Close them after this candidate is accepted.
- **#309 (Codex drawer portal), #308 (drawer QA):** the same fix already exists here, so do not merge them separately.
- **#312:** contained in #314.
- **#317 / #296 / #233** (Samuel's staff portal): out of scope and not modified. No shared files with this candidate were found in this session; Samuel should confirm.
- **#36 / #37** (dependabot): separate maintenance.

## 7. Acceptance checklist for Codex
1. Base = the head SHA of the draft PR.
2. Run:
   - `npm test`;
   - `NODE_PATH=tests/qa/node_modules node --test --test-concurrency=1 tests/*.database.cjs tests/operations/*.database.cjs`;
   - `npm run build`.
3. Browser suites, with flags (check that nothing reports `skipped`):
   - `SALES_BROWSER=1 CRM_BROWSER=1 QUOTES_BROWSER=1 CRM_INTEL_BROWSER=1 node --test --test-concurrency=1 tests/sales.browser.cjs tests/lead-drawer-scroll.browser.cjs tests/quotes.browser.cjs tests/crm.integration.cjs tests/quick-improvements/mobile.browser.cjs`.
4. Drawer scenarios A–E, plus wheel/touch, Escape/X and the Kanban after closing.
5. Client "Chino Barber Demo" → exactly one New lead and 0 sales. A sale for client A that tries to use B's opportunity → rejected.
6. Commissions:
   - $10,000 at 5% → $500.00;
   - `paid` only after `invoiced`;
   - the legacy RPC is denied;
   - a stale version → `conflict`.
7. Estimator: N/D without a verified rate; $20.00 base in the synthetic case.
8. `node scripts/security/definer-audit.cjs` → 0 ungated.
9. Physical iPhone Safari, if a device is available.

## 8. Backup and rollback plan
- **App:** Vercel keeps the previous production deployment (`dpl_8fwamEWPEhpaFyg58wEDpzqbdFKV` on `ff8191d`). Rollback = promote it again.
- **Database:** before applying anything, take a Supabase backup or PITR point and a snapshot of `crm_sales`, `crm_attributed_conversions` and `pg_proc` for the affected functions. The three migrations are additive, so roll forward is preferred:
  - `180000`: drop trigger `crm_sale_lead_company_guard`;
  - `181000`: the new columns are nullable or defaulted; `crm_attribution_advance` can be revoked;
  - `182000`: re-create the previous `crm_attribution_transition` body from `20261119150000` only if the old app must come back.
  - Never delete `crm_attribution_events`.

## 9. Pending owner decisions (Miguel + Samuel)
1. Accept this candidate and merge it to `main` (after Codex QA, when available).
2. A maintenance window: backup → migrations 180000/181000/182000 → deploy, together.
3. Verified prices and rates (catalog and estimators); today everything shows N/D.
4. Draft invoices and corrective documents (needs an accountant and a legal review); Florida contract review (#286).
5. `AVALON_INTAKE_TOKEN` and closing the anonymous public intake.
6. Whether public signups stay disabled. Moving `pg_net` out of `public`.
7. Samuel: confirm #317 has no conflict with this candidate.
