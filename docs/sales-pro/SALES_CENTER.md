# Sales Center — Quotes + Sales unification (V4)

All data in this document and in its tests is synthetic. Migration `20261123160000_crm_sales_center_close.sql` is **not applied to production**; applying it needs written authorization from both owners.

## One flow, one form

```
Lead → Cotización (Quoting Studio, único motor de propuestas)
     → revisión interna → aprobada → enviada → aceptada (+ evidencia)
     → contrato firmado y verificado (won gate existente)
     → «Cerrar venta» (crm_quote_close_sale) → Venta + términos inmutables
     → órdenes de trabajo / proyectos / tareas (crm_confirm_sale, sin duplicar)
     → cobros (calendario, cuotas, reembolsos)   → liquidaciones variables → cobro
```

- **Nueva venta** (`/crm/sales/new`) lists the accepted quotes that have not been closed yet. A **Crear cotización** button sits next to them. The old manual form is collapsed under «Registro manual — solo ventas históricas o excepciones autorizadas». It opens on its own only when the page is reached from a lead or a client (`?lead=` / `?client=`), so legacy routes keep working.
- `?quote=` (the old «Preparar venta» link) now redirects to `quotes/{id}#close-sale`. Quote lines are never typed twice.
- Sales Center tabs: Resumen · Cotizaciones · Ventas cerradas · Cobros y liquidaciones · Postventa, plus **+ Nueva venta**.

## Entities stay separate

| Entity | Table | Notes |
|---|---|---|
| Quote | `crm_quotes`, `crm_quote_versions` | sha256-sealed content per version |
| Contract | `crm_contracts` | `verified_signed` is required to close |
| Sale | `crm_sales` (+ `quote_id`, `quote_version_id` UNIQUE, `commercial_model`) | one sale per accepted version |
| Accepted terms | `crm_sale_terms` | immutable copy (update and delete are blocked by a trigger, even for privileged roles) |
| Variable agreement | `crm_sale_variable_terms` | `revenue_share` / `sale_commission` / `outcome_commission`; pct, base, trigger, evidence, settlement, exclusions, refunds, effective date, duration |
| Settlement | `crm_sale_settlements` | period, eligible base, exclusions, pct. The DB generates `amount_due = round((base − excl) × pct / 100, 2)`. Periods cannot overlap. States: `recorded → verified / void` |
| Receivable | view `crm_sale_receivables` | `balance = total + variable_due (verified) − net collected`; also shows `variable_pending` |
| Payment | `crm_payments` | the cap is `total + verified settlements` (`payment_guard`) |
| Work order / Commission | unchanged | created by `crm_confirm_sale` / the commission engine |

## Closing guarantees (`crm_quote_close_sale`)

- Only for an **accepted** quote, with a verified contract. Every line must be an active catalog service of the same billing type. A percentage still marked «por acordar» blocks the close.
- **Atomic.** It reuses `crm_confirm_sale` with a deterministic idempotency key (`md5('avalon-quote-close:' || version_id)`). Any failure rolls back everything.
- **Idempotent.** A double click, a retry or a race returns the same sale (`replayed: true`). If the quote changed during review, the close is refused with `quote_version_changed`.
- The UI («Cerrar venta» panel) shows the same blockers before the button is enabled. The database re-checks all of them anyway.

## Commercial models

| Model | Status |
|---|---|
| A fixed price | VERIFIED (DB + UI) |
| B monthly subscription | VERIFIED |
| B quarterly / annual subscription | NOT IMPLEMENTED: line kinds are only `one_time` / `monthly` |
| C revenue share (Chino synthetic case) | VERIFIED: never shown as $0. It shows «Venta por participación en ingresos — importe variable pendiente de liquidación» |
| D sale commission / E outcome commission | VERIFIED (DB); same UI as C |
| F hybrid (fixed + %) | VERIFIED (DB); the list and the sale show «+ variable» |
| G milestones | PARTIAL: payment-schedule installments, not a separate model |
| H hourly | NOT IMPLEMENTED |
| I TBD drafts | VERIFIED: `to_negotiate` cannot be closed |

## Known consolidation item

Pre-quote agreements still use the client-level attribution engine (`crm_attribution_*`). New variable sales use sale-scoped settlements. Merging the two needs an owner decision about historical data.

## Tests

- `tests/sales-center.test.cjs`: readiness logic and quote-model fields.
- `tests/sales-center.database.cjs`: TEST 1–9 and 11 in real PostgreSQL (PGlite).
- `tests/sales-center.browser.cjs` (`SALES_CENTER_BROWSER=1`, after `npm run build`). It follows the synthetic Chino case end to end through the real UI: quote → close → settlement → verify → payment, then Clients 360. It also checks 320/375/390/430/768 px with no horizontal scroll. This uses Chromium emulation, not physical Safari.
