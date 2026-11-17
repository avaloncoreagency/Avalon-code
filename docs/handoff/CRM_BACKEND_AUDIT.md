# CRM backend audit — Operation Core Engine (C0)

Fecha: 2026-11-17 · Autor: Claude Code (backend) · Base: `main` `c9a3fec` · Rama: `claude/core-engine-c0`

Todo lo que sigue es evidencia observada en esta sesión. Las lecturas de producción fueron de **solo lectura** (registro de migraciones, Branching y Security Advisor). No se ejecutó SQL contra producción, no se aplicó ninguna migración y no se tocaron datos.

## 1. Estado de GitHub (PR pedidos)

| PR | Tema | Estado real en `main` | Clasificación |
|---|---|---|---|
| #217 | Integridad de Project Bridge (`scripts/bridge-health`, `send-project`) | No está en `main`. Borrador, *mergeable clean* | **Pendiente**. No se duplica: Core Engine no toca Project Bridge |
| #205 | Centro de créditos IA (2 migraciones + UI en `overview.tsx`) | No está en `main`. *mergeable dirty* | **En conflicto**. Fuera del alcance (créditos IA). Toca la UI de Codex |
| #197 | Texto de hallazgos de seguridad (`findings.ts`) | El texto ya está en `main`; esta rama actualiza R-18 con evidencia nueva | **Integrado / obsoleto** |
| #192 | Validación numérica del formulario CRM Intelligence | El código ya está en `main` (`src/lib/crm/intel/form.ts`) | **Integrado / obsoleto** |
| #190 | Radar: fallo cerrado si no se puede verificar la cuota de Geoapify | El código ya está en `main` (`radarQuota` con try/catch y 503) | **Integrado / obsoleto** |
| #189 | Concurrencia de CI y `docs-only` | `concurrency` y `scripts/ci/docs-only.cjs` ya están en `main` | **Integrado / obsoleto** |

Recomendación: cerrar #189, #190, #192 y #197 como integrados, tras confirmarlo su autor. #205 necesita *rebase* y decisión de producto. #217 se puede revisar por separado.

## 2. Supabase producción (`ltbwzcrxeuczdhhtbqgm`)

### 2.1 Registro de migraciones y `MIGRATIONS_FAILED`
- Producción tiene **41** migraciones registradas. La última es `20261114165206 crm_client_agreement_drafts_release`.
- El repo tiene 41 archivos (sin contar la nueva `20261117100000`), pero **29 de ellos usan una versión distinta** de la que registró producción. Producción las aplicó manualmente con `apply_migration`, que asigna marca de tiempo propia. Además:
  - Producción tiene `radar_scheduler_extensions` (`pg_net`/`pg_cron`), que **no existe en el repo**.
  - Los dos archivos `code_exchange*` del repo aparecen en producción como uno solo, `code_exchange_with_anon_disabled`.
- Branching muestra la rama `main` en `MIGRATIONS_FAILED`, con `created_at = updated_at = 2026-10-31`. Ese estado es **histórico**: no lo volvió a actualizar ninguna ejecución reciente, y la instancia está `ACTIVE_HEALTHY`.
- **Significado práctico:** Branching (o `supabase db push`) intentaría volver a ejecutar los 29 archivos con versión distinta sobre objetos que ya existen, y fallaría. **Nunca se debe sincronizar el repo con producción de forma automática.** El procedimiento seguro es:
  1. Respaldo.
  2. `apply_migration` manual de **una** migración nueva, con autorización expresa.
  3. Renombrar el archivo del repo a la versión que haya registrado producción.
  4. Mover el marcador de `tests/prod-schema-compat.browser.cjs`.
- Ese marcador estaba desactualizado: asumía 38 migraciones y que los borradores de contrato no estaban en producción. **Corregido en esta rama** a 41, y ahora la prueba exige que la base nueva falte.
- No se reaplicó ni se reparó nada.

### 2.2 Security Advisor (2026-11-16, 21:54 UTC)

