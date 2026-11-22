# Catálogo de fuentes documentales — revisión inicial

**ID:** KNI-SRC-001 · **Versión:** v0.4 · **Custodio propuesto:** Knowledge & Innovation.
**Solidez:** PROPUESTO · **Vigencia:** POR REVISAR · **Aprobación:** BORRADOR · **Clasificación:** PUBLICABLE · **Última revisión:** 2026-11-22.

Inventario documental, no estado operativo. **Corte histórico:** `main@207ed3a3dc8fdae5dd949a7361733e441c530519` (2026-11-20). **Corte actualizado en GitHub:** `main@ff8191d23c99e3e4230f0d6e224230821c94aa43` (2026-11-22). Las fechas antiguas de cada fuente se conservan para permitir auditoría de su vigencia.

## Cómo interpretar el catálogo

**VERIFICADO** aquí significa que **el archivo existía y se leyó en la base citada**. **No** confirma que las funciones, migraciones, despliegues, costos o decisiones descritos sigan vigentes. `HISTÓRICO` marca snapshots que no se deben utilizar como informe del estado actual. `POR REVISAR` no equivale a falso: falta contrastarlo con la fuente primaria actual, los responsables o el entorno correspondiente.

No se incluyen documentos privados de clientes, contratos firmados, datos personales ni enlaces internos restringidos porque este repositorio es público.

