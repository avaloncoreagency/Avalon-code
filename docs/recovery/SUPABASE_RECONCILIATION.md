# Supabase: reconciliación del repositorio con producción

| Campo | Valor |
|---|---|
| Fecha | 2026-11-13 (Operation Phoenix, CP3) |
| Repositorio | `main` @ `1c996ac` + PR de Phoenix (incluye #165), 34 migraciones |
| Producción | `ltbwzcrxeuczdhhtbqgm` |
| Base aislada | `wupvuwmqfcvmjqycmnvg` (rama de Supabase sin datos de producción) |
| Estado remoto usado aquí | Historial leído con el conector de Supabase el **2026-11-12**. El 13 el conector no responde (503), así que no se ha vuelto a leer. **Hay que confirmarlo antes de cualquier aplicación.** |

## 1. Por qué no basta con comparar nombres

Producción no se migró con `supabase db push`. Las versiones se aplicaron a mano o por MCP, con **otras marcas de tiempo**. Además, hay una migración remota que no existe en el repositorio (`radar_scheduler_extensions`).

Por eso la equivalencia se decide por **estructura**, con la herramienta de §4, y no por versión ni por nombre de archivo.

## 2. Matriz (repositorio → historial remoto del 2026-11-12)

| # | Versión en el repo | Nombre | Versión remota | Estado | Nota |
|---|---|---|---|---|---|
| 1–11 | 20261102053022 … 20261103100000 | membresías, módulos, núcleo CRM, ventas, 13 etapas, núcleo Radar, solicitudes públicas, tablero, calendario, oficina | Las mismas versiones | Aplicadas, misma versión | — |
| 12 | 20261103113000 | crm_client_workspace | 20261103205807 `crm_client_workspace_finance_access` | **Equivalente probable, versión distinta** | Comprobar por estructura |
| 13 | 20261103192500 | radar_source_research | 20261103192843 | Equivalente probable | Ídem |
| 14 | 20261103195650 | radar_auto_technical_opportunity_tier | 20261103195650 | Aplicada | — |
| 15 | 20261103205000 | radar_scheduler_core | 20261103211927 | Equivalente probable | Ídem |
| — | *(no está en el repo)* | — | 20261103212000 `radar_scheduler_extensions` | **Solo en remoto** | Exportar su SQL y versionarlo, o documentar qué crea |
| 16 | 20261103223000 | staff_profiles_notifications | 20261103213432 `staff_profiles_global_notifications` | Equivalente probable | Ídem |
| 17 | 20261103224500 | radar_profile_prequalification | 20261103215714 | Equivalente probable | Ídem |
| 18 | 20261104120000 | manager_execution | 20261104163843 | Equivalente probable | Ídem |
| 19 | 20261104130000 | project_client_canonical | 20261104163904 | Equivalente probable | Ídem |
| 20 | 20261104140000 | radar_rules_decisions | 20261104163931 | Equivalente probable | Ídem |
| 21 | 20261105090000 | manager_missions | 20261104172854 | Equivalente probable | Ídem |
| 22 | 20261106090000 | ai_engine | Versión MCP del 2026-11-12, `ai_engine` | Aplicada (Claude, 12-nov) | Contenido idéntico al archivo |
| 23 | 20261106100000 | radar_owner_approval | Versión MCP del 12-nov | Aplicada (Claude, 12-nov) | Idéntica |
| 24 | 20261107090000 | ai_chatbots_module (PR #164) | **Desconocido** | Por verificar | Llegó a `main` después de la última lectura |
| 25 | 20261108100000 | project_bridge | Versión MCP del 12-nov | Aplicada (Claude, 12-nov) | Idéntica |
| 26 | 20261109160000 | code_exchange | Versión MCP del 12-nov, `code_exchange_with_anon_disabled` | Aplicada **fusionada con #28** | Anon nunca tuvo acceso (verificado `code_anon = false`) |
| 27 | 20261110140000 | radar_search_runs | — | **Pendiente** | Tres intentos el 12-nov: la confirmación del owner caducó; no se aplicó (verificado) |
| 28 | 20261111090000 | code_exchange_disabled | Fusionada en #26 | Aplicada (equivalente) | — |
| 29 | 20261111100000 | crm_intelligence | — | **Pendiente** | Depende de #27 |
| 30 | 20261112090000 | crm_titan_backend | — | **Pendiente** | Depende de #27 y #29 |
| 31 | 20261112100000 | crm_titan_documents | — | **Pendiente** | — |
| 32 | 20261112110000 | growth_funnel_public | — | **Pendiente** | Exposición anónima aprobada por el owner el 12-nov |

**Migraciones en PR abiertas (todavía no están en `main`):**

| Migración | PR | Observación |
|---|---|---|
| `20261112130000_commercial_b2c_owner_only` | #167 | — |
| `20261112153000_bridge_token_scope_hardening` | #169 | **Duplica** la corrección de #165 (integrada aquí); #169 queda reemplazada |
| `20261112190000_bridge_scope_hardening` | #165 → PR de Phoenix | Integrada en la cadena del repo; pendiente en producción |
| `20261112191000_future_public_default_acl` | #165 → PR de Phoenix | Integrada en la cadena del repo; pendiente en producción. Solo afecta a objetos **futuros** |
| `20261112204212_crm_growth_consent_version_required` | #170 | — |
| `20261112204554_crm_public_inquiry_restore_caller_identity` | #170 | — |

## 3. Riesgos sobre los datos existentes (producción, 12-nov)

**Datos reales:** 0 leads, 0 ventas, 4 tareas, 86 prospectos y 2 owners.

**Las migraciones pendientes son aditivas:**
- Columnas con valor por defecto.
- Tablas nuevas.
- Funciones.
- Triggers que solo actúan sobre escrituras nuevas.

**Efectos de comportamiento que hay que conocer antes de aplicarlas:**

| Migración | Efecto |
|---|---|
| `crm_intelligence` | Ningún lead pasa a **Ganado** sin un contrato verificado. También afecta a `crm_confirm_sale` |
| `crm_titan_backend` | Las tareas no pueden quedar vinculadas a otro cliente; la aprobación de comisiones queda ligada a quien aprueba; el Radar registra los fallos del proveedor |
| `crm_titan_documents` | Los adjuntos nuevos deben tener un hash real |

Ninguna borra ni reescribe filas existentes. La única que redefine una función ya existente es `crm_radar_ingest`, y mantiene su firma.

## 4. Herramienta de verificación estructural (nueva, `scripts/recovery/`)

| Archivo | Qué hace |
|---|---|
| `schema-fingerprint.sql` | Consulta de **solo lectura**. Devuelve tablas (con RLS), columnas, funciones (firma, definer/invoker y hash del cuerpo), triggers, políticas, restricciones y permisos de `anon`/`authenticated`. No devuelve filas de datos |
| `expected-fingerprint.cjs` | Aplica las 32 migraciones del repo, en orden, sobre PostgreSQL aislado (PGlite) y genera la huella **esperada** |
| `compare-fingerprint.cjs` | Compara la huella esperada con la real y lista, objeto por objeto, lo que falta, lo que sobra y lo que cambió |

**Verificado el 2026-11-13:**
- La cadena completa de 32 migraciones se aplica sin errores en PGlite. Huella esperada:

| Objeto | Cantidad |
|---|---|
| Tablas | 86 |
| Columnas | 1048 |
| Funciones | 132 |
| Triggers | 109 |
| Políticas | 174 |
| Restricciones | 858 |
| Permisos de tabla | 145 |
| Permisos de función | 74 |

- El comparador detecta exactamente los objetos que faltan en una base detenida antes de `crm_intelligence`: `crm_lead_assessments`, `crm_growth_funnels`, sus columnas, etc.

## 5. Procedimiento reproducible para producción (requiere la aprobación del owner)

1. **Respaldo.** Comprobar que hay un respaldo reciente: Dashboard → Database → Backups. En el plan Free no hay respaldos gestionados; en ese caso, ejecutar `pg_dump --schema-only` y luego un volcado de datos de las tablas de la aplicación antes de tocar nada (ver `BACKUP_AND_RESTORE.md`).
2. **Huella real.** Ejecutar `schema-fingerprint.sql` en producción, en el editor SQL. Es solo lectura. Guardar el JSON y compararlo:

   ```bash
   node scripts/recovery/compare-fingerprint.cjs expected.json prod.json
   ```

3. **Decidir con la diferencia exacta:**
   - Los objetos que faltan corresponden a las migraciones pendientes 27 y 29–32.
   - Cualquier objeto **sobrante** o **cambiado**, por ejemplo de `radar_scheduler_extensions`, se documenta antes de seguir.
4. **Ensayo en la base aislada.** Aplicar los lotes en `wupvuwmqfcvmjqycmnvg` y repetir la huella. Debe coincidir.
5. **Aplicar en producción en 5 lotes pequeños**, en este orden: `radar_search_runs` → `crm_intelligence` → `crm_titan_backend` → `crm_titan_documents` → `growth_funnel_public`. Cada lote corre en una transacción; si falla, Postgres revierte el DDL.
6. **Huella después de cada lote** y comparación. Solo se continúa si la diferencia esperada desaparece.
7. **Historial.** Solo después de confirmar la equivalencia estructural, y con aprobación expresa, registrar las equivalencias de versión con `supabase migration repair --status applied <versión>` para las filas 12–21. No se hace para «hacer desaparecer» errores: la huella es la evidencia.

**Qué está prohibido:** `supabase db push` a ciegas, borrar tablas, reiniciar la base o modificar RLS sin pasar por este procedimiento.
