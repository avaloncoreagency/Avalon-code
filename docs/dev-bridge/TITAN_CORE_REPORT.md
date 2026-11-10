# Operación Avalon Titan Core: informe de cierre (2026-11-10)

**Rama:** `gitless/code-exchange`.
**HEAD:** `5eaa2b9`, más este informe.
**Mainline verificada:** #8 `408f918`.
**Base de datos:** Supabase aislado `wupvuwmqfcvmjqycmnvg`.
**Sin tocar:** producción (`ltbwzcrxeuczdhhtbqgm`) y el proyecto Vercel `avalon-core-agency`.
**GitHub:** no se usó.

## Fase 0: recuperación (VERIFICADO)

| Comprobación | Resultado |
| --- | --- |
| `7a07f5c` = `backup/titan-export` | Sí |
| SHA-256 del bundle completo `…140517Z` | `e905dd4c…27e3` ✔ |
| SHA-256 del incremental `…143631Z` | `01ac4403…608d` ✔ |
| Completo + incremental en un directorio limpio | Reproduce `7a07f5c` con árbol idéntico y sin remotos; `npm ci`, tsc y **406 de 406** |
| **Respaldo duradero** | Google Drive del owner: carpeta privada «Avalon OS — Respaldos Gitless (privado)» (acceso solo para la cuenta propietaria de Avalon; permisos heredados desactivados) |