| ID | Archivo / función | Referencia temporal dentro del archivo | Uso recomendado ahora | Vigencia editorial |
| --- | --- | --- | --- | --- |
| SRC-001 | [Cooperación Dev Bridge](../dev-bridge/COOPERATION.md): reglas para ramas, SHA y handoffs | Contiene instrucciones de inicio de sesión y verificación en vivo | Consultar **antes** de coordinar trabajos, comprobando PR/Issue actual | POR REVISAR |
| SRC-002 | [Contexto de agentes](../dev-bridge/AI_CONTEXT.md): instrucciones de arranque | No se confirmó un sello de actualización posterior | Consultar junto con COOPERATION y verificar SHA | POR REVISAR |
| SRC-003 | [Estado del proyecto](../../PROJECT_STATE.md): checkpoint | 2026-11-07 | Referencia histórica, no resumir como estado actual | HISTÓRICO |
| SRC-004 | [Estado de ejecución](../AVALON_EXECUTION_STATUS.md): reporte de una rama antigua | 2026-11-02; el encabezado dice “single source of truth” | **No** tomar ese encabezado como autoridad actual | HISTÓRICO |
| SRC-005 | [Estado v1](../AVALON_V1_STATUS.md): evaluación antigua de readiness | 2026-11-11 | Útil para rastrear hipótesis y bloqueos de aquella fecha | HISTÓRICO |
| SRC-006 | [Coordinación Claude → ChatGPT](../handoff/CHATGPT_COORDINATION.md) | 2026-11-11 | Handoff histórico, sus PR, flags y estados requieren revalidación | HISTÓRICO |
| SRC-007 | [Progreso OMEGA](../AVALON_OMEGA_PROGRESS.md) | 2026-11-07 | Evidencias históricas, no estado de los motores en vivo | HISTÓRICO |
| SRC-008 | [CRM implementación](../CRM_IMPLEMENTATION.md) | 2026-11-01/02; declara partes del plan como históricas | Consultar arquitectura, no inferir migraciones o pruebas actuales | POR REVISAR |
| SRC-009 | [Sales Core](../SALES_CORE.md) | Referencias de rama y base de comienzos de noviembre | Especificación histórica, comprobar RPC y migraciones en `main` | POR REVISAR |
| SRC-010 | [Product Control](../PRODUCT_CONTROL_RELEASE.md) | PR #175 y hallazgo documentado 2026-11-13 | Reutilizar sus límites conceptuales y verificar integración actual | POR REVISAR |
| SRC-011 | [Communications Hub](../COMMUNICATIONS_HUB.md) | Trabajo fechado 2026-11-12 | Arquitectura histórica; **no** activar proveedores | POR REVISAR |
| SRC-012 | [Respuesta a incidentes](../security/RESPUESTA_A_INCIDENTES.md) | No se validó en esta revisión aprobación formal vigente | Procedimiento de referencia; validar con CLOUD & SECURITY | POR REVISAR |
| SRC-013 | [Radar hibernación](../radar/RADAR_REACTIVATION_PLAN.md) | Reporte 2026-11-20 y [PR #262](https://github.com/avaloncoreagency/Avalon-code/pull/262) fusionado | Documento técnico sobre suspensión; el estado **remoto** necesita comprobación separada | POR REVISAR |
| SRC-014 | [Formulario comercial](../../src/app/quote-actions.ts): entrada de solicitudes voluntarias | `main@207ed3a`; leído el 2026-11-20 | La acción `requestQuote` usa limitador de IP y llama a `crm_public_inquiry`. No prueba que la integración remota responda correctamente | POR REVISAR |
| SRC-015 | [Migración de solicitud pública](../../supabase/migrations/20261102200000_public_inquiry.sql) | SQL histórico; encabezado “PREPARED ONLY” | Contiene permiso `execute` para `anon`, validación/honeypot y cuotas. Verificar ledger de migraciones antes de describir estado remoto (DESCONOCIDO) | HISTÓRICO |
| SRC-016 | [Bandeja inbound](../../src/components/crm/inbound-inbox.tsx) y [ruta protegida](../../src/app/admin/workspace/crm/inbound/page.tsx) | `main@207ed3a`; [PR #251](https://github.com/avaloncoreagency/Avalon-code/pull/251) fusionado | Flujo owner-only, revisión humana y agrupación por prospecto. Existencia de código no prueba QA Safari ni operación remota | POR REVISAR |
| SRC-017 | [PR #269](https://github.com/avaloncoreagency/Avalon-code/pull/269): clasificación orientativa | Snapshot `8c9a9b9167fb9aa766d6b1a158f248afc07c487f` (2026-11-20) | PR **fusionado** y posteriormente incorporado en [#288](https://github.com/avaloncoreagency/Avalon-code/pull/288) y [#300](https://github.com/avaloncoreagency/Avalon-code/pull/300). No es un antibot completo ni valida producción | HISTÓRICO |
| SRC-018 | [Issue #266](https://github.com/avaloncoreagency/Avalon-code/issues/266): límites del antibot | Issue abierto el 2026-11-20 | Riesgo documentado de bypass de controles frontend mediante llamada directa a RPC `anon`; revisión técnica y seguridad PENDIENTE | POR REVISAR |
| SRC-019 | [PR #268](https://github.com/avaloncoreagency/Avalon-code/pull/268): Knowledge Engine | HEAD `8f3425b5bccf43b46c0d80c8d19a5f0eed3dbe66`; merge verificado el 2026-11-22 | Índice, decisiones, catálogo y SOP integrados en `main` (vía #300). La gobernanza no fue aprobada por el merge | VIGENTE |
| SRC-020 | [PR #288](https://github.com/avaloncoreagency/Avalon-code/pull/288): historial inbound y revisión humana | HEAD `87a993168b8f72ecc9d9b19a44b4eab9c09123e5`; merge verificado el 2026-11-22 | Incluye el trabajo #269; integrado en el candidato #294 y luego en `main`. No reintroducir #269 en otra integración | HISTÓRICO |
| SRC-021 | [PR #289](https://github.com/avaloncoreagency/Avalon-code/pull/289): revisión de Turnstile y RPC | HEAD `cf7a493bc335380e944f956e755332a794e88edb`; merge verificado el 2026-11-22 | Código integrado; claves, permisos, migraciones y protección remota **DESCONOCIDOS** sin verificación de Cloud & Security | POR REVISAR |
| SRC-022 | [PR #294](https://github.com/avaloncoreagency/Avalon-code/pull/294): candidato comercial unificado | HEAD `6c980a447e0d6ef7531543dbb02b1bf873c7293a`; merge verificado el 2026-11-22 | Cadena #288 + #289 y otros cambios comerciales incluidos en #300; evitar merge redundante | HISTÓRICO |
| SRC-023 | [PR #300](https://github.com/avaloncoreagency/Avalon-code/pull/300): consolidación anterior | HEAD `87db3ab091dd0ab7f1051762821f1df83e6b82ea`; merge verificado el 2026-11-22 | Integración en `main@ff8191d`; **no prueba** aceptación operativa ni despliegue seguro | VIGENTE |
| SRC-024 | [PR #301](https://github.com/avaloncoreagency/Avalon-code/pull/301): QA independiente | HEAD `d010e04f73493d0bd8217da4a65700d9db65afeb`; Draft el 2026-11-22 | Evidencia de QA para `ff8191d` y `320a21e`; **no** transferir su aceptación al candidato V5 #316 | POR REVISAR |
| SRC-025 | [PR #299](https://github.com/avaloncoreagency/Avalon-code/pull/299) y [#305](https://github.com/avaloncoreagency/Avalon-code/pull/305): mejoras móviles | HEAD de #305 `320a21ef5b85510e5b17fa92a93cd26617fcc93f`; ambos Draft en el corte | Cambios móviles incluidos en ramas sucesoras #311/#314/#316; el merge aislado de #299 sería duplicado | POR REVISAR |
| SRC-026 | [PR #302](https://github.com/avaloncoreagency/Avalon-code/pull/302) y [#312](https://github.com/avaloncoreagency/Avalon-code/pull/312): auditoría de EXECUTE | HEAD de #312 `7df9ce96447341b6a19d1ee56328865e1da98f8e`; Draft en el corte | Archivos de auditoría incorporados en #314/#316; el análisis estático no verifica permisos reales remotos | POR REVISAR |
| SRC-027 | [PR #314](https://github.com/avaloncoreagency/Avalon-code/pull/314): candidato Commercial OS V5 | HEAD `ed92f40c19ceca3f9a30c2a56bce23eb240c4bc7`; Draft en el corte | Candidato principal base de #316. No fusionar o desplegar por la sola presencia de archivos | POR REVISAR |
| SRC-028 | [PR #316](https://github.com/avaloncoreagency/Avalon-code/pull/316): gate financiero de V5 | HEAD `a640e6799273995ebe935d448473f0abf286e434`; Draft en el corte | 9 checks `success` y Supabase Preview `skipped` observados en el SHA; no acreditan QA independiente, Safari físico ni migración productiva | POR REVISAR |
| SRC-029 | [PR #317](https://github.com/avaloncoreagency/Avalon-code/pull/317): portal de empleados | HEAD `b7a5de68d4816655341c1aeedbab859dd6115ea5`; Draft en el corte | Candidato de Samuel, separado de Knowledge y V5; aprobación y despliegue no verificados por este departamento | POR REVISAR |

## Conflictos y vacíos que requieren atención

1. **Portada corregida:** `README.md` del corte **histórico** `main@207ed3a` afirmaba que faltaba login. Los [PR #268](https://github.com/avaloncoreagency/Avalon-code/pull/268) y [#300](https://github.com/avaloncoreagency/Avalon-code/pull/300) están fusionados y el README de `main@ff8191d` describe el código de autenticación sin certificar el entorno remoto. **No volver a registrar la portada como defecto vigente.**
2. **Etiqueta engañosa:** `docs/AVALON_EXECUTION_STATUS.md` conserva “single source of truth” en su título, aunque es un snapshot del 2 de noviembre. El catálogo la clasifica como **HISTÓRICA** sin modificar el original.
3. **Instrucciones de varias generaciones:** `AGENTS.md` contiene material antiguo de Google OAuth y Sprint 01; su propio encabezado advierte que esas indicaciones son históricas. Seguir siempre las reglas vigentes y la evidencia actual. No modificar AGENTS ni archivos de Claude/Samuel desde esta misión.
4. **Fuentes fragmentadas:** existen registros sobre CRM, producto, finanzas, infraestructura y soporte que todavía no tienen un custodio ni un registro de aprobación documental común. Completar en una fase editorial revisada.
5. **Despliegues de documentación:** Vercel puede señalar un status check `success` cuando el despliegue queda **Ignored / Skipped**. Inspeccionar el comentario/despliegue real; no usar ese check para afirmar que existe un Preview verificable.


## Matriz de sucesión y eventos de revalidación

| Material que puede confundir | Fuente más reciente a contrastar | Evento que obliga a revisar | Resultado editorial ahora |
| --- | --- | --- | --- |
| `README.md` antiguo decía “no hay login” | [PR #268](https://github.com/avaloncoreagency/Avalon-code/pull/268) y [#300](https://github.com/avaloncoreagency/Avalon-code/pull/300) fusionados | Nuevo cambio en autenticación o comprobación remota | **SUSTITUIDO**: portada corregida en `main@ff8191d`; funcionamiento remoto no verificado |
| `docs/AVALON_EXECUTION_STATUS.md` se autodenomina “single source of truth” | `main` + [Dev Bridge](../dev-bridge/COOPERATION.md) | Cambio de rama, SHA o PR | HISTÓRICO desde 2026-11-02; no citar como estado en vivo |
| `PROJECT_STATE.md`, `docs/AVALON_OMEGA_PROGRESS.md` | `main`, CI exacto y entornos actuales | Cualquier checkpoint nuevo o consulta de readiness | HISTÓRICO desde 2026-11-07 |
| `docs/AVALON_V1_STATUS.md` y handoff de 2026-11-11 | `main`, reportes QA actuales | Decisión de publicar piloto, revisión de migraciones | HISTÓRICO; `NOT_READY` de esa fecha no determina el estado actual |
| Documentación antigua que presenta Radar activo | [Plan Radar hibernado](../radar/RADAR_REACTIVATION_PLAN.md) y [PR #262](https://github.com/avaloncoreagency/Avalon-code/pull/262) | Orden explícita de reactivación o nuevo PR de seguridad | Directriz vigente: mantener hibernado; no inferir estado remoto |
| Solicitudes comerciales confundidas con agentes o bots | [#269](https://github.com/avaloncoreagency/Avalon-code/pull/269) → [#288](https://github.com/avaloncoreagency/Avalon-code/pull/288) → [#294](https://github.com/avaloncoreagency/Avalon-code/pull/294) → [#300](https://github.com/avaloncoreagency/Avalon-code/pull/300), luego V5 [#314](https://github.com/avaloncoreagency/Avalon-code/pull/314)/[#316](https://github.com/avaloncoreagency/Avalon-code/pull/316) | Nuevo merge o aceptación remota | El inbound integrado admite revisión; no constituye activación de agentes comerciales ni prueba del servicio en producción |
| Instrucciones Google OAuth/Sprint 01 en `AGENTS.md` | Aviso histórico al comienzo de [AGENTS.md](../../AGENTS.md), [Dev Bridge](../dev-bridge/COOPERATION.md) | Cambio aprobado de política de identidad | Tratar instrucciones Sprint 01 como históricas |

**Sucesión comprobada para el corte:** Knowledge #268 → #300 → `main`; inbound #269 → #288 → #294 → #300 → `main`; móvil #299 → #305 → #311 → #314 → #316 (Draft); auditoría EXECUTE #302 → #312 → #314 → #316 (Draft); empleados #233 → #296 → #317 (Draft de Samuel). Las flechas describen incorporación documentada en ramas sucesoras, **no** autorización de merge ni funcionamiento remoto.

**Regla de prueba:** GitHub `merged`, un check `success`, `Preview skipped` y “operando en producción” son cuatro hechos diferentes. Verificar rama, SHA, entorno, periodo y fuente primaria antes de registrar una decisión como VIGENTE o una función como VERIFICADA en el entorno remoto. Este cuadro no reemplaza validación de Cloud & Security, QA ni aceptación de Miguel/Samuel.


## Ampliación del inventario

Añadir entradas solo después de leer el archivo original y registrar fecha, SHA y custodio. Cada revisión debe indicar si cambió **la existencia del documento**, su **contenido** o la **verificación del sistema**: son tres hechos diferentes. Si el recurso deja de existir, retirar el enlace roto en el índice y conservar referencia histórica segura en la incidencia.

Para un documento no autorizado para publicación pública, registrar el **tipo**, el departamento custodio y el mecanismo de acceso aprobado, sin publicar su contenido ni una URL privada.

**Siguiente acción:** PROJECT MANAGER valida los custodios y decide dónde vive el registro corporativo privado; hasta entonces este catálogo es solo un inventario técnico público con referencias seguras.
