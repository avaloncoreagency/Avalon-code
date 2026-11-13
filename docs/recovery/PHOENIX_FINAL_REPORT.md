# Operation Phoenix — Informe final (2026-11-13)

**Veredicto: COMPLETADA.**

- Producción de Supabase está reconciliada y verificada contra el repo.
- #174 está integrada y desplegada (`639f94a`, READY).
- La QA automatizada pasa en staging y producción.
- El owner configuró la protección de `main` y la de contraseñas filtradas, y ambas están verificadas.
- Solo queda la revisión visual opcional con las sesiones reales y un iPhone, que ninguna IA puede hacer.

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
| CP2 #173 primero y luego #174 | COMPLETADO Y VERIFICADO. `main` protegida por el owner; verificado vía API: `protected: true`, check obligatorio `checks` |
| CP3-A Huella | COMPLETADO Y VERIFICADO: las 26 migraciones previas de producción coincidían con el repo. Solo diferían los comentarios de 6 funciones, idénticas sin comentarios, y los permisos por defecto de `service_role` |
| CP3-B Respaldo y restauración | COMPLETADO Y VERIFICADO **para el esquema**. Ver detalle bajo la tabla |
| CP3-C Migraciones | COMPLETADO Y VERIFICADO con autorización explícita del owner (2026-11-13). Se aplicaron 10 pendientes más la corrección `chatbots`; `code_exchange_disabled` ya estaba aplicada con otro nombre |
| CP4 Preview aislado | COMPLETADO Y VERIFICADO. Variables por rama apuntando a staging; nunca claves de producción |
| CP5 CRM Titan, Intelligence y Comercial | IMPLEMENTADO Y DESPLEGADO; QA humana PENDIENTE |
| CP6 Product Control (Codex) | Preservado. Único cambio: `os_projects_module_check` vuelve a admitir `chatbots` en instalaciones nuevas, como ya hacía producción |
| CP7 Pruebas | COMPLETADO: automáticas en verde y QA SQL de extremo a extremo en staging y producción (ver D). Revisión visual con sesiones reales e iPhone: opcional, solo humana |
| CP8 Fusión #174 | COMPLETADO: fusionada en `639f94a` con autorización explícita, CI en verde; producción READY |
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
  - Protección de contraseñas filtradas: **activada por el owner**; el aviso ya no aparece en *Advisors*.

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
| QA de extremo a extremo en staging (owner autenticado, transacción revertida) | 11/11: lead, diagnóstico, puntuación, «ganado» rechazado sin contrato, adjunto con hash falso rechazado, verificación sin evidencia rechazada, contrato verificado, «ganado» aceptado con contrato, comisión falsificada rechazada, capacidades |
| QA anónima en producción y staging | `anon` no lee leads, contratos ni funnels; un funnel inexistente devuelve `null`; un envío sin consentimiento devuelve `invalid`; sin acceso a capacidades |
| Revisión visual opcional (humana) | Sesiones reales de Miguel y Samuel; Safari en iPhone |

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

## F. Acciones del owner
1. **Protección de `main`:** HECHO y verificado.
2. **Protección de contraseñas filtradas:** HECHO y verificado.
3. **Opcional:** abrid la app en producción con vuestras cuentas (una desde un iPhone) y cread un lead de prueba de principio a fin.
4. **Opcional, costes:** las ramas de Supabase `feature/staff-proyectos-finder-20261103` e `integration/ren-managers-codex-claude-20261103` pertenecen a PRs aún abiertas (#82 y otra). Se pueden borrar en Supabase → *Branches* cuando esas PRs se cierren. **No** borréis `release/avalon-os-production-candidate`: es el staging actual.

Next action: ninguna obligatoria. Operation Phoenix está cerrada.
