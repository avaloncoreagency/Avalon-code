# Avalon Knowledge — índice y reglas de consulta

**ID:** KNI-INDEX-001 · **Versión:** v0.3 · **Custodio propuesto:** Knowledge & Innovation.
**Solidez:** PROPUESTO · **Vigencia:** POR REVISAR · **Aprobación:** BORRADOR · **Clasificación:** PUBLICABLE · **Última revisión:** 2026-11-22.

Este documento no acredita aprobación de los owners ni despliegue.

## Finalidad y límites

Este directorio organiza **referencias documentales** para PROJECT MANAGER y los departamentos. No es el módulo histórico «Library» de productos, no crea una segunda base de datos, no cambia el CRM ni sustituye al almacenamiento de productos de Avalon OS. El repositorio es **público**: únicamente se admiten referencias y documentos sanitizados, nunca contratos firmados, precios privados, nombres/datos reales de clientes, contraseñas, tokens, URLs privadas ni información personal.

**Fuentes de verdad**: para implementación, código en `main`, PR y SHA exacto, CI y pruebas; para decisiones corporativas, aprobación trazable por los owners en el sistema autorizado; para operaciones, procedimientos vigentes validados por su departamento. Un prompt, un issue, un PR abierto y una captura de pantalla por sí solos no son pruebas de entrega ni de funcionamiento en producción.

## Mapa funcional

