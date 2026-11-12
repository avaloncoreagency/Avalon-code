# Avalon Project Bridge: Import & Publish (Misión 0400)

Avalon OS ya puede **importar, guardar en privado, versionar, previsualizar de forma aislada y publicar en Vercel** proyectos creados con IA, sin GitHub. Este documento explica qué hay, cómo se usa, qué está verificado y qué falta. No se declara nada como operativo si no lo está.

> **Estado al 2026-11-08:** el código está terminado y probado en local y en CI sintético. Para usarlo en Avalon OS de producción faltan tres pasos del dueño: aplicar la migración, configurar el token de Vercel y fusionar o desplegar el código (ver «Activación»).

---

## 1. Qué encontramos (Fase cero)

- **Código local:** checkout legítimo y completo en la rama `claude/upbeat-galileo-grbelq`. Hay 5 commits locales sin subir porque GitHub está suspendido. La base es `main` = `d2890bb`. Graphify no está conectado en esta sesión; se usó búsqueda directa en el código.
- **Supabase (producción, verificado por SQL de solo lectura):**
  - 0 buckets de Storage, 0 objetos y 0 políticas de Storage.
  - `os_projects`, `os_website_pages` y `os_website_page_versions` existen y están vacías (0 filas).
- **Vercel:**
  - Producción READY en `d2890bb`.
  - Los despliegues recientes con error son Preview bloqueadas por el guard de aislamiento de Supabase (conocido; ver `docs/AVALON_OMEGA_BLOCKERS.md` B2).
- **Módulos existentes que se reutilizan:**
  - `os_projects` (Website / E-commerce / CRM Creator / …), con su `client_id` hacia CRM.
  - `crm_clients`, `os_private.is_owner()`, el diseño de Suite y el Creative Bridge (se asocia, no se reconstruye).

## 2. Qué se construyó

| Pieza | Archivo |
| --- | --- |
| Política de importación (límites, tipos permitidos y bloqueados, secretos, magic bytes) | `src/lib/project-bridge/policy.ts` |
| Lector ZIP defensivo (sin dependencias nuevas; `node:zlib`) | `src/lib/project-bridge/zip.ts` |
| Inspección: manifiesto, SHA-256, framework, entrada, «desplegable», duplicados | `src/lib/project-bridge/inspect.ts` |
| Servicio de importación (puertos inyectables; recuperación de fallos) | `src/lib/project-bridge/service.ts` |
| Adaptadores Supabase (sesión del owner; **sin clave de servicio**) | `src/lib/project-bridge/supabase.ts` |
| Vista previa aislada (documento autocontenido + CSP sandbox) | `src/lib/project-bridge/preview.ts` |
| Cliente Vercel oficial (`/v2/files` + `/v13/deployments`) | `src/lib/project-bridge/vercel.ts` |
| Migración: Storage privado, importaciones, versiones inmutables, archivos, despliegues, aprobaciones, eventos, tokens, RLS | `supabase/migrations/20261108100000_project_bridge.sql` |
| Biblioteca (lista, filtros, importador, bandeja API, importaciones recientes) | `src/app/admin/workspace/library/page.tsx` |
| Ficha del proyecto (vista previa, versiones, restaurar, archivos, cliente, publicación, actividad) | `src/app/admin/workspace/library/[id]/page.tsx` |
| Tokens de API para herramientas | `src/app/admin/workspace/library/tokens/page.tsx` |
| Rutas: ticket de subida, procesar, vista previa | `src/app/admin/workspace/library/{uploads,imports/[importId]/process,[id]/preview}/route.ts` |
| Acciones de servidor: restaurar, asignar cliente, aprobar, desplegar, consultar estado, crear y revocar tokens | `src/app/admin/workspace/library/actions.ts` |
| API privada para herramientas | `src/app/api/project-bridge/v1/imports/**` |
| Cliente de ejemplo | `scripts/project-bridge/send-project.mjs` |
| Interfaz (importador con progreso real, vista previa sandbox, estilos HUD) | `src/components/library/*` |
| Enlace «Biblioteca» en la navegación principal | `src/components/suite/suite.tsx` |
| CI | `.github/workflows/project-bridge.yml` |

