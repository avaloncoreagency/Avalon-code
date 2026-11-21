# Procedimiento de incorporación y mantenimiento de conocimiento

**ID:** KNI-SOP-001 · **Versión:** v0.2 · **Custodio propuesto:** Knowledge & Innovation.
**Solidez:** PROPUESTO · **Vigencia:** POR REVISAR · **Aprobación:** BORRADOR · **Clasificación:** PUBLICABLE · **Última revisión:** 2026-11-20.

El procedimiento no habilita agentes, gastos, integraciones, aprobaciones automáticas ni cambios productivos.

**Objetivo:** hacer que PROJECT MANAGER encuentre una respuesta respaldada por su fuente original, sin duplicar información ni confundir decisiones de propietarios, planes históricos y resultados de implementación. Este procedimiento no habilita ningún agente, gasto, integración o cambio de producción.

## Alcance y entradas permitidas

Entradas: decisiones de Miguel y Samuel, manuales operativos validados por su departamento, estándares, guías de soporte, PR/Issue y evidencia técnica, investigaciones fechadas y lecciones aprendidas. No importar automáticamente el historial de otros chats: un resumen o mensaje aislado es una **pista documental**, no una aprobación ni evidencia de sistema.

Este repositorio es público. No guardar aquí datos reales de clientes, contratos firmados, información financiera privada, credenciales, incidentes sensibles, datos personales o enlaces de acceso no públicos. Cuando un documento necesite privacidad, dejar **la ficha y el archivo completo** en un repositorio privado autorizado y registrar aquí solo una referencia genérica segura, si corresponde. No migrar datos a servicios externos sin permiso.

## Flujo operativo para cada nueva entrada

1. **Recepción.** Obtener contenido original, área, autor/solicitante, fecha de observación y enlace a la fuente. Comprobar si existe otro registro del mismo tema.
2. **Seguridad.** Clasificar PUBLICABLE / INTERNO / CONFIDENCIAL / RESTRINGIDO. Solo PUBLICABLE pasa al GitHub público tras comprobar que no contiene datos privados ni claves. `INTERNO` no significa publicable.
3. **Tipo y custodia.** Identificar DEC (decisión/directriz), SOP (procedimiento), STD (estándar), LEG (modelo legal), ARCH (arquitectura), RUN (soporte), RES (investigación), LES (aprendizaje), IMP (mejora). Asignar departamento responsable y una ID sin reutilizar otras existentes.
4. **Fuentes y tiempo.** Registrar fecha de la fuente, fecha de revisión y `main@SHA` si afirma algo sobre el código. Distinguir `main`, rama/PR, CI, Preview y producción. No equiparar `success` de un check con aceptación hospedada.
5. **Tres estados separados.** Solidez: VERIFICADO / PROPUESTO / PENDIENTE / DESCONOCIDO. Vigencia: VIGENTE / HISTÓRICO / SUSTITUIDO / REVOCADO / POR REVISAR. Aprobación: BORRADOR / EN REVISIÓN / APROBADO / RECHAZADO.
6. **Revisión por responsable.** El departamento custodio verifica exactitud y contradicciones. Si dos fuentes discrepan, conservar ambas con fecha y marcar la decisión como `POR REVISAR`. No resolver contradicciones adjudicando autoridad a un modelo.
7. **Autorización.** Los owners deciden política empresarial, gastos, contratación, cambios sensibles y cualquier excepción que requiera su aprobación. Ningún PR documental o texto generado por IA equivale a una aprobación corporativa.
8. **Publicación e historial.** Actualizar el índice canónico, enlazar fuente y sucesor, registrar versión; no borrar el historial ni reescribir retrospectivamente una decisión anterior.
9. **Handoff.** PROJECT MANAGER recibe el ID, estado de las tres dimensiones, evidencia, cambios, dependencias, decisiones pendientes y una siguiente acción reproducible. El chat central **no se sincroniza automáticamente** con este repositorio.

## Criterios de aceptación del registro

