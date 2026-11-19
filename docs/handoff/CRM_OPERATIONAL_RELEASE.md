# CRM operational release — Operation Core Engine

Estado: **aplicado en producción el 2026-11-17** con autorización expresa del propietario (registro `20261117155716_crm_core_engine`, 42 migraciones). Verificación posterior: `get_advisors` sin alertas 0008 y con las 6 nuevas 0029 previstas, todas con control de propietario.

Estado anterior: listo para revisión. Las pruebas de esta tabla se ejecutaron en esta sesión, sobre la rama `claude/core-engine-c0`.

## 1. Qué cambia

| Checkpoint | Entregado | Archivo |
|---|---|---|
| C0 Auditoría | Estado de los PR, registro de migraciones, Security Advisor y huecos del recorrido | `docs/handoff/CRM_BACKEND_AUDIT.md` |
| C1 Seguridad | Prueba estática de las 45 funciones DEFINER ejecutables (39 existentes + 6 nuevas): 0 sin control. Políticas explícitas de denegación en las 2 tablas señaladas | `scripts/security/definer-audit.cjs`, `tests/definer-gates.test.cjs`, migración §6 |
| C2 Pipeline y ventas | Sin cambios de esquema (ya funcionaba). Recorrido completo cubierto por la prueba piloto: lead, etapas, propuesta, contrato, venta idempotente | `tests/core-engine.database.cjs` |
| C3 Contratos, finanzas y comisiones | Facturas documentadas, conciliación de pagos (verificar, revertir, referencia única), comisiones acordadas/devengadas/pagadas, libro con seis cifras | migración §2–§5 |
| C4 Clientes 360° y proyectos | Libro financiero por cliente; el proyecto no puede pasar a otro cliente; documento de otro cliente rechazado | migración §5, §5b |
| C5 Radar, calendario, tareas y notificaciones | Verificado sin cambios: fallo cerrado de cuota ya en `main`, eventos y tareas existentes. Sin envíos externos | — |
| C6 Piloto de la barbería | Recorrido sintético B2B completo, sin venta real ni datos B2C mezclados | `tests/core-engine.database.cjs` |
| C7 Contrato con Codex | Tipos, validación y llamadas de servidor; contrato publicado | `src/lib/sales/core-engine*.ts`, `docs/handoff/CRM_BACKEND_CONTRACT.md` |

## 2. Pruebas ejecutadas

| Comando | Resultado |
|---|---|
| `npm test` (unitarias y guardas estáticas) | 633/633 ✓ |
| `NODE_PATH=tests/qa/node_modules node --test tests/*.database.cjs` (PGlite, todas las migraciones, RLS real) | 68/68 ✓ |
| Cadena completa en **PostgreSQL 16** (`psql ON_ERROR_STOP`) + `tests/sql/crm_pipeline.test.sql` | ✓ |
| `tests/prod-schema-compat.browser.cjs` (build de producción contra el esquema de producción de 41 migraciones) | ✓ |
| `npm run typecheck`, `npm run lint` (0 errores; 1 aviso previo en `suite/chrome.tsx`), `npm run build` | ✓ |

Casos mínimos del encargo, ya cubiertos:
- Dos propietarios con acceso y un tercero rechazado.
- Prospecto duplicado (`crm-flow`).
- Doble envío de una venta, que devuelve la misma venta.
- Venta rechazada sin contrato verificado.
- Venta aceptada con contrato sintético.
- Cliente duplicado bloqueado.
- Proyecto vinculado a otro cliente: rechazado.
- Documento de otro cliente en una factura: rechazado.
- Céntimos exactos: total 2400.10, comisión 240.01, beneficio 809.54.
- El historial sigue ahí tras recargar.
- Pagos y facturas no editables ni borrables desde la API.
- Pagos revertidos excluidos de cualquier cifra cobrada.
- Prueba de compatibilidad frente al registro real de producción.
- Cero llamadas a servicios de pago: no hay red, ni Geoapify, ni IA.

## 3. Lo que NO hace

- No se aplicó a producción, no se ejecutó SQL de producción y no se crearon ramas de Supabase con coste.
- No activa Stripe, transferencias, correos, SMS, WhatsApp, chatbots, recepcionistas ni campañas.
- No inventa precios, porcentajes, ventas ni firmas. El catálogo nace en borrador y sin precio.
- No desactiva la recepcionista IA por su cuenta. Es una decisión del propietario (`active = false`) y la prueba demuestra que, hecha, bloquea nuevas ventas.
- No toca pantallas de Codex.

## 4. Pasos para activarlo en producción (requieren autorización)

1. Respaldo de `ltbwzcrxeuczdhhtbqgm` (PITR o volcado).
2. `apply_migration` con el contenido de `20261117155716_crm_core_engine.sql` (antes `20261117100000`), en una sola transacción. ✓ 2026-11-17.
3. Renombrar el archivo del repo a la versión que haya registrado producción y mover `PRODUCTION_LAST_LOCAL_MIGRATION` en `tests/prod-schema-compat.browser.cjs`.
4. Ejecutar `get_advisors` (seguridad y rendimiento). Lo esperado: las dos alertas 0008 desaparecen y aparecen 6 nuevas 0029, todas con control de propietario.
5. Conceder `crm_private.finance_access` a los propietarios que deban ver finanzas.

**Reversión:**
- `drop` de `crm_commissions` y `crm_invoices`, con sus RPC.
- `alter table crm_payments drop column` de las columnas nuevas, tras restaurar `payment_guard` desde `20261102170000`.
- `drop trigger` de `crm_service_catalog_offer_guard` y `os_projects_client_lock`.
- `drop` de las columnas nuevas del catálogo y de las dos políticas.
- Restaurar `crm_sales_metrics` y `crm_client_finance_summary` desde sus migraciones originales.

No hay datos que migrar: producción tiene cero ventas.

## 5. Bloqueos reales

- Autorización expresa del propietario para aplicar el esquema en producción.
- Precios, ofertas y acuerdos de comisión: los deciden Miguel y Samuel.
- UI de Codex sobre el contrato §A–§D.
- Revisión dinámica de abuso de los 6 endpoints públicos (P1).
- Medición de índices con tráfico real (P2).
