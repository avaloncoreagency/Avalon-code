# Operación Avalon Phoenix: Direct Bridge sin GitHub

**Fecha:** 2026-11-09.
**Entorno:** Supabase aislado `wupvuwmqfcvmjqycmnvg`, una rama sin datos reales (PR #19, sin uso desde el 2 de noviembre). **Producción no se tocó:** `ltbwzcrxeuczdhhtbqgm` sigue con 22 migraciones, la última `20261104172854`, 0 buckets y sin tablas del puente. Se verificó después de las pruebas.

**Leyenda de estados:**
- **VERIFICADO:** ejecutado contra servicios reales, con evidencia.
- **IMPLEMENTADO:** el código existe y tiene pruebas locales.
- **PREPARADO:** listo, pero no ejecutado de extremo a extremo.
- **BLOQUEADO:** depende de un acceso que falta.

| Objetivo | Estado | Evidencia | Próximo paso |
| --- | --- | --- | --- |
| Migraciones pendientes en la base aislada (13 de 13) | VERIFICADO | El historial muestra 24 migraciones, incluida `project_bridge`. Cada una se revisó antes y se aprobó en Supabase | Aplicar en producción solo con aprobación expresa |
| Bucket privado y 7 tablas con RLS | VERIFICADO | Bucket `avalon-projects` con `public=false` y 25 MB. 7 tablas con `rls=true`, 17 políticas, 7 triggers, 16 índices y 4 políticas de storage. `anon` no tiene permisos sobre tablas | — |
| Funciones (2 de API y la de restaurar) | VERIFICADO | `open_import` e `import_status` son definer y piden token. `restore_version` es invoker y solo para `authenticated`. El asesor de Supabase no encontró nada nuevo fuera de las excepciones revisadas | — |
| Identidades de prueba reales | VERIFICADO | Un owner y un usuario sin membresía, sintéticos (`@avalon-test.invalid`). El hash bcrypt se generó en local; la contraseña nunca salió del entorno. Inicio de sesión real con Supabase Auth | Borrarlos al terminar las pruebas, si se desea |
| Importación real de un ZIP | VERIFICADO | `evidence/phoenix-evidence.json`: **21 de 21**. Ticket, URL firmada, subida al bucket privado, validación, registro, v1 | — |
| SHA-256 coincidente | VERIFICADO | El ZIP descargado coincide con el local y con el registrado (`66bc1f5a…`). Los 3 archivos de la versión coinciden en hash y tamaño | — |
| Dos versiones y restauración | VERIFICADO | v1 → v2. Un ZIP idéntico se detecta como `duplicate`. Restaurar v1 crea v3 con el contenido de v1, y el `index.html` descargado dice «versión 1» | — |
| Acceso no autorizado denegado | VERIFICADO | Con su propio JWT, el usuario sin permisos: lee 0 filas en las 5 tablas, no descarga ni sube archivos, no registra importaciones, no restaura y no modifica el proyecto. `anon` recibe 42501 | — |
| Auditoría | VERIFICADO | `os_project_events` registra la recepción, el registro, las versiones, el duplicado y la restauración, con el actor real | — |
| Canal de entregas por token (Codex y agentes) | VERIFICADO | `evidence/phoenix-evidence-api-inbox.json`: **11 de 11**. Token con permisos acotados, subida solo a la ruta asignada y sin sobrescribir, el owner procesa la entrega, la revocación es inmediata | — |
| Avalon OS contra la base aislada en un navegador real | VERIFICADO | `evidence/phoenix-evidence-app.json`: **10 de 10** en Chromium con perfil de iPhone (**no Safari**). Login real, biblioteca, versiones, archivos y vista previa en sandbox. Sin desbordamiento horizontal tras corregir 3 páginas. El usuario sin permisos es rechazado (307 → login) | Probar en Safari real |
| Build con Supabase aislado y `VERCEL_ENV=preview` | VERIFICADO | `next build` exit 0. El guard sigue activo y solo bloquearía la URL de producción | — |
| Preview en Vercel de Avalon OS sin GitHub | BLOQUEADO | Este entorno no tiene token de Vercel con permiso para desplegar. El MCP de Vercel no admite subir el repositorio completo (cientos de archivos) | Ver «Preview» abajo |
| Respaldo sin GitHub | VERIFICADO | El bundle `ccc5bd8` de Miguel tiene un SHA-256 correcto y contiene los 6 commits. El incremental desde `ccc5bd8` reproduce exactamente la punta | Guardar los incrementales nuevos junto al bundle |
| Recepción de entregas de Codex | VERIFICADO con entregas sintéticas | Una válida sale `READY_FOR_HUMAN_REVIEW`. Se rechazan las 4 manipuladas: bundle alterado, secreto, conflicto y manifiesto incompleto | Pedir a Codex el paquete de Nova UI (`d948066`) en el formato del contrato |
| Nova UI integrada | NO INICIADO, a propósito | El paquete real todavía no llegó | Verificar el paquete con `verify-delivery.mjs` y revisarlo antes de integrarlo |

## Archivos de esta operación

- **Pruebas reales:** `scripts/project-bridge/e2e-isolated.cjs`, `scripts/project-bridge/e2e-api-inbox.cjs` y `scripts/project-bridge/e2e-app-isolated.cjs`. Se niegan a ejecutarse contra producción.
- **Respaldos:** `scripts/devops/gitless-backup.sh`, con modos `full`, `incr` y `verify`.
- **Entregas:** `scripts/project-bridge/make-delivery.sh`, `scripts/project-bridge/verify-delivery.mjs` y `docs/dev-bridge/DELIVERY_CONTRACT.md`.
- **Corrección de interfaz:** `src/components/library/library.module.css`.
- **Evidencias:** `docs/project-bridge/evidence/phoenix-*.json`. No contienen contraseñas ni claves; se comprobó.

## Cómo reproducir

```bash
# Requiere: env.json {url, key publishable} y creds.json {owner, stranger}. Solo una base AISLADA.
NODE_USE_ENV_PROXY=1 node scripts/project-bridge/e2e-isolated.cjs <dir>
NODE_USE_ENV_PROXY=1 node scripts/project-bridge/e2e-api-inbox.cjs <dir>
# App: compilar y arrancar con NEXT_PUBLIC_SUPABASE_URL/KEY de la base aislada, luego:
node scripts/project-bridge/e2e-app-isolated.cjs <dir> http://127.0.0.1:3100
```

## Desarrollo sin GitHub

```bash
git switch -c mission/<nombre>
# ...cambios y pruebas...
git commit
scripts/devops/gitless-backup.sh incr <carpeta> backup/miguel-2026-11-09
```

El incremental solo contiene lo nuevo y se verifica reconstruyendo la punta. Una vez por semana (o al cerrar una misión) conviene un `full`. Para restaurar se usa `git clone <full>.bundle` y luego `git fetch <incr>.bundle`. Nunca se borra un respaldo anterior.

## Preview en Vercel sin GitHub: requisito pendiente

1. Crear en Vercel un token con permiso de despliegue limitado al equipo Avalon Core Agency.
2. Añadirlo como credencial del entorno de trabajo. Nunca en el repositorio ni con `NEXT_PUBLIC_`.
3. Configurar en el proyecto de Vercel, **solo para Preview**, la URL y la clave pública de la base aislada `wupvuwmqfcvmjqycmnvg`. El guard de producción no cambia.
4. Desplegar con `npx vercel deploy` sin `--prod`, desde este checkout verificado.
5. Ejecutar `e2e-app-isolated.cjs` contra la URL de la Preview.

Producción nunca se publica desde este flujo.
