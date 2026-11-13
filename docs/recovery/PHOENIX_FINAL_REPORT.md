# Operation Phoenix — Informe final (2026-11-13)

**Veredicto: COMPLETADA EN LO TÉCNICO, con validación humana pendiente.**

- Producción de Supabase está reconciliada y verificada contra el repo.
- #174 está integrada.
- Quedan pendientes solo las acciones que no puede hacer una IA: QA con las sesiones reales de los dos owners y un iPhone, la protección de `main` y la de contraseñas filtradas.

## Estado final
| Elemento | Estado |
|---|---|
| `main` | Incluye #172 (REN y managers apagados), #173 (seguridad #165 y herramientas) y #174 (este candidato) |
| Supabase producción `ltbwzcrxeuczdhhtbqgm` | **37 + 1 migraciones**; huella idéntica a la cadena del repo (ver C) |
| Supabase staging `wupvuwmqfcvmjqycmnvg` (rama aislada, sin datos reales) | Misma cadena; lo usa el Preview de `claude/phoenix-release-candidate` |
| Vercel producción | `2c4ea21` READY, 0 errores de runtime en 24 h |
| Vercel Preview de #174 | READY (`dpl_GbhjQga8jLxugS5e2kLv3MqmZ4gF`) contra staging; `/login` responde 200 con cabeceras de seguridad |
| #169 | Cerrada (reemplazada; su parte útil está en #174) |
| #167, #168, #170 | Se cierran como integradas al fusionar #174 |

## A. Checkpoints
| CP | Estado |
|---|---|
| CP1 Auditoría | COMPLETADO Y VERIFICADO |
| CP2 #173 primero y luego #174 | COMPLETADO Y VERIFICADO. Protección de `main`: **acción del owner** (no hay herramienta de administración) |
| CP3-A Huella | COMPLETADO Y VERIFICADO: las 26 migraciones previas de producción coincidían con el repo. Solo diferían los comentarios de 6 funciones, idénticas sin comentarios, y los permisos por defecto de `service_role` |
| CP3-B Respaldo y restauración | COMPLETADO Y VERIFICADO **para el esquema**. Ver detalle bajo la tabla |
| CP3-C Migraciones | COMPLETADO Y VERIFICADO con autorización explícita del owner (2026-11-13). Se aplicaron 10 pendientes más la corrección `chatbots`; `code_exchange_disabled` ya estaba aplicada con otro nombre |
| CP4 Preview aislado | COMPLETADO Y VERIFICADO. Variables por rama apuntando a staging; nunca claves de producción |
| CP5 CRM Titan, Intelligence y Comercial | IMPLEMENTADO Y DESPLEGADO; QA humana PENDIENTE |
| CP6 Product Control (Codex) | Preservado. Único cambio: `os_projects_module_check` vuelve a admitir `chatbots` en instalaciones nuevas, como ya hacía producción |
| CP7 Pruebas | Automáticas en verde. **Pendiente:** iPhone real y sesiones de Miguel y Samuel |
| CP8 Fusión #174 | Con autorización explícita del owner, tras CI en verde |
| CP9 Limpieza y seguridad | #169 cerrada. Avisos de seguridad revisados (ver C) |

**Detalle de CP3-B:**
- El lote no modifica ni borra datos. Está demostrado de forma estática y no había leads, ventas ni adjuntos en producción.
- `scripts/recovery/phoenix-batch-rollback.sql` devuelve el esquema exacto previo. Lo genera y lo verifica `phoenix-batch-rollback.cjs` en PostgreSQL aislado, comparando tablas, columnas, políticas, triggers, funciones, constraints, permisos, índices y ACL por defecto.
- Los datos dependen de los respaldos diarios automáticos de Supabase. Su restauración **no** se ha probado, porque haría falta copiar datos reales a otro entorno.