**Contenido en Drive** (cada parte se subió con su SHA-256 comprobado):
- Bundle completo en 4 partes, más `SHA256SUMS.txt` y `LEEME-RESTAURAR.txt`.
- Incrementales `…143631Z` y `…153204Z`.
- El paquete de Codex en 4 partes (incluye el bundle completo de la mainline #8), más `LEEME-CODEX-HANDOFF.txt`.

El límite de subida del conector es de unos 3,1 MB por llamada; por eso se dividió en partes.

## Fases 1–3: verificación de cierre (VERIFICADO, reproducible)

`scripts/verify-isolated.sh <dir> 3100` ejecuta todo en orden contra la base aislada. Usa solo sesiones reales de cada usuario sintético y la clave publicable: ninguna clave privilegiada. La ejecución sobre `8a71a13` dio:

| Suite | Resultado | Evidencia |
| --- | --- | --- |
| Unitarias y de seguridad | 406 de 406 | `npm test` |
| Code Exchange (PGlite) | PASS | Scopes por agente, chunks con SHA-256 verificados por la base, entregas duplicadas o reusadas rechazadas, mainline lineal y solo de anexado con pruebas en verde, aprobación de rutas sensibles solo por el owner, cuotas, auditoría, token por cabecera |
| Build (Preview, base aislada) | PASS | — |
| Dos owners (cuentas y sesiones separadas) | **15 de 15** | `evidence/core-two-owners.json`: crear, guardar, B edita, A cierra sesión y recupera, autoría por versión, restaurar como v3, conflicto en escritura simultánea, reintento sin duplicado, usuario ajeno y anónimo denegados |
| Exportar e importar | **5 de 5** | `evidence/core-export-roundtrip.json`: ZIP con hashes idénticos, reimportación como proyecto nuevo, B exporta, usuario ajeno, anónimo y versión ajena rechazados |
| Direct Bridge, cinco pruebas | **4 PASS, 2 BLOCKED, 0 FAIL** | `evidence/core-five-tests.json` (T3 y T4b, ver Vercel) |
| Ciclo Code Exchange con dos entornos | 17 de 17 (2026-11-09) | `evidence/titan-gitless-two-envs.json` |
| Publicación de la mainline #8 | Gates en verde y restauración idéntica desde un directorio vacío | `acx publish` y `verify-restore` |

**Protecciones de entregas verificadas por pruebas existentes:**
- Lector ZIP: traversal, symlinks, bombas, ZIP64 y nombres peligrosos (`tests/project-bridge-import.test.cjs`, en `npm test`).
- Bundle alterado, secreto, conflicto y manifiesto incompleto: rechazados (`verify-delivery`, 2026-11-09).
- `invalid_chunk`: corregido (`Uint8Array` → `Buffer` antes de Base64) y cubierto por el E2E de dos entornos.

**Corrección nueva:** cada llamada de `acx` tiene un límite de 60 segundos. Una conexión colgada ya no puede bloquear un ciclo; los reintentos ya estaban acotados a 4.

## Constructores (Fase 3)

**Website Designer** está conectado de extremo a extremo: crear, editar, guardar en remoto (confirmado en Supabase antes de mostrar «Guardado»), versionar en la biblioteca, cerrar sesión, recuperar, exportar, importar y restaurar.

**AI Chatbots y CRM Creator** guardan su configuración en `os_projects.settings` (`saveNovaStudio`, con control de versión optimista), sin motor paralelo. Contrato pendiente para versionarlos en la biblioteca: reutilizar `saveWebsiteToLibrary`, con un snapshot JSON de `settings` como versión de la misma tabla `os_project_versions`. No requiere esquema nuevo.

## Vercel (BLOQUEADO; diagnóstico definitivo)

| Hecho | Fuente |
| --- | --- |
| *«The first deployment of a new project is always a production deployment, even without --prod»* | Documentación CLI de Vercel |
| Plan de la cuenta: **`billing.plan: "hobby"`** | API de Vercel (`get_auth_user`) |
| *«Hobby teams are restricted to non-commercial personal use only. All commercial usage of the platform requires either a Pro or Enterprise plan.»* Comercial incluye *«a paid employee or consultant writing the code»* | vercel.com/docs/limits/fair-use-guidelines |
| Pro: **$20 por desarrollador al mes**, $20 de uso incluido y prueba de 14 días con $20 de créditos; asientos de solo lectura gratis | vercel.com/docs/plans/hobby y vercel.com/pricing |
| Proyecto de prueba aislado: dominio único `avalon-client-bridge-e2e.vercel.app`, sin dominios propios, protección `all_except_custom_domains`, sin despliegues | API de Vercel |
| Credencial del entorno: ve **solo** el proyecto de prueba | API de Vercel |
| El control de seguridad de la sesión deniega despliegues de producción | Sin eludir y sin repetir |

**No existe una vía de despliegue conforme en el entorno actual.** Un uso comercial (agencia que construye sitios para clientes) en Hobby incumple las condiciones.

### Opciones compatibles

| Opción | Costo | Intervención humana |
| --- | --- | --- |
| **1. Pro** (recomendada): una persona activa la prueba de 14 días o Pro en el equipo «Avalon Core Agency» y hace el despliegue neutro inicial | $20/mes por desarrollador (Miguel y Samuel como desarrolladores: $40/mes; o uno desarrollador y otro de solo lectura: $20/mes) | 2 acciones: activar el plan y un `vercel deploy --prod` de `index.html` neutro en `avalon-client-bridge-e2e` |
| 2. Sin hosting de pago | $0 | Ninguna: exportar el ZIP (ya funciona) y alojarlo en el hosting del cliente |
| 3. Otro proveedor con Previews sin Git (p. ej. subida directa de Cloudflare Pages) | **NO VERIFICADO**: sus condiciones, límites y uso comercial no se leyeron (host no permitido) | Requiere verificación antes de recomendarlo |

Tras la opción 1, se ejecuta **una sola vez** `scripts/project-bridge/e2e-five-tests.cjs` para T3 y T4b. Riesgo: un despliegue neutro de producción en un proyecto protegido, sin datos.

## Codex (entrega directa)

- **Paquete:** `codex-handoff-408f918.zip`, SHA-256 `239f48f1…ba171`. Contiene:
  - El bundle completo de la mainline #8.
  - `acx.mjs`.
  - `MANIFEST.json`: commits, lockfile `9c4c058c…`, dependencias fijadas, módulos integrados y no recibidos.
  - Los contratos (Direct Bridge, Code Exchange, Delivery Contract).
  - `LEEME-CODEX.md`, con las rutas que Codex puede modificar.
  - `SHA256SUMS`.
- **Verificado** en un directorio limpio: sumas correctas, árbol idéntico a `408f918`, sin remotos.
- **Dónde está:** en Drive (4 partes) y entregado en el chat.
- **Intercambio directo autorizado:** el Code Exchange (`acx sync` / `acx deliver`). Solo requiere que el entorno de Codex permita `wupvuwmqfcvmjqycmnvg.supabase.co` y tenga un token de perfil agente.

## Fase 6: auditoría de infraestructura

| Área | Resultado |
| --- | --- |
| Funciones `SECURITY DEFINER` (37 en `public`) | Verificado en la base: todas comprueban owner o token con scope, salvo `crm_ai_public_control`, revisada (solo cuatro interruptores, fijados por prueba). Las ejecutables por `anon` son las del puente y del exchange, protegidas por token, más las revisadas `crm_public_inquiry` y `crm_ai_public_control` |
| RLS sin políticas (`crm_private.finance_access`, `crm_radar_worker_config`) | INFO: denegación total intencionada (solo acceso por funciones definer) |
| **Protección de contraseñas filtradas (Auth)** | **Desactivada.** Cambio de configuración de Auth: requiere aprobación (pendiente) |
| Dependencias (`npm audit --omit=dev`) | 1 moderada: `ajv` (ReDoS solo con la opción `$data`). La app no compila esquemas no confiables con `$data`; riesgo bajo, a actualizar en la siguiente ventana |
| Claves privilegiadas en el cliente | No hay `service_role` en `src` (prueba de seguridad) |
| Edge Function del Radar sin `verify_jwt` | Token propio por hash en tiempo constante; falla cerrado |
| Code Exchange | Tokens de 90 días como máximo, revocables al instante, por cabecera inyectada; cuota de 256 MB/día por token; 30 entregas/hora; auditoría de solo anexado |
| Managers (cinco) | Sin cambios en esta misión; no se habilitaron funciones autónomas |

## Fase 7: siguiente etapa (después de cerrar los P0)

1. **Cerrar la publicación (P0):** decisión de plan de Vercel, despliegue neutro y T3/T4b. Después, el escritor remoto del adaptador de Codex sobre los contratos existentes.
2. **Versionar AI Chatbots y CRM Creator en la biblioteca** (snapshot de `settings`) y activar la protección de contraseñas filtradas. Con eso, los tres constructores quedan con historial, exportación y restauración.
3. **CRM Radar / Lead Hunter:** reproducir el fallo de búsquedas por ZIP o dirección y asociar cada búsqueda a su ejecución.

Después vendrán los managers con ejecuciones reales, Dev Bridge, Higgsfield y la Oficina 3D unificada, en ese orden de impacto.
