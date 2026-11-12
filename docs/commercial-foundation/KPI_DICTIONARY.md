# Commercial Foundation — KPI dictionary v1.0

**Truth standard:** `N/D` for missing/disconnected/partial data; `0` only when a complete source verifies zero. Source data must be exact for selected period. No currencies mixed and no B2C metrics from B2B tables.

| ID | Metric | Source | Definition |
|---|---|---|---|
| KPI-01 | Leads B2B nuevos | crm_leads audience=agency_b2b | Conteo de identidades únicas por fecha de creación |
| KPI-02 | Leads calificados | crm_leads / lead_score | Estado de calificación aprobado, no mero score |
| KPI-03 | Leads contactados | crm_activities | Actividad de contacto completada; no tarea programada |
| KPI-04 | Propuestas presentadas | CRM propuestas | Propuestas con envío o presentación verificable |
| KPI-05 | Ventas verificadas | crm_sales | Ventas confirmadas y gate contractual válido |
| KPI-06 | Conversión B2B | crm_sales + crm_leads | Ventas atribuibles a una misma cohorte / leads elegibles *100 |
| KPI-07 | Ingresos facturados | facturas verificadas | Facturas válidas netas de notas de crédito |
| KPI-08 | Ingresos cobrados | crm_payments / conciliación | Solo pagos reales conciliados netos de ajustes |
| KPI-09 | Gastos reales | crm_client_costs y finanzas | Gastos verificados por período |
| KPI-10 | Beneficio bruto | ingresos + costos directos | Ingresos reconocidos menos costos directos correspondientes |
| KPI-11 | Margen bruto | beneficio e ingresos | Beneficio bruto / ingresos reconocidos *100 |
| KPI-12 | MRR | contratos recurrentes activos | Mensualidad contractual, no efectivo recibido |
| KPI-13 | Solicitudes B2C válidas | futuro backend B2C | Solicitudes con consentimiento y elegibilidad validada |
| KPI-14 | Solicitudes asignadas | futuro backend B2C | Asignación única y auditada |
| KPI-15 | Tiempo primer contacto | futuro backend B2C | Marca de asignación a contacto acreditado |
| KPI-16 | Trabajos cerrados | futuro backend B2C | Cierre verificado del contratista |
| KPI-17 | Valor trabajos contratista | futuro backend B2C | Volumen ajeno; NUNCA ingreso de Avalon |
| KPI-18 | Comisiones generadas | futuro registro de comisiones | Base elegible y términos firmados |
| KPI-19 | Comisiones cobradas | cobros conciliados Avalon | Comisiones realmente recibidas |
| KPI-20 | Envíos de formularios | crm_growth_funnel_submissions | Eventos válidos, no personas únicas |
| KPI-21 | Contactos únicos | CRM deduplicado | Identidades distintas por regla explícita |
| KPI-22 | Gasto publicitario | Meta / facturas auditadas | Importes efectivamente gastados |
| KPI-23 | Costo por lead válido | gasto + leads | Gasto verificable / leads válidos atribuidos |
| KPI-24 | Costo de adquisición | gasto + ventas atribuibles | Gasto verificable / adquisiciones confirmadas |
| KPI-25 | Conversión landing | web analytics | Conversiones válidas / visitantes únicos verificados |
| KPI-26 | ROAS verificable | gasto + revenue | Ingresos atribuibles documentados / gasto verificado |

## Delivery states
- `VERIFIED`: complete, fresh source and known denominator.
- `NOT_CONNECTED`: no authorized provider connection.
- `PARTIAL`: truncated, lagged or incomplete query.
- `ERROR`: request failed; value must not become zero.
- `N/D`: missing denominator, incompatible cohort or unavailable source.

## Reporting rules
Never combine a contractor's gross job value with Avalon revenue. Never show a commission estimate as cash received. Distinguish contracted, invoiced, paid and refunded amounts. Attach source, as-of timestamp, timezone, currency, period, filters, methodology and owner access to every KPI.

## Implemented now
Private overview `/admin/workspace/marketing-hub/commercial/overview` queries canonical owner-authorized CRM counts and `crm_sales_metrics()`; other definitions remain future work. Finance helper in `src/lib/commercial/metrics.ts` supports verified conversion/CPL calculations but is not a provider integration.