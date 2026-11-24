# Sales Pro — collections, payment schedule, refunds and chargebacks

Stacked on PR #323 (Sales Pro studio, Quote parity, agreed payment terms).
Migration `20261123150000_crm_sale_payment_schedule.sql` is **review-only**: it is not applied to production until an owner approves it.

## Why

PR #323 records the *agreed* plan as validated text in `crm_sales.notes`. It says itself that a typed receivables schedule needs a reviewed migration. This is that migration, plus the UI and tests around it. It answers the master prompt's §1.3 / §1.4 / §1.7:
- installments and their status;
- overdue amounts;
- partial payments;
- refunds and chargebacks;
- payment status kept separate from commercial, contract and delivery status;
- exact money handling.

## Data model (additive)

| Object | Purpose | Rules enforced in PostgreSQL |
|---|---|---|
| `crm_sale_installments` | deposit / installment / balance / milestone / recurring rows | See [Installments](#installments) below. |
| `crm_payments.installment_id` | allocate a receipt to one installment | See [Payment allocation](#payment-allocation) below. |
| `crm_payments.method` | manual receipt channels: + ach, wire, zelle, check, paypal, payment_link, financing_external | **No processor**: Stripe stays out until an integration is authorised. |
| `crm_payment_refunds` | refunds and chargebacks | See [Refunds and chargebacks](#refunds-and-chargebacks) below. |
| `crm_sale_receivables` (view, `security_invoker`) | per-sale totals | See [Receivables](#receivables) below. |

### Installments
- The live schedule sums **exactly** to the sale total.
- Due dates are real dates, no earlier than the sale date and at most 10 years after it.
- Amounts are strict decimals greater than 0.
- Rescheduling:
  - never edits an installment that already holds money;
  - cancels replaced rows with a reason, and never deletes them;
  - uses optimistic concurrency through `crm_sales.schedule_version`;
  - is limited to finance owners.

### Payment allocation
- A receipt allocated to an installment can never exceed what is left on that installment.
- The installment must belong to the same sale, be live and use the same currency.
- Allocation is serialised by the sale row lock.

### Refunds and chargebacks
- They apply only to **verified** payments. An unverified capture error is corrected by reversing it instead.
- They are idempotent by key.
- Their sum can never exceed the payment.
- A chargeback stays `open` until it is resolved as `won` or `lost`, with a note.
- A payment that has refunds cannot be reversed.

### Receivables
The view reports, per sale:

| Field | Meaning |
|---|---|
| `recorded` | Receipts that were not reversed. |
| `verified` | Receipts that were verified. |
| `refunded` | Refunds, plus chargebacks that are `open` or `lost`. |
| `net_collected` | Recorded receipts minus refunded amounts. |
| `balance` | Total minus net collected. |
| `overdue` | Unpaid amount past due. Receipts allocated to an installment count for it first; unallocated receipts then cover the oldest open gaps. |
| `next_due` | Next due date. |
| `open_chargebacks` | Number of chargebacks still `open`. |

**Access.** Finance owners can read everything through RLS. Nothing can be written directly; changes go only through:
- `crm_sale_schedule_set`;
- `crm_payment_refund`;
- `crm_chargeback_resolve`.

Each of them requires `auth.uid()`, the owner role and finance access, and is audited in `crm_timeline`.

## One payment status per sale

`paymentStatus()` in `src/lib/sales/schedule.ts` resolves the status in this order:

1. **disputed**: an open chargeback.
2. **refunded**: everything collected was refunded.
3. **paid**: the balance is 0 or less.
4. **overdue**: something is past due.
5. **partially_paid**: some money was collected.
6. **unpaid**: nothing yet.

It stays separate from commercial status (`confirmed`/`cancelled`), contract status and delivery status, which already exist.

## UI

**Sale detail → "Cobranza y calendario de pagos"**
- Summary: net collected, balance, overdue, next due date, refunds and chargebacks.
- Installment table with a per-row status.
- Editor:
  - pre-filled from #323's agreed plan;
  - exact in integer cents, with a live "adds up exactly" check;
  - funded rows stay locked.
- Refund and chargeback forms per verified payment; each form carries an idempotency key rendered with it.
- Chargeback resolution.

**Payment form**
- An optional "Apply to installment" selector.
- The real channel is stored; the `[channel]` prefix is no longer added to the reference.

**Sales list**
- A "Cobranza" column: status, balance and overdue amount.
- Filters "Con saldo" and "Vencidas", resolved in PostgreSQL before pagination.
- An agency KPI, "Cobros vencidos", shown per currency.

## Also fixed (found by the 390 px E2E)

`.tableWrap` had no `position`, so the absolutely positioned `.srOnly` labels inside its tables escaped the scroll container. That widened the sale detail page to 522 px on phones. `position: relative` contains them. This is pre-existing in the work-orders table, not introduced here.

## Tests

| File | Covers |
|---|---|
| `tests/sales-schedule.database.cjs` (PGlite, 4) | Exact total, validation including NaN, concurrency, finance-only RLS, history kept, allocation caps, funded rows locked, manual channels (Stripe refused), receivables and overdue, refunds and chargebacks (verified-only, caps, idempotency, resolution, blocked reversal). |
| `tests/sales-schedule.test.cjs` (unit, 5) | Cents, proposals from the agreed plan, validation, coverage, status. |
| `tests/sales-schedule.browser.cjs` (`SALES_SCHEDULE_BROWSER=1`, after `npm run build`) | Synthetic end to end at 1440 and 390 px (Chromium emulation, **not** physical Safari): create the schedule in the UI → allocated Zelle receipt → verify in the UI → partial refund → chargeback, which shows "disputed", resolved as won → list overdue filter and KPI → no horizontal scroll. |

All of them run in `.github/workflows/crm.yml`.

## Not done / limits

- **Overdue ignores refunds.** Refunds reduce `net_collected` and `balance`, not the coverage of individual installments.
- **Re-collecting after a refund is blocked.** The total cap still counts gross receipts, so money cannot be collected again after a refund. This is conservative by design.
- **No automatic recurring billing, reminders, interest or late fees**, and no processor integration (Stripe needs an authorised integration).
- **No accounting postings.** Invoices remain the existing documented-invoice model.
- **Production:** NOT applied. Hosted Preview: NOT_RUN, because no isolated Supabase Preview exists and the owner declined a paid branch.
