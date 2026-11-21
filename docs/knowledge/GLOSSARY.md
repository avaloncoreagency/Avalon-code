# Glosario operativo de Avalon

**ID:** KNI-GLO-001 · **Versión:** v0.2 · **Custodio propuesto:** Knowledge & Innovation.
**Solidez:** PROPUESTO · **Vigencia:** POR REVISAR · **Aprobación:** BORRADOR · **Clasificación:** PUBLICABLE · **Última revisión:** 2026-11-20.

Estas definiciones requieren revisión departamental y **no** cambian estados del CRM, lógica de ventas, contratos ni permisos. Consultar el esquema y el procedimiento vigente antes de automatizar.

## Ciclo comercial

| Término | Significado para documentación y reportes |
| --- | --- |
| Prospecto | Empresa o contacto que podría necesitar un servicio; aún no hay confirmación de oportunidad comercial. Su existencia no equivale a autorización para contactar. |
| Lead | Registro comercial con etapa, fuente, siguiente acción y datos según evidencias. Puede no ser cliente; falta de datos no se interpreta como rechazo ni como venta. |
| Oportunidad | Posible transacción o proyecto negociable. Una misma empresa puede tener varias oportunidades a lo largo del tiempo. |
| Cliente de Avalon | Empresa vinculada a una relación comercial de la agencia, con identidad canónica en Clients 360. **La creación manual de su ficha por sí sola no demuestra un contrato firmado ni un cobro.** |
| Consumidor final de un cliente | Persona que compra al negocio atendido por Avalon. Pertenece a su propio ámbito de datos; no debe mezclarse automáticamente con el CRM interno de Avalon. |
| Etapa “ganado” | Resultado de una oportunidad conforme al contrato de datos y las condiciones comerciales vigentes. No cambiar etapas automáticamente por una ficha o un enlace sin prueba y regla aprobada. |
| Servicio contratado | Obligación comercial conforme a acuerdo verificable; no equivale a entrega técnica ni a dinero cobrado. |
| Venta contratada | Compromiso comercial registrado con las verificaciones requeridas. Debe separarse de facturación y pago. |
| Factura emitida | Documento de cobro registrado; no significa que el importe haya sido recibido. |
| Pago recibido | Cobro respaldado por evidencia financiera; nunca inferido solo de una venta o estado de pipeline. |
| Comisión acordada | Porcentaje o importe definido en condiciones contractuales; no equivale a comisión ganada, exigible ni pagada. |
| Ingreso de Avalon | Importe que pertenece a la agencia por servicios o comisiones; **no** es la facturación total de un negocio cliente. |

## Productos y entrega

| Término | Diferencia crítica |
| --- | --- |
| Producto referenciado | URL o registro administrativo de producto externo: **no** prueba que esté alojado, funcionando ni entregado. |
| Producto versionado | Archivo, manifest o versión vinculada a un identificador estable; requiere integridad y origen, no supone despliegue. |
| Producto entregado | Cliente/owner aceptó un entregable concreto según los criterios establecidos; no se infiere de un enlace disponible. |
| Producto publicado | Existe evidencia de despliegue en el ambiente esperado y fecha específica; no implica prueba de accesibilidad o disponibilidad continua. |
| Producto verificado en línea | Se comprobó mediante prueba del entorno, versión y fecha; no garantiza disponibilidad futura. |
| Portal administrativo Avalon OS | Herramienta privada para organizar la agencia, no necesariamente el hosting de todos los websites/CRMs creados para clientes. |
| Biblioteca corporativa Knowledge | Índice de decisiones, procesos y fuentes. **Distinta** de las bibliotecas/portafolios de productos y de las bases de conocimiento propias de cada cliente. |

## Evidencia técnica

| Término | Interpretación |
| --- | --- |
| Branch / rama | Línea de desarrollo aislada. No acredita integración en `main`. |
| Draft PR | Cambio propuesto y disponible para revisión, sin aprobación de integración. |
| PR merged | Cambios integrados en una rama objetivo; **no** significa que el despliegue esté activo ni probado. |
| Check CI success | Comprobación específica reportó éxito en un SHA. Confirmar suites realmente ejecutadas; no extenderla a pruebas que no corrieron. |
| Vercel Skipped / Ignored | Despliegue omitido: un estado `success` de integración no demuestra un Preview desplegado. |
| Preview READY | Un candidato desplegado en Preview, no aceptación de producción. El entorno de datos debe ser aislado y autorizado. |
| DESCONOCIDO | No existe evidencia suficiente para afirmar el valor, estado o resultado. **No** sustituirlo por “0”, “offline”, “falló” o “completado”. |
| VERIFICADO | Afirmación respaldada por fuente pertinente al entorno, fecha y alcance; no es una aprobación de negocio. |
| VIGENTE | Documento aplicable a la operación presente, sujeto a su fecha de revisión. No equivale a “aprobado”. |
| APROBADO | Autoridad humana competente aceptó el objeto concreto, con evidencia identificable. No equivale a “implementado”. |

## Reglas para resolver conflictos de términos

- CRM, FINANCE & KPIs, LEGAL y CLIENT OPERATIONS deben ratificar sus términos antes de incorporarlos a lógica o contratos.
- Si un manual histórico habla de `Lead Hunter` activo o de un pipeline anterior, consultar el estado actual de `main`, la decisión del owner y el [catálogo de fuentes](./SOURCE_CATALOG.md).
- Una misma empresa puede ser cliente y tener oportunidades adicionales. No derivar automáticamente la etapa de **todas** las oportunidades a partir de una sola venta.
- No publicar términos contractuales o datos de clientes reales en GitHub público.

**Siguiente acción:** cada departamento revisa estas definiciones; PROJECT MANAGER registra aprobaciones o discrepancias en el [registro de decisiones](./DECISION_REGISTER.md).