| Aviso | Hallazgo | Veredicto | Acción |
|---|---|---|---|
| 0008 RLS sin políticas (×2) | `crm_private.finance_access`, `public.crm_radar_worker_config` | Ya inaccesibles: tienen privilegios revocados a `anon` y `authenticated`. Solo informativo | Política restrictiva explícita `using (false)` en la migración nueva |
| 0014 extensión en `public` | `pg_net` | La instaló `radar_scheduler_extensions`, que solo existe en producción. Ninguna migración del repo usa `net.http_*` | **No se mueve**: `pg_net` no admite `ALTER EXTENSION SET SCHEMA` y volver a crearla podría romper el planificador. Riesgo aceptado y documentado |
| 0028 DEFINER ejecutable por `anon` (×6) | Formulario de cotización, envío y vista de funnel, interruptor de IA, 2 RPC del puente | Las 6 son intencionadas. Coinciden **exactamente** con la lista revisada | Prueba estática `tests/definer-gates.test.cjs` |
| 0029 DEFINER ejecutable por `authenticated` (×38) | CRM, Office, agentes, Code Exchange y puente | 39 funciones únicas. El análisis estático del repo da el mismo conjunto. **0 sin control**: 24 comprueban propietario, 9 exigen token, 6 son públicas revisadas | Ídem. Se revocaría por error flujos legítimos (formularios, entregas con token): **no se revoca nada** |

El análisis (`scripts/security/definer-audit.cjs`) toma la última definición de cada función y sus `grant`/`revoke` reales. Ahora corre en `npm test`.

### 2.3 Rendimiento SQL
- `20261114120000_fk_lookup_indexes` ya indexó las FK que la app filtra, y está en producción.
- Esta rama **no añade índices especulativos**. Solo indexa lo que las consultas nuevas usan: `crm_invoices(sale_id)`, `crm_invoices(client_id)`, `crm_payments(invoice_id)` parcial, `crm_commissions(client_id)` y el único parcial de comisiones abiertas.
- Medir los avisos restantes de índices sin uso requiere `pg_stat_user_indexes` de producción con tráfico real. Hoy hay cero ventas, así que las estadísticas no serían representativas. **P2**: repetir con uso real.

## 3. Recorrido comercial: qué existía y qué faltaba

| Paso | Antes de esta rama | Ahora |
|---|---|---|
| Prospecto → aprobación humana → lead sin duplicados | ✓ `crm_radar_ingest`, `crm_prospect_approve`, `crm_convert_prospect` y unicidad por email (`tests/crm-flow.database.cjs`) | Sin cambios |
| 13 etapas, historial, responsable, estrellas, diagnóstico | ✓ CRM Intelligence | Sin cambios |
| Ganado exige contrato `verified_signed` | ✓ `won_requires_contract` | Sin cambios; cubierto en las pruebas nuevas |
| Venta idempotente, cliente sin duplicar, órdenes, proyectos y tareas | ✓ `crm_confirm_sale` | Sin cambios |
| Catálogo: precio mensual, costo, margen, exclusiones, duración, condiciones, aprobación, versión, comisión | ✗ Solo precio sugerido, sin aprobación | ✓ `20261117100000` |
| Servicio de automatizaciones | ✗ | ✓ Sin precio |
| Facturación documentada | ✗ | ✓ `crm_invoices` + RPC |
| Pagos: verificación, reversión, referencia única, enlace a factura | ✗ Solo inserción | ✓ |
| Comisiones acordadas → devengadas → pagadas | ✗ Solo `commission_pct` de cliente en términos | ✓ `crm_commissions` |
| Seis cifras financieras separadas | Parcial (contratado, cobrado, gastos, beneficio) | ✓ `crm_client_finance_ledger` |
| Proyecto no reasignable a otro cliente | ✗ | ✓ `project_client_locked` |
| Documento de otro cliente en una factura | n/a | ✓ Rechazado |

## 4. Prioridades

**P0, resueltas en esta rama (sin aplicar a producción):** catálogo comercial, facturas, conciliación, comisiones, libro financiero, bloqueo de proyecto, políticas explícitas, prueba estática de RPC y marcador de compatibilidad.

**P0, requieren al propietario:**
1. ~~Aplicar `20261117100000` en producción~~ — **hecho el 2026-11-17** con autorización del propietario (registro `20261117155716_crm_core_engine`).
2. Dar acceso financiero en `crm_private.finance_access` a quien corresponda.
3. Decidir precios, aprobar ofertas y retirar `recepcionista-ia` del catálogo activo (`active = false`) desde el CRM.

**P1:**
- Revisión dinámica de abuso y límites de los 6 endpoints públicos.
- UI de Codex sobre el contrato.
- Revisar #217.

**P2:**
- Índices con estadísticas reales.
- Llevar `radar_scheduler_extensions` al repo como archivo de solo referencia, para cerrar el desvío.