### Flujo

1. **Ticket de subida.** El navegador llama a `POST /admin/workspace/library/uploads`. La ruta comprueba la sesión de owner, el mismo origen, el tipo, el tamaño, la categoría y la clave de idempotencia.
2. **Registro y límites.** SQL registra la importación y aplica sus límites: 30 por hora y 2 simultáneas por owner. El archivo solo puede ir a `incoming/<tu id>/<id importación>`.
3. **Subida directa.** El navegador sube el archivo directamente a Supabase Storage **privado** con una URL firmada de un solo uso, mostrando el progreso real. Así se evita el límite de cuerpo de Vercel.
4. **Procesamiento.** `POST …/imports/<id>/process` hace, en el servidor y con la sesión del owner:
   - Descarga el archivo.
   - Lo valida y extrae en memoria, con límites.
   - Guarda cada archivo como `blobs/<sha256>`, inmutable y deduplicado.
   - Crea la **versión** y su manifiesto, y la **sella**.
   - Una versión sin sellar nunca se lista ni se despliega.
5. **Contenido idéntico** a la versión actual: queda como `duplicate` y no se crea versión.
6. **Restaurar** crea una versión **nueva** con los mismos archivos. El historial nunca se reescribe.
7. **Publicar.** Solo para versiones selladas y **estáticas**. Siempre va a un proyecto Vercel propio `avalon-client-<slug>`; el proyecto de Avalon OS está prohibido en el código **y** en SQL. Producción requiere una aprobación del owner para **esa versión exacta**: de un solo uso, válida 24 h y comprobada por la base de datos.

## 3. Qué está verificado (sin inventar)

| Prueba | Resultado | Tipo |
| --- | --- | --- |
| `tests/project-bridge-import.test.cjs` | 9/9 | ZIP sintéticos válidos y maliciosos |
| ZIP reales generados con Python `zipfile`, con *data descriptor* (stream) e Info-ZIP | aceptados | archivos reales |
| `tests/project-bridge.database.cjs` | 6/6 (repetido 4 veces estable) | migración real en PostgreSQL aislado (PGlite) + stub de Storage |
| `tests/project-bridge-service.database.cjs` | 2/2 | **servicio real** contra la migración real; Storage = doble de pruebas en memoria (declarado) |
| `tests/project-bridge-vercel.test.cjs` | 5/5 | lógica de peticiones con `fetch` **falso** (declarado) |
| `tests/project-bridge-preview.browser.cjs` | 1/1 | **Chromium real** con perfil iPhone 13 (**no es Safari**) y cabeceras de seguridad reales de Avalon |
| Revisiones existentes (SHIN, `security.test`, `os.test`) | pasan, con excepciones nuevas **revisadas y justificadas** | |
| `npm test` | 400/400 | |
| `next build` | exit 0 (8 rutas nuevas) | |
| `tsc` / `eslint` | limpios | |

**Despliegues reales en Vercel (2026-11-08, payload generado por este código, sitio sintético):**

- **Proyecto creado:** `avalon-client-bridge-selftest`, aislado y nuevo, dentro del equipo Avalon Core Agency. Avalon OS no se tocó.
- **`dpl_Chgi2GCEPdvad8GFX4B32iEXCqgi` → READY. Hallazgo:** Vercel lo asignó a **production** aunque no se envió `target`. **El primer despliegue de un proyecto nuevo siempre es producción.** Quedó publicado en `avalon-client-bridge-selftest.vercel.app`, con contenido sintético y sin dominio propio.
- **`target: "preview"`:** la API lo rechaza (`400: target should be 'production', 'staging', or a custom environment`).
- **`dpl_6vN5ijCmiNkbWKKPwsyWJoRs1Zmu` → READY, `target: null` (Preview), sin alias.** La URL devolvió HTTP 200 con exactamente el HTML desplegado.
- **Consecuencia aplicada al código:** un Preview solo se permite si el proyecto de Vercel ya tiene producción. El primer despliegue de un cliente pasa obligatoriamente por la aprobación del owner. Está cubierto por pruebas.