## B. Integraciones
- **Automatizaciones autónomas:** REN, managers, Radar automático y OpenRouter siguen **apagados**. `tests/ai-engine-workflow.test.cjs` lo garantiza.
- **Vercel:** se añadieron 2 variables de Preview (`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) solo para la rama `claude/phoenix-release-candidate`. No se creó ningún recurso de pago: se reutilizó la rama de staging que ya existía.

## C. Supabase
**Comparación final:** hash por sección, con las funciones comparadas sin comentarios. Producción coincide con la cadena del repo en las 9 secciones: tablas 89, columnas 1086, funciones 135, triggers 112, políticas 181, constraints 884 (también idénticos en definición), permisos de función 65, permisos de tabla 152 e índices 228.

**Avisos de seguridad:**
- Las 6 funciones `SECURITY DEFINER` ejecutables por `anon` son las RPC públicas aprobadas: solicitud de presupuesto, control de IA, inbox de Bridge (2) y funnel opt-in (2).
- Las de `authenticated` comprueban `is_owner` internamente.
- **Pendientes:**
  - `pg_net` en `public`: no se mueve sin una ventana de mantenimiento.
  - Protección de contraseñas filtradas desactivada: **acción del owner**.

**Hallazgo:** `20261108100000_project_bridge` recreaba `os_projects_module_check` sin `chatbots`. En una base construida desde el repo, el módulo AI Chatbots no podía crear proyectos. Lo corrige la nueva migración `20261113160000_os_projects_module_chatbots_restore`, idempotente y aplicada en producción y staging sin cambio estructural. Lo vigila la prueba `tests/os-projects-modules.database.cjs`.

**Comportamiento nuevo:** un lead solo puede pasar a «ganado» con un contrato `verified_signed`. Es la puerta de #170, aprobada por el owner.

## D. Pruebas
| Prueba | Resultado |
|---|---|
| `npm test` | 500/500 |
| PGlite | 62/62 |
| TypeScript y lint | 0 errores |
| Build | OK |
| CI de GitHub | Todo en verde: `checks`, `crm`, `project-bridge`, `isolated-e2e`, RLS, cadena PG16 + E2E, E2E navegador, CodeQL, Security, Dependency audit/review |
| Pendientes humanos | Safari en iPhone real; sesiones autenticadas de Miguel y Samuel en el Preview |

## E. Funcionalidades nuevas en producción
- **CRM Intelligence:**
  - Diagnóstico por sector con fusión por pregunta y detección de conflictos.
  - Puntuación explicable.
  - Recomendaciones con evidencia; las obsoletas se retiran solas sin tocar decisiones humanas.
  - Términos comerciales.
  - Contratos con verificación y la puerta de «ganado».
- **CRM Titan:**
  - Aprobación de comisiones.
  - Candidatos a duplicado.
  - Enlaces canónicos de tareas.
  - Resumen financiero exacto por moneda.
  - Historial de Radar con fallos (Radar sigue sin ejecución automática).
  - Integridad de adjuntos.
  - Funnel público con consentimiento versionado obligatorio.
- **Fundación Comercial B2C:** solo owners.
- **Seguridad:**
  - El scope de los tokens de Bridge se aplica; un token sin el scope necesario recibe 403 `insufficient_scope`.
  - Los permisos por defecto de los objetos nuevos son mínimos.
  - La identidad del llamante se restaura en las consultas públicas.

## F. Acciones del owner (agrupadas)
1. **Proteger `main` en GitHub:** Settings → Branches → *Add rule* (o *Add branch ruleset*), con el patrón `main`. Marcar:
   - *Require a pull request before merging*
   - *Require status checks to pass*: `checks`, `crm`, `Security regression tests`, `RLS and triggers on isolated PostgreSQL`
   - *Block force pushes*

   Pulsar *Create*. Resultado esperado: un push directo a `main` queda rechazado.
2. **Contraseñas filtradas en Supabase:** Dashboard → Authentication → *Password security* (o Providers → Email) → activar *Leaked password protection* → *Save*. Resultado esperado: el aviso desaparece de *Advisors*.
3. **QA:**
   - Miguel y Samuel inician sesión en producción, uno de ellos desde Safari en un iPhone.
   - Recorrido: crear lead → diagnóstico → recomendaciones → términos → contrato (subir PDF, enviar, firmar, verificar) → marcar como ganado → venta.
   - Resultado esperado: sin el contrato verificado, «ganado» se rechaza con un mensaje claro.
4. **Limpieza opcional de costes:** en Supabase → *Branches* hay ramas antiguas de PRs ya cerradas (`feature/staff-proyectos-finder-20261103`, `integration/ren-managers-codex-claude-20261103`) que siguen activas y se facturan. Bórralas desde ese panel si no las necesitáis. **No** borres `release/avalon-os-production-candidate`: es el staging actual.

Next action: el owner ejecuta F.1–F.3 y deja el resultado de la QA en el Issue de Phoenix.
