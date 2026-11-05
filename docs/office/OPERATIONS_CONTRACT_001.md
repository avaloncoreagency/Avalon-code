# REN — Contrato operativo único de Avalon HQ 0350
**Misión:** REN / Avalon OS 001. **Fecha de corte:** 2026-11-04, America/New_York.
**Base leída:** main@d2890bbc414de48bf0b77767d05b040f3ed66b64 (no es una solicitud de merge).
**Decisión:** UNA oficina visual y UNA fuente de verdad para ejecuciones; ninguna segunda oficina ni trabajadores inventados.
**Alcance de esta entrega:** coordinación/documentación. No modifica runtime, producción, SQL, permisos ni gastos.

## 1. Evidencia y límites de lo que ya funciona

- La ruta principal /admin/workspace/crm/office monta Hq3d y, debajo, Office; Office todavía dibuja IsoOffice. Ese es el origen concreto de la doble visualización.
- La ruta /admin/workspace/crm/office/hq monta el mismo Hq3d como vista ampliada; puede mantenerse como modo de visualización, NO como segunda sede.
- PR #127 está fusionado en main y contiene el motor determinista de misiones y HQ 3D. Main@d2890bbc tiene despliegue Vercel READY (estado de despliegue, no aceptación humana).
- Lectura de solo lectura en Supabase principal: manager_missions figura en el ledger, automatic_enabled=true, kill_switch=false; existen 2 misiones completed y 12 ejecuciones completed (REN 2, SHIN 2, HARU 4, SORA 2, KENJI 2). Una comprobación no equivale a un agente autónomo capaz de programar.
- Issue #108 reportó un check horario de GitHub Actions a 2026-11-04T21:09:35Z: es evidencia de diagnóstico de PR/CI, no de trabajo autónomo de desarrollo. El workflow office-managers-free.yml ya está en main aunque su PR histórico #102 siga abierto; no fusionarlo a ciegas.
- Documentos existentes como docs/office/HQ_0350.md y docs/office/MANAGER_FREE_GITHUB.md contienen frases anteriores sobre migración o cron pendiente; la lectura en vivo prevalece en asuntos de estado actual.
- Los tres modelos GLB de Higgsfield fueron verificados como archivos; la escena actual usa geometría procedural porque no hay activos importados en hq-assets. GLB no es prioridad frente al funcionamiento.

