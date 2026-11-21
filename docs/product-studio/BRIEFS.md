# Plantillas de requisitos APS v1
**Estado:** PROPUESTO, formularios de trabajo; no contienen datos de clientes reales.

## Brief universal (duplicar por proyecto)
| Campo | Respuesta / evidencia |
| --- | --- |
| ID de solicitud / cliente verificado | PENDIENTE |
| Lead vs cliente vs venta confirmada | PENDIENTE; nunca inferir relación |
| Tipo de producto y objetivo | PENDIENTE |
| Usuario final y acción principal | PENDIENTE |
| KPI y evento de conversión | PENDIENTE |
| Idioma y área geográfica | PENDIENTE |
| Alcance incluido / excluido | PENDIENTE |
| Personas que aprueban contenido/diseño | PENDIENTE |
| Dominio, hosting, titular y costos | PENDIENTE |
| Dependencias: contenido, fotografías, logos y licencias | PENDIENTE |
| Integraciones, datos y requisitos de privacidad | PENDIENTE |
| Roles/permisos y responsable de soporte | PENDIENTE |
| Presupuesto/plazo contractual, cambios y aceptación | PENDIENTE |

## Anexos por tipo
**Website:** mapa de páginas, CTA, mensajes, formularios (destino y pruebas de recepción), CMS requerido o no, identidad, contenido y SEO local/multilingüe; preview y dominio son campos distintos.

**Tienda:** catálogo, SKU, variantes, stock, región/moneda, impuestos/envíos, pasarela y cuenta titular, devoluciones, notificaciones, roles, eventos de compra y pruebas de checkout en sandbox. Nunca probar cobros reales sin autorización.

**CRM:** modelo de contacto/empresa/lead/venta, pipeline y reglas de transición, deduplicación, roles, límites por tenant, migración de datos, adjuntos, auditoría, exportación y retención. Caso negativo obligatorio: usuario sin permiso y cliente equivocado.

**Herramienta digital:** caso de uso, entradas/salidas, validaciones, acciones irreversibles, errores, límites de consumo, conexión de terceros, analítica y fallback offline/errores según necesidad.

## Requisito verificable
| ID | Escenario | Resultado esperado | Criticidad | Evidencia |
| --- | --- | --- | --- | --- |
| R-001 | Usuario abre home a 390 CSS px | Sin overflow, CTA visible/usable | P1 | PENDIENTE |
| R-002 | Formulario válido se envía | Backend confirma recepción/persistencia; no duplicado | P0 | PENDIENTE |
| R-003 | Usuario de organización B pide datos de A | Servidor deniega, sin filtración | P0 | PENDIENTE |
| R-004 | Producto se adjunta a ficha Client 360 | ID válido, sin fabricar venta | P0 | PENDIENTE |

## Solicitud de cambio
ID, solicitante, fecha, requisito original, modificación, justificación, efectos en plazo/costo/seguridad, decisión explícita, nueva versión y responsable. No ejecutar cambios fuera del alcance por una solicitud informal.

## Acta de aceptación
Producto/versión/SHA/entorno; lista de requisitos probados; defectos conocidos y excepciones firmadas; dominio/titularidad; componentes y archivos entregados; soporte y renovación; fecha, canal y aprobador. Sin evidencia o sin aprobación → PENDIENTE, no ENTREGADO.