| Grupo | Contenido | Fuente o directorio existente |
| --- | --- | --- |
| 00 Control | Índice, glosario, propiedad y estados | Este archivo, [control documental](./DOCUMENT_CONTROL.md), [procedimiento de curación](./CURATION_RUNBOOK.md), [catálogo de fuentes](./SOURCE_CATALOG.md), [glosario](./GLOSSARY.md) y [plantillas](./TEMPLATES.md) |
| 01 Gobierno | Registro de decisiones, sustituciones y aprobaciones | [Registro inicial](./DECISION_REGISTER.md), GitHub Issues/PR con evidencias |
| 02 Operaciones | Onboarding, implementación, mantenimiento, entrega | [CRM](../CRM_IMPLEMENTATION.md), [handoffs](../handoff/) |
| 03 Producto | Criterios de calidad y alcance | [Módulos](../AVALON_OS_MODULES.md), [QA independiente](../independent-qa/) |
| 04 Legal | Contratos modelo y condiciones, sujetos a revisión profesional | [Contratos](../contracts/); no guardar contratos reales en GitHub |
| 05 Ventas | Pipeline, propuestas, facturas y comisiones | [Sales Core](../SALES_CORE.md), [fundamento comercial](../commercial-foundation/) |
| 06 Arquitectura | Seguridad, auth, proveedores e integraciones | [Arquitectura](../architecture/), [seguridad](../security/), [Dev Bridge](../dev-bridge/COOPERATION.md) |
| 07 Soporte | Runbooks de incidencias y QA | [Soporte y seguridad](../security/RESPUESTA_A_INCIDENTES.md), [QA](../independent-qa/) |
| 08 Investigación | Investigaciones, fuentes, fecha de verificación y alternativas | [Ideas priorizadas](./INNOVATION_BACKLOG.md); investigación histórica [#63](https://github.com/avaloncoreagency/Avalon-code/issues/63) |
| 09 Aprendizajes | Causa raíz, evidencia, prevención y resolución | [Checkpoints](../CHECKPOINTS.md), PRs verificados por SHA |
| 10 Mejora | Cartera priorizada y dependencias | [Innovación](./INNOVATION_BACKLOG.md) |
| 90 Historia | Material sustituido, referencias de tiempo y decisiones revocadas | [PROJECT_STATE](../../PROJECT_STATE.md) (histórico), [coordinación 2026-11-11](../handoff/CHATGPT_COORDINATION.md) (histórico) |

Las ubicaciones enlazadas pueden contener contenido de distinta fecha o vigencia; **la existencia de un archivo no verifica su actualidad**. No trasladar indiscriminadamente documentos a una carpeta `historical/`: conservar los enlaces, señalar fecha y revisar con el owner.

## Acceso rápido para PROJECT MANAGER

- **¿Dónde está la fuente y de qué fecha es?** [Catálogo de fuentes](./SOURCE_CATALOG.md), con distinción explícita entre archivos históricos y conocimiento por revisar.
- **¿Qué evidencia reemplaza un checkpoint anterior?** [Sucesión incremental STABLE V1 (KN-V3-01)](../pm-v3/knowledge/evidence-and-decisions.md), siempre subordinada a las fuentes primarias.
- **¿Quién aprobó una decisión?** [Registro de decisiones](./DECISION_REGISTER.md). Sin aprobador explícito, el resultado permanece en borrador.
- **¿Qué significa lead, cliente, venta, cobro o PR verificado?** [Glosario operativo](./GLOSSARY.md), pendiente de ratificación por los departamentos.
- **¿Cómo documentamos una operación repetible?** [Plantillas de decisión, SOP, investigación, incidente y handoff](./TEMPLATES.md).
- **¿Cómo se recibe y acepta un nuevo conocimiento?** [Procedimiento de incorporación con criterios de aceptación](./CURATION_RUNBOOK.md).
- **¿Cómo se actualiza y archiva la información?** [Protocolo documental](./DOCUMENT_CONTROL.md).
- **¿Qué investigar sin contratar nada?** [Cartera de innovación](./INNOVATION_BACKLOG.md).

Un elemento del catálogo puede estar **VERIFICADO como archivo existente** y **DESCONOCIDO como estado de producción**. La información actual depende de la comprobación del sistema y de su fecha, no del título del documento.

## Cómo contestar una pregunta operativa

1. Identificar tema, responsable y documento canónico.
2. Comprobar rama `main`, commit SHA, PR/issue, fecha de la fuente y si el documento está sustituido.
3. Clasificar la evidencia como **VERIFICADO**, **REPORTADO**, **PROPUESTO**, **DESCARTADO**, **PAUSADO** o **DESCONOCIDO** (V2). Usar **PENDIENTE** para tareas; documentar vigencia y aprobación por separado.
4. Para sistemas, exigir pruebas reales del entorno y alcance afirmados. CI verde no equivale a navegador móvil probado ni a producción aceptada.
5. Enviar a PROJECT MANAGER un resumen breve con fuente, riesgo, responsable, decisión humana y próxima acción. Nunca autoaprobar ni invocar proveedores por una sugerencia.

## Restricciones actuales comunicadas por los propietarios

- Radar suspendido. No reactivar trabajadores, búsquedas ni proveedores asociados sin nueva aprobación.
- No activar recepcionistas/chatbots comerciales u OpenRouter.
- Samuel es responsable del portal de empleados: no editar esas áreas ni atribuir progreso sin evidencia.
- Claude Code tiene desarrollo técnico asignado; Knowledge & Innovation no duplica código ni migraciones.
- No crear clientes, productos piloto, ventas o contratos reales mediante esta biblioteca.

Revisar estas restricciones frente a **instrucciones posteriores** de los owners antes de tratarlas como definitivas.

## Estado comprobado de integración documental — 2026-11-22

- **VERIFICADO en repositorio:** los nueve archivos del [PR #268](https://github.com/avaloncoreagency/Avalon-code/pull/268) se integraron en `main@ff8191d23c99e3e4230f0d6e224230821c94aa43` a través de [#300](https://github.com/avaloncoreagency/Avalon-code/pull/300). No reconstruirlos ni crear otra biblioteca de producto.
- **POR REVISAR:** las fuentes históricas permanecen en el [catálogo](./SOURCE_CATALOG.md), ahora con su cadena de sucesión. Consultar siempre el SHA vivo antes de recomendar una integración.
- **REQUIERE APROBACIÓN:** esta integración no ratifica el protocolo documental, los custodios, el almacenamiento privado ni las decisiones empresariales de Miguel/Samuel.
- **NO CERTIFICADO:** la mera documentación de CI, migraciones o Preview no valida producción ni Safari físico.

La biblioteca sigue siendo un **índice editorial** y no el backlog del PROJECT MANAGER. Los módulos de colaboradores externos y cualquier documentación privada permanecen bajo sus responsables y permisos.

## Cambios al propio índice

Abrir issue/PR trazable con propietario, SHA, fuente y pruebas de enlaces. La aprobación de una PR documental no equivale automáticamente a la aprobación de un cambio de política. La fuente jurídica/financiera de cada departamento prevalece sobre resúmenes divulgativos hasta revisión humana.
