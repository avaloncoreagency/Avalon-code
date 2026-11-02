# Respaldos y recuperación

> **No se declara que los backups funcionan hasta que se haya probado una restauración en un entorno aislado.** Al 2026-11-02 esa prueba sigue pendiente (hallazgo R-14).

## Qué existe hoy (verificado)

| Elemento | Estado | Evidencia |
|---|---|---|
| Plan de Supabase | **Pro** | API de la organización: `plan: pro` |
| Backups diarios de la base de datos | Incluidos en el plan Pro (Supabase indica 7 días de retención) | Panel de Supabase → Database → Backups (**no verificado desde la app**) |
| Point-in-Time Recovery (PITR) | No contratado; es un complemento de pago | Requiere aprobación (regla: sin servicios de pago) |
| Código | GitHub: historial completo; cada merge es reversible | `main` |
| Despliegues | Vercel guarda los despliegues anteriores; se pueden promover al instante | Vercel → Deployments |
| Datos de páginas web | Versionado por fila en `os_website_page_versions` | Migración `20261102070500` |
| Borrado de proyectos | Se archivan, no se borran (no existe permiso DELETE) | RLS + permisos |
| Auditoría | `os_audit` registra cada INSERT, UPDATE y DELETE de `os_*` y es de solo lectura | Trigger `SECURITY DEFINER` |

## Objetivos de recuperación (propuestos)

| Escenario | RPO (datos que se pueden perder) | RTO (tiempo hasta recuperar) |
|---|---|---|
| Despliegue defectuoso | 0 | ≤ 15 min (rollback en Vercel) |
| Cambio erróneo en una página web | 0 | ≤ 5 min (restaurar versión) |
| Borrado o corrupción de datos | ≤ 24 h (backup diario) | ≤ 4 h |
| Pérdida del proyecto de Supabase | ≤ 24 h | ≤ 1 día hábil |

Si un RPO de 24 h es demasiado para los datos de clientes, hay que contratar PITR. Eso tiene costo y requiere la aprobación de ambos dueños.

## Procedimiento de prueba de restauración (pendiente; hacerlo una vez por trimestre)
1. En Supabase → Database → Backups, comprobar que hay backups recientes y anotar la fecha del último.
2. Restaurar ese backup en un **proyecto nuevo y aislado**. Nunca sobre producción. Se puede usar "Restore to new project" si el plan lo ofrece; si no, una descarga del backup y `pg_restore` en un proyecto de prueba.
3. Comprobar que existen `os_projects`, `os_audit` y `agency_memberships` y que el número de filas coincide con producción en la fecha del backup.
4. Comprobar que RLS sigue activo (`select tablename from pg_tables where schemaname='public' and not rowsecurity` debe devolver 0 filas).
5. Medir el tiempo total, que es el RTO real, y anotarlo en la bitácora.
6. Eliminar el proyecto de prueba.
7. Marcar R-14 como verificado en `src/lib/security/findings.ts`.

## Rollback de la aplicación
1. **Inmediato:** Vercel → Deployments → elegir el último despliegue correcto → **Promote to Production**.
2. **Definitivo:** `git revert -m 1 <commit de merge>` en una rama, abrir un PR y fusionarlo.
3. **Base de datos:** las migraciones de Avalon OS son aditivas. Revertirlas implica borrar tablas y datos, así que se hace solo con revisión y después de tomar un backup. El SQL de reversión está en `docs/AVALON_OS_MODULES.md`.

## Protección contra eliminación accidental
- Los proyectos no tienen DELETE; se archivan.
- Productos, contenidos y páginas exigen marcar una casilla de confirmación, que el servidor también verifica, y quedan en `os_audit`.
- `/admin/security` muestra las eliminaciones recientes.
- Pendiente: recuperar desde la app los elementos borrados ("papelera"). Hoy se recuperan desde el backup.