| Control | Aceptación | Si falta evidencia |
| --- | --- | --- |
| Fuente y fecha | URL/identificador real, fecha comprobable y alcance | DESCONOCIDO; no publicar como hecho |
| Responsable | Custodio editorial identificado; sin adjudicar un rol por suposición | EN REVISIÓN |
| Estados | Los tres ejes independientes con valores exactos | Corregir antes de publicar |
| Vigencia | Snapshot fechado y enlace al contenido nuevo si está sustituido | POR REVISAR |
| Seguridad | Sin secretos, datos de clientes ni enlaces de acceso restringidos en GitHub público | No publicar; escalar |
| Reutilización | Una fuente canónica y enlaces, no archivos duplicados | Consolidar o explicar la excepción |
| Implementación | PR y SHA; pruebas ejecutadas, resultado y entorno | No afirmar que está desplegado |
| Aprobar | Autoridad humana, fecha y registro de la decisión específica | BORRADOR o EN REVISIÓN |
| Integridad del índice | Enlaces locales existentes y formato Markdown correcto | Corregir antes de revisión |

## Prueba manual con tres escenarios sintéticos

**Caso A — Documento antiguo que parece vigente.** Se recibe un reporte fechado 2026-11-02 con un título `single source of truth`. Se registra como `HISTÓRICO`, aun si describe correctamente el sistema de su época. Resultado esperado: PROJECT MANAGER no lo usa para asegurar el estado actual.

**Caso B — PR verde sin despliegue.** Se recibe un commit con checks correctos y despliegue `Ignored`. Resultado esperado: registrar `CI verificado` y `Preview no ejecutado` como hechos independientes. No marcar funcionamiento real en navegador.

**Caso C — Recomendación de IA.** Se propone contratar una herramienta para buscar documentos. Resultado esperado: conservar `PROPUESTO + POR REVISAR + BORRADOR` hasta que Miguel/Samuel evalúen costo, privacidad y uso. No crear cuentas ni activar la integración.

Estos son **criterios de revisión**; no representan pruebas automatizadas o realizadas contra sistemas externos.

## Cadencia y escalamiento propuestos

| Evento | Acción editorial |
| --- | --- |
| Una decisión nueva o revocada | Revisar de inmediato todas las referencias a la decisión previa |
| Cambio en permisos, plataforma o normativa | Escalar a CLOUD & SECURITY / LEGAL y revisar documentos afectados |
| Cierre de una incidencia crítica | Incorporar causa raíz y paso de prevención, con evidencia verificada |
| Cada mes | Revisar manuales de alto uso y enlaces señalados |
| Cada trimestre | Revisar documentos estables; detectar duplicados, fuentes sin custodia y vigencia vencida |

El calendario no autoriza tareas programadas ni llamadas automáticas. PROJECT MANAGER decide el seguimiento operativo según recursos disponibles.

## Handoff mínimo a PROJECT MANAGER

```text
Registro: [ID] / [título]
Custodio / clasificación:
Solidez: [VERIFICADO|PROPUESTO|PENDIENTE|DESCONOCIDO]
Vigencia: [VIGENTE|HISTÓRICO|SUSTITUIDO|REVOCADO|POR REVISAR]
Aprobación: [BORRADOR|EN REVISIÓN|APROBADO|RECHAZADO]
Fuente y fecha / entorno / SHA:
Hecho comprobado y límite de la evidencia:
Diferencia con la versión anterior:
Riesgos y dependencias:
Decisión reservada a los owners:
Next action: [acción verificable + responsable]
```

**Relacionados:** [Índice](./README.md), [control documental](./DOCUMENT_CONTROL.md), [registro de decisiones](./DECISION_REGISTER.md), [catálogo de fuentes](./SOURCE_CATALOG.md) y [plantillas](./TEMPLATES.md).

**Pendiente de aprobación:** herramienta de custodia corporativa, matriz de autoridad de Miguel/Samuel y custodios designados por departamento.