**No verificado aún:**

- La subida a Supabase Storage real y las políticas de Storage en Supabase real. Requiere aplicar la migración en un entorno aislado; ver «Activación».
- El recorrido completo en la app desplegada.
- Safari real en iPhone.

## 4. Seguridad

- **Autenticación y autorización:**
  - Solo owners (`os_private.is_owner()`), comprobado en el servidor y en RLS.
  - Las acciones de servidor reverifican al owner.
  - Las rutas JSON exigen el mismo origen (CSRF).
  - Ningún permiso depende de datos del navegador.
- **ZIP:**
  - Se rechazan: traversal (`..`), rutas absolutas o con `\`, symlinks y dispositivos, cifrado, ZIP64, multi-disco, nombres duplicados (sin distinguir mayúsculas), colisiones archivo/carpeta, compresión desconocida, ratio > 200, más de 2000 entradas, más de 100 MB descomprimidos, archivos de más de 15 MB y archivos de más de 25 MB.
  - El inflado está acotado al tamaño declarado y se verifica el CRC32.
  - La cabecera local debe coincidir con el directorio central.
- **Archivos:**
  - Se bloquean ejecutables y scripts de servidor (`.exe .sh .php .py …`), `.env`, claves, `node_modules`, `.git`, y binarios renombrados (magic bytes).
  - Se detectan secretos: claves privadas, `sk_live`, AWS, GitHub, OpenAI, Slack, Google, Vercel y claves de servicio de Supabase. El valor nunca se devuelve.
  - Los scripts de `package.json` **solo se leen**.
- **Ejecución:**
  - Nada importado se ejecuta, instala ni compila.
  - Los proyectos Next.js/React se guardan y se marcan `needs_build`; publicarlos está **bloqueado** (también en SQL) hasta que exista un entorno de compilación aislado.
- **Vista previa:**
  - Documento con todo en `data:` dentro de `<iframe sandbox="allow-scripts" srcdoc>`.
  - Origen opaco, sin cookies, sin almacenamiento, `connect-src 'none'` y sin navegación de la ventana principal. Verificado en navegador.
- **Inmutabilidad:**
  - Versiones, archivos, despliegues, aprobaciones y eventos no se pueden editar ni borrar (triggers).
  - Las importaciones siguen una máquina de estados con reintentos acotados (≤ 5).
- **API para herramientas:**
  - Token `avb_…` aleatorio de 192 bits. Solo se guarda su SHA-256. Tiene permisos acotados, caduca en ≤ 90 días y se revoca al instante. Límite: 20 por hora por token.
  - Un token **solo** puede abrir una importación que espera su archivo en `inbox/<id>.zip` (una vez, 30 minutos). No puede leer proyectos, crear versiones ni publicar: un owner revisa cada envío.
- **Sin clave de servicio:** la aplicación no usa claves privilegiadas de Supabase en ninguna parte (regla verificada por `security-baseline`).
- **Superficie `anon` nueva, revisada y fijada en pruebas:**
  - `os_bridge_api_open_import` y `os_bridge_api_import_status` (SECURITY DEFINER, solo con un hash de token válido).
  - La política de Storage de la bandeja.
  - `usage` sobre `os_private`, para que la política pueda evaluar `bridge_inbox_open`. Esto no da acceso a nada más: PostgREST no expone `os_private`, y sus funciones tienen `execute` revocado.

**Riesgos restantes:**

1. Las políticas de Storage no están probadas en Supabase real.
2. El token recién creado se muestra con una cookie httpOnly de 2 minutos: si se recarga la página en ese tiempo, se ve otra vez.
3. Producción de un cliente en `*.vercel.app` es pública por diseño; los dominios propios no están implementados.
4. Sin antivirus de contenido: se bloquea por tipo y por firma, no por análisis de malware.

## 5. Costos

- **Servicios:** solo Supabase y Vercel existentes. No se contrató nada ni se añadieron dependencias.
- **Supabase Storage:** cada versión guarda solo los archivos nuevos (deduplicado por SHA-256), más el archivo original para auditoría. Las cuotas del plan (almacenamiento, egress y tamaño por objeto) deben **confirmarse en el panel**; aquí no se verificaron. El límite de 25 MB por archivo se eligió para quedar por debajo del límite habitual de 50 MB del plan gratuito.
- **Vercel:**
  - Despliegues estáticos, sin compilación: no consumen minutos de build.
  - Cada cliente es un proyecto nuevo.
  - **Verifica el plan del equipo.** El plan Hobby no permite uso comercial; publicar sitios de clientes requiere Pro. La API no devolvió el plan.
- **Recurso de prueba creado:** el proyecto `avalon-client-bridge-selftest` (2 despliegues sintéticos). Puede borrarse desde Vercel cuando quieras; Claude no lo borra sin tu confirmación.

## 6. Activación (pasos del dueño, en orden)

1. **Restablecer GitHub o integrar el parche** (sección 9).
2. **Probar la migración en un entorno aislado.**
   - Aplica `20261108100000_project_bridge.sql` a un Supabase aislado (no producción).
   - Comprueba que se crea el bucket `avalon-projects` y sus 4 políticas.
   - Haz una importación real desde la Preview.
3. **Producción.** Con aprobación expresa, aplica la migración en producción.
   - Depende de `20261106090000_ai_engine.sql`, porque redefine la función de postura de SHIN con la excepción revisada.
   - Si no se aplica la del AI Engine, el bloque final crea esa función igualmente.
4. **Vercel.**
   - Crea un token de Vercel de **mínimo alcance**, solo para el equipo.
   - Guárdalo como variable de servidor `AVALON_VERCEL_DEPLOY_TOKEN` (Production). Opcional: `AVALON_VERCEL_TEAM_ID=team_lHTO3wgJm0yAyexxMDmkIFW4`.
   - **Nunca** con prefijo `NEXT_PUBLIC_`.
5. **Verificar el plan de Vercel** para uso comercial.

### DOWN (revertir la migración en un entorno aislado; borra datos del puente)

```sql
begin;
drop policy if exists avalon_projects_owner_read on storage.objects;
drop policy if exists avalon_projects_owner_write on storage.objects;
drop policy if exists avalon_projects_owner_cleanup on storage.objects;
drop policy if exists avalon_projects_api_inbox on storage.objects;
drop function if exists public.os_bridge_api_open_import(text, text, text, text, text, text);
drop function if exists public.os_bridge_api_import_status(text, uuid, boolean);
drop function if exists public.os_project_restore_version(uuid, text);
drop table if exists public.os_project_events, public.os_project_deployments, public.os_project_publish_approvals,
  public.os_project_files cascade;
