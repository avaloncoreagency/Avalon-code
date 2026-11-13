# Operation Phoenix — Informe final (2026-11-13)

**Veredicto: PARCIALMENTE COMPLETADA.** Todo lo que se podía hacer con código, CI y GitHub está hecho y verificado. Las acciones restantes requieren al owner: autorizar producción, configurar Vercel y Supabase, y hacer QA con sesiones reales.

## Estado de GitHub
| Elemento | SHA / estado |
|---|---|
| `main` | `2c4ea21` (#172 + #173) |
| #172 retirada de REN y managers autónomos | Fusionada (`1c996ac`) |
| #173 seguridad #165 + herramientas de reconciliación | Fusionada (`2c4ea21`). #165 queda cerrada como fusionada |
| #174 candidato de release (CRM Titan #170 + Comercial #167 + #418 y reconciliación de #168 + 403 de #169) | **Borrador**, base `main`, head `60d0c0d` |
| #167, #168, #170 | Abiertas. Se cierran como integradas cuando #174 se fusione |
| #169 | Reemplazada: comentada, falta que el owner la cierre |

## A. Checkpoints
| CP | Estado |
|---|---|
| CP1 Auditoría | COMPLETADO Y VERIFICADO |
| CP2 #173 → main y #174 rebasada a main (borrador) | COMPLETADO Y VERIFICADO. La protección de `main` está BLOQUEADA: no hay herramienta de administración; es acción del owner |
| CP3 Supabase, fase A (huella) | IMPLEMENTADO, PENDIENTE DE VALIDACIÓN: la herramienta está en main y la comparación en vivo está bloqueada porque el conector de Supabase devolvía 502 |
| CP3 Supabase, fase B (respaldo y restauración) | BLOQUEADO: procedimiento documentado, **restauración NO verificada** |
| CP3 Supabase, fase C (migraciones) | NO INICIADO: requiere autorización del owner y que la fase B esté verificada |
| CP4 Preview aislado de #174 | BLOQUEADO: faltan variables de Preview por rama; conector de Vercel con 502 |
| CP5 CRM Titan / Intelligence / Comercial | IMPLEMENTADO, PENDIENTE DE VALIDACIÓN (falta QA autenticada) |
| CP6 Product Control (Codex) | COMPLETADO Y VERIFICADO: no se tocó `os_projects`, Project Bridge (salvo el mapeo 403) ni las tablas de versiones |
| CP7 Pruebas integrales | Las automáticas están COMPLETADAS. iPhone real y sesiones de los owners: PENDIENTES |
| CP8 Fusionar #174 | NO INICIADO: condiciones no cumplidas |
| CP9 Limpieza y seguridad | IMPLEMENTADO, PENDIENTE DE VALIDACIÓN (ver F) |

## B. Integraciones
- **REN, managers y Radar:** siguen apagados. `ai-engine.yml` es solo CI: sin cron, sin secretos y con permisos de solo lectura. `tests/ai-engine-workflow.test.cjs` falla si alguien reintroduce un schedule, un auto-merge o un script autónomo.
- **OpenRouter y proveedores de IA:** no se activaron. No hay gasto nuevo.
- **Vercel:**
  - El deploy de `main` `2c4ea21` aparece en GitHub statuses: hubo un estado `pending` y otro `Deployment has completed`. La verificación visual de producción queda pendiente.
  - En `2c4ea21` (main), el check **Supabase Preview** de la integración GitHub↔Supabase terminó en `failure`. Probablemente se debe a la deriva del historial de migraciones; no se pudo inspeccionar porque el conector estaba en 502. El owner debe revisarlo en Supabase → *Branches*, y no se debe reintentar un *push* de migraciones desde ahí hasta completar F.2.
  - Preview de #174: bloqueado.
- **Supabase:** conector caído (502) durante la sesión; no se hizo ninguna escritura en producción.

## C. Supabase (producción)
Pendiente de aplicar, en lotes, según `docs/recovery/SUPABASE_RECONCILIATION.md`:
1. **Main (#165):** `20261112190000_bridge_scope_hardening` y `20261112191000_future_public_default_acl`.
2. **CRM:** `radar_search_runs`, `crm_intelligence`, `crm_titan_backend`, `crm_titan_documents` y `growth_funnel_public`.
3. **#170:** `20261112204212_crm_growth_consent_version_required` y `20261112204554_crm_public_inquiry_restore_caller_identity`.
4. **Sin confirmar:** si `20261107090000_ai_chatbots_module` existe en remoto.

Antes de aplicar nada: ejecutar `scripts/recovery/schema-fingerprint.sql` (solo lectura) y compararlo con `compare-fingerprint.cjs`. Después, hacer el respaldo y **comprobar una restauración**.

Además:
- La protección de contraseñas filtradas sigue desactivada; es acción del owner.
- `pg_net` está en el esquema `public`. Queda documentado y no se mueve sin respaldo.

## D. Pruebas (local y CI de GitHub sobre `60d0c0d`)
| Prueba | Resultado |
|---|---|
| `npm test` | 500/500 |
| PGlite | 61/61 |
| TypeScript | 0 errores |
| Lint | 0 errores |
| Build | OK |
| CI de GitHub sobre `60d0c0d` | Todo en verde: `checks`, `crm`, `project-bridge`, `isolated-e2e`, RLS, migraciones + E2E, CodeQL, Security, Dependency audit |
| Vercel Preview sobre `60d0c0d` | **failure** esperado: el guard de `next.config.ts` bloquea Preview sin variables propias (ver F.3) |

**Pendientes:**
- Safari en un iPhone real.
- QA autenticada con Miguel y con Samuel en un Preview aislado.

## E. Funcionalidades en #174
- **CRM Titan (#170):**
  - Diagnóstico por sector con puntuación auditada.
  - Contratos y documentos.
  - Funnel público con versión de consentimiento obligatoria.
  - Identidad del llamante restaurada en las consultas públicas.
- **Fundación Comercial (#167).**
- **Desde #168:**
  - Corrección de hidratación React #418: fecha estable de la venta.
  - Reconciliación de recomendaciones obsoletas: retira o restaura solo las sugerencias automáticas sin tocar; nunca sobrescribe decisiones humanas. Aceptar una regla obsoleta devuelve `stale_recommendation`.
- **Desde #169:** un token de Bridge sin el scope necesario recibe `403 insufficient_scope` en vez de 503.

## F. Instrucciones para el owner

### 1. GitHub
- **Proteger `main`:** GitHub → repo → *Settings* → *Branches* → *Add branch ruleset* (o *Add rule*) → patrón `main`. Marcar:
  - *Require a pull request before merging*
  - *Require status checks to pass*: `checks`, `crm`, `Security regression tests`, `RLS and triggers on isolated PostgreSQL`
  - *Block force pushes*

  Pulsar *Create*. Resultado esperado: ya no se puede hacer push directo a `main`.
- **Cerrar #169:** abrir PR #169 → *Close pull request*. Ya está reemplazada.

### 2. Supabase (en este orden)
1. **Huella (solo lectura):** Dashboard → proyecto de producción → *SQL Editor* → pegar `scripts/recovery/schema-fingerprint.sql` → *Run*. Guardar el JSON resultante y compartirlo en un Issue privado o pasárselo a Claude o Codex, **sin datos de clientes**.
2. **Respaldo:** *Database* → *Backups* → comprobar que hay un respaldo de hoy o hacer `pg_dump` según `docs/recovery/BACKUP_AND_RESTORE.md`.
3. **Restauración:** restaurar en un proyecto o rama **aislados**. El respaldo solo cuenta como verificado cuando las tablas y los recuentos coinciden.
4. **Autorizar:** escribir en el Issue de Phoenix: "Autorizo aplicar el lote X en producción".
5. **Contraseñas filtradas:** *Authentication* → *Providers* → *Email* (o *Auth* → *Password security*) → activar *Leaked password protection* → *Save*. Resultado esperado: el aviso de *Advisors* desaparece.

### 3. Vercel (Preview aislado de #174)
1. Vercel → proyecto → *Settings* → *Environment Variables*.
2. Para cada variable de Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y la variable de servidor si aplica), *Add* con alcance **Preview** y rama `claude/phoenix-release-candidate`, apuntando a una base de **staging**, nunca la de producción.
3. Pulsar *Redeploy* en el último deploy de la rama.

Resultado esperado: el build de Preview pasa el guard de `next.config.ts`.

### 4. QA y fusión
- **Prueba en Preview:** Miguel y Samuel inician sesión en el Preview, uno de ellos desde Safari en un iPhone. Recorrido: lead → diagnóstico → recomendaciones → venta → funnel público.
- **Fusión de #174:** solo con Supabase reconciliado, Preview verde y QA aprobada. Pasos:
  1. Pulsar *Ready for review*.
  2. Esperar CI en verde.
  3. Pulsar *Merge*.
  4. Cerrar #167, #168 y #170 como integradas.

Next action: el owner ejecuta los pasos F.2.1 (huella) y F.2.2/F.2.3 (respaldo y restauración) y publica el resultado en el Issue de Phoenix.
