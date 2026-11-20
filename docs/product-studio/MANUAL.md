# Manual de producción APS v1
**Versión:** 1.0 propuesta. **Fecha:** 2026-11-20. **Issue:** #274.
**Objetivo:** productos profesionales, repetibles, rápidos y rentables; ninguna implementación se presume existente.

## Diez fases y evidencia mínima
| Fase | Responsable propuesto | Salida exigida |
| --- | --- | --- |
| Descubrimiento | CLIENT OPERATIONS | Brief, objetivos, audiencia y contenidos |
| Alcance y precio | BUSINESS/FINANCE/LEGAL | Inclusiones, exclusiones, costos, cambios y contrato aprobados |
| Arquitectura | PRODUCT STUDIO + CLOUD & SECURITY | Decisión de plataforma, datos, dominio y límites |
| UX/UI iPhone-first | PRODUCT STUDIO | Wireframes 320/375/390/430 CSS px y marca aprobada |
| Implementación | Agente técnico asignado | PR aislado y vínculo a Issue; nada productivo sin autorización |
| QA | QUALITY ASSURANCE | Evidencias sobre SHA exacto, defectos y riesgos |
| Validación cliente | CLIENT OPERATIONS | Revisión del flujo real y aceptación del alcance |
| Publicación | CLOUD & SECURITY + owner | Rollout, titularidad DNS, monitoreo, rollback y aprobación |
| Entrega | CLIENT OPERATIONS | Acta, accesos mínimos, archivos/licencias y documentación |
| Mantenimiento | Responsable contratado | Versión, incidentes, SLA acordado y reporte |

**Criterio de transición:** no declarar finalizada una fase sin evidencia. Excepción no bloqueante requiere registro y aprobación humana.

## Arquitecturas de referencia
- **Website informativo:** preferir páginas renderizadas/estáticas o híbridas con contenido indexable, CMS solo si edición frecuente lo justifica. Componentes responsivos y formularios server-validated.
- **E-commerce:** seleccionar proveedor de tienda/checkout administrado según catálogo, impuestos, envíos, país y obligaciones; no almacenar tarjetas ni reinventar cobros. Integración a Avalon como referencia a producto y métricas autorizadas, no como segunda plataforma de pedidos.
- **CRM personalizado:** módulos mínimos de personas, organizaciones, roles, oportunidades, actividades, productos y reportes. Autorizar cada operación en servidor, aislar datos por organización, RLS/roles y pruebas de IDOR; elección single-tenant vs multi-tenant aprobada por CLOUD & SECURITY.
- **Herramienta digital:** caso de uso acotado, interfaz móvil, contrato entrada/salida, permisos, errores, límites de costo y telemetría sin PII.

## Design system por cliente
Tokens configurables: color (primario/neutral/semántico), tipografía, espaciado, radios, sombras, foco y movimiento. No imponer la estética de Avalon a clientes. Componentes cubren default, hover, focus, disabled, loading, success, empty, error. Logo/medios con licencia y origen verificable. Contraste AA: 4.5:1 para texto normal donde aplica; objetivo táctil propuesto ≥44×44 CSS px, respetando WCAG 2.2 AA y sus excepciones. Evitar que el CTA dependa únicamente de animación, hover o drag.

## iPhone-first
- Diseño desde 320 CSS px, comprobar 375/390/430 y landscape; sin scroll horizontal accidental.
- Etiquetas persistentes y `autocomplete`/`inputmode` pertinentes. Error junto al campo y resumen cuando proceda; controlar foco y teclado virtual.
- Respetar safe-area, zoom de texto, VoiceOver, contraste, foco visible, reduced motion y control sin gesto complejo.
- Definir navegación, tablas, filtros y diálogos en móvil con alternativa a drag-and-drop.
- Safari físico es gate separado del navegador sintético/CI; registrar dispositivo/iOS/versión Safari, ruta y evidencia, no inventar aprobación.

## Rendimiento y accesibilidad
Core Web Vitals: LCP ≤2.5 s, INP ≤200 ms y CLS ≤0.1 al percentil 75 cuando existan datos reales. En pre-release medir laboratorio, distinguirlo del campo y documentar condiciones/red/dispositivo. Optimizar imágenes responsive, reservar dimensiones, reducir JS y terceros, revisar fuentes y caching. Objetivo WCAG 2.2 AA con pruebas automáticas **y manuales**, sin declarar conformidad solo por un scanner.

Fuentes: https://web.dev/articles/vitals ; https://www.w3.org/TR/WCAG22/ ; https://developer.apple.com/design/human-interface-guidelines/

## SEO técnico y conversiones
Para páginas públicas indexables: title único, description, headings semánticos, canonical correcto, sitemap, robots y noindex adecuados, enlaces internos, metadatos sociales, contenido móvil equivalente, idioma/hreflang cuando aplica, datos estructurados validados. No prometer rankings. No indexar admin/previews. SEO no aplica a superficies privadas como si fueran websites públicos.
Formularios: validar en servidor; anti-spam/rate limits; éxito solo tras persistencia/envío verificado; consentimiento y política de privacidad según caso. Eventos de analítica con diccionario: page_view, form_start, generate_lead (tras recepción real), begin_checkout y purchase (solo venta confirmada), nunca PII ni inferir una venta de un clic.
Fuentes: https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing ; https://developers.google.com/analytics/devguides/collection/ga4/reference/events

## Integración existente con Avalon
La **fuente de verdad** es Product Control: `os_projects` + Project Bridge + módulos Website Designer, E-commerce Designer, CRM Creator, Marketing y Communication Hub. Consultar ../PRODUCT_CONTROL_RELEASE.md antes de proponer datos o navegación. Para producto externo usar URL HTTPS estable y verificada; es referencia, no implantación. ZIP importado pasa por revisión humana y versiones; no se ejecuta por defecto. El proyecto puede vincularse a `crm_clients.id` o al lead legado validado; no inventar venta, ingresos, hosting o prueba de uptime. El contrato firmado de Creative Bridge está desactivado hasta aprobación; no activar terceros.

## Entrega y mantenimiento
Acta: alcance y excepciones, versión/SHA, entorno, rutas, cuentas de titularidad acordada, licencias, archivos editables según contrato, capacitación, presupuesto recurrente, backups/restore, incidencia y SLA específico. Accesos mínimos, MFA, transferencia por canal seguro, revocación de privilegios temporales. SemVer Mayor.Menor.Parche propuesto para entregables; changelog con pruebas, dependencias, dueño y rollback. No ofrecer 24/7 ni garantías sin capacidad real.

## Referencias de decisión
Infraestructura y recuperación → CLOUD & SECURITY; onboarding/aceptación → CLIENT OPERATIONS; criterios contractuales → LEGAL; costo y margen → FINANCE; aceptación independiente → QA; prioridad e integración → PROJECT MANAGER.
