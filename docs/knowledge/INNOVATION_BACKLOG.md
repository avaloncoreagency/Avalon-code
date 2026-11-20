# Cartera de innovación — evaluación documental

**Estado:** PROPUESTO; **revisión:** 2026-11-20. Las prioridades no autorizan implementación, proveedor, gasto, llamadas IA, cron ni cambios remotos. La puntuación de impacto es cualitativa: no se inventan ahorros, precios ni ROI.

## Criterios

- Beneficio: reducción de duplicaciones, diagnósticos repetidos y errores de operación.
- Costo: preferir herramientas ya disponibles, antes de contratar plataformas o consumir créditos.
- Riesgo: evitar exposición de datos, acceso entre tenants, fuentes no autorizadas y afirmaciones falsas.
- Dependencias: primero fuente canónica y metadatos; solo después búsqueda y automatización.
- Prueba de aceptación: caso sintético y evidencia de ahorro/eficiencia real, cuando se autorice.

| Prioridad | Idea | Beneficio hipotético | Dependencia y validación |
| --- | --- | --- | --- |
| P0 | Índice canónico por áreas y enlaces estables | Evitar investigaciones y documentos duplicados | Revisar referencias, propietario y fechas; no crear segunda biblioteca de productos |
| P0 | Registro de decisiones con supersesión | Prevenir órdenes contradictorias | Aprobaciones explícitas, evidencia y matriz de autoridad |
| P0 | Playbooks de incidentes y soluciones recurrentes | Reducir repetición de diagnóstico | Guardian/QA verifican causas y procedimientos; jamás ejecutar reparaciones automáticamente |
| P1 | Requisitos ↔ PR ↔ tests ↔ entregas | Mejorar la trazabilidad de aceptación | SHA exactos y confirmación de entorno y autorización |
| P1 | Inventario de fuentes y revisión de vigencia | Detectar instrucciones históricas engañosas | Custodios departamentales y calendario de revisión |
| P2 | Búsqueda de texto completo en PostgreSQL existente | Consultar una biblioteca futura más grande | Evaluar esquema y cuotas con Cloud & Security; **no** modificar Supabase sin autorización |
| P2 | Búsqueda semántica con pgvector | Recuperar conceptos equivalentes | Primero datos clasificados; embeddings autorizados y costos/riesgos medidos |
| P3 | Asistente de consulta con citas, read-only | Reducir búsquedas manuales de documentación | Autorización por documento, aislamiento, evidencia, coste y supervisión humana |

## Límites y rechazo temprano

Desestimar una idea si requiere datos de clientes en un repositorio público, activación de Radar, recepcionistas o chatbots comerciales, OpenRouter, uso no autorizado de proveedores, creación de nuevos proyectos de hosting o una segunda fuente de verdad. No automatizar la toma de decisiones de Miguel y Samuel.

## Evidencia antes de promover

1. Definir pregunta, métrica y muestra sintética; documentar baseline.
2. Comparar al menos dos alternativas, incluida la opción de no implementar.
3. Acordar límite de consumo, clasificación de datos y responsable.
4. Probar de forma aislada con autorización, registrar resultados y rollback.
5. Elevar recomendación a PROJECT MANAGER; solo los propietarios autorizan compromisos y cambios sensibles.

**Handoff inicial:** aprobar primero el índice y la gobernanza. No autorizar pgvector/RAG/cron por aparecer en este backlog.
