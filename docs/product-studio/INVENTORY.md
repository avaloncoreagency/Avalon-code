# Inventario técnico de reutilización — Product Studio
**Estado:** auditoría de código, NO certificación funcional. **Fecha:** 2026-11-20. **Base:** `main@207ed3a3dc8fdae5dd949a7361733e441c530519`. **Issue:** #274; **PR:** #282.

## Cómo interpretar la evidencia
- **VERIFICADO EN FUENTE:** el archivo existe en el SHA auditado y contiene la función indicada. No equivale a prueba en navegador, disponibilidad, RLS real, hosting ni aceptación de cliente.
- **PENDIENTE DE QA:** no se ejecutó test, CI ni Safari real durante esta auditoría.
- **CANDIDATO DE REUTILIZACIÓN:** la funcionalidad puede inspirar un componente, pero antes de usarlo en productos externos se revisan aislamiento, API, licencia y accesibilidad.
- Los nombres de rutas en el código no garantizan que estén accesibles en un despliegue autorizado.

## Inventario observable
| Referencia | Evidencia concreta en `main` | Aprovechamiento y límite |
| --- | --- | --- |
| [Portafolio por empresa](../../src/components/os/company-portfolio.tsx) | `CompanyPortfolio`: agrupa productos por compañía; filtros por texto/estado y enlaces a ficha del CRM, Product HUD y versiones. Su búsqueda interactiva filtra **solo los proyectos cargados**. | Reutilizar el patrón, no construir un segundo portafolio. Comprobar búsqueda entre páginas; wrapper de módulos tiene parámetros de búsqueda en servidor. |
| [Product HUD](../../src/components/os/product-hud.tsx) | `ProductHud`: estado del producto, metadatos de fuente, URL externa, checks e incidencias. | Fuente de verdad operativa; revisar la comprensión de estados, no presentar URL como web instalada. |
| [Entrega por fases](../../src/components/os/delivery-panel.tsx) | `DeliveryPanel`: etapas, transiciones, notas y enlace HTTPS de evidencia cuando corresponde. | Base para el handoff de CLIENT OPERATIONS; una nota escrita no prueba despliegue real. |
| [Editor de website persistente](../../src/components/os/website-studio.tsx) | `WebsiteStudio`: cambios sin guardar, guardado, bloqueo de salida y manejo de conflictos. | Patrón de UX reutilizable condicionado a pruebas de pérdida/reanudación de cambios. |
| [Ruta de edición autenticada](../../src/app/admin/workspace/website-designer/%5Bid%5D/studio/page.tsx) | `requireOwner()`, lectura de `os_website_pages` y límites de páginas. | Evidencia de diseño con acceso owner en código, NO de que una sesión real o RLS estén verificados. |
| [Editor de bloques](../../src/components/avalon-ui/builders/website-editor.tsx) | Selección de página, bloques, reordenamiento con botones y selector Desktop/Tablet/Mobile. Vista previa etiquetada **sin publicar**. | Candidato de composición interna; no confundir preview de editor con output final en Safari. |
| [Contratos de builders](../../src/components/avalon-ui/builders/contracts.ts) | Tipos para website/chatbot/CRM, borradores y entregas opcionales sin persistencia implícita. | Reutilizar contratos donde correspondan, sin activar chatbots ni inferir backend. |
| [Campos de productos de tienda](../../src/components/os/product-fields.tsx) | Campos para SKU, categoría, precio, inventario, estado e imagen. | Referencia de formularios; no certifica checkout, inventario real ni pagos. |
| [Pipeline de oportunidades](../../src/components/crm/lead-board.tsx) | Botones Anterior/Avanzar, select para cambiar grupo, enlace de edición y drag opcional. Indica estimaciones y paginación. | Ya existe alternativa a drag; PRIORIDAD: QA táctil de Safari antes de modificar controles. |
| [Formulario de cotización](../../src/components/public/quote-form.tsx) | Campos etiquetados, estados de envío, honeypot y feedback ARIA. | Patrón de formulario, sujeto a prueba de recepción/abuso y privacidad. |
| [Acción de cotización](../../src/app/quote-actions.ts) | `requestQuote` llama RPC `crm_public_inquiry` con rate limit y trata `ok` como solicitud pendiente de revisión, no venta. | Nunca contar solicitudes públicas como lead ganado, cliente o ingreso. Verificar entrega end-to-end en QA. |
| [UI común administrativa](../../src/components/os/ui.tsx) | `PageHeader`, `Flash`, `DbNotice`, breadcrumb y estados de error. | Candidato para unificar microcopy/errores del admin; necesita test de rutas de fallos. |
| [SEO público](../../src/app/robots.ts), [sitemap](../../src/app/sitemap.ts) | robots excluye `/admin` y `/api`; sitemap declara home y ocho soluciones en ES/EN. | Política SEO de Avalon existente; validar metadatos/render y revisar contenido comercial de módulos pausados. |

