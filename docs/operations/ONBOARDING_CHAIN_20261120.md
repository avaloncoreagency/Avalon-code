# Cadena de onboarding: entidades reales existentes (bloque D)

2026-11-20 · Claude Code. Este documento solo mapea. No crea tablas, no aprueba precios ni términos y no fabrica clientes. Cada paso apunta a lo que **ya existe en `main`** o en el candidato #294. El checklist operativo detallado (website, e-commerce, CRM, contenido, dominio, hosting, imágenes, integraciones, aceptación y mantenimiento) vive en #281 (`docs/client-operations/ONBOARDING_AND_DELIVERY_CHECKLISTS.md`) y no se duplica aquí.

| # | Paso | Entidad / ruta existente | Quién decide | Evidencia mínima para avanzar | Estado |
|---|---|---|---|---|---|
| 1 | Solicitud | `crm_public_inquiries`, con un mensaje por envío en #288, y `crm_prospects` (`pending`). Bandeja en `/admin/workspace/crm` con filtros por mensaje | Miguel o Samuel revisan; ninguna IA decide | Mensaje guardado y revisión registrada en `crm_public_inquiry_reviews` | IMPLEMENTED_IN_BRANCH (#288); migración sin aplicar |
| 2 | Discovery | `crm_leads`, `crm_lead_assessments` y `crm_prospect_needs`; pipeline de 5 grupos con `crm_lead_stage_history` | Propietario | Necesidades y diagnóstico registrados en la ficha del lead | MERGED |
| 3 | Cotización | `crm_quotes`, `crm_quote_versions` y `crm_quote_events` (Quoting Studio) | Propietario. Solo con precios `approved` en `crm_service_catalog` | Versión enviada y aceptada, con su evento | MERGED. Hoy no hay ningún precio aprobado |
| 4 | Contrato | `crm_contracts` y `crm_contract_events`; borrador desde cotización aceptada; PDF seguro en #278 | Propietarios + revisión legal profesional (#286) | Contrato firmado registrado; un borrador no cuenta | MERGED + #278 en el candidato |
| 5 | Venta | `crm_sales` y `crm_sale_lines`; cobro verificado con referencia (Core Engine) | Propietario | Venta confirmada; ingreso solo con cobro verificado | MERGED |
| 6 | Proyecto | `os_projects`, con vínculo canónico proyecto↔cliente | Propietario | Proyecto vinculado al cliente y a la venta | MERGED |
| 7 | Producto | Producto del cliente en estado borrador, permitido sin website (`crm-client-product-links`); biblioteca existente | Propietario | Borrador → referencia externa solo con URL HTTPS real | MERGED |
| 8 | QA | Puertas de #281 (`ACCEPTANCE_GATES_ES.md`) y estándares de #282 (iPhone) | QA independiente (Codex) + propietario | Lista de verificación firmada con evidencia y SHA | Docs en revisión (#281/#282) |
| 9 | Entrega | `os_project_deployments`, `os_project_publish_approvals` y entrega de producto (`product-delivery`) | Propietario aprueba la publicación | Despliegue verificado + aceptación del cliente registrada | MERGED (mecanismo); sin entregas reales |

## Piloto Chino Barber (sintético)

Usa `docs/crm/PILOT_CHINO_BARBER_CHECKLIST.md`. **No existe** URL, contrato, venta ni pago reales del piloto, y este documento no los inventa.

Bloqueos antes de un piloto real:
- precios aprobados en el catálogo;
- plantilla contractual revisada por un profesional legal (#286);
- migración #288 y SQL de intake aplicados con respaldo;
- claves Turnstile configuradas;
- Preview aislada contra una base autorizada;
- aceptación humana de las puertas G1–G6 de #281.

## Revisión de los documentos #268 / #279 / #280 / #281 / #282

| PR | Duplicados | Contradicciones | Decisiones no aprobadas | Obsoleto |
|---|---|---|---|---|
| #268 knowledge | Ninguno; declara que no es la «Library» de productos | No | No. Precios «propuestos» separados de los «aprobados» | No |
| #279 ventas | Complementa `SALES_PLAYBOOK.md` | Menciona «13 etapas». Siguen siendo las etapas reales, pero la UI ahora las agrupa en 5 grupos. Conviene añadir esa nota | No. Precios, vertical y territorio quedan pendientes de los propietarios | Revisar referencia a Radar: está hibernado |
| #280 estrategia | No; remite a `crm_service_catalog` como única fuente de precios | No | No. Posicionamiento y objetivos marcados como PROPUESTO | No |
| #281 operaciones | Es la fuente del checklist del bloque D; este documento solo enlaza | No | No. Firmas, precios y SLA marcados PENDIENTE | No |
| #282 product studio | Solapa ligeramente los criterios QA con #281 (G4); aceptable si #281 queda como puerta canónica | No | No | No |

Next action: los propietarios deciden el orden de fusión de los docs (#281 primero, como puerta canónica). Al autor de #279 le toca añadir la nota de los 5 grupos y del Radar hibernado.
