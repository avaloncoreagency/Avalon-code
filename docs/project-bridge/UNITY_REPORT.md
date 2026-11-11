# Operación Avalon Unity: integración de Nova sin GitHub

**Fecha:** 2026-11-09.
**Rama local:** `integration/unity-nova`, sin push porque GitHub está suspendido.
**Base de datos:** Supabase aislado `wupvuwmqfcvmjqycmnvg`.
**Producción no se tocó:** `ltbwzcrxeuczdhhtbqgm` sigue con 22 migraciones (la última, `20261104172854`), 0 buckets y sin tablas del puente. Se verificó al terminar. Ningún despliegue de Vercel tiene target de producción.

**Leyenda:**
- **VERIFICADO:** ejecutado contra servicios reales, con evidencia.
- **IMPLEMENTADO:** código con pruebas locales.
- **PREPARADO:** listo, pero no ejecutado de extremo a extremo.
- **BLOQUEADO:** depende de un acceso que falta.

## 1. Recepción del paquete de Codex (`avalon-unity-handoff.zip`)

| Paso | Resultado |
| --- | --- |
| ZIP extraído con el lector defensivo del puente; nada se ejecutó | VERIFICADO |
| `SHA256SUMS` exterior (5 de 5) e interiores (10 de 10 en Nova 1 y 24 de 24 en Nova 2) | VERIFICADO |
| Tarballs inspeccionados antes de extraer: sin symlinks, rutas absolutas ni `..` | VERIFICADO |
| Base `8a0104d` existe y es ancestro de la rama | VERIFICADO |
| Adaptado al contrato (`DELIVERY.json` sintetizado a partir de hechos Git) y pasado por `verify-delivery` | VERIFICADO: los dos paquetes salen `READY_FOR_HUMAN_REVIEW` |
| Cuarentena: `refs/quarantine/nova1-d948066` y `refs/quarantine/nova2-809da98`. La punta coincide con el commit esperado y desciende de la base | VERIFICADO |
| Secretos en las líneas añadidas (222 y 517) | Ninguno |
| Merge de prueba en un worktree separado | Sin conflictos y sin archivos compartidos: todo es nuevo |
| Revisión manual del código | Sin `fetch`, `eval`, `innerHTML`, `localStorage` ni cookies. Las pruebas de Codex no usan red |

Se corrigió `receive-package.mjs`, que fallaba con bundles incrementales: ahora importa los objetos a una ref de sonda antes de listar los cambios.

## 2. Integración

| Commit | Contenido |
| --- | --- |
| `b53986a` | merge `--no-ff` de Nova 1 (`d948066`): primitivas de interfaz |
| `b8b9c54` | merge `--no-ff` de Nova 2 (`809da98`): Website Designer, AI Chatbots y CRM Creator |
| `9befbc2` | ESLint excluye la cuarentena `.avalon-deliveries/` |
| `c42f3b7` | Website Designer con persistencia real |
| `6a96a69` | CRM Creator y AI Chatbots con persistencia real |

Ninguna funcionalidad existente se eliminó ni se reescribió. Los editores de Codex (`WebsiteEditor`, `CrmEditor` y `ChatbotEditor`) se usan **sin cambios**, dentro de una capa de persistencia propia de Avalon. `ProductBuilder`, la versión de Codex «solo en memoria», sigue intacto para sus pruebas y su demo.

## 3. Persistencia real (sin migraciones nuevas)

| Constructor | Ruta | Dónde guarda | Estado |
| --- | --- | --- | --- |
| Website Designer | `/admin/workspace/website-designer/<id>/studio` | `os_website_pages`. El trigger existente crea una versión en `os_website_page_versions` con cada cambio | VERIFICADO (14 de 14) |
| CRM Creator | `/admin/workspace/crm-creator/<id>/studio` | `os_projects.settings.blueprint`, el mismo blueprint que usan la página clásica y la exportación JSON/SQL. Color y módulos en `settings.nova` | VERIFICADO (13 de 13, junto con Chatbot) |
| AI Chatbots | `/admin/workspace/ai-receptionist/<id>/studio` | `os_projects.settings.chatbot` del proyecto de AI Receptionist. No toca `settings.receptionist` | VERIFICADO. **Las respuestas con IA no están conectadas**, y la interfaz lo dice |

Garantías comunes:
- Escritura con la sesión del owner, de modo que se aplica RLS. No se usa ninguna clave administrativa.
- Control de versión optimista: una pestaña desactualizada recibe «Conflicto de versión» y no sobrescribe.
- Validación en el servidor: enlaces `javascript:` rechazados, límites de longitud, colores y claves.
- Estados de guardado visibles: guardado, sin guardar, guardando, error y conflicto.
- Aviso del navegador antes de salir con cambios sin guardar.
- Al recargar, los datos se recuperan desde Supabase.

