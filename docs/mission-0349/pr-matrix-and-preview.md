# Operación 0349 — Matriz de PRs y diagnóstico de Preview/migraciones

Verificado el 2026-11-04 contra GitHub (lista de PRs abiertos), Supabase (`list_migrations`, `list_branches`, advisors) y Vercel (variables, solo nombres/targets, nunca valores). `main` = `8a0104d`. Nada aquí cambia producción.
«No verificado» = no se leyó el detalle del PR en esta pasada; la fila se basa en título/descripción.

## 1. Matriz de PRs

| PR | Qué es | Veredicto | Motivo / dependencia |
|---|---|---|---|
| #119 | Higgsfield/Creative Bridge consolidado (#87→#112→#116) sobre `main@8a0104d` | **Conservar (canónico)** | Sustituye #87/#112/#116. 14/15 checks verdes; falla la anotación `CodeQL` (sin diagnosticar). Sin entrega real aprobada: no se declara "conectado". |
| #87, #112, #116 | Ramas apiladas históricas del Bridge | **Sustituido por #119** | No fusionar; cerrar solo con coordinación de Codex. |
| #120 | Motor persistente de 5 managers (Claude) | **Integrar** | Migración `20261104120000` no aplicada. Contrato en `docs/office/MANAGER_ACTIVITY_CONTRACT.md`. |
| #122 | UI honesta de Oficina (Codex) sobre `main@8a0104d` | **Integrar tras #120** | Su fuente actual es el reporte GitHub; debe leer `manager-activity` de #120. |
| #102 | Managers + ledger GitHub (issue #108) | **Complementario / reemplazado en UI por #122** | El ledger gratuito se conserva como fuente secundaria; no duplicar motor. |
| #121 | Dev Bridge reconciliado (Codex) | **Conservar (Codex)** | Sustituye a #96. No tocar. |
| #96 | Dev Bridge antiguo | **Sustituido por #121** | |
| #110 | Contrato financiero Cliente 360° (101/201) + guardas de evidencia (Claude) | **Integrar** | Archivos nuevos; la integración de UI es el parche `docs/handoff/CLIENT_FINANCE_UI_INTEGRATION.patch` (archivos de Codex). |
| #100 | Test de regresión 101/201 (KENJI) | **Integrar con #110** | Su arnés necesita el mock de `client-finance`. |
| #73, #115 | Sales Copilot de solo lectura + vista owner | **Bloqueado** | #73 tiene la debilidad de validación de hostnames (#110 la corrige con `evidence-guard`); #115 apilado sobre #73. No fusionar antes. |
| #77 | Cuota/replay del Radar, duplicados, SEO, unidades IA (Claude) | **Integrar tras reconciliar** | `main` ya tiene #99 (worker), #113, #118; #77 está basado en `c5d5caf` y choca. No verificado el estado exacto del conflicto hoy. |
| #65, #67 | Geoapify opt-in | **No verificado** | #77 documentó conflicto con #67. |
| #92, #93, #85 | Tests de contrato Radar→venta y guardas de autorización | **Conservar** (solo tests) | Sin conflicto conocido; verificar CI. |
| #54, #59, #90 | Catálogo/Solution Planner/propuesta imprimible | **No verificado** | #90 apilado sobre #59; #77 notó conflicto en `tests/sales.browser.cjs`. |
| #105 | Prueba SQL del expediente + dependencia de migración | **Conservar** | Documenta la deriva del ledger (ver §3). |
| #109 | HQ isométrica | **Conservar (Codex)** | Depende de #102 para el estado. |
| #97, #88, #103, #104 | Entregas/tareas/mensajes UI | **Conservar** | No tocados por esta misión. |
| #118, #113, #99, #107 | Radar (worker, tiers, analista) | **Ya en `main`** | Fuente canónica del Radar actual. |

No se cierra ningún PR ajeno.

## 2. Por qué falla Vercel Preview (causa verificada)
- `next.config.ts` lanza `Preview must use an isolated Supabase database, never production.` solo si `VERCEL_ENV=preview` y `NEXT_PUBLIC_SUPABASE_URL` contiene la referencia del proyecto de producción. **La protección es correcta y no se toca.**
- En Vercel, las variables `NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY` de Preview están definidas **por rama** (≥34 ramas con su propio par; lectura truncada a 100 filas). Una rama nueva (p. ej. `integration/higgsfield-bridge-unified-20261104`, `agent/claude-*`) no tiene override y hereda el valor general de Preview; si ese valor apunta a producción, el guard aborta el build. **No pude leer el valor general (lectura truncada y valores cifrados): causa probable, no confirmada.**
- Existen ramas Supabase aisladas ACTIVE_HEALTHY: `nwiqgnaaezpkomwmjhwi`, `vvnylyfsjhmyidbfuxru` (PR #82), `wupvuwmqfcvmjqycmnvg` (PR #19). Ninguna es la de una rama de PR actual y sus esquemas están atrasados (ver §3).
- **Corrección propuesta (requiere dueño; no aplicada):** definir UN par de variables de Preview para *todas* las ramas apuntando a una rama Supabase **persistente aislada** y retirar los overrides por rama. Coste de ramas de Supabase: no verificable con las herramientas disponibles → confirmar en la facturación antes de crear/mantener ramas.

## 3. Migraciones: repositorio vs. producción vs. ramas aisladas
| Migración (repo `main`) | Producción (ledger) | Observación |
|---|---|---|
| 20261102053022 … 20261103100000 (10) | mismas versiones | OK |
| 20261103113000 `crm_client_workspace` | `20261103205807 crm_client_workspace_finance_access` | **Versión y nombre distintos** (#105 lo documentó). |
| 20261103192500 `radar_source_research` | `20261103192843` | Mismo nombre, otra versión |
| 20261103195650 `radar_auto_technical_opportunity_tier` | `20261103195650` | OK |
| 20261103205000 `radar_scheduler_core` | `20261103211927` + extra `20261103212000 radar_scheduler_extensions` | `radar_scheduler_extensions` **no existe en `main`** |
| 20261103223000 `staff_profiles_notifications` | `20261103213432` | Mismo nombre, otra versión |
| 20261103224500 `radar_profile_prequalification` | `20261103215714` | Mismo nombre, otra versión |
| 20261104120000 / 20261104130000 (esta misión) | — | Propuestas, no aplicadas |

- **MIGRATIONS_FAILED en la rama `main` de Supabase Branching (proyecto sano):** Branching intenta reproducir las migraciones del repo sobre su propio ledger; con versiones/nombres distintos reintentaría crear objetos ya existentes. Hipótesis coherente con la evidencia, **no demostrada** (no hay logs de ese job accesibles).
- **Reparación segura (no aplicada):** (1) exportar el SQL realmente aplicado de `radar_scheduler_extensions` y `crm_client_workspace_finance_access` y comprobar si es equivalente al repo; (2) si lo es, añadir la migración faltante al repo con su versión de producción o reparar el ledger con `supabase migration repair` — acción remota sensible: **pendiente de aprobación**; (3) respaldo previo: dump de esquema + PITR/backup diario del plan Pro; (4) rollback: el ledger es metadato, revertir = restaurar las filas originales de `supabase_migrations.schema_migrations`.
- Las ramas aisladas no contienen las migraciones de Radar posteriores a `20261103100000`: **no sirven tal cual** para probar Radar/managers; habría que reconstruirlas desde `main`.
