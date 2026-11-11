# Etapa A: diagnóstico definitivo de la publicación e inventario para Codex (2026-11-10)

## 1. ¿Puede el primer despliegue ser Preview?

**No para un proyecto nuevo.** La documentación oficial de Vercel (CLI, «Deploying from CLI») dice: *«The first deployment of a new project is always a production deployment, even without --prod; later deployments without --prod create preview deployments.»*

Esto coincide con lo observado con despliegues reales el 2026-11-08. El flujo `vercel link` → `vercel deploy` produce una Preview solo cuando el proyecto ya tiene un despliegue de producción.

El payload del Direct Bridge para Preview (`deploymentBody(…, "preview")`) **no incluye `target`**, como pide la API para una Preview. `target: "production"` solo se añade en la ruta de producción, que exige aprobación del owner en la base de datos. Antes de llamar a Vercel, el puente comprueba si el proyecto ya tiene producción. Si no la tiene, rechaza la Preview con `first_deployment_is_production`, así que nunca termina en producción sin querer.

## 2. Identidad efectiva de la credencial

- La configuración del entorno tiene **una sola** credencial para `api.vercel.com`: «Avalon-Claude-30Days», en la cabecera `Authorization`. La anterior ya no existe y no hay ninguna otra regla para ese host.
- El proxy sustituye cualquier cabecera `Authorization` por esa credencial. Por eso un Bearer falso devuelve 200: se envía el token guardado.
- Con ese token, a las 14:13 UTC (más de 40 minutos después de guardarlo, fuera de la ventana de propagación):

| Llamada | Resultado |
| --- | --- |
| `GET /v10/projects?teamId=team_lHTO3wgJm0yAyexxMDmkIFW4` | 200 con **solo `avalon-core-agency`** |
| `GET /v9/projects/prj_Ln7ik1hsql2BZqBx22ZjcRJOt6DI` | 404 |
| `GET /v2/teams/{team}` | 403 `team_unauthorized` |
| `POST /v13/deployments` (proyecto de prueba) | 403 `forbidden` |

- El conector de Vercel, que usa la cuenta del dueño, **sí** ve el proyecto de prueba en el mismo equipo.
- No pude consultar el estado interno del proxy: el control de seguridad lo bloquea y no lo eludí.
- **Conclusión:** la credencial que se usa es la nueva, y está limitada al proyecto `avalon-core-agency`. No hay una credencial gestionada oculta. El token se creó con un alcance que no incluye el resto de proyectos del equipo, o la cuenta que lo creó tiene un rol limitado a ese proyecto.

**Para cerrar T3 y T4b**, haz una de estas dos cosas:
1. Cambiar el alcance del token a «Avalon Core Agency» (equipo completo) o añadirle `avalon-client-bridge-e2e`, y actualizar el secret.
2. Dar acceso a ese proyecto al rol del creador del token.

Después:
1. Un despliegue neutro de producción, ya autorizado. Es inevitable por la regla de Vercel y queda protegido con `all_except_custom_domains`.
2. Preview de v1 y Preview de v2, y la restauración, con `e2e-five-tests.cjs` (una sola ejecución).

Además, hay que confirmar que el plan permite el uso; Hobby es solo no comercial.

**Estado:** T1, T2, T4 (versionado y restauración) y T5 son **PASS**. T3 y T4b siguen **BLOCKED** por el alcance de la credencial. El Direct Bridge **no** se declara terminado.

## 3. Qué contiene el respaldo y qué no

**Dentro del bundle completo** `avalon-os-full-20261110T140517Z.bundle` (SHA-256 `e905dd4c…27e3`):
- 151 referencias: todas las ramas y etiquetas, entre ellas `gitless/code-exchange` en `dc89f55`, que incluye `c8b9175`.
- Los 603 archivos versionados.
- Las 25 migraciones.
- `package-lock.json`.
- Los informes y las evidencias.

**Fuera del bundle (no versionado):**

| Qué | ¿Hace falta conservarlo? |
| --- | --- |
| `node_modules/`, `tests/qa/node_modules/`, `.next/`, `tsconfig.tsbuildinfo` | No; se regeneran con `npm ci` y `next build` desde el lockfile |
| `.avalon-deliveries/` (1,6 MB: paquetes de Codex en cuarentena e informes de verificación) | Opcional. Los commits de Nova 1 y Nova 2 ya están en la historia; el ZIP original sigue en las subidas de la sesión |
| `.dev-bridge/continuity.json` (12 KB, estado local de continuidad) | Opcional |
| Credenciales sintéticas de prueba (scratchpad, `0600`) | **No deben salir de la sesión**; se recrean |
| Datos en Supabase aislado: versiones y blobs de la biblioteca, mainlines del Code Exchange, cuentas sintéticas | No están en el bundle. El esquema sí (migraciones). Las mainlines también existen como bundles locales |
| Configuración de Vercel (proyectos, protección) y secretos del entorno | Viven en Vercel y en claude.ai; no forman parte del código |

**Qué conservar fuera de la sesión:**
- El **bundle completo** con su `.sha256`; basta él solo para reconstruir todo el código.
- El incremental y el `.patch` sirven para revisar.
- Restauración: `git init avalon && git -C avalon fetch <full>.bundle '+refs/heads/*:refs/heads/*' && git -C avalon checkout gitless/code-exchange && npm ci`.

## 4. Inventario de integración con Codex (preparación; sin cambios todavía)

| Entrega | Estado |
| --- | --- |
| Nova 1 `d948066` (UI) | **Integrada** (merge `b53986a`), 18 de 18 pruebas de Codex |
| Nova 2 `809da98` (builders) | **Integrada** (merge `b8b9c54`); los editores se usan sin cambios con persistencia real |
| `codex/direct-bridge-adapter` `9f5c3fc` (lectura y metadatos de la biblioteca, preparación de guardado y restauración) | **No recibida**: el ZIP no llegó a la sesión. Su base `272985f` **no existe** en este repositorio |
| Two-owner handoff | **No recibido**. La colaboración entre dos owners ya funciona y está probada con 15 de 15 sobre el Website Designer |

**Cómo debe entregar Codex a partir de ahora:**
1. Ejecutar `acx sync` sobre la mainline #7 (`b082465`) o posterior.
2. Rehacer su rama encima.
3. Ejecutar `acx deliver` con un token de agente.

**Para no duplicar trabajo:**
- Su adaptador debe **reutilizar** `processImport` y `os_project_imports.idempotency_key`, y la acción `saveWebsiteToLibrary` (Website Designer → versión), que ya hace guardado idempotente por digest.
- La restauración ya existe: `os_project_restore_version`.
- Su JSON de recuperación local **no** es un formato del importador ZIP.
