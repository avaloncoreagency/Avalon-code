# Operation Phoenix — Informe final (actualizado 2026-11-13, segunda sesión)

**Veredicto: PARCIALMENTE COMPLETADA, BLOQUEADA EN SUPABASE Y VERCEL.** El código, CI y la herramienta de reconciliación están verificados. En esta sesión el conector de Supabase volvió a dar **502** y la credencial de Vercel disponible solo ve un proyecto de pruebas (`avalon-client-bridge-e2e`), no `avalon-core-agency`. Por eso **no se ha leído ni escrito nada en producción** y las fases B y C no se han iniciado.

## Estado de GitHub (verificado en vivo)
| Elemento | SHA / estado |
|---|---|
| `main` | `2c4ea21` (#172 + #173) |
| #174 candidato de release | **Borrador**, base `main`. Head probado: `df4c887` (este informe añade un commit de documentación y una consulta SQL de solo lectura) |
| CI de GitHub sobre `df4c887` | 13/13 en verde: `checks`, `crm`, `project-bridge`, `isolated-e2e`, RLS, cadena de migraciones + E2E, E2E navegador, Security, CodeQL, Dependency audit/review. *Supabase Preview*: `skipped` |
| Vercel sobre `df4c887` | **failure** (`dpl_F217q4D7EMaTAjcXimxdixCbsBW8`): el guard de `next.config.ts` bloquea Preview sin variables propias |
| #167, #168, #170 | Abiertas (borrador). Se cierran como integradas solo cuando #174 se fusione |
| #169 | Cerrada (reemplazada) |

## A. Supabase, fase A — huella (solo lectura)
**Estado: BLOQUEADO en la parte remota; parte local COMPLETADA Y VERIFICADA.**

- **Remoto:** conector de Supabase con 502 → no se pudo ejecutar `schema-fingerprint.sql` en `ltbwzcrxeuczdhhtbqgm`. **No se afirma qué migraciones faltan en remoto**: solo hay la lectura del historial del 2026-11-12 (ver `SUPABASE_RECONCILIATION.md`).
- **Local (verificado):** las 37 migraciones de #174 (`df4c887`) se aplican sin errores en PGlite. Huella esperada:

  | Tablas | Columnas | Funciones | Triggers | Políticas | Restricciones | Permisos tabla | Permisos función |
  |---|---|---|---|---|---|---|---|
  | 89 | 1086 | 135 | 112 | 181 | 884 | 152 | 74 |

- **Causa del fallo de «Supabase Preview» en `main` `2c4ea21`** (leída del check run `131950842982`): `Remote migration versions not found in local migrations directory.` Es la deriva de versiones ya documentada (versiones aplicadas por MCP/a mano con otras marcas de tiempo y `radar_scheduler_extensions` solo en remoto). **No se debe pulsar *Retry* ni hacer `migration repair`** hasta tener la huella real.
- **Marcadores por migración** (objetos que delatan si un lote está aplicado; se buscan en la huella real):

  | Migración | Marcador en la huella |
  |---|---|
  | `20261107090000_ai_chatbots_module` | Hash de la restricción `os_projects.os_projects_module_check` (debe incluir `chatbots`). **Toca `os_projects` (Codex)**: aplicarla requiere coordinación con Codex/owner |
  | `20261110140000_radar_search_runs` | Tabla `crm_radar_run_places`, nueva firma de `crm_radar_ingest` |
  | `20261111100000_crm_intelligence` | 7 tablas: `crm_lead_assessments`, `crm_lead_recommendations`, `crm_lead_scores`, `crm_contracts`, `crm_contract_events`, `crm_commercial_terms`, `crm_lead_assessment_revisions` |
  | `20261112090000_crm_titan_backend` | Tablas `crm_growth_funnels`, `crm_growth_funnel_submissions`; funciones `crm_my_capabilities`, `crm_lead_duplicate_candidates` |
  | `20261112100000_crm_titan_documents` | Trigger `crm_attachments_integrity` |
  | `20261112110000_growth_funnel_public` | Función `crm_agent_security_posture_internal` |
  | `20261112130000_commercial_b2c_owner_only` (#167, **no estaba en la lista conocida**) | Tablas `crm_b2c_target_policies`, `crm_b2c_requests`, `crm_b2c_request_events` |
  | `20261112190000_bridge_scope_hardening` | Nuevo hash de `os_bridge_api_import_status` |
  | `20261112191000_future_public_default_acl` | **No visible en la huella.** Verificar con la nueva consulta `scripts/recovery/default-acl-check.sql` (solo lectura). Resultado esperado: ninguna fila de `public` que dé permisos a `anon`/`authenticated` y la fila global de funciones sin `=X/postgres` |
  | `20261112204212_crm_growth_consent_version_required` | Nuevo hash de `crm_growth_funnel_submit` |
  | `20261112204554_crm_public_inquiry_restore_caller_identity` | Nuevo hash de `crm_public_inquiry` |

## B. Supabase, fase B — respaldo y restauración
**Estado: BLOQUEADO.** Sin conector no se puede consultar el plan, los respaldos ni crear una rama. **Respaldo NO verificado** (no se ha restaurado nada). La rama aislada documentada (`wupvuwmqfcvmjqycmnvg`) no se ha podido inspeccionar.

## C. Supabase, fase C — producción
**Estado: NO INICIADO.** Requiere B verificada y autorización explícita del owner **por lote**. `get_advisors` no se pudo ejecutar.

## D. Vercel
**Estado: BLOQUEADO.**
- La credencial de Vercel de esta sesión solo ve el proyecto `avalon-client-bridge-e2e`; `avalon-core-agency` devuelve `not_found`. No se han configurado variables de Preview ni hecho redeploy.
- Producción de `main` `2c4ea21`: el estado de GitHub dice `Vercel: success — Deployment has completed` (`6YpS2MhS4SDqobbN7AibJ8Jp1dZ7`). **No se han podido revisar los logs de runtime ni el render**: PENDIENTE.
- No existe todavía una base de STAGING aislada con credenciales propias para Preview; sin ella el guard debe seguir bloqueando (comportamiento correcto).

## E. Pruebas
| Prueba | Resultado |
|---|---|
| CI de GitHub sobre `df4c887` | 13/13 en verde (ver arriba) |
| Cadena de 37 migraciones en PGlite (esta sesión) | OK, huella esperada generada |
| `default-acl-check.sql` en PGlite tras las 37 migraciones (esta sesión) | OK: solo `{postgres=X/postgres}` global de funciones; sin permisos por defecto para `anon`/`authenticated` |
| Vercel Preview | failure esperado (guard) |
| QA autenticada Miguel y Samuel | PENDIENTE |
| Safari en iPhone real | PENDIENTE |

## F. Instrucciones para el owner (qué pulsar)

### 1. Reconectar los conectores (lo que bloquea todo lo demás)
1. Ir a **claude.ai → Settings → Connectors** (https://claude.ai/customize/connectors).
2. **Supabase:** *Disconnect* y *Connect* de nuevo; autorizar la organización que contiene `ltbwzcrxeuczdhhtbqgm`.
3. **Vercel:** al conectar, conceder acceso al equipo/proyecto **`avalon-core-agency`** (ahora solo está concedido `avalon-client-bridge-e2e`).
4. **Abrir una sesión nueva** (los conectores solo se leen al arrancar la sesión) y pedir: «Continúa Operation Phoenix desde PHOENIX_FINAL_REPORT.md».

### 2. Alternativa sin conector — fase A manual (solo lectura)
1. Supabase → proyecto de producción → *SQL Editor* → pegar `scripts/recovery/schema-fingerprint.sql` → *Run*. Guardar el JSON.
2. En el mismo editor, pegar `scripts/recovery/default-acl-check.sql` → *Run*. Guardar el resultado.
3. Pasar ambos resultados a Claude/Codex en un Issue **privado** o por chat (no contienen filas de datos de clientes).

### 3. Fase B
- Supabase → *Database* → *Backups*: anotar plan y fecha del último respaldo. Si es Free, `pg_dump` según `BACKUP_AND_RESTORE.md`.
- Supabase → *Branches*: confirmar que existe una rama/proyecto aislado (o crearla) **sin datos de clientes**. Si el plan no permite ramas, crear un proyecto Free vacío de staging.

### 4. Vercel (cuando exista la base de staging)
Vercel → `avalon-core-agency` → *Settings* → *Environment Variables* → para `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (y la de servidor si aplica): *Add* con entorno **Preview** y rama `claude/phoenix-release-candidate`, valores de **staging**. Luego *Redeploy* del último deploy de la rama.

### 5. Fusión de #174
Solo con migraciones aplicadas y verificadas, Preview verde, CI verde y QA (Miguel, Samuel, Safari iPhone) confirmada, más autorización explícita del owner.

Next action: el owner reconecta Supabase y Vercel (con acceso a `avalon-core-agency`) y abre una sesión nueva, o ejecuta F.2 y comparte la huella; después Claude compara contra `df4c887` con `compare-fingerprint.cjs` y propone los lotes exactos.
