# Registro inicial de decisiones y directrices

**Clasificación:** PUBLICABLE — sin datos privados. **Versión propuesta:** 0.2. **Fecha de revisión documental:** 2026-11-20. **Base contrastada:** `main@207ed3a3dc8fdae5dd949a7361733e441c530519`.

Este es un registro de **directrices y recomendaciones rastreables**, no un acta de aprobación conjunta. Las tres columnas de estado se usan con los valores exactos de [control documental](./DOCUMENT_CONTROL.md). `VERIFICADO` solo significa que la fuente citada fue encontrada y respalda la **existencia de la directriz**; no significa que su implementación esté activa en producción.

| ID | Tipo | Directriz o propuesta | Solidez | Vigencia | Aprobación del registro | Fuente pública |
| --- | --- | --- | --- | --- | --- | --- |
| KDEC-001 | Directriz de arquitectura | Avalon OS administra productos creados externamente, sin reconstruir sus constructores. | VERIFICADO | POR REVISAR | BORRADOR | [Product Control](../PRODUCT_CONTROL_RELEASE.md) |
| KDEC-002 | Regla de entrega | Una referencia/URL de producto no demuestra una venta, pago, entrega, publicación ni uptime; preservar vínculo canónico y versión. | VERIFICADO | POR REVISAR | BORRADOR | [Product Control](../PRODUCT_CONTROL_RELEASE.md), [Dev Bridge](../dev-bridge/COOPERATION.md) |
| KDEC-003 | Procedimiento de desarrollo | Verificar SHA exacto y diferenciar pruebas CI, Preview, navegador y producción. | VERIFICADO | VIGENTE | BORRADOR | [AGENTS.md](../../AGENTS.md), [Cooperación](../dev-bridge/COOPERATION.md) |
| KDEC-004 | Restricción operativa | Radar debe mantenerse suspendido, sin activar búsqueda, campañas ni costos. | VERIFICADO | VIGENTE | BORRADOR | [Plan de hibernación](../radar/RADAR_REACTIVATION_PLAN.md), [PR #262](https://github.com/avaloncoreagency/Avalon-code/pull/262) |
| KDEC-005 | Límite de responsabilidad | No modificar el portal de empleados atendido por Samuel dentro de esta misión. | VERIFICADO | VIGENTE | BORRADOR | [PR Draft #233](https://github.com/avaloncoreagency/Avalon-code/pull/233); instrucción de coordinación del proyecto |
| KDEC-006 | Restricción de proveedores | No activar recepcionistas/chatbots comerciales ni OpenRouter en esta fase. | VERIFICADO | VIGENTE | BORRADOR | Instrucción de coordinación del proyecto; **sin acta corporativa en GitHub** |
| KDEC-007 | Recomendación documental | Evaluar Google Drive como custodia corporativa principal y GitHub como índice técnico. | PROPUESTO | POR REVISAR | BORRADOR | [Índice Knowledge](./README.md) |

**Precauciones:** KDEC-006 se respalda en el mandato del proyecto, no en una verificación de que los proveedores estén apagados remotamente. KDEC-005 identifica exclusión de alcance, no prueba que el PR #233 esté fusionado. KDEC-004 cita documentación y código fusionado; el estado remoto no fue comprobado por esta misión. KDEC-007 **no** autoriza crear ni compartir carpetas de Drive.

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
Solidez: VERIFICADO | PROPUESTO | PENDIENTE | DESCONOCIDO
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
