# Catálogo de fuentes documentales — revisión inicial

**Clase:** Inventario documental, no estado operativo. **Edición:** 2026-11-20. **Base inspeccionada:** `main@207ed3a3dc8fdae5dd949a7361733e441c530519` mediante lectura de archivos en GitHub.

## Cómo interpretar el catálogo

**VERIFICADO** aquí significa que **el archivo existía y se leyó en la base citada**. **No** confirma que las funciones, migraciones, despliegues, costos o decisiones descritos sigan vigentes. `HISTÓRICO` marca snapshots que no se deben utilizar como informe del estado actual. `POR REVISAR` no equivale a falso: falta contrastarlo con la fuente primaria actual, los responsables o el entorno correspondiente.

No se incluyen documentos privados de clientes, contratos firmados, datos personales ni enlaces internos restringidos porque este repositorio es público.

| ID | Archivo / función | Referencia temporal dentro del archivo | Uso recomendado ahora | Vigencia editorial |
| --- | --- | --- | --- | --- |
| SRC-001 | [Cooperación Dev Bridge](../dev-bridge/COOPERATION.md): reglas para ramas, SHA y handoffs | Contiene instrucciones de inicio de sesión y verificación en vivo | Consultar **antes** de coordinar trabajos, comprobando PR/Issue actual | POR REVISAR por evento |
| SRC-002 | [Contexto de agentes](../dev-bridge/AI_CONTEXT.md): instrucciones de arranque | No se confirmó un sello de actualización posterior | Consultar junto con COOPERATION y verificar SHA | POR REVISAR |
| SRC-003 | [Estado del proyecto](../../PROJECT_STATE.md): checkpoint | 2026-11-07 | Referencia histórica, no resumir como estado actual | HISTÓRICO |
| SRC-004 | [Estado de ejecución](../AVALON_EXECUTION_STATUS.md): reporte de una rama antigua | 2026-11-02; el encabezado dice “single source of truth” | **No** tomar ese encabezado como autoridad actual | HISTÓRICO |
| SRC-005 | [Estado v1](../AVALON_V1_STATUS.md): evaluación antigua de readiness | 2026-11-11 | Útil para rastrear hipótesis y bloqueos de aquella fecha | HISTÓRICO |
| SRC-006 | [Coordinación Claude → ChatGPT](../handoff/CHATGPT_COORDINATION.md) | 2026-11-11 | Handoff histórico, sus PR, flags y estados requieren revalidación | HISTÓRICO |
| SRC-007 | [Progreso OMEGA](../AVALON_OMEGA_PROGRESS.md) | 2026-11-07 | Evidencias históricas, no estado de los motores en vivo | HISTÓRICO |
| SRC-008 | [CRM implementación](../CRM_IMPLEMENTATION.md) | 2026-11-01/02; declara partes del plan como históricas | Consultar arquitectura, no inferir migraciones o pruebas actuales | MIXTO / POR REVISAR |
| SRC-009 | [Sales Core](../SALES_CORE.md) | Referencias de rama y base de comienzos de noviembre | Especificación histórica, comprobar RPC y migraciones en `main` | POR REVISAR |
| SRC-010 | [Product Control](../PRODUCT_CONTROL_RELEASE.md) | PR #175 y hallazgo documentado 2026-11-13 | Reutilizar sus límites conceptuales y verificar integración actual | POR REVISAR |
| SRC-011 | [Communications Hub](../COMMUNICATIONS_HUB.md) | Trabajo fechado 2026-11-12 | Arquitectura histórica; **no** activar proveedores | POR REVISAR |
| SRC-012 | [Respuesta a incidentes](../security/RESPUESTA_A_INCIDENTES.md) | No se validó en esta revisión aprobación formal vigente | Procedimiento de referencia; validar con CLOUD & SECURITY | POR REVISAR |
| SRC-013 | [Radar hibernación](../radar/RADAR_REACTIVATION_PLAN.md) | Reporte 2026-11-20 y [PR #262](https://github.com/avaloncoreagency/Avalon-code/pull/262) fusionado | Documento técnico sobre suspensión; el estado **remoto** necesita comprobación separada | DOCUMENTADO / REMOTO DESCONOCIDO |

## Conflictos y vacíos que requieren atención

1. **Portada obsoleta:** `README.md` en `main@207ed3a` todavía describía la aplicación como provisional y afirmaba que carecía de login. El [PR #268](https://github.com/avaloncoreagency/Avalon-code/pull/268) propone corregirlo; **no** considerar integrado mientras el PR siga sin fusionarse.
2. **Etiqueta engañosa:** `docs/AVALON_EXECUTION_STATUS.md` conserva “single source of truth” en su título, aunque es un snapshot del 2 de noviembre. El catálogo la clasifica como **HISTÓRICA** sin modificar el original.
3. **Instrucciones de varias generaciones:** `AGENTS.md` contiene material antiguo de Google OAuth y Sprint 01; su propio encabezado advierte que esas indicaciones son históricas. Seguir siempre las reglas vigentes y la evidencia actual. No modificar AGENTS ni archivos de Claude/Samuel desde esta misión.
4. **Fuentes fragmentadas:** existen registros sobre CRM, producto, finanzas, infraestructura y soporte que todavía no tienen un custodio ni un registro de aprobación documental común. Completar en una fase editorial revisada.
5. **Despliegues de documentación:** Vercel puede señalar un status check `success` cuando el despliegue queda **Ignored / Skipped**. Inspeccionar el comentario/despliegue real; no usar ese check para afirmar que existe un Preview verificable.

## Ampliación del inventario

Añadir entradas solo después de leer el archivo original y registrar fecha, SHA y custodio. Cada revisión debe indicar si cambió **la existencia del documento**, su **contenido** o la **verificación del sistema**: son tres hechos diferentes. Si el recurso deja de existir, retirar el enlace roto en el índice y conservar referencia histórica segura en la incidencia.

Para un documento no autorizado para publicación pública, registrar el **tipo**, el departamento custodio y el mecanismo de acceso aprobado, sin publicar su contenido ni una URL privada.

**Siguiente acción:** PROJECT MANAGER valida los custodios y decide dónde vive el registro corporativo privado; hasta entonces este catálogo es solo un inventario técnico público con referencias seguras.