alter table public.os_project_imports drop constraint if exists os_project_imports_version_fk;
drop table if exists public.os_project_versions, public.os_project_imports, public.os_project_api_tokens cascade;
drop view if exists os_private.bridge_inbox_objects;
drop function if exists os_private.bridge_inbox_open(text);
-- 'apps' projects must be moved or archived before restoring the old module check.
commit;
-- The bucket is removed from the Supabase dashboard after emptying it.
```

## 7. Cómo usarlo desde iPhone

1. Exporta el proyecto desde ChatGPT, Claude o tu editor como **.zip**, o guarda un **.html**. En el iPhone queda en la app Archivos.
2. Abre Avalon OS en Safari → menú → **Biblioteca**.
3. En **Importar proyecto** toca el recuadro y elige el archivo en Archivos. Elige la biblioteca (Website, E-commerce, CRM Creator o Apps), escribe un nombre y la herramienta de origen.
4. Toca **Importar proyecto**. Verás «Subiendo X %» y luego «Validando…».
   - Si todo va bien: «Importado · versión 1» y el enlace **Abrir proyecto**.
   - Si algo no se permite, verás la lista exacta de archivos y el motivo.
5. En el proyecto puedes:
   - Ver la **Vista previa** aislada (elige la página arriba).
   - Revisar **Archivos** e **Historial de versiones**.
   - **Restaurar** una versión: se crea una nueva.
   - **Asignar cliente**.
   - **Publicar.** La primera vez escribe `PUBLICAR`, registra la aprobación y luego toca «Publicar en producción». Después, cada versión nueva puede ir primero a Preview.
6. **Nueva versión:** dentro del proyecto, usa «Nueva versión» con el ZIP actualizado.

## 8. API para herramientas

```bash
AVALON_BRIDGE_TOKEN=avb_… node scripts/project-bridge/send-project.mjs ./sitio.zip --url https://avaloncoreagency.com --category website --name "Landing" --tool claude_code
```

1. **Abrir la importación.** `POST /api/project-bridge/v1/imports` (Bearer) con `{fileName, category, projectName, sourceTool, idempotencyKey}`. Responde `importId` y las instrucciones de subida a la bandeja privada.
2. **Subir el ZIP** a esa URL. Máximo 25 MB y 30 minutos.
3. **Confirmar.** `POST /api/project-bridge/v1/imports/<id>` con `{"uploaded": true}`. El estado pasa a `received`. Consulta el estado con `GET` a la misma ruta.
4. **Revisión del owner.** Un owner pulsa «Validar e importar» en la Biblioteca.

**Errores estructurados:** `invalid_token` 401, `rate_limited` 429, `idempotency_key_in_use` 409, `archive_not_uploaded` 409, `not_found` 404, `not_configured` 503. No es un sistema de ejecución remota: no acepta comandos.

## 9. Recuperar la integración con GitHub (sin evadir la suspensión)

1. No se crearon repositorios ni cuentas alternativas. Todo el trabajo está en Git local, rama `claude/upbeat-galileo-grbelq`.
2. Cuando GitHub esté restablecido: `git push -u origin claude/upbeat-galileo-grbelq` desde este checkout. CI ejecuta `.github/workflows/project-bridge.yml` y el resto.
3. Sin este checkout: aplica el parche entregado (`git am`) sobre `ee7e9bb`, la punta remota de la rama, y sube igual.
4. **Vercel no es una copia del código fuente:** no se debe usar para recuperar código.

## 10. Copias de seguridad (versionar ≠ respaldar)

Las versiones protegen contra cambios, no contra perder la base de datos o el bucket. Estrategia propuesta (no automatizada aún):

- **Metadatos.** Exporta de forma periódica las tablas `os_project_*` y `os_projects` (`pg_dump` de esas tablas, o el backup diario del plan si existe).
- **Archivos.** Exporta periódicamente el bucket `avalon-projects` con la CLI de Supabase Storage hacia un almacenamiento externo del dueño. Los blobs son direccionados por contenido: una copia incremental solo copia `blobs/<sha256>` nuevos.
- **Restauración.** Primero los metadatos y luego los blobs. Comprueba que cada `os_project_files.sha256` existe como `blobs/<sha256>`, con una consulta de verificación más un script.

## 11. Pendiente (no completado)

- **Probar Storage y la app en un entorno aislado** (paso 2 de Activación). Es el último eslabón del recorrido de aceptación (puntos 1–9 en vivo).
- **Compilación aislada** para Next.js/React/Vite. Por ahora se guardan y se bloquea su publicación.
- **Dominios propios** con un flujo autorizado.
- **Rollback de producción** de un sitio: hoy se hace redesplegando una versión anterior con aprobación. No hay botón «promover despliegue anterior».
- **Paquetes de CRM:** importar datos o migraciones requiere un procedimiento separado y aprobado (no implementado; nunca se ejecuta SQL importado).
- **Creative Bridge:** asociar recursos existentes a un proyecto de la biblioteca (pendiente; no se duplicó el puente).
- **Managers (HQ):** lectura de importaciones y despliegues desde HQ (pendiente).
- **Antivirus de contenido.**
- **Safari real en iPhone.**
