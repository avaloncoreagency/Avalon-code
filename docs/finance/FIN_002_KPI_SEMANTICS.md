# FIN-002 — Semántica financiera y criterios de aceptación

**Estado:** ajuste de presentación en rama aislada; sin modificaciones de cálculos, ledger, transacciones ni políticas contables.

## Fuentes y límites

- `src/lib/sales/client-finance.ts`: el fallback calcula `collectedCents - expensesCents`. No incluye todos los gastos indirectos, impuestos, conciliación bancaria ni devengo contable. No es rentabilidad neta ni flujo de caja.
- `src/lib/sales/client-finance-server.ts`: fuente preferida `crm_client_finance_summary`; paginación completa como fallback cuando la función no está disponible. Lectura parcial o fallida impide declarar resultado total.
- `recurringCents`: cuota recurrente contratada de ventas confirmadas; no prueba contratos activos, facturación continua ni MRR contable.
- `crm_sales_metrics()`: separa importe contratado, cobrado y recurrencia por moneda, no equivale automáticamente a ingreso devengado.
- `crm_attributed_conversions`: ventas del negocio del cliente ≠ ingreso propio de Avalon. `crm_commissions`: pagos a vendedores ≠ comisiones cobradas por Avalon.

## Cambio FIN-002

1. Etiqueta ES/EN de saldo: `Cobrado menos gastos registrados`, sin presentarlo como ganancia neta.
2. Etiqueta ES/EN del recurrente: `Recurrente contratado/mes (no MRR activo)`.
3. Prueba sintética de regresión de etiquetas y preservación de límites del cálculo.

## Aceptación

- El valor numérico del saldo, autorización y estados parcial/completo se mantienen iguales.
- No se cambian SQL, RLS, secrets, operaciones, facturas, pagos, clientes ni portal de empleados.
- Verificar `node --test tests/finance-kpi-labels.test.cjs`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` sobre el SHA exacto.
- Verificar diseño ES/EN en iPhone y Preview aislado. Ninguna de esas pruebas se infiere de GitHub CI.

## KPI futuros — pendientes de fuente verificada

| KPI | Fuente requerida |
| --- | --- |
| Revenue devengado | Facturas, servicio prestado y política contable |
| MRR activo | Contratos activos, altas, bajas y moneda |
| Margen por cliente | Revenue devengado, costos directos y reglas de asignación |
| Beneficio neto | Gastos indirectos, impuestos y ajustes |
| Cuentas por cobrar | Facturas menos pagos aplicados, créditos y bajas |
| Caja | Movimientos de efectivo conciliados |

Sin datos no significa cero. No sumar ventas del cliente a Revenue Avalon.

## Handoff

Refs #283. Evitar solapamientos con PR #225 y trabajo de Samuel.

Next action: correr los checks y la aceptación visual en el SHA exacto del PR; propietarios revisan antes de cualquier merge o despliegue.