Fuentes: [main](https://github.com/avaloncoreagency/Avalon-code/commit/d2890bbc414de48bf0b77767d05b040f3ed66b64), [PR #127](https://github.com/avaloncoreagency/Avalon-code/pull/127), [Issue #108](https://github.com/avaloncoreagency/Avalon-code/issues/108), [PR #102](https://github.com/avaloncoreagency/Avalon-code/pull/102), [PR #109](https://github.com/avaloncoreagency/Avalon-code/pull/109).

## 2. Contrato de la oficina unificada

**Ruta canónica:** /admin/workspace/crm/office, exclusiva de owners autorizados. La experiencia visual canónica es Hq3d de Higgsfield HQ 0350 (geometría alternativa hasta importar modelos auténticos). /office/hq es una vista ampliada del mismo componente y los mismos datos, no una app independiente.

**Pantallas o secciones del mismo Centro de Operaciones:**
1. Sede 3D + vista ligera accesible, diez estaciones, controles de misión y estado en vivo.
2. Actividad real: GET /admin/workspace/crm/office/manager-activity, resultado SQL con run_id/status/evidence_refs. No animar si no está genuinely running. Un completed no significa conectado online ni funcionalidad aprobada.
3. Órdenes del propietario: bandeja de solicitudes; mostrar explícitamente REGISTRADA SIN EJECUTAR cuando se guarda en office_agent_requests y todavía no existe vínculo a una misión.
4. Equipo humano: conservar directorio, perfiles, fotografía, disponibilidad/presencia no-online, filtros, mensajería, tareas internas y proyectos de la Office anterior.
5. Salud técnica / GitHub: lector separado de issue #108 con fuente y timestamp, nunca sumar estos informes como ejecuciones SQL ni como código escrito.

**Requisito UI para Codex:** reemplazar la segunda escena IsoOffice y su segundo encabezado de Oficina por paneles reutilizables de directorio/servicios. No eliminar las API de Office ni los mensajes, perfiles o tareas; no duplicar el código de Hq3d. No etiquetar como «IA activa» a ejecutores deterministas. Eliminar o corregir la bandera estática MANAGER_INTEGRATION.status=offline en vistas que ya tienen API de actividad real, sin declarar unavailable como 0. No tocar PR #109/#102 hasta comparar blobs ya integrados en main y sus conflictos.

**Estaciones:** A1 REN (coordinación), A2 SHIN (seguridad), A3 HARU (CRM), A4 SORA (Radar/integraciones), A5 KENJI (QA/costos); B6–B10 RESERVADAS para futuras incorporaciones. Las B permanecen sin usuario, cuenta, turno, movimiento, IA, tareas o estadísticas personales; no mostrar presencia simulada.

## 3. Una orden del propietario, de principio a fin

**Distinción obligatoria:** el formulario antiguo POST /office/api op=agent_request guarda office_agent_requests, pero en main NO despacha por sí mismo crm_agent_missions. El botón «Iniciar misión diaria» sí llama a startMission/SQL. Nunca fingir que una orden libre ya se ejecutó.

1. **Recepción (owner):** guardar texto, tipo, enlaces a lead/proyecto permitidos, timestamp, solicitante e idempotency_key. Responder «registrada» si solo se persistió; no responder «en cola de ejecución» sin una fila real de misión.
2. **Triage (REN):** convertir la intención en un plan declarativo con una sola tarea primaria por manager, owner funcional, dependencias, prioridad P0/P1/P2, riesgo y criterio comprobable. Clasificar cada paso como: capacidad SQL existente, trabajo externo de desarrollo (Claude/Codex en GitHub), aprobación humana o capacidad todavía no implementada.
3. **Admisión de capacidades (SHIN + motor de Claude):** validar membresía owner por UUID, CSRF, cuota, kill switch, capability enabled/effect/max_writes y datos mínimos. Efectos sensibles, cualquier proveedor de pago, producción, cambios de roles o publicación requieren aprobación específica. Paso no admitido = BLOCKED, con motivo, nunca ejecutar «lo que sea» como SQL.
4. **Plan/mission:** reutilizar crm_agent_missions y crm_agent_runs del ejecutor único crm_private.agent_execute, con pasos/depends_on/contract_version. Claude debe implementar y probar un vínculo rastreable entre solicitud y misión (por ejemplo source_request_id o una clave de correlación con acceso restringido), sin crear un segundo ejecutor ni migrar producción sin permiso.
5. **Ejecución:** el motor ejecuta solo capacidades allowlist con límite y reintentos idempotentes; HARU puede crear tareas internas de seguimiento mediante followup_tasks con deduplicación. Los trabajos de programación quedan bajo GitHub Issue/PR/commit, NO como supuestas llamadas a una IA autónoma dentro de Avalon.
6. **Evidencia:** cada paso registra run_id, estado, error_code, hora, capability, references verificables y, para desarrollo, Issue/PR/SHA/checks exactos. No copiar datos de clientes al issue público. Si falta evidencia, mantener «implementado sin verificar» o «blocked».
7. **QA (KENJI):** repetir pruebas positivas/negativas con datos sintéticos en aislamiento; comparar resultados persistentes y rollback, incluyendo idempotencia y denegaciones. No considerar el verde CI una prueba de navegador autenticado.
8. **Cierre (REN/owner):** solo «verificado» con pruebas pertinentes; «listo para aprobación» requiere revisión humana; «publicado y comprobado» únicamente tras autorización de release y prueba de producción. Un run completed NO cambia esos estados por sí solo.

**Política de dependencia:** P0 bloqueado detiene las partes dependientes, no otros trabajos aislados; máximo un owner técnico primario de cada ruta/PR; rutas compartidas requieren handoff GitHub con Next action y SHA exacto. No abrir un PR nuevo por cada comprobación horaria.

## 4. Propiedad y secuencia sin duplicación

| Manager | Única responsabilidad central | Dependencia/gate | Evidencia de aceptación |
|---|---|---|---|
| REN | Contrato de órdenes, prioridades, rutas reclamadas, coordinación de entrega | Lee HEAD+PRs+#23 antes de asignar; no edita backend/UX ajenos | Contrato, backlog y handoffs con SHA/PR |
| SHIN | Autorización owner, RLS, capacidades permitidas, límites, kill switch | Debe validar contrato SQL/API de Claude y staging aislado | Tests owner/no-owner, 403, no bypass de permisos |
| HARU | CRM, pipeline, tareas internas y servicios reutilizados de Office | Solo usa prospectos aprobados por SORA; respeta rutas Codex | Flujo de negocio persistente, sin tareas duplicadas |
| SORA | Radar, investigación con evidencia, entrada comercial y adaptadores | No crea clientes automáticamente ni altera CRM canónico | Lead origen trazable y aprobación humana antes de convertir |
| KENJI | Pruebas integradas, tiempos, errores, costo observable, QA | Valida SHA exacto entregado por autores, sin editar ramas ajenas | Evidencia E2E/CI/RLS, fallos reproducibles y métricas honestas |

**Ejecutores externos:** Claude Code tiene propiedad de SQL, intake→mission, scheduler, acceso y APIs. Codex tiene propiedad de HQ, extracción de paneles Legacy y dashboard visual. REN no duplica ninguno. GH Actions #108 es solo observabilidad read-only, nunca un segundo dispatcher SQL.

## 5. Dashboard ejecutivo: métricas verificables, no porcentajes inventados

| Indicador | Fuente canónica y regla |
|---|---|
| Órdenes recibidas / sin despacho | office_agent_requests; separar registrado, cancelado y enlace a misión. Sin enlace NO es queued |
| Misiones / ejecuciones | crm_agent_missions y crm_agent_runs; distinguir completed/failed/blocked/running/queued/stale; último run real y ventana |
| Tareas internas | crm_tasks; abiertas, completadas en periodo, vencidas, asignadas. Evitar top-N truncado presentado como total |
| Proyectos y entregas | os_projects + crm_work_orders por IDs canónicos; no sumar ambos como si fueran el mismo objeto |
| Errores | fallos reales de API y runs; CI GitHub por SHA separado, con fecha y alcance de los resultados |
| Progreso | pasos verificados / pasos requeridos para un plan identificable; N/D si no existe plan o no hay evidencia |
| Coste IA / créditos | registros reales por proveedor, periodo, unidad, modelo y proyecto. Diferenciar Higgsfield créditos, USD, tokens LLM y checks deterministas. Desconocido ≠ 0 |
| Salud y frescura | última ejecución, edad, fuentes offline, kill switch y estado del schedule; NEVER «online» por presencia decorativa |

Todas las consultas: owner-only, RLS, filtros por periodo, sin exposición de contenido interno por GitHub; mostrar N/D si una fuente no está conectada y avisar si una consulta está truncada. No usar «coste de IA $0» para proveedores sin ledger completo.

## 6. Backlog por impacto, riesgo y dependencia

### P0 — funcionalidad segura que desbloquea el producto
- **P0-01 / Codex:** en /office solo HQ 0350; separar de Office los paneles humanos y conservar perfil/mensajes/tareas; no renderizar IsoOffice ni duplicar tarjetas de managers. Gate: owner navegador escritorio + 320/390px, ruta ampliada consistente; PR existente reutilizado, sin tocar SQL.
- **P0-02 / Claude:** enlazar office_agent_requests → planes/misiones aceptadas o devolver BLOCKED con causa, sin crear un segundo worker. Aprobación manual para cualquier capacidad no allowlist. Gate: test aislado, reconexión y doble submit sin duplicados, test negativo sin permiso.
- **P0-03 / SHIN + KENJI:** auditar owner/no-owner en /office, /manager-activity, /manager-run, /office/api; probar idempotencia, scheduler y kill switch únicamente en entorno aislado autorizado. Gate: E2E por SHA, no lectura/escritura de producción para pruebas.
- **P0-04 / REN:** reconciliar #102/#109/#82 con main; el código integrado en #126/#127 hace que los PRs viejos no se puedan fusionar a ciegas. Gate: mapa de conflictos por archivos, propietario de decisión y Next action en #23.

### P1 — operación medible y flujo de negocio
- **P1-01 / HARU + Codex:** dashboard ejecutivo con métricas reales, estados N/D y trazabilidad a vistas canónicas; sin duplicar polling indiscriminado.
- **P1-02 / SORA + HARU:** continuar PR #128 Radar → Lead → Ventas → Cliente 360° usando origen canónico, aprobación humana, deduplicación y pruebas de integración antes de release. KENJI verifica dependencias de #58/#92.
- **P1-03 / REN + KENJI:** consolidar evidencia #108 GitHub y SQL sin sumar reportes como misiones; presupuesto por modelo y origen del ledger sin nuevas APIs pagas.

### P2 — experiencia y mejoras no bloqueantes
- **P2-01 / Codex + Claude:** evaluar compresión/importación segura de GLB Higgsfield. No elevar límite de tamaño sin evaluación de seguridad; mantener fallback procedural y vista ligera.
- **P2-02 / HARU:** acabados de cámara, rendimiento y personalización de estaciones B6–B10 únicamente después de que haya personas realmente incorporadas.
- **P2-03 / REN:** limpieza de docs y PRs históricos solo después de handoff de los propietarios y del gate P0.

## 7. Definición de aceptación final

1. Existe una sola Oficina canónica y diez estaciones; cinco reservadas no inventan personas o actividad.
2. Dos owners autorizados pueden usar las rutas y un no-owner es rechazado; se comprueba en entorno aislado.
3. Una orden libre no pasa de «registrada» a «ejecutada» sin plan y registro persistente ligados por un identificador comprobable.
4. Repetir la misma misión/acción no duplica tareas, clientes ni ejecuciones; fallos, cancelaciones, stale y kill switch quedan visibles.
5. Las cinco capacidades y las tareas internas permitidas usan el motor SQL ya existente, no un servicio nuevo ni un modelo de IA ficticio.
6. Datos del dashboard corresponden a consultas no truncadas y separan costes reales, no conectados y consumos de distintas unidades.
7. KENJI aporta resultado reproducible, SHA, run de CI y navegación en 320/390/desktop antes de declarar ready for approval.
8. Cualquier merge, despliegue, credencial, presupuesto o cambio de producción requiere autorización independiente.

## 8. Handoff inmediato / límites de esta rama

- **Claude / P0-02:** especificar cambio mínimo y tests del enlace de solicitud libre a misión. No aplicar migración en producción.
- **Codex / P0-01:** preparar un diff visual que conserve servicios de Office sin una segunda escena. Coordinar archivo de página compartido antes de editar.
- **SHIN/KENJI / P0-03:** preparar caso de prueba negativo y positivo aislado; comprobar ledger/test contra el mismo SHA.
- **REN / P0-04:** Issue #23 fuente de coordinación; revisar el estado nuevo de #128 y PRs de Oficina antes de nuevos trabajos.
- **No realizado aquí:** cambio de runtime, tests locales, merge, deploy, SQL mutante, activación de tokens, generación Higgsfield o gastos.

**Next action:** Codex presenta el diff propuesto para una sola oficina; Claude presenta el contrato intake→mission con tests; REN consolida un único handoff en #23 y KENJI valida sin nuevos PRs redundantes.

---

## 9. Checkpoint REN 001-B — avance verificable de integración (2026-11-04 ET)

**No altera runtime ni pretende reemplazar la implementación de Claude/Codex.** Verificados GitHub/Graphify `main@d2890bbc` y acciones de CI en la rama de Claude.

### A. La recepción de tareas AI Engine existe en PR #132, pero NO despacha todavía una orden libre desde la UI de Oficina
- [PR #132](https://github.com/avaloncoreagency/Avalon-code/pull/132) (head observado `84115a06a949f14fca13e2df5eb6ba133e15dc79`) implementa intake de GitHub Issues etiquetados `avalon:task`, rutinas por manager, selección de proveedores gratuitos y un worker limitado para REN. [Issue #135](https://github.com/avaloncoreagency/Avalon-code/issues/135) incluye una auditoría SHIN con comandos/evidencia; [#136](https://github.com/avaloncoreagency/Avalon-code/issues/136) demuestra que una solicitud de producción+eliminación queda `avalon:needs-owner` sin ejecutarse. Esto no conecta por sí solo `office_agent_requests` a `crm_agent_missions` ni convierte cada pedido libre en trabajo implementado.
- **P0 falso cierre:** `scripts/ai-engine/operate.cjs` recibe título/cuerpo para clasificar, pero el ejecutor `M[manager]` no recibe esa orden; se utiliza para análisis de IA, no ejecución de la instrucción. Aun así, `intake()` marca `avalon:done` cuando termina la rutina. Un pedido «arregla doble Oficina» no debe quedar DONE al completar una revisión general. La aceptación exige intención soportada + acción de esa intención + evidencia exacta; en ausencia de herramienta, estado `NEEDS_IMPLEMENTATION`/handoff (nunca success). **Revisión registrada:** [comentario PR #132](https://github.com/avaloncoreagency/Avalon-code/pull/132#issuecomment-6646629638).
- **P0 recuperación:** si falla `runManager`, `avalon:in-progress` puede permanecer y hacer que la siguiente consulta omita la orden. Implementar lease y transición recuperable; idempotencia sobre issue+capability+versión.
- **CI nuevo:** [run 41944912603](https://github.com/avaloncoreagency/Avalon-code/actions/runs/41944912603), job `live-smoke` success (Groq/Cloudflare reales, fallback 429 simulado, OpenRouter `not_configured`) y job `managers` success; **REN dev worker failed** por `edit_expect_mismatch:21` en `tests/agents-managers.database.cjs`. Es un rechazo de seguridad válido y no debe eludirse. Revalidar archivo/SHA, acotar el reintento, no marcar terminado ni abrir PR si no se supera el gate.
- PR #132 usa GitHub Actions y un worker de desarrollo diferente del ejecutor SQL `crm_private.agent_execute`: **no confundirlos ni convertirlos en dos fuentes canónicas de ejecución**. Mapear `source=github_action` vs `source=supabase_sql`; asignar ID/correlación solo si existe evidencia real, y nunca contar diagnósticos GitHub como pasos SQL.
- [PR #133 de HARU](https://github.com/avaloncoreagency/Avalon-code/pull/133) contiene contrato CRM y test estático, no una conexión E2E publicada; mantener P0 de la oficina y seguridad antes de integrar visual.

### B. P0 seguridad comercial comprobado en la función publicada
- La política vigente [Issue #40](https://github.com/avaloncoreagency/Avalon-code/issues/40) exige que Miguel/Samuel aprueben manualmente un prospecto del Radar antes de enviarlo al CRM.
- La función `public.crm_radar_worker_convert_verified(uuid)` **instalada en producción** sigue admitiendo `pending` y haciendo `UPDATE status='approved'` con un rol de servicio antes de insertar `crm_leads`. Confirmación técnica exclusivamente SELECT sobre `pg_get_functiondef` del principal: `accepts_pending=true`, `auto_approves_pending=true`, `creates_leads=true`. No se ejecutó la función ni se alteraron datos. [Handoff documentado en Issue #40](https://github.com/avaloncoreagency/Avalon-code/issues/40#issuecomment-6646635255).
- **Responsables:** Claude prepara patch de backend SQL y test PGlite aislado; SHIN define política de autorización y rechaza suplantación de aprobación; HARU valida estados y SORA fuente/evidencias; KENJI valida negativo `pending 5★ high 2 evidencias → 0 leads`, positivo aprobado owner → 1 lead, replay sin duplicados, rechazo de no-contact/override/no-owner.
- Ningún cambio de SQL o configuración en producción se autoriza por este documento. Cualquier reparación real requiere aprobación separada tras pruebas.

### C. Estado, métricas y condiciones de avance
- `main` seguía `d2890bbc` al inicio de este checkpoint. Graphify indexado en el mismo SHA; PR #132/#133 todavía no están en main.
- Para declarar 'operativo': (1) una sola escena en /office, (2) libre texto de owner se guarda y registra su estado honesto, (3) intake issue no marca DONE si solo hizo una auditoría genérica, (4) no promoción de Radar pending sin política autorizada, (5) REN dev worker supera test sin soltar los guards, (6) CI, RLS, E2E iPhone y persistencia en entorno aislado al SHA exacto.
- Siguiente acción de **REN**: revisar el nuevo head de PR #132 y #133, comprobar que el cierre falso de órdenes y la aprobación de Radar están bloqueados en tests; coordinar Codex para único componente visual sin pisar archivos reclamados.

## 10. Reconciliación de ramas antiguas — no merge ciego (2026-11-04 ET)

Comparación read-only en GitHub de `main@d2890bbc` vs heads de PR existentes; `ahead/behind` mide divergencia de commits, NO garantiza que todas sus funciones estén ausentes en main:

| PR | Head | Commits ahead/behind de main | Rutas cambiadas en PR | Decisión segura |
|---|---|---|---|---|
| #102 Office free GitHub | `bd454597` | +55 / -105 | 16 | El workflow `office-managers-free.yml`, `manager-workstation.tsx` y `office-manager-free-github.cjs` tienen **blob SHA idéntico** en main y en la rama; existen componentes ya incorporados. No volver a fusionar solo para activar el cron. Auditar los 13 archivos restantes antes de decidir closure o cherry-pick |
| #109 Office isométrica | `33a7a8fc` | +11 / -102 | 4 | `iso-office.tsx` difiere del main, pero **la sede canónica es Hq3d**; no sustituir HQ 3D por esta escena antigua. Codex evalúa solo helpers que aporten valor sin restaurar segunda oficina |
| #82 integración acumulativa | `acd01a3b` | +4 / -114 | 49 | `office.tsx` difiere del main y toca gran cantidad de rutas compartidas; no merge/rebase automático. Contrastar cambios puntuales contra código nuevo; dueño confirma cada remanente útil |

Las comparaciones no prueban visualización móvil ni autorización de ninguna rama. No se borraron, cerraron o fusionaron PRs; la siguiente acción es handoff de los propietarios de sus rutas con SHA exacto.