## Tests EXISTENTES identificados — no duplicar
- [SEO, sitemap y formulario público](../../tests/public-seo.test.cjs).
- [Control de productos y rutas](../../tests/product-control.test.cjs).
- [Website Studio y contratos](../../tests/nova-studio.test.cjs).
- [Export HTML sintético a 1280 y 390 px Chromium](../../tests/forge-website-preview.screenshot.cjs): *no es Safari físico ni navegador autenticado de Preview alojado*.
- [Pipeline y adjuntos](../../tests/pipeline-board.test.cjs); [grupos](../../tests/pipeline-groups.test.cjs); [flujo](../../tests/pipeline-timeline.test.cjs).

**Resultado:** se verificó existencia y lectura de las rutas/archivos anteriores; NO se ejecutaron estas pruebas en este trabajo y NO se verificó el estado de ejecución del producto.

## Puntos que merecen validación, no diagnóstico definitivo
1. **Búsqueda:** `CompanyPortfolio` limita el filtro local a la página cargada; la ruta de Website Designer tiene búsqueda en servidor. Comprobar que el usuario entiende el alcance de los resultados y que no hay búsquedas engañosas.
2. **Vista previa:** el editor de bloques ofrece tamaños simulados, no Safari real. Confirmar que los proyectos exportados conservan diseño y navegación en dispositivo físico.
3. **Formulario:** confirmación de RPC no implica mensaje entregado a un correo de ventas; definir el SLA interno de revisión de solicitudes junto a CLIENT OPERATIONS.
4. **Sitemap/comercial:** aparecen rutas de soluciones `receptionist` y `chatbots`, pero su activación comercial permanece suspendida por política. Revisar con BUSINESS STRATEGY si el contenido público y su indexación deben mantenerse, modificarse o retirarse. No tocar rutas sin aprobación.
5. **Aislamiento:** la existencia de `requireOwner` en la página no sustituye pruebas negativas de RLS/IDOR en una base aislada.
6. **Chino Barber:** es piloto previsto sin website construido ni URL real. Crear solo un brief y pruebas sintéticas hasta disponer de un entregable autorizado.

## Ownership y conflicto
- No editar archivos de [PR #233](https://github.com/avaloncoreagency/Avalon-code/pull/233) (portal empleados, Samuel).
- No reemplazar pruebas o arquitectura de [PR #276](https://github.com/avaloncoreagency/Avalon-code/pull/276) (QA).
- No sobrescribir [PR #245](https://github.com/avaloncoreagency/Avalon-code/pull/245) (vinculación CRM, revisión de migración) ni tareas técnicas de Claude/Codex.
- Product Studio solamente documenta ahora; cada corrección futura necesita un Issue específico, dueño y PR aislado.

**Next action:** PROJECT MANAGER utiliza el [backlog priorizado](BACKLOG.md) para aprobar una primera mejora acotada, sin publicar cambios en producción.
