# Registro propuesto de componentes APS v1
**Importante:** este catálogo es un **backlog de componentes candidatos**, NO un inventario de funcionalidades implementadas. Cada candidato requiere cotejo contra el repositorio y PRs vigentes antes de construirlo.

| ID | Candidato | Productos | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| APS-01 | Tokens de marca + temas por cliente | Todos | P0 | PROPUESTO |
| APS-02 | Header/navigation responsivo | Websites/tiendas | P0 | PROPUESTO |
| APS-03 | Hero y CTA configurable | Websites | P0 | PROPUESTO |
| APS-04 | Tarjetas servicios/productos | Websites/tiendas | P0 | PROPUESTO |
| APS-05 | Footer + contacto/legal | Websites/tiendas | P0 | PROPUESTO |
| APS-06 | Formularios validados + estados | Todos | P0 | PROPUESTO |
| APS-07 | Estados vacíos, loading, error y éxito | Todos | P0 | PROPUESTO |
| APS-08 | Metadata SEO/OG/schema | Públicos | P0 | PROPUESTO |
| APS-09 | Modelo de eventos de conversión sin PII | Públicos | P0 | PROPUESTO |
| APS-10 | Tabla/filtros accesibles mobile | CRM | P0 | PROPUESTO |
| APS-11 | Editor de registros con cambios auditables | CRM | P0 | PROPUESTO |
| APS-12 | Acceso/roles/tenant guards | CRM/herramientas | P0 | PROPUESTO |
| APS-13 | Pipeline con opción no drag | CRM | P1 | PROPUESTO |
| APS-14 | Ficha y vínculo producto-cliente | CRM | P1 | PROPUESTO: revisar Product Control existente |
| APS-15 | Catálogo/variantes | Tiendas | P1 | PROPUESTO |
| APS-16 | Conector checkout administrado | Tiendas | P1 | PROPUESTO |
| APS-17 | Reserva/agenda | Websites | P1 | PROPUESTO |
| APS-18 | Testimonios verificables | Websites | P1 | PROPUESTO |
| APS-19 | KPI/analytics dashboard | CRM | P1 | PROPUESTO |
| APS-20 | Localización EN/ES | Todos | P1 | PROPUESTO |
| APS-21 | Preview/descarga de documentos | CRM | P1 | PROPUESTO |
| APS-22 | Changelog/versiones/handoff | Todos | P1 | PROPUESTO: revisar Product Control existente |
| APS-23 | Galería/media/reduced motion | Websites | P2 | PROPUESTO |
| APS-24 | Integraciones y automatización autorizadas | Todos | P2 | PROPUESTO |

## Política de adopción
Antes de implementar APS-xx: buscar componente, ruta, Issue y PR ya existentes; verificar estado exacto en `main` y condiciones de licencia. Si existe, preferir adaptar por extensión, no reemplazar ni duplicar. Si falta, presentar decisión build-vs-buy, complejidad, costo, owner, contrato de datos y aislamiento.

**Definición de reutilizable:** API/props documentadas; tokens configurables; responsive 320–430 CSS px; estados completos; accesibilidad; pruebas en SHA exacto; licencia y dependencias inventariadas; versión, límites y rollback. Estado VERIFICADO solo con evidencia de ejecución.

**Puntos de integración existentes:** [Product Control](../PRODUCT_CONTROL_RELEASE.md), [Cooperación](../dev-bridge/COOPERATION.md). `os_projects` y Project Bridge no deben rediseñarse desde este catálogo. Nada de activar Radar, AI Receptionists, chatbots u otros proveedores sin decisión nueva.
