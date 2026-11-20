# Control documental — protocolo propuesto

**Estado:** PROPUESTO; **fecha:** 2026-11-20; **audiencia:** PROJECT MANAGER y responsables departamentales. No constituye aprobación formal de política.

## Tres dimensiones que nunca se mezclan

| Dimensión | Valores | Interpretación |
| --- | --- | --- |
| Solidez | VERIFICADO / PROPUESTO / PENDIENTE / DESCONOCIDO | VERIFICADO requiere evidencia adecuada al hecho y entorno; PENDIENTE es una acción no concluida |
| Vigencia | VIGENTE / HISTÓRICO / SUSTITUIDO / REVOCADO / POR REVISAR | El estado antiguo puede haber sido correcto en su fecha |
| Aprobación | BORRADOR / EN REVISIÓN / APROBADO / RECHAZADO | APROBADO exige un aprobador y una evidencia explícita |

Un documento puede ser VERIFICADO + HISTÓRICO + APROBADO y, aun así, no autorizar operaciones actuales.

## Metadatos mínimos de cada registro

- ID y título descriptivo, fecha de creación y última revisión (UTC o zona explícita).
- Departamento, autor, custodio y aprobador cuando exista; **no inventar identidades**.
- Versión semántica `major.minor`, las tres dimensiones de estado y clasificación de confidencialidad.
- URL fuente, rama/SHA si aplica, evidencia y fecha de la comprobación; enlace al documento sucesor si lo hay.
- Revisión siguiente por fecha o evento (cambio de proveedor, incidente, norma o aprobación).
- Dependencias, riesgos, criterios de aceptación y cambios desde la versión anterior.

**Nombre recomendado:** `TIPO-AREA-NNN-titulo-vX.Y`; ejemplos `ADR-ARCH-001`, `SOP-CRM-001`, `RUN-SUPPORT-001`. Los ejemplos son formatos, no registros aprobados.

## Ciclo editorial

1. **Capturar** propuesta o fuente original sin modificarla. Documentar cuándo se observó.
2. **Clasificar** el material, detectar duplicados y contenido personal/confidencial. No copiar datos sensibles al repositorio público.
3. **Verificar** contra código, issues, PR exactos, logs, contratos autorizados o fuentes oficiales. Identificar discrepancias de entorno y fecha.
4. **Revisar** por el departamento custodio; áreas legales, privacidad y pagos necesitan validación competente y aprobación explícita.
5. **Aprobar** según el ámbito y la autoridad de Miguel/Samuel que éstos definan. Registrar autor, fecha y prueba de consentimiento. Las sugerencias de IA no son aprobaciones.
6. **Publicar** con enlace canónico, historial de cambios y referencia a la versión anterior.
7. **Revisar o retirar** cuando cambie el entorno. Conservar documento anterior como histórico sin sustituirlo silenciosamente.

**Cadencia propuesta:** operativos mensualmente, estándares estables trimestralmente, incidentes y cambios de seguridad inmediatamente; los owners pueden ajustar la política.

## Matriz de custodia

- BUSINESS STRATEGY: catálogo, posicionamiento, precios propuestos (precios **aprobados** requieren evidencia separada).
- FINANCE & KPIs: fórmulas, definición de ingresos propios vs ventas de terceros, comisiones.
- LEGAL & COMPLIANCE: contratos modelo y advertencias de revisión jurídica.
- CLOUD & SECURITY: arquitectura, RLS, permisos y backups.
- CLIENT OPERATIONS / SALES: SOP de prospectos, onboarding, entrega y soporte.
- PRODUCT / QA / GUARDIAN: estándares, pruebas, fallos, runbooks y lecciones aprendidas.
- KNOWLEDGE & INNOVATION: índice, taxonomía, duplicados y cartera de investigación.
- PROJECT MANAGER: prioridades, coordinación y escalamiento de decisiones.
- Miguel y Samuel: decisiones sensibles o estratégicas según una matriz de autoridad pendiente de acordar.

## Seguridad y auditoría

El código y los documentos de este repositorio son visibles públicamente. En el índice solo se permiten referencias sanitizadas: nunca contratos reales, datos de leads/clientes, transcripciones privadas, API keys, cookies, tokens, respaldos ni direcciones internas. Documentos restringidos permanecen en sistemas privados con permisos mínimos; el índice registra únicamente un título seguro y ubicación de acceso controlado, si esa referencia es apropiada.

Los hallazgos de pruebas deben identificar entorno, fecha, SHA y evidencia. No inferir `READY` por la existencia de una URL, ni `VERIFICADO` a partir de un prompt o texto de un PR. Una migración presente en GitHub no prueba que esté aplicada remotamente.

## Formato de handoff para PROJECT MANAGER

```text
ID / título:
Custodio:
Estado de solidez / vigencia / aprobación:
Hechos verificados y referencias (SHA, fecha, entorno):
Cambios propuestos:
Pruebas ejecutadas y limitaciones:
Riesgos / dependencias:
Decisión que necesitan Miguel y Samuel:
Siguiente acción reproducible y responsable:
```

No hay sincronización autónoma entre chats; el handoff se comparte explícitamente a través del canal autorizado. La ruta de cooperación técnica existente es [Dev Bridge](../dev-bridge/COOPERATION.md).
