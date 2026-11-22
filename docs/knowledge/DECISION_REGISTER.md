# Registro inicial de decisiones y directrices

**ID:** KNI-DEC-REG-001 · **Versión:** v0.4 · **Custodio propuesto:** Knowledge & Innovation.
**Solidez:** PROPUESTO · **Vigencia:** POR REVISAR · **Aprobación:** BORRADOR · **Clasificación:** PUBLICABLE · **Última revisión:** 2026-11-22.

Los registros individuales distinguen directrices verificadas documentalmente de aprobaciones reales. Corte histórico: `main@207ed3a3dc8fdae5dd949a7361733e441c530519`. Nueva verificación documental: `main@ff8191d23c99e3e4230f0d6e224230821c94aa43` (2026-11-22).

Este es un registro de **directrices y recomendaciones rastreables**, no un acta de aprobación conjunta. Las tres columnas de estado se usan con los valores exactos de [control documental](./DOCUMENT_CONTROL.md). La etiqueta de solidez usa desde esta revisión los seis valores V2; `PENDIENTE` queda reservado a tareas y decisiones por tomar. `VERIFICADO` solo significa que la fuente citada fue encontrada y respalda la **existencia de la directriz**; no significa que su implementación esté activa en producción.

| ID | Tipo | Directriz o propuesta | Solidez | Vigencia | Aprobación del registro | Fuente pública |
| --- | --- | --- | --- | --- | --- | --- |
| KDEC-001 | Directriz de arquitectura | Avalon OS administra productos creados externamente, sin reconstruir sus constructores. | VERIFICADO | POR REVISAR | BORRADOR | [Product Control](../PRODUCT_CONTROL_RELEASE.md) |
| KDEC-002 | Regla de entrega | Una referencia/URL de producto no demuestra una venta, pago, entrega, publicación ni uptime; preservar vínculo canónico y versión. | VERIFICADO | POR REVISAR | BORRADOR | [Product Control](../PRODUCT_CONTROL_RELEASE.md), [Dev Bridge](../dev-bridge/COOPERATION.md) |
| KDEC-003 | Procedimiento de desarrollo | Verificar SHA exacto y diferenciar pruebas CI, Preview, navegador y producción. | VERIFICADO | VIGENTE | BORRADOR | [AGENTS.md](../../AGENTS.md), [Cooperación](../dev-bridge/COOPERATION.md) |
| KDEC-004 | Restricción operativa | Radar debe mantenerse suspendido, sin activar búsqueda, campañas ni costos. | VERIFICADO | VIGENTE | BORRADOR | [Plan de hibernación](../radar/RADAR_REACTIVATION_PLAN.md), [PR #262](https://github.com/avaloncoreagency/Avalon-code/pull/262) |
| KDEC-005 | Límite de responsabilidad | El portal de empleados pertenece a Samuel y no es alcance de Knowledge. | VERIFICADO | VIGENTE | BORRADOR | [Antecedente #233](https://github.com/avaloncoreagency/Avalon-code/pull/233), [candidato #317](https://github.com/avaloncoreagency/Avalon-code/pull/317); directriz de coordinación |
| KDEC-006 | Restricción de proveedores | No activar recepcionistas/chatbots comerciales ni OpenRouter en esta fase. | VERIFICADO | VIGENTE | BORRADOR | Instrucción de coordinación del proyecto; **sin acta corporativa en GitHub** |
| KDEC-007 | Recomendación documental | Evaluar Google Drive como custodia corporativa principal y GitHub como índice técnico. | PROPUESTO | POR REVISAR | BORRADOR | [Índice Knowledge](./README.md) |
| KDEC-008 | Estado de integración documental | Los nueve archivos de Knowledge del [PR #268](https://github.com/avaloncoreagency/Avalon-code/pull/268) están integrados en `main` mediante la cadena [#300](https://github.com/avaloncoreagency/Avalon-code/pull/300). Esto **no aprueba** la política documental. | VERIFICADO | VIGENTE | BORRADOR | [`main@ff8191d`](https://github.com/avaloncoreagency/Avalon-code/tree/ff8191d23c99e3e4230f0d6e224230821c94aa43/docs/knowledge) y PR fusionados |

**Precauciones:** KDEC-006 se respalda en el mandato del proyecto, no en una verificación de que los proveedores estén apagados remotamente. KDEC-005 identifica exclusión de alcance: #317 sigue como candidato, no como publicación verificada. KDEC-004 cita documentación y código fusionado; el estado remoto no fue comprobado por esta misión. KDEC-007 **no** autoriza crear ni compartir carpetas de Drive. KDEC-008 prueba integración técnica, **no** ratificación de políticas corporativas.

## Cómo añadir una decisión aprobada

1. Conservar el ID, fuentes y contexto; identificar si es una directriz, recomendación o aprobación.
2. Registrar en el sistema corporativo **autorizado** el objeto aprobado, fecha, identidad del propietario y evidencia explícita. No publicar el acta privada ni datos personales en GitHub público.
3. Al recibirse una referencia pública o sanitizada adecuada, actualizar `Aprobación` a `APROBADO` (o `RECHAZADO`) indicando solo metadatos no sensibles y una ubicación controlada cuando proceda.
4. Si una decisión sustituye otra, marcar la antigua `SUSTITUIDO` y enlazarla con su sucesora; no borrar el histórico.
5. Si no puede probarse la fuente o el aprobador, mantener `BORRADOR` o `EN REVISIÓN`, nunca inventar aprobación por un prompt, PR verde o afirmación de un agente.

## Ficha de decisión reutilizable

```text
ID / tipo:
Título y contexto:
Solidez (evidencia V2): VERIFICADO | REPORTADO | PROPUESTO | DESCARTADO | PAUSADO | DESCONOCIDO
Vigencia: VIGENTE | HISTÓRICO | SUSTITUIDO | REVOCADO | POR REVISAR
Aprobación: BORRADOR | EN REVISIÓN | APROBADO | RECHAZADO
Alternativas y opción de no actuar:
Decisión exacta (si aprobada):
Fecha, autoridad y evidencia (si falta: PENDIENTE):
Fuente pública segura / commit SHA / entorno:
Riesgos, reversibilidad y dependencias:
Responsable de verificación:
Sustituye a / sustituido por:
Próximo evento de revisión:
```

**Pendiente:** Miguel y Samuel deben definir la matriz de autoridad documental y ratificar qué registros representan decisiones corporativas formales. Knowledge & Innovation solo ordena evidencias y propone clasificaciones.
