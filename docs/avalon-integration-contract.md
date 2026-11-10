# Avalon OS: contrato de integración backend ↔ frontend (Codex)

**Rama:** `claude/engine-registry` (apilada sobre #157 → #132).
**Fecha:** 2026-11-10.
**Regla:** este documento describe **solo lo que existe y está probado**. Lo planificado se marca como «PREVISTO».

## 1. Autenticación y autorización (común a todo)

| Aspecto | Contrato |
| --- | --- |
| Sesión | Supabase Auth (correo + contraseña) mediante cookies httpOnly (`@supabase/ssr`). Login en `/admin/login` y cierre en la acción `signOut` |
| Quién entra | Solo los usuarios con `agency_memberships.role = 'owner'`. Hoy, Miguel y Samuel (cuentas reales); en la base aislada, owners sintéticos |
| Servidor | Toda página bajo `/admin/**` llama a `requireOwner()` y toda acción de servidor a `ownerForAction()`. Sin sesión: redirige a `/admin/login`. Los route handlers JSON devuelven `401` y comprueban el mismo origen (`403 forbidden_origin`) |
| Base de datos | RLS en todas las tablas. Las lecturas usan la sesión del usuario: **nunca** una clave privilegiada en `src` (hay una prueba que lo exige) |
| Estados de UI obligatorios | `loading`, `empty`, `error` con mensaje real, `conflict` (otra sesión cambió el dato) y `unauthorized`. No mostrar «guardado» hasta confirmarlo en el servidor |

## 2. Endpoints existentes (route handlers)

| Ruta | Método | Respuesta | Uso |
| --- | --- | --- | --- |
| `/admin/workspace/library/uploads` | POST JSON `{name,size,category,projectName?,projectId?,sourceTool,idempotencyKey}` | `201 {importId, upload:{url,method,contentType}}` o `{replayed:true}`; errores `400/401/403/409/413/429` | Paso 1 de importación: URL firmada al almacenamiento privado |
| `/admin/workspace/library/imports/[importId]/process` | POST | `201 registered` / `200 duplicate` / `409 busy` / `422 rejected {reason,message}` | Paso 2: validar, extraer y crear la versión |
| `/admin/workspace/library/[id]/export?version=<uuid>` | GET | `application/zip`, con todos los archivos verificados por SHA-256 y `AVALON_EXPORT.json`; `404` si la versión no pertenece al proyecto | Exportar o compartir; el ZIP se puede volver a importar |
| `/admin/workspace/library/[id]/preview` | GET | JSON con el HTML de la versión, para un iframe `srcdoc` en sandbox **sin** `allow-same-origin` | Vista previa aislada |
| `/api/project-bridge/v1/imports` y `/[importId]` | POST/GET, con Bearer de token de herramienta | Bandeja privada de entregas de herramientas | Codex, Higgsfield y agentes |
| `/admin/workspace/website-designer/[id]/pages/[pageId]/export` | GET | HTML descargable | Exportar una página |
| `/admin/workspace/{crm-creator,ecommerce-designer,marketing-hub}/[id]/export` | GET | JSON/SQL/CSV | Exportaciones por módulo |
| `/admin/workspace/crm/radar/{area,campaigns,geocode,places,research}` | GET/POST | Ver `src/lib/crm/*` | Radar / Lead Hunter |
| `/admin/workspace/crm/office/{manager-run,manager-activity,…}` | — | Ver §5 | Managers |

## 3. Acciones de servidor de guardado (sin endpoints nuevos)

| Acción | Entrada | Salida | Garantías |
| --- | --- | --- | --- |
| `saveWebsiteStudio(projectId, pages[])` (`website-designer/studio-actions.ts`) | `{id, title, blocks, version \| null}[]` | `{ok, pages:[{id, ok, version, slug} \| {id, ok:false, error}]}` | Control de versión optimista (`conflict`), reintento idempotente, sin borrados. **Codex no debe sustituirla** |
| `saveWebsiteToLibrary(form{projectId})` | — | Redirige con `ok=library_version_saved \| library_version_unchanged` | Snapshot estático como versión inmutable de la **misma** fila `os_projects`; idempotente por digest |
| `saveNovaStudio(kind, projectId, version, content)` | `kind: 'crm' \| 'chatbot'` | `{ok, version} \| {ok:false, error}` | Optimista; guarda en `os_projects.settings` |
| `restoreVersion` (biblioteca) / `restoreVersion` (página web) | — | — | Restaurar **crea una versión nueva**; nunca se borra historia |

**Componentes de Codex que ya están integrados sin cambios:** `src/components/avalon-ui/**` (Nova UI, `WebsiteEditor`, `CrmEditor`, `ChatbotEditor`). Las capas de persistencia viven fuera, en `src/components/os/website-studio.tsx` y `nova-settings-studio.tsx`.

## 4. Biblioteca y versiones (tablas)

`os_projects` (proyecto, `module`, `settings`, `version`) → `os_project_versions` (inmutables, `number`, `kind: import|restore`, `content_digest`) → `os_project_files` (`path`, `sha256`, blob en el bucket privado `avalon-projects`). Auditoría en `os_project_events`. Despliegues en `os_project_deployments`; producción solo con `os_project_publish_approvals`. Ambos owners ven todos los proyectos de la agencia: es la política real, sin ACL por proyecto.

## 5. Registro de motores (NUEVO en esta rama)

**Lectura:** `select * from crm_engine_status` (vista; solo owners). Tipo TS: `EngineRecord` en `src/lib/engines/registry.ts`.

| Campo | Significado |
| --- | --- |
| `engine_id`, `manager`, `name`, `responsibility`, `capabilities`, `provider`, `runtime_type`, `requires_gpu` | Definición del motor. `name` es el framework o herramienta, **no** un modelo de IA |
| `deployment_status` | Último estado informado: `NOT_CONFIGURED`, `READY`, `RUNNING`, `PAUSED`, `RATE_LIMITED`, `FAILED` o `UNAVAILABLE` |
| `effective_status`, `paused_reason` | **Lo que debe mostrar la UI.** El interruptor general (`crm_agent_settings.kill_switch`) o la suspensión del puesto lo fuerzan a `PAUSED` |
| `configuration_status`, `license`, `license_verified`, `health_status`, `quota_status` | Hechos verificados. `READY` y `RUNNING` exigen `configuration_status = verified` **y** `license_verified` (restricción SQL) |
| `last_execution_id`, `last_execution_at` | Enlace a `crm_agent_runs`: la cola durable con historial |
| `estimated_cost_usd` | `null` = desconocido. Nunca asumir 0 |
| `error_code` | Obligatorio en `FAILED`, `RATE_LIMITED` y `UNAVAILABLE` |

**Escritura del owner:**

```sql
crm_engine_update(p_engine, p_deployment_status, p_configuration_status, p_license, p_license_verified, p_error_code, p_notes)
```

Solo admite `NOT_CONFIGURED`, `READY`, `PAUSED` y `UNAVAILABLE`. Los estados `RUNNING`, `RATE_LIMITED` y `FAILED` solo los informa la capa de ejecución (`engine_state_reserved_for_executor`).

**Estado actual (verificado en PGlite):** los 10 motores están en **`NOT_CONFIGURED`**. Ninguno está instalado ni conectado.

**Contrato de tareas (ya existe, reutilizar):**

```
crm_agent_enqueue(manager, capability, idempotency_key) → crm_agent_claim(run) → crm_agent_complete(run, summary, result, evidence) | crm_agent_fail(run, code)
```

Con lista blanca de capacidades, límites por hora y por día, hasta 3 intentos, interruptor general e historial en `crm_agent_runs`. Las capacidades ejecutables hoy son deterministas (SQL) para REN, SHIN, HARU, SORA y KENJI. **PREVISTO:** un adaptador por motor que, al ejecutar, actualice `deployment_status` y `last_execution_id`.

## 6. Lo que Codex debe hacer y lo que no

- **Hacer:**
  - Pintar `effective_status` con `ENGINE_STATE_LABEL`.
  - Leer `crm_engine_status`.
  - Pedir cambios con `crm_engine_update`.
  - Mostrar «Sin configurar» como estado normal, no como error.
- **No:**
  - Simular ejecuciones.
  - Mostrar «Ejecutando» sin `RUNNING` informado.
  - Inventar costos.
  - Crear endpoints o tablas paralelos de guardado.
  - Tocar `studio-actions.ts`, `library-actions.ts` ni las migraciones sin acordarlo.

## 7. Compatibilidad

- Migraciones **aplicadas solo en Supabase aislado**: `project_bridge`, `code_exchange`.
- **No aplicada en ninguna base** (solo PGlite): `engine_registry`.
- Producción: ninguna de estas tres. Se aplicarán con revisión y aprobación expresa.
