# Finance P0 — PR #322 follow-up (non-finite money, legacy commission path) + #325 posture regression

Branch `claude/finance-p0-322-20261123`, base `main@04969aa`. Migrations are **review-only**: none of this is applied to
production until an owner approves.

## Defects, verified on `main@04969aa` before the fix

| # | Defect | How it was reproduced | Before | After |
|---|---|---|---|---|
| 1 | `crm_attribution_record` stores `gross_collected: "NaN"` and poisons the aggregate (Codex #322) | Codex's `financial-boundaries.database.cjs`, unmodified | NaN stored | `amount_invalid`, nothing stored |
| 2 | A pre-V5 `verified` conversion cannot advance to `invoiced` (Codex #322) | same file, legacy upgrade test | `crm_attribution_attribution_evidence` violation | Advances, carrying its original evidence |
| 3 | **New finding:** `crm_commission_agree` stores a commission with `fixed_amount: "NaN"` | `tests/finance-finite.database.cjs` (this branch) | NaN stored | `crm_commissions_fixed_amount_finite` violation |
| 4 | **Regression from #325:** the in-app security manager reports the reviewed `dev_bridge_agent_event` as a HIGH "anonymous definer" finding | `tests/agents-engine.database.cjs`, `tests/agents-managers.database.cjs` | 2 failing | passing |

Entry points checked and **already safe** before the fix (no false credit taken):
- sale lines, through the strict decimal pattern in `crm_private.amount`;
- Quotes, through its own pattern;
- invoices and payments: NaN is caught by the cap against the sale total, because NaN orders above every number;
- commission `rate_pct` and lead `value`, through existing checks.

**Root cause.** PostgreSQL `numeric` accepts `NaN` and orders it **above** every number. Guards like `amount <= 0` or `check (amount > 0)` therefore cannot catch it.

## Fixes

1. **`20261123140000_crm_finance_finite_money.sql`** (forward-only):
   - **A.** Every numeric column of every public table gets `<table>_<column>_finite CHECK (col not in ('NaN','Infinity','-Infinity'))`. At the time of writing that is 43 columns. This is defense in depth for RPCs, direct inserts and future functions.
   - **B.** `crm_attribution_record` keeps the same body and adds the finite guard proposed by Codex, which returns the documented `amount_invalid` error.
   - **C.** `crm_attribution_advance` adds an explicit legacy path for `verified` → `invoiced`:
     - it requires the row's original `verified_at` and `verification_ref`;
     - it copies them into both V5 evidence slots with their **original time and actor**, prefixed `legacy-v4:`;
     - it records the carry-over in the append-only event log.

     Nothing is invented. A direct `verified` → `paid` is still refused, and so is `paid` → `void`.
2. **`20261123141000_dev_bridge_posture_allowlist.sql`**: `crm_agent_security_posture_internal` keeps the same body and adds the reviewed name `dev_bridge_agent_event` to its allowlist.

## Production preflight (read-only, run 2026-11-23 on `ltbwzcrxeuczdhhtbqgm`)

- Non-finite values in conversions, commissions, payments, invoices, sales or leads: **0**.
- Legacy `verified` conversions: **0**.
- Totals: 0 conversions, 0 commissions, 0 sales.

The CHECK constraints would validate cleanly. If any non-finite value appears before applying, adding the constraint fails, the transaction rolls back and nothing changes.

## Rollback

- **Constraints:**
  ```sql
  alter table public.<table> drop constraint <table>_<column>_finite;
  ```
  The names are generated deterministically; list them with:
  ```sql
  select conname from pg_constraint where conname like '%\_finite';
  ```
- **Functions:** re-run the previous bodies from these migrations:
  - `20261119150000` for `crm_attribution_record`;
  - `20261121182000` for `crm_attribution_advance`;
  - `20261112110000` for `crm_agent_security_posture_internal`.
- No data is rewritten, so there is nothing to restore.

## Evidence (local)

| Check | Result |
|---|---|
| Codex's #322 regressions, unmodified (`financial-boundaries` + `proposed-finite-guard`) | **7/7 pass**; 4 pass / 3 fail on `main` |
| `tests/finance-finite.database.cjs` | 2/2 pass; **fails 2/2 without the migration** |
| All `tests/*.database.cjs` | 96/96 |
| `npm test` | 812/0 |
| typecheck | PASS |
| lint | 0 errors, 2 warnings that already exist on `main` |
| Definer audit | 61 functions, 0 ungated |

Production: **NOT applied**. Hosted Preview: NOT_RUN (no isolated Supabase Preview exists; the owner declined a paid branch).