## 4. Pruebas

| Prueba | Local (`next start`) | Preview de Vercel |
| --- | --- | --- |
| `tsc --noEmit` | 0 errores | — |
| ESLint | 0 errores (4 avisos previos) | — |
| `npm test` | **406 de 406** (incluye 6 nuevas en `tests/nova-studio.test.cjs`) | — |
| Pruebas de Codex `tests/nova/*.test.cjs` | **18 de 18** | — |
| `next build` (base aislada, `VERCEL_ENV=preview`, guard activo) | exit 0 | build de Vercel `READY` |
| E2E Website Designer | 14 de 14 | **14 de 14** |
| E2E CRM y Chatbot | 13 de 13 | **13 de 13** |
| E2E biblioteca (regresión de Phoenix) | 10 de 10 | **10 de 10** |
| Importación de Nova en la biblioteca por Direct Bridge | 5 de 5 (con `localhost`; ver el límite 3) | **5 de 5**: v1 = Nova 1, v2 = Nova 2, y cada archivo coincide por SHA-256 con el blob Git del commit verificado |

Todas las pruebas de navegador se ejecutaron en **Chromium con perfil de iPhone 13. No es Safari.** Las evidencias están en `docs/project-bridge/evidence/unity-*.json` y no contienen contraseñas, claves ni enlaces de acceso.

## 5. Preview

- URL: `https://avalon-core-agency-dzhg4iweu-avalon-core-agency.vercel.app` (`dpl_3KyaQ6EUhThfdpKno9twmBGpAAa7`). Estado `READY` y target `null`: es Preview, no producción.
- Construida desde `git archive` del commit `6a96a69`, sin metadatos Git.
  - El primer intento quedó `BLOCKED`: Vercel Hobby rechaza commits de autores que no son miembros del equipo.
- Variables solo de esta Preview: la URL y la clave **publishable** de la base aislada. No se usó `--prod` y no se tocaron dominios ni la configuración del proyecto.
- Protección: Vercel Authentication. Hay dos formas de abrirla:
  - Con una cuenta de Vercel del equipo.
  - Con un enlace temporal que expira el 2026-11-10 a las 15:03 UTC. No se guarda en el repositorio.
- **Para iniciar sesión dentro de Avalon:** la base aislada solo tiene usuarios sintéticos. Miguel y Samuel necesitan una cuenta propia como owner en esa base. Es un paso pendiente que requiere su aprobación.

## 6. Límites conocidos (honestos)

1. **Safari real no se probó.** Las pruebas usan Chromium con perfil de iPhone.
2. **Publicar desde el editor Nova no está conectado.** El Website Designer clásico sí publica.
3. **Importador de la biblioteca en local:** con `next start` accedido por `127.0.0.1`, Next construye `req.url` con `localhost`. El guard CSRF compara hosts y rechaza la subida («Solicitud bloqueada por seguridad»). En Vercel funciona (5 de 5). No se debilitó el guard. Para probar en local hay que usar `http://localhost:3100`: así se verificó, con 5 de 5.
4. El editor Nova del Website Designer no borra páginas ni edita la ruta (slug) ni la descripción SEO. Para eso sigue disponible el editor clásico.
5. Si una página falla al guardar, las demás páginas modificadas sí se guardan. El resultado se informa página por página; no es una transacción global.

## 7. Cómo reproducir

```bash
NODE_USE_ENV_PROXY=1 node scripts/project-bridge/e2e-website-studio.cjs <dir> http://localhost:3100
NODE_USE_ENV_PROXY=1 node scripts/project-bridge/e2e-nova-studios.cjs <dir> http://localhost:3100
# Contra una Preview protegida (el enlace temporal de Vercel solo va en una variable de entorno):
AVALON_PREVIEW_SHARE_URL='<enlace temporal>' NODE_USE_ENV_PROXY=1 node -r ./scripts/project-bridge/preview-share-preload.cjs scripts/project-bridge/e2e-import-nova.cjs <dir> <preview>
```

## 8. Revocar la credencial temporal de Vercel

1. En claude.ai, abrir la configuración del entorno «Avalon code» → Network secrets → borrar «Vercel deploy token (Avalon Preview only)».
2. En Vercel, ir a Account Settings → Tokens y revocar el token.
3. Opcional: quitar del allowlist del entorno el host de la Preview (`avalon-core-agency-dzhg4iweu-avalon-core-agency.vercel.app`).

Next action: aprobar la creación de cuentas owner para Miguel y Samuel en la base aislada, y probar la Preview en Safari real.
