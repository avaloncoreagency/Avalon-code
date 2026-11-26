# Operation Infinity · inventario de superficies

AVL-CODEX-INFINITY-001 · Codex · 2026-11-26 · candidato #365. Base inspeccionada `f94b566f6c600b988ec4b57729bd0887ba980f6d`.

101 páginas y 45 handlers en Git. También se generan /robots.txt y /sitemap.xml. El manifiesto del build contiene estas 148 entradas y la página interna de Next para rutas inexistentes. La columna de datos incluye referencias literales directas; las dependencias delegadas a componentes, layouts, middleware y servicios requieren seguimiento. La presencia de un guard en esta tabla no certifica autorización efectiva.


## Cómo leer la evidencia

El mapa corresponde a la rama de #365. Las fuentes de producto son las rutas y el esquema local; #303 y #304 conservan el backlog y las reservas. Claude mantiene #366 (contratos, catálogo, suscripciones y correo); ChatGPT mantiene #368 (presentación del cierre y PDF). STABLE V1, OMEGA, GENESIS y Total Convergence aportan antecedentes, no aceptación de este build.

| Área y vínculo | Comprobación de esta ronda | Pendiente para certificar |
|---|---|---|
| Público → solicitud → aprobación → oportunidad | PGlite, solicitud duplicada, aprobación humana y conversión por ID | Formulario y sesión alojados |
| Oportunidad → venta → cliente → tareas | Backbone y Nova comercial, datos sintéticos, dos propietarios; revisadas relaciones persistidas y rollback | Preview aislada en el candidato integrado |
| Cotización → aprobación → contrato | Suite de vendedores y borrado lógico; un concepto personalizado sin código de catálogo bloquea dos recorridos históricos | Propietarios y Claude deben acordar la regla para esas líneas antes de integrar #364 |
| Venta → factura → pago → saldo | SQL de importes y Chromium con cobro parcial, devolución y contracargo | Conciliación operativa y revisión financiera humana |
| Calendario CRM | Componente real con adaptador sintético, paginación, zonas horarias y consulta parcial | Calendario en Safari físico |
| Staff y vendedores | SQL con MFA sintético, asignación, suspensión y permisos individuales; bloqueo anónimo de páginas en Next | Correo de invitación y autenticadores reales |
| HUD, módulos y marketing | Caso de 501 proyectos y fallos independientes de marketing y auditoría | Medición en dispositivo físico; integraciones proveedor por proveedor |
| Producción, onboarding, herramientas y entrega | Pruebas SQL de aislamiento, documentos, tareas y ciclo de entrega | Prueba de principio a fin del candidato combinado con #366 |
| Bridges, crédito de IA y automatizaciones | Inventario de rutas, acciones y esquema | Telemetría real y operación de cada control desconocidas |
| Backup | Restauración PGlite en otra instancia, relación cliente–lead, control anónimo y escritura posterior al snapshot | Ensayo autorizado de respaldo alojado, incluidos Auth y objetos Storage |

La restauración local se reproduce con `node --test tests/infinity-restore.database.cjs` usando la dependencia de QA ya instalada. Después de `npm run build`, `node --test tests/infinity-routes.integration.cjs` recorre cada página administrativa o de staff protegida. Los contratos de cada endpoint, formulario y control siguen requiriendo pruebas individuales.

La única migración de Infinity requiere `commercial_authority` y añade dos CHECK a `crm_quote_deletion_requests`. Para revertir en una base aislada, retirar únicamente `crm_quote_deletion_requests_one_time_total_finite` y `crm_quote_deletion_requests_monthly_total_finite`. La aplicación de la restricción valida filas existentes y debe planificarse con el integrador. El rollback de interfaz se limita al commit del HUD y el calendario.

| Ruta | Entrada | Guard directo | Tabla o RPC directa | Verificación funcional |
|---|---|---|---|---|
| `/admin/api/notifications` | route | — | `crm_notifications` | Por verificar individualmente |
| `/admin/api/staff-presence` | route | — | — | Por verificar individualmente |
| `/admin/auth/callback` | route | — | `agency_memberships` | Por verificar individualmente |
| `/admin/auth/confirm` | route | — | — | Por verificar individualmente |
| `/admin/creative-bridge` | page | `requireOwner` | `crm_leads`, `crm_sales`, `os_projects` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/dashboard` | page | `requireOwner` | `crm_leads`, `crm_quote_summary`, `crm_sales_metrics`, `crm_usage`, `os_marketing_items`, `os_projects` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/dev-bridge/ledger` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/dev-bridge` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/forgot-password` | page | — | — | Por verificar individualmente |
| `/admin/login` | page | — | — | Por verificar individualmente |
| `/admin/mfa` | page | — | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/profile` | page | `requireOwner` | `office_availability`, `office_profiles`, `office_time_off` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/reset-password` | page | — | — | Por verificar individualmente |
| `/admin/search` | page | `requireOwner` | `crm_clients`, `os_marketing_items`, `os_projects`, `os_receptionist_entries`, `os_store_products`, `os_website_pages` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/security` | page | `requireOwner` | `os_audit` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/settings/communications` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/settings` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/signup` | page | — | — | Por verificar individualmente |
| `/admin/staff` | page | `requireOwner` | `crm_clients`, `crm_leads`, `crm_quote_deletion_requests`, `office_directory`, `staff_casefiles`, `staff_client_grants`, `staff_contacts`, `staff_lead_grants`, `staff_permission_events`, `staff_portal_access`, `staff_private_messages`, `staff_work_items` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/[module]` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/ai-chatbots/[id]` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/ai-chatbots/[id]/studio` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/ai-chatbots/builder` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/ai-chatbots` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/ai-communications/analytics` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/ai-communications/appointments` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/ai-communications/conversations` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/ai-communications/knowledge` | page | `requireOwner` | `os_receptionist_entries` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/ai-communications` | page | `requireOwner` | `crm_clients`, `crm_leads`, `os_projects` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/ai-receptionist/[id]` | page | `requireOwner` | `os_receptionist_entries` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/ai-receptionist/[id]/studio` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/ai-receptionist/builder` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/ai-receptionist` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/clients/[id]` | page | `requireOwner` | `crm_activities`, `crm_clients`, `crm_leads`, `os_projects` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm-creator/[id]/export` | route | — | — | Por verificar individualmente |
| `/admin/workspace/crm-creator/[id]` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm-creator/[id]/studio` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm-creator` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/[section]` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/activity` | page | `requireOwner` | `crm_clients`, `crm_timeline` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/api` | route | — | `crm_audit`, `crm_convert_prospect`, `crm_lead_stage_history`, `crm_prospects`, `crm_public_inquiries`, `crm_stages` | Por verificar individualmente |
| `/admin/workspace/crm/calendar` | page | `requireOwner` | `crm_calendar_banners`, `crm_clients`, `crm_events`, `crm_leads`, `crm_stages`, `crm_tasks`, `crm_work_orders` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/clients/[id]/contracts/[agreementId]` | route | — | `crm_client_agreement_drafts` | Por verificar individualmente |
| `/admin/workspace/crm/clients/[id]/contracts` | page | `requireOwner` | `crm_client_agreement_drafts`, `crm_clients`, `crm_commercial_terms`, `crm_contacts`, `crm_contracts`, `crm_quote_versions`, `crm_quotes` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/clients/[id]` | page | `requireOwner` | `crm_activities`, `crm_attachments`, `crm_client_agreement_drafts`, `crm_client_opportunity_capability`, `crm_clients`, `crm_contacts`, `crm_events`, `crm_invoices`, `crm_leads`, `crm_quotes`, `crm_sale_variable_terms`, `crm_sales`, `crm_tasks`, `crm_timeline`, `crm_work_orders`, `os_projects` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/clients/[id]/results` | page | `requireOwner` | `crm_attributed_conversions`, `crm_attribution_summary`, `crm_clients`, `crm_commercial_terms`, `crm_contracts` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/clients` | page | `requireOwner` | `crm_clients` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/communications` | page | `requireOwner` | `crm_email_outbox` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/desk` | page | `requireOwner` | `crm_leads` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/documents/[id]` | route | — | — | Por verificar individualmente |
| `/admin/workspace/crm/documents` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/documents/review-pack` | route | — | — | Por verificar individualmente |
| `/admin/workspace/crm/inbound` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/lead/[id]/discovery` | page | `requireOwner` | `crm_lead_assessments`, `crm_leads` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/lead/[id]` | page | `requireOwner` | `crm_activities`, `crm_attachments`, `crm_audit`, `crm_commercial_terms`, `crm_contract_events`, `crm_contracts`, `crm_lead_assessment_revisions`, `crm_lead_assessments`, `crm_lead_recommendations`, `crm_lead_scores`, `crm_lead_stage_history`, `crm_leads`, `crm_stages` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/messages` | page | `requireOwner` | `staff_contacts`, `staff_private_messages` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/notifications` | page | `requireOwner` | `crm_notifications`, `crm_refresh_alerts` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/office/api` | route | — | `crm_clients`, `crm_events`, `crm_owner_directory`, `crm_tasks`, `crm_timeline`, `crm_work_orders`, `office_agent_requests`, `office_availability`, `office_directory`, `office_messages`, `office_profiles`, `office_time_off`, `os_projects` | Por verificar individualmente |
| `/admin/workspace/crm/office/executive` | route | — | `crm_agent_missions`, `crm_agent_runs`, `crm_agent_settings`, `crm_ai_usage` | Por verificar individualmente |
| `/admin/workspace/crm/office/hq` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/office/manager-activity` | route | — | `crm_agent_capabilities`, `crm_agent_runs`, `crm_agent_settings` | Por verificar individualmente |
| `/admin/workspace/crm/office/manager-run` | route | — | `crm_agent_set_automatic`, `crm_agent_set_kill_switch` | Por verificar individualmente |
| `/admin/workspace/crm/office/manager-work/api` | route | — | — | Por verificar individualmente |
| `/admin/workspace/crm/office/manager-work/github-history/api` | route | — | — | Por verificar individualmente |
| `/admin/workspace/crm/office/manager-work` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/office` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/office/photo/[id]` | route | — | `office_profiles` | Por verificar individualmente |
| `/admin/workspace/crm/onboarding/[id]/documents/[docId]` | route | — | `crm_client_documents` | Por verificar individualmente |
| `/admin/workspace/crm/onboarding/[id]` | page | `requireOwner` | `crm_client_documents`, `crm_client_onboardings`, `crm_clients`, `crm_contacts`, `crm_email_outbox`, `crm_invoices`, `os_projects` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/onboarding` | page | `requireOwner` | `crm_client_onboardings`, `crm_sales` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/overview` | page | `requireOwner` | `crm_sales_metrics` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/pipeline/files/[id]` | route | — | `crm_attachments` | Por verificar individualmente |
| `/admin/workspace/crm/pipeline/files` | route | — | `crm_attachments` | Por verificar individualmente |
| `/admin/workspace/crm/pipeline` | route | — | `crm_activities`, `crm_attachments`, `crm_audit`, `crm_lead_stage_history` | Por verificar individualmente |
| `/admin/workspace/crm/quotes/[id]/edit` | page | `requireOwner` | `crm_quote_versions`, `crm_quotes`, `crm_service_catalog` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/quotes/[id]` | page | `requireOwner` | `crm_client_agreement_drafts`, `crm_clients`, `crm_contracts`, `crm_quote_events`, `crm_quote_versions`, `crm_quotes` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/quotes/[id]/pdf` | route | — | `crm_quote_versions`, `crm_quotes` | Por verificar individualmente |
| `/admin/workspace/crm/quotes/new` | page | `requireOwner` | `crm_clients`, `crm_leads`, `crm_service_catalog` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/quotes` | page | `requireOwner` | `crm_clients`, `crm_quote_summary`, `crm_quote_versions`, `crm_quotes` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/radar/area` | route | — | — | Por verificar individualmente |
| `/admin/workspace/crm/radar/campaigns` | route | — | `crm_radar_campaigns` | Por verificar individualmente |
| `/admin/workspace/crm/radar/control` | route | — | — | Por verificar individualmente |
| `/admin/workspace/crm/radar/geocode` | route | — | — | Por verificar individualmente |
| `/admin/workspace/crm/radar/places` | route | — | `crm_convert_prospect`, `crm_prospect_needs`, `crm_prospects` | Por verificar individualmente |
| `/admin/workspace/crm/radar/research` | route | — | `crm_prospect_needs`, `crm_prospects`, `crm_radar_research_reports`, `crm_radar_worker_runs` | Por verificar individualmente |
| `/admin/workspace/crm/radar/runs` | route | — | `crm_radar_runs` | Por verificar individualmente |
| `/admin/workspace/crm/sales/[id]/invoices/[invoiceId]` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/sales/[id]/invoices/[invoiceId]/pdf` | route | — | — | Por verificar individualmente |
| `/admin/workspace/crm/sales/[id]` | page | `requireOwner` | `crm_invoices`, `crm_payments`, `crm_sale_installments`, `crm_sale_lines`, `crm_sale_receivables`, `crm_sale_terms`, `crm_sales`, `crm_tasks`, `crm_timeline`, `crm_work_orders` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/sales/new` | page | `requireOwner` | `crm_clients`, `crm_leads`, `crm_quote_versions`, `crm_quotes`, `crm_service_catalog` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/sales` | page | `requireOwner` | `crm_clients`, `crm_invoices`, `crm_overdue_collection_metrics`, `crm_quotes`, `crm_sale_settlements`, `crm_sale_variable_terms`, `crm_sales`, `crm_sales_metrics`, `crm_sales_with_receivables`, `crm_tasks`, `crm_work_orders` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/settings` | page | `requireOwner` | `crm_automation_rules`, `crm_service_catalog`, `crm_stages` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/crm/tasks` | page | `requireOwner` | `crm_clients`, `crm_task_comments`, `crm_tasks`, `crm_timeline` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/ecommerce-designer/[id]/export` | route | — | `os_store_products` | Por verificar individualmente |
| `/admin/workspace/ecommerce-designer/[id]` | page | `requireOwner` | `os_store_products` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/ecommerce-designer/[id]/preview` | page | `requireOwner` | `os_store_products` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/ecommerce-designer/[id]/products/[productId]` | page | `requireOwner` | `os_store_products` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/ecommerce-designer` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/library/[id]/export` | route | — | `os_project_files`, `os_project_versions`, `os_projects` | Por verificar individualmente |
| `/admin/workspace/library/[id]` | page | `requireOwner` | `crm_clients`, `os_project_deployments`, `os_project_events`, `os_project_files`, `os_project_publish_approvals`, `os_project_versions`, `os_projects` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/library/[id]/preview` | route | — | `os_project_files`, `os_project_versions` | Por verificar individualmente |
| `/admin/workspace/library/code` | page | `requireOwner` | `os_code_deliveries`, `os_code_mainline` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/library/imports/[importId]/process` | route | — | `os_project_imports` | Por verificar individualmente |
| `/admin/workspace/library` | page | `requireOwner` | `os_project_deployments`, `os_project_imports`, `os_project_versions`, `os_projects` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/library/tokens` | page | `requireOwner` | `os_project_api_tokens` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/library/uploads` | route | — | `os_project_imports`, `os_projects` | Por verificar individualmente |
| `/admin/workspace/marketing-hub/[id]/export` | route | — | `os_marketing_items` | Por verificar individualmente |
| `/admin/workspace/marketing-hub/[id]/items/[itemId]` | page | `requireOwner` | `os_marketing_items` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/marketing-hub/[id]` | page | `requireOwner` | `os_marketing_items` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/marketing-hub/commercial/campaigns` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/marketing-hub/commercial/catalog` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/marketing-hub/commercial/knowledge` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/marketing-hub/commercial/overview` | page | `requireOwner` | `crm_sales_metrics` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/marketing-hub/commercial` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/marketing-hub/commercial/playbook` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/marketing-hub/commercial/router` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/marketing-hub/funnels` | page | `requireOwner` | `crm_clients`, `crm_growth_funnel_submissions`, `crm_growth_funnels`, `os_projects` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/marketing-hub/growth` | page | `requireOwner` | `crm_leads` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/marketing-hub` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/products/[id]/brief` | route | — | `os_projects` | Por verificar individualmente |
| `/admin/workspace/products/[id]` | page | `requireOwner` | `crm_leads`, `os_audit`, `os_projects` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/website-designer/[id]` | page | `requireOwner` | `os_website_pages` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/website-designer/[id]/pages/[pageId]/export` | route | — | `os_website_pages` | Por verificar individualmente |
| `/admin/workspace/website-designer/[id]/pages/[pageId]` | page | `requireOwner` | `os_website_page_versions`, `os_website_pages` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/website-designer/[id]/pages/[pageId]/preview` | page | `requireOwner` | `os_website_pages` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/website-designer/[id]/studio` | page | `requireOwner` | `os_website_pages` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/admin/workspace/website-designer` | page | `requireOwner` | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/api/creative-bridge/deliveries` | route | — | `os_receive_creative_delivery` | Por verificar individualmente |
| `/api/creative-bridge/projects` | route | — | — | Por verificar individualmente |
| `/api/dev-bridge/export` | route | — | — | Por verificar individualmente |
| `/api/dev-bridge/resume` | route | — | — | Por verificar individualmente |
| `/api/dev-bridge/v1/events` | route | — | `dev_bridge_agent_event` | Por verificar individualmente |
| `/api/project-bridge/v1/imports/[importId]` | route | — | `os_bridge_api_import_status` | Por verificar individualmente |
| `/api/project-bridge/v1/imports` | route | — | `os_bridge_api_open_import` | Por verificar individualmente |
| `/dashboard` | page | — | — | Por verificar individualmente |
| `/f/[slug]` | page | — | `crm_growth_funnel_view` | Por verificar individualmente |
| `/login` | page | — | — | Por verificar individualmente |
| `/` | page | — | — | Por verificar individualmente |
| `/soluciones/[service]` | page | — | — | Por verificar individualmente |
| `/staff/mfa` | page | — | — | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/staff` | page | `requireStaff` | `staff_casefiles`, `staff_client_grants`, `staff_contacts`, `staff_my_leads`, `staff_notes`, `staff_private_messages`, `staff_work_items` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/staff/quotes/[id]/edit` | page | — | `staff_seller_catalog`, `staff_seller_quote` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/staff/quotes/[id]` | page | — | `crm_quote_deletion_requests`, `staff_seller_quote` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |
| `/staff/quotes/[id]/pdf` | route | — | `staff_seller_quote` | Por verificar individualmente |
| `/staff/quotes/new` | page | — | `staff_contacts`, `staff_seller_catalog`, `staff_seller_leads` | Anónimo → login (HTTP local); uso autenticado pendiente por ruta |

## Acciones de servidor · 44

- `src/app/admin/dev-bridge/ledger/actions.ts`
- `src/app/admin/mfa-actions.ts`
- `src/app/admin/password-actions.ts`
- `src/app/admin/profile/actions.ts`
- `src/app/admin/settings/communications/actions.ts`
- `src/app/admin/signup/actions.ts`
- `src/app/admin/staff/actions.ts`
- `src/app/admin/workspace/ai-receptionist/actions.ts`
- `src/app/admin/workspace/crm-creator/actions.ts`
- `src/app/admin/workspace/crm/calendar/actions.ts`
- `src/app/admin/workspace/crm/clients/[id]/contracts/actions.ts`
- `src/app/admin/workspace/crm/clients/[id]/experience-actions.ts`
- `src/app/admin/workspace/crm/clients/[id]/results/actions.ts`
- `src/app/admin/workspace/crm/clients/actions.ts`
- `src/app/admin/workspace/crm/clients/project-actions.ts`
- `src/app/admin/workspace/crm/clients/workspace-actions.ts`
- `src/app/admin/workspace/crm/core-actions.ts`
- `src/app/admin/workspace/crm/lead/actions.ts`
- `src/app/admin/workspace/crm/messages/actions.ts`
- `src/app/admin/workspace/crm/notifications/actions.ts`
- `src/app/admin/workspace/crm/onboarding/actions.ts`
- `src/app/admin/workspace/crm/quotes/actions.ts`
- `src/app/admin/workspace/crm/sales/actions.ts`
- `src/app/admin/workspace/crm/settings/actions.ts`
- `src/app/admin/workspace/crm/tasks/actions.ts`
- `src/app/admin/workspace/ecommerce-designer/actions.ts`
- `src/app/admin/workspace/library/actions.ts`
- `src/app/admin/workspace/marketing-hub/actions.ts`
- `src/app/admin/workspace/marketing-hub/funnels/actions.ts`
- `src/app/admin/workspace/nova-studio-actions.ts`
- `src/app/admin/workspace/product-delivery-actions.ts`
- `src/app/admin/workspace/products/actions.ts`
- `src/app/admin/workspace/project-actions.ts`
- `src/app/admin/workspace/website-designer/actions.ts`
- `src/app/admin/workspace/website-designer/library-actions.ts`
- `src/app/admin/workspace/website-designer/studio-actions.ts`
- `src/app/dashboard/actions.ts`
- `src/app/f/[slug]/actions.ts`
- `src/app/login/actions.ts`
- `src/app/quote-actions.ts`
- `src/app/staff/actions.ts`
- `src/app/staff/mfa/actions.ts`
- `src/app/staff/seller-actions.ts`
- `src/components/agents/invite-actions.ts`

## Edge Functions · 2

- `supabase/functions/avalon-radar-worker/index.ts`
- `supabase/functions/staff-invite/index.ts`

## Migraciones · 76

- `supabase/migrations/20261102053022_avalon_owner_memberships_rls.sql`
- `supabase/migrations/20261102053452_harden_membership_table_grants.sql`
- `supabase/migrations/20261102070500_avalon_os_modules.sql`
- `supabase/migrations/20261102085430_crm_core.sql`
- `supabase/migrations/20261102170000_avalon_sales_core.sql`
- `supabase/migrations/20261102180000_crm_pipeline_13.sql`
- `supabase/migrations/20261102190000_radar_core.sql`
- `supabase/migrations/20261102200000_public_inquiry.sql`
- `supabase/migrations/20261102210000_pipeline_board.sql`
- `supabase/migrations/20261102220000_shared_calendar.sql`
- `supabase/migrations/20261103100000_office.sql`
- `supabase/migrations/20261103113000_crm_client_workspace.sql`
- `supabase/migrations/20261103192500_radar_source_research.sql`
- `supabase/migrations/20261103195650_radar_auto_technical_opportunity_tier.sql`
- `supabase/migrations/20261103205000_radar_scheduler_core.sql`
- `supabase/migrations/20261103223000_staff_profiles_notifications.sql`
- `supabase/migrations/20261103224500_radar_profile_prequalification.sql`
- `supabase/migrations/20261104120000_manager_execution.sql`
- `supabase/migrations/20261104130000_project_client_canonical.sql`
- `supabase/migrations/20261104140000_radar_rules_decisions.sql`
- `supabase/migrations/20261105090000_manager_missions.sql`
- `supabase/migrations/20261106090000_ai_engine.sql`
- `supabase/migrations/20261106100000_radar_owner_approval.sql`
- `supabase/migrations/20261107090000_ai_chatbots_module.sql`
- `supabase/migrations/20261108100000_project_bridge.sql`
- `supabase/migrations/20261109160000_code_exchange.sql`
- `supabase/migrations/20261110140000_radar_search_runs.sql`
- `supabase/migrations/20261111090000_code_exchange_disabled.sql`
- `supabase/migrations/20261111100000_crm_intelligence.sql`
- `supabase/migrations/20261112090000_crm_titan_backend.sql`
- `supabase/migrations/20261112100000_crm_titan_documents.sql`
- `supabase/migrations/20261112110000_growth_funnel_public.sql`
- `supabase/migrations/20261112130000_commercial_b2c_owner_only.sql`
- `supabase/migrations/20261112190000_bridge_scope_hardening.sql`
- `supabase/migrations/20261112191000_future_public_default_acl.sql`
- `supabase/migrations/20261112204212_crm_growth_consent_version_required.sql`
- `supabase/migrations/20261112204554_crm_public_inquiry_restore_caller_identity.sql`
- `supabase/migrations/20261113160000_os_projects_module_chatbots_restore.sql`
- `supabase/migrations/20261113173000_product_control_extended_import_categories.sql`
- `supabase/migrations/20261114120000_fk_lookup_indexes.sql`
- `supabase/migrations/20261114160000_crm_client_agreement_drafts.sql`
- `supabase/migrations/20261117155716_crm_core_engine.sql`
- `supabase/migrations/20261117180500_staff_private_portal.sql`
- `supabase/migrations/20261119143838_crm_client_opportunity_registration.sql`
- `supabase/migrations/20261119150000_crm_attributed_conversions.sql`
- `supabase/migrations/20261119210002_crm_quoting_studio.sql`
- `supabase/migrations/20261120130331_os_product_delivery_guard.sql`
- `supabase/migrations/20261120130354_public_inquiry_services_guard.sql`
- `supabase/migrations/20261120130358_project_bridge_rls_initplan.sql`
- `supabase/migrations/20261120160000_public_inquiry_message_history.sql`
- `supabase/migrations/20261121180000_crm_sale_lead_company_guard.sql`
- `supabase/migrations/20261121181000_crm_attribution_lifecycle.sql`
- `supabase/migrations/20261121182000_crm_attribution_legacy_guard.sql`
- `supabase/migrations/20261123120000_dev_bridge_ledger.sql`
- `supabase/migrations/20261123140000_crm_finance_finite_money.sql`
- `supabase/migrations/20261123141000_dev_bridge_posture_allowlist.sql`
- `supabase/migrations/20261123150000_crm_sale_payment_schedule.sql`
- `supabase/migrations/20261123160000_crm_sales_center_close.sql`
- `supabase/migrations/20261123190000_staff_roles_leads_invites.sql`
- `supabase/migrations/20261124100000_staff_work_calendar.sql`
- `supabase/migrations/20261124110000_crm_quote_soft_delete.sql`
- `supabase/migrations/20261124134323_staff_share_suspension.sql`
- `supabase/migrations/20261124134350_sales_collections_read_model.sql`
- `supabase/migrations/20261124140000_client_experience.sql`
- `supabase/migrations/20261124190000_outbox_lifecycle_kinds.sql`
- `supabase/migrations/20261124192749_staff_own_commercial_history.sql`
- `supabase/migrations/20261124200000_contract_agreement_link.sql`
- `supabase/migrations/20261125005906_enforce_enrolled_mfa_data_access.sql`
- `supabase/migrations/20261125100000_delivery_acceptance.sql`
- `supabase/migrations/20261125110000_finance_rpc_search_path.sql`
- `supabase/migrations/20261125120000_outbox_onboarding_kinds.sql`
- `supabase/migrations/20261125120100_corporate_mailbox.sql`
- `supabase/migrations/20261125140000_welcome_package_documents.sql`
- `supabase/migrations/20261125150000_staff_seller_pipeline.sql`
- `supabase/migrations/20261125221252_commercial_authority.sql`
- `supabase/migrations/20261126121700_quote_deletion_totals_finite.sql`

## Componentes de presentación · 107

- `src/components/agents/invitation-panel.tsx`
- `src/components/agents/invite-submit.tsx`
- `src/components/auth/human-verification.tsx`
- `src/components/auth/login-panel.tsx`
- `src/components/auth/mfa-panel.tsx`
- `src/components/auth/password-page.tsx`
- `src/components/auth/password-panel.tsx`
- `src/components/avalon-ui/builders/builders-demo.tsx`
- `src/components/avalon-ui/builders/chatbot-editor.tsx`
- `src/components/avalon-ui/builders/crm-editor.tsx`
- `src/components/avalon-ui/builders/product-builders.tsx`
- `src/components/avalon-ui/builders/website-editor.tsx`
- `src/components/avalon-ui/nova-demo.tsx`
- `src/components/avalon-ui/nova.tsx`
- `src/components/communications/communications-portfolio.tsx`
- `src/components/crm/client-experience.tsx`
- `src/components/crm/command-summary.tsx`
- `src/components/crm/commercial-journey.tsx`
- `src/components/crm/crm.tsx`
- `src/components/crm/inbound-inbox.tsx`
- `src/components/crm/intel/contract-upload.tsx`
- `src/components/crm/intel/discovery-form.tsx`
- `src/components/crm/intel/quick-add.tsx`
- `src/components/crm/lead-attachments.tsx`
- `src/components/crm/lead-board.tsx`
- `src/components/crm/lead-interaction-form.tsx`
- `src/components/crm/lead-timeline.tsx`
- `src/components/crm/lead-workbench.tsx`
- `src/components/crm/navigation.tsx`
- `src/components/crm/overview.tsx`
- `src/components/crm/radar-auto-research.tsx`
- `src/components/crm/radar-research-panel.tsx`
- `src/components/crm/record-form.tsx`
- `src/components/crm/shared-calendar.tsx`
- `src/components/crm/titan-radar.tsx`
- `src/components/library/importer.tsx`
- `src/components/library/preview-frame.tsx`
- `src/components/office/executive-panel.tsx`
- `src/components/office/hq-3d.tsx`
- `src/components/office/manager-activity-panel.tsx`
- `src/components/office/manager-execution-status.tsx`
- `src/components/office/manager-workstation.tsx`
- `src/components/office/my-profile-photo.tsx`
- `src/components/office/office.tsx`
- `src/components/office/presence-avatar.tsx`
- `src/components/os/company-portfolio.tsx`
- `src/components/os/delivery-panel.tsx`
- `src/components/os/marketing-fields.tsx`
- `src/components/os/mfa-settings.tsx`
- `src/components/os/module-delivery-panel.tsx`
- `src/components/os/nova-settings-studio.tsx`
- `src/components/os/product-fields.tsx`
- `src/components/os/product-hud.tsx`
- `src/components/os/project-context.tsx`
- `src/components/os/projects.tsx`
- `src/components/os/ui.tsx`
- `src/components/os/website-draft-guard.tsx`
- `src/components/os/website-studio.tsx`
- `src/components/public/growth/demo-language-link.tsx`
- `src/components/public/growth/demos/ads.tsx`
- `src/components/public/growth/demos/calendar.tsx`
- `src/components/public/growth/demos/chat.tsx`
- `src/components/public/growth/demos/crm.tsx`
- `src/components/public/growth/demos/journey.tsx`
- `src/components/public/growth/demos/local.tsx`
- `src/components/public/growth/demos/shared.tsx`
- `src/components/public/growth/demos/shop.tsx`
- `src/components/public/growth/experience.tsx`
- `src/components/public/growth/intro.tsx`
- `src/components/public/growth/store.tsx`
- `src/components/public/growth/tree.tsx`
- `src/components/public/landing/effects.tsx`
- `src/components/public/landing/icons.tsx`
- `src/components/public/landing/interactive.tsx`
- `src/components/public/landing/product-video.tsx`
- `src/components/public/landing/showroom.tsx`
- `src/components/public/landing/site-chrome.tsx`
- `src/components/public/landing/universe/living-universe.tsx`
- `src/components/public/quote-form.tsx`
- `src/components/quotes/delete-quote.tsx`
- `src/components/quotes/quote-wizard.tsx`
- `src/components/quotes/review-download.tsx`
- `src/components/quotes/service-studio.tsx`
- `src/components/quotes/unavailable.tsx`
- `src/components/sales/client-edit-panel.tsx`
- `src/components/sales/client-overview.tsx`
- `src/components/sales/client-workspace.tsx`
- `src/components/sales/core-form.tsx`
- `src/components/sales/core-panels.tsx`
- `src/components/sales/print-button.tsx`
- `src/components/sales/quote-close-panel.tsx`
- `src/components/sales/sale-agreement-panel.tsx`
- `src/components/sales/sale-form.tsx`
- `src/components/sales/sale-payment-editor.tsx`
- `src/components/sales/sale-schedule-panel.tsx`
- `src/components/sales/schedule-editor.tsx`
- `src/components/sales/task-edit-form.tsx`
- `src/components/sales/tz-offset.tsx`
- `src/components/sales/ui.tsx`
- `src/components/staff/commercial-history.tsx`
- `src/components/staff/seller-pipeline.tsx`
- `src/components/staff/work-calendar.tsx`
- `src/components/suite/chrome.tsx`
- `src/components/suite/icons.tsx`
- `src/components/suite/language-switch.tsx`
- `src/components/suite/module-cards.tsx`
- `src/components/suite/suite.tsx`

## Suites existentes · 252

- `tests/a11y-roving.test.cjs`
- `tests/agent-portal.browser.cjs`
- `tests/agents-engine.database.cjs`
- `tests/agents-managers.database.cjs`
- `tests/agents-missions.database.cjs`
- `tests/agents-policy.test.cjs`
- `tests/ai-engine-ops.test.cjs`
- `tests/ai-engine-workflow.test.cjs`
- `tests/ai-engine.database.cjs`
- `tests/ai-engine.test.cjs`
- `tests/ai-evidence-guard.test.cjs`
- `tests/ai-provider-registry.test.cjs`
- `tests/attachment-integrity-recovery.test.cjs`
- `tests/attribution-lifecycle.database.cjs`
- `tests/attribution-lifecycle.test.cjs`
- `tests/auth.integration.cjs`
- `tests/auth.test.cjs`
- `tests/avalon-hud-style.test.cjs`
- `tests/backbone-e2e.database.cjs`
- `tests/bridge-integrity.test.cjs`
- `tests/ci-concurrency-credit-guard.test.cjs`
- `tests/client-contracts-pdf.test.cjs`
- `tests/client-contracts.test.cjs`
- `tests/client-directory.browser.cjs`
- `tests/client-experience.browser.cjs`
- `tests/client-experience.database.cjs`
- `tests/client-experience.test.cjs`
- `tests/client-finance.test.cjs`
- `tests/client-hud.test.cjs`
- `tests/client-opportunity-link.database.cjs`
- `tests/client-project-link.test.cjs`
- `tests/client-workspace-feedback.test.cjs`
- `tests/client360-integrations.test.cjs`
- `tests/client360-scoping.test.cjs`
- `tests/code-exchange.database.cjs`
- `tests/codex-visibility.test.cjs`
- `tests/command-center-time.test.cjs`
- `tests/command-center-ui.test.cjs`
- `tests/commercial-b2c-lifecycle.test.cjs`
- `tests/commercial-b2c.database.cjs`
- `tests/commercial-catalog.test.cjs`
- `tests/commercial-foundation.test.cjs`
- `tests/commercial-operations.test.cjs`
- `tests/commercial-overview.test.cjs`
- `tests/commercial-policy-edges.test.cjs`
- `tests/communications-hub.test.cjs`
- `tests/contracts-guided-ui.test.cjs`
- `tests/convergence-mfa.test.cjs`
- `tests/convergence-pipeline.database.cjs`
- `tests/convergence-privileges.database.cjs`
- `tests/core-engine.database.cjs`
- `tests/core-engine.test.cjs`
- `tests/creative-bridge.database.cjs`
- `tests/creative-bridge.test.cjs`
- `tests/creative-continuity.database.cjs`
- `tests/creative-continuity.test.cjs`
- `tests/creative-delivery.test.cjs`
- `tests/creative-hq-bridge.test.cjs`
- `tests/creative-lifecycle.database.cjs`
- `tests/creative-media-import.test.cjs`
- `tests/creative-projects-api.test.cjs`
- `tests/creative-register.test.cjs`
- `tests/crm-attribution-contracts.test.cjs`
- `tests/crm-attribution.database.cjs`
- `tests/crm-business-day.test.cjs`
- `tests/crm-client-editor.test.cjs`
- `tests/crm-client-product-links.test.cjs`
- `tests/crm-commercial-journey.test.cjs`
- `tests/crm-flow.database.cjs`
- `tests/crm-intel-numeric-guard.test.cjs`
- `tests/crm-intel.test.cjs`
- `tests/crm-intelligence.browser.cjs`
- `tests/crm-intelligence.database.cjs`
- `tests/crm-kanban.test.cjs`
- `tests/crm-lead-attachments.test.cjs`
- `tests/crm-pipeline-first.test.cjs`
- `tests/crm-theme-parity.test.cjs`
- `tests/crm-timeline-window.test.cjs`
- `tests/crm-titan.database.cjs`
- `tests/crm-titan.test.cjs`
- `tests/crm.database.cjs`
- `tests/crm.integration.cjs`
- `tests/crm.pipeline.database.cjs`
- `tests/crm.test.cjs`
- `tests/definer-gates.test.cjs`
- `tests/definer-privilege-regression.test.cjs`
- `tests/definer-privileges.database.cjs`
- `tests/dev-bridge-ledger.browser.cjs`
- `tests/dev-bridge-ledger.database.cjs`
- `tests/dev-bridge-ledger.test.cjs`
- `tests/dev-bridge-provider-links.test.cjs`
- `tests/dev-bridge/cache.test.cjs`
- `tests/dev-bridge/continuity.test.cjs`
- `tests/dev-bridge/core.test.cjs`
- `tests/dev-bridge/noise.test.cjs`
- `tests/dev-bridge/preflight.test.cjs`
- `tests/docs-only-ci.test.cjs`
- `tests/finance-finite.database.cjs`
- `tests/finance-kpi-labels.test.cjs`
- `tests/fixture-child-cleanup.test.cjs`
- `tests/forge-website-draft.test.cjs`
- `tests/forge-website-template.test.cjs`
- `tests/fv2-capacity.database.cjs`
- `tests/fv2-commercial-chain.database.cjs`
- `tests/fv2-intake-matrix.database.cjs`
- `tests/fv2-intake-matrix.test.cjs`
- `tests/fv2-migrations.database.cjs`
- `tests/growth-funnel.database.cjs`
- `tests/growth-funnel.test.cjs`
- `tests/higgsfield-bridge-entry.test.cjs`
- `tests/higgsfield-handoff.test.cjs`
- `tests/hq-executive-caps.test.cjs`
- `tests/i18n-date.test.cjs`
- `tests/inbound-inbox.test.cjs`
- `tests/inbound-location.test.cjs`
- `tests/inbound-navigation.browser.cjs`
- `tests/inbound-seed.database.cjs`
- `tests/independent-qa/integrity.database.cjs`
- `tests/infinity-restore.database.cjs`
- `tests/infinity-routes.integration.cjs`
- `tests/inquiry-history.database.cjs`
- `tests/inquiry-presentation.test.cjs`
- `tests/inquiry-triage.test.cjs`
- `tests/intake-role.database.cjs`
- `tests/lead-drawer-scroll.browser.cjs`
- `tests/lead-timeline-i18n.test.cjs`
- `tests/lead-timeline-ui.test.cjs`
- `tests/membership-migration.test.cjs`
- `tests/navigation.test.cjs`
- `tests/nexus-journey.test.cjs`
- `tests/nova-studio.test.cjs`
- `tests/nova/builders-render.test.cjs`
- `tests/nova/builders.test.cjs`
- `tests/nova/components.test.cjs`
- `tests/office-hq-layout.test.cjs`
- `tests/office-hq.browser.cjs`
- `tests/office-manager-free-github.test.cjs`
- `tests/office-manager-free-history.test.cjs`
- `tests/office-manager-freshness.test.cjs`
- `tests/office-manager-work.test.cjs`
- `tests/office.database.cjs`
- `tests/office.test.cjs`
- `tests/omega-missions.test.cjs`
- `tests/operations/mission.database.cjs`
- `tests/orchestrator-activation-gate.test.cjs`
- `tests/os-projects-modules.database.cjs`
- `tests/os.test.cjs`
- `tests/owner-hq-usage-priority.test.cjs`
- `tests/owner-identity.test.cjs`
- `tests/owner-messages.test.cjs`
- `tests/password-login-hotfix.test.cjs`
- `tests/pipeline-board.database.cjs`
- `tests/pipeline-board.test.cjs`
- `tests/pipeline-groups.test.cjs`
- `tests/pipeline-timeline.test.cjs`
- `tests/portfolio-server-search.test.cjs`
- `tests/prod-schema-compat.browser.cjs`
- `tests/product-client-identity-recovery.test.cjs`
- `tests/product-control-upload-route.test.cjs`
- `tests/product-control.test.cjs`
- `tests/product-delivery.database.cjs`
- `tests/product-delivery.test.cjs`
- `tests/product-report-recovery.test.cjs`
- `tests/product-verification-recovery.test.cjs`
- `tests/profile-menu.test.cjs`
- `tests/project-bridge-import.test.cjs`
- `tests/project-bridge-preview.browser.cjs`
- `tests/project-bridge-receipt.test.cjs`
- `tests/project-bridge-service.database.cjs`
- `tests/project-bridge-vercel.test.cjs`
- `tests/project-bridge.database.cjs`
- `tests/project-client-link.database.cjs`
- `tests/project-operations.test.cjs`
- `tests/prospect-link.test.cjs`
- `tests/public-experience.browser.cjs`
- `tests/public-inquiry.database.cjs`
- `tests/public-seo.test.cjs`
- `tests/public-universe.test.cjs`
- `tests/quick-improvements/mobile.browser.cjs`
- `tests/quote-antibot.test.cjs`
- `tests/quote-chatbot-catalog.test.cjs`
- `tests/quote-delete.browser.cjs`
- `tests/quote-delete.database.cjs`
- `tests/quote-estimators.test.cjs`
- `tests/quotes.browser.cjs`
- `tests/quotes.database.cjs`
- `tests/quotes.test.cjs`
- `tests/radar-approval.database.cjs`
- `tests/radar-dns.test.cjs`
- `tests/radar-geoapify.test.cjs`
- `tests/radar-geocode.test.cjs`
- `tests/radar-guidance-motion.test.cjs`
- `tests/radar-hibernation.test.cjs`
- `tests/radar-intelligence.test.cjs`
- `tests/radar-map-tiles.test.cjs`
- `tests/radar-pause.test.cjs`
- `tests/radar-profile.database.cjs`
- `tests/radar-qualification.test.cjs`
- `tests/radar-research.database.cjs`
- `tests/radar-research.test.cjs`
- `tests/radar-rules.database.cjs`
- `tests/radar-search-runs.database.cjs`
- `tests/radar-server-scheduler.database.cjs`
- `tests/radar-server-scheduler.test.cjs`
- `tests/radar.database.cjs`
- `tests/radar.test.cjs`
- `tests/react-hydration-backport.test.cjs`
- `tests/restore-grant.database.cjs`
- `tests/sales-center-candidates.test.cjs`
- `tests/sales-center.browser.cjs`
- `tests/sales-center.database.cjs`
- `tests/sales-center.test.cjs`
- `tests/sales-closing.test.cjs`
- `tests/sales-invoice.browser.cjs`
- `tests/sales-payment-terms.test.cjs`
- `tests/sales-quote-acceptance.test.cjs`
- `tests/sales-schedule.browser.cjs`
- `tests/sales-schedule.database.cjs`
- `tests/sales-schedule.test.cjs`
- `tests/sales.browser.cjs`
- `tests/sales.database.cjs`
- `tests/sales.test.cjs`
- `tests/schema-fingerprint.database.cjs`
- `tests/security-baseline.test.cjs`
- `tests/security-reporting.test.cjs`
- `tests/security-workflow-pins.test.cjs`
- `tests/security.test.cjs`
- `tests/shared-calendar.test.cjs`
- `tests/stable-v1-independent/financial-boundaries.database.cjs`
- `tests/stable-v1-independent/proposed-finite-guard.database.cjs`
- `tests/stable-v1-independent/responsive.browser.cjs`
- `tests/staff-availability-persistence.test.cjs`
- `tests/staff-calendar.database.cjs`
- `tests/staff-design.test.cjs`
- `tests/staff-invite-action.test.cjs`
- `tests/staff-invite-signature.test.cjs`
- `tests/staff-invite.test.cjs`
- `tests/staff-mfa-enrollment.test.cjs`
- `tests/staff-portal.browser.cjs`
- `tests/staff-portal.database.cjs`
- `tests/staff-portal.test.cjs`
- `tests/staff-presence.test.cjs`
- `tests/staff-seller-pipeline.database.cjs`
- `tests/staff-work.test.cjs`
- `tests/staff.test.cjs`
- `tests/suite-poll-policy.test.cjs`
- `tests/task-links.test.cjs`
- `tests/task-owner-single-route.test.cjs`
- `tests/turnstile-login.test.cjs`
- `tests/unified.database.cjs`
- `tests/usage-units.test.cjs`
- `tests/vercel-ignore-build.test.cjs`

## Esquema reconstruido en PGlite

124 tablas de public y crm_private tras aplicar la cadena local. Las claves de destino se leen de pg_constraint. RLS es el indicador de la tabla y requiere revisión conjunta de sus políticas y privilegios.

| Tabla | RLS | Referencias |
|---|---|---|
| `crm_private.finance_access` | Sí | auth.users |
| `crm_private.quote_acceptances` | No | crm_quote_versions |
| `crm_private.quote_commercial_approvals` | No | crm_quote_versions |
| `public.agency_memberships` | Sí | auth.users |
| `public.avalon_company_settings` | Sí | auth.users |
| `public.crm_activities` | Sí | auth.users, crm_clients, crm_leads |
| `public.crm_agent_capabilities` | Sí |  |
| `public.crm_agent_missions` | Sí | auth.users |
| `public.crm_agent_runs` | Sí | auth.users, crm_agent_capabilities, crm_agent_missions |
| `public.crm_agent_settings` | Sí | auth.users |
| `public.crm_agent_task_links` | Sí | crm_agent_runs, crm_tasks |
| `public.crm_ai_memory` | Sí | crm_ai_worker_profiles |
| `public.crm_ai_tasks` | Sí | crm_ai_worker_profiles |
| `public.crm_ai_usage` | Sí |  |
| `public.crm_ai_worker_profiles` | Sí |  |
| `public.crm_attachments` | Sí | auth.users, crm_clients, crm_leads |
| `public.crm_attributed_conversions` | Sí | auth.users, crm_clients, crm_commercial_terms, crm_contracts |
| `public.crm_attribution_events` | Sí | auth.users, crm_attributed_conversions |
| `public.crm_audit` | Sí | auth.users |
| `public.crm_automation_rules` | Sí | auth.users |
| `public.crm_b2c_request_events` | Sí | crm_b2c_requests |
| `public.crm_b2c_requests` | Sí | crm_b2c_target_policies, crm_clients, os_projects |
| `public.crm_b2c_target_policies` | Sí | crm_clients, os_projects |
| `public.crm_calendar_banners` | Sí | auth.users |
| `public.crm_client_agreement_drafts` | Sí | auth.users, crm_clients, crm_quote_versions |
| `public.crm_client_costs` | Sí | auth.users, crm_clients |
| `public.crm_client_documents` | Sí | auth.users, crm_client_onboardings, crm_clients, os_projects |
| `public.crm_client_journal` | Sí | auth.users, crm_clients |
| `public.crm_client_journal_revisions` | Sí | auth.users, crm_client_journal, crm_clients |
| `public.crm_client_onboardings` | Sí | auth.users, crm_clients, crm_invoices, crm_sales, os_projects |
| `public.crm_client_workspace` | Sí | auth.users, crm_clients |
| `public.crm_client_workspace_revisions` | Sí | auth.users, crm_clients |
| `public.crm_clients` | Sí | agency_memberships, auth.users, crm_leads |
| `public.crm_commercial_terms` | Sí | auth.users, crm_leads |
| `public.crm_commissions` | Sí | agency_memberships, auth.users, crm_clients, crm_sales |
| `public.crm_contacts` | Sí | auth.users, crm_clients |
| `public.crm_contract_events` | Sí | auth.users, crm_contracts, crm_leads |
| `public.crm_contracts` | Sí | auth.users, crm_attachments, crm_client_agreement_drafts, crm_commercial_terms, crm_leads, crm_quote_versions |
| `public.crm_conversions` | Sí | auth.users, crm_clients, crm_leads |
| `public.crm_departments` | Sí |  |
| `public.crm_email_outbox` | Sí | auth.users, crm_client_onboardings, crm_clients |
| `public.crm_events` | Sí | agency_memberships, auth.users, crm_clients, crm_leads |
| `public.crm_growth_funnel_submissions` | Sí | crm_growth_funnels, crm_leads |
| `public.crm_growth_funnels` | Sí | agency_memberships, crm_clients, os_projects |
| `public.crm_invoices` | Sí | auth.users, crm_attachments, crm_clients, crm_sales |
| `public.crm_lead_assessment_revisions` | Sí | auth.users, crm_lead_assessments, crm_leads |
| `public.crm_lead_assessments` | Sí | auth.users, crm_leads |
| `public.crm_lead_recommendations` | Sí | auth.users, crm_leads |
| `public.crm_lead_scores` | Sí | auth.users, crm_lead_assessments, crm_leads |
| `public.crm_lead_stage_history` | Sí | crm_leads, crm_stages |
| `public.crm_leads` | Sí | agency_memberships, auth.users, crm_prospects, crm_stages |
| `public.crm_notifications` | Sí | agency_memberships, crm_clients, crm_sales, crm_tasks |
| `public.crm_payment_refunds` | Sí | auth.users, crm_payments, crm_sales |
| `public.crm_payments` | Sí | auth.users, crm_invoices, crm_sale_installments, crm_sales |
| `public.crm_prospect_approvals` | Sí | auth.users, crm_prospects |
| `public.crm_prospect_needs` | Sí | auth.users, crm_prospects |
| `public.crm_prospects` | Sí | agency_memberships, auth.users, crm_leads, crm_radar_campaigns |
| `public.crm_public_inquiries` | Sí | auth.users, crm_prospects |
| `public.crm_public_inquiry_reviews` | Sí | auth.users, crm_public_inquiries |
| `public.crm_quote_deletion_requests` | Sí | auth.users, crm_leads, crm_quotes |
| `public.crm_quote_events` | Sí | auth.users, crm_quotes |
| `public.crm_quote_versions` | Sí | auth.users, crm_quotes |
| `public.crm_quotes` | Sí | auth.users, crm_clients, crm_leads |
| `public.crm_radar_campaigns` | Sí | agency_memberships, auth.users |
| `public.crm_radar_decisions` | Sí | auth.users, crm_leads, crm_prospect_approvals, crm_prospects, crm_radar_rule_sets |
| `public.crm_radar_research_reports` | Sí | auth.users, crm_prospects |
| `public.crm_radar_rule_sets` | Sí | auth.users |
| `public.crm_radar_run_places` | Sí | crm_prospects, crm_radar_runs |
| `public.crm_radar_runs` | Sí | auth.users, crm_radar_campaigns |
| `public.crm_radar_worker_config` | Sí |  |
| `public.crm_radar_worker_runs` | Sí |  |
| `public.crm_sale_installments` | Sí | auth.users, crm_sales |
| `public.crm_sale_lines` | Sí | agency_memberships, auth.users, crm_departments, crm_sales, crm_service_catalog |
| `public.crm_sale_settlements` | Sí | auth.users, crm_sale_variable_terms, crm_sales |
| `public.crm_sale_terms` | Sí | auth.users, crm_quote_versions, crm_quotes, crm_sales |
| `public.crm_sale_variable_terms` | Sí | crm_clients, crm_sales |
| `public.crm_sales` | Sí | agency_memberships, auth.users, crm_clients, crm_leads, crm_quote_versions, crm_quotes |
| `public.crm_service_catalog` | Sí | agency_memberships, auth.users, crm_departments |
| `public.crm_stages` | Sí |  |
| `public.crm_task_comments` | Sí | auth.users, crm_tasks |
| `public.crm_tasks` | Sí | agency_memberships, auth.users, crm_clients, crm_departments, crm_sales, crm_work_orders, os_projects |
| `public.crm_testimonial_consents` | Sí | auth.users, crm_clients |
| `public.crm_timeline` | Sí |  |
| `public.crm_usage` | Sí | auth.users |
| `public.crm_work_orders` | Sí | agency_memberships, auth.users, crm_clients, crm_departments, crm_sale_lines, crm_sales, os_projects |
| `public.dev_bridge_agents` | Sí | auth.users |
| `public.dev_bridge_commitment_events` | Sí | auth.users, dev_bridge_commitments |
| `public.dev_bridge_commitments` | Sí | auth.users |
| `public.dev_bridge_events` | Sí | auth.users, dev_bridge_agents, dev_bridge_sessions |
| `public.dev_bridge_people` | Sí | auth.users |
| `public.dev_bridge_sessions` | Sí | dev_bridge_agents |
| `public.dev_bridge_time_entries` | Sí | auth.users, dev_bridge_time_entries |
| `public.office_agent_requests` | Sí | agency_memberships |
| `public.office_availability` | Sí | agency_memberships |
| `public.office_messages` | Sí | agency_memberships |
| `public.office_profiles` | Sí | agency_memberships |
| `public.office_time_off` | Sí | agency_memberships |
| `public.os_audit` | Sí |  |
| `public.os_code_deliveries` | Sí | os_private.acx_blobs, os_project_api_tokens |
| `public.os_code_events` | Sí | os_code_deliveries, os_code_mainline, os_project_api_tokens |
| `public.os_code_mainline` | Sí | os_private.acx_blobs, os_project_api_tokens |
| `public.os_marketing_items` | Sí | auth.users, os_projects |
| `public.os_project_api_tokens` | Sí | auth.users |
| `public.os_project_deployments` | Sí | auth.users, os_project_publish_approvals, os_project_versions, os_projects |
| `public.os_project_events` | Sí | auth.users, os_project_deployments, os_project_imports, os_project_versions, os_projects |
| `public.os_project_files` | Sí | os_project_versions |
| `public.os_project_imports` | Sí | auth.users, os_project_api_tokens, os_project_versions, os_projects |
| `public.os_project_publish_approvals` | Sí | auth.users, os_project_versions, os_projects |
| `public.os_project_versions` | Sí | auth.users, os_project_imports, os_project_versions, os_projects |
| `public.os_projects` | Sí | auth.users, crm_clients |
| `public.os_receptionist_entries` | Sí | auth.users, os_projects |
| `public.os_store_products` | Sí | auth.users, os_projects |
| `public.os_website_page_versions` | Sí | auth.users, os_website_pages |
| `public.os_website_pages` | Sí | auth.users, os_projects |
| `public.staff_casefiles` | Sí | agency_memberships, crm_clients |
| `public.staff_client_grants` | Sí | agency_memberships, crm_clients |
| `public.staff_contacts` | Sí | agency_memberships |
| `public.staff_lead_grants` | Sí | agency_memberships, crm_leads |
| `public.staff_notes` | Sí | agency_memberships, crm_clients, crm_leads, staff_work_items |
| `public.staff_permission_events` | Sí | agency_memberships |
| `public.staff_portal_access` | Sí | agency_memberships |
| `public.staff_private_messages` | Sí | agency_memberships |
| `public.staff_work_item_shares` | Sí | agency_memberships, staff_work_items |
| `public.staff_work_items` | Sí | agency_memberships, crm_clients, crm_leads |

## Funciones del esquema local · 215

Catálogo sin funciones pertenecientes a extensiones. La presencia de una función no demuestra que un rol pueda ejecutarla.

- `crm_agent_capability_set(text,text,boolean)` · definer
- `crm_agent_claim(uuid)` · definer
- `crm_agent_complete(uuid,text,jsonb,jsonb)` · definer
- `crm_agent_enqueue(text,text,text)` · definer
- `crm_agent_fail(uuid,text)` · definer
- `crm_agent_mission_start(text,jsonb,text)` · definer
- `crm_agent_retry(uuid)` · definer
- `crm_agent_run_now(text,text,text)` · definer
- `crm_agent_security_posture()` · definer
- `crm_agent_security_posture_internal()` · definer
- `crm_agent_set_automatic(boolean)` · definer
- `crm_agent_set_kill_switch(boolean)` · definer
- `crm_ai_public_control()` · definer
- `crm_ai_set_enabled(boolean)` · definer
- `crm_ai_set_suspended(text,boolean)` · definer
- `crm_assessment_save(uuid,text,text,jsonb,text,integer)` · invoker
- `crm_attribution_advance(uuid,text,text,integer)` · definer
- `crm_attribution_record(jsonb)` · definer
- `crm_attribution_set_period(uuid,date,date)` · definer
- `crm_attribution_summary(uuid)` · invoker
- `crm_attribution_transition(uuid,text,text)` · definer
- `crm_chargeback_resolve(uuid,text,text)` · definer
- `crm_client_finance_ledger(uuid)` · invoker
- `crm_client_finance_summary(uuid)` · invoker
- `crm_client_opportunity_capability()` · invoker
- `crm_commission_agree(jsonb)` · definer
- `crm_commission_transition(uuid,text,text)` · definer
- `crm_confirm_sale(jsonb)` · definer
- `crm_convert_lead_to_client(uuid,text,text,text[])` · definer
- `crm_convert_prospect(uuid)` · invoker
- `crm_decide_quote_deletion(uuid,text,boolean)` · definer
- `crm_ensure_client_opportunity(uuid)` · definer
- `crm_growth_funnel_submit(jsonb)` · definer
- `crm_growth_funnel_view(text)` · definer
- `crm_invoice_record(jsonb)` · definer
- `crm_invoice_void(uuid,text)` · definer
- `crm_lead_assign_seller(uuid,uuid)` · definer
- `crm_lead_duplicate_candidates(text,text,text,text)` · invoker
- `crm_link_verified_quote_contract(uuid,uuid,uuid)` · definer
- `crm_my_capabilities()` · invoker
- `crm_overdue_collection_metrics()` · invoker
- `crm_owner_directory()` · definer
- `crm_payment_refund(jsonb)` · definer
- `crm_payment_reverse(uuid,text)` · definer
- `crm_payment_verify(uuid,text)` · definer
- `crm_private.agent_daily_steps()` · invoker
- `crm_private.agent_execute(uuid)` · definer
- `crm_private.agent_mission_advance(uuid)` · definer
- `crm_private.agent_mission_create(text,jsonb,text,uuid,text)` · definer
- `crm_private.agent_process(uuid)` · definer
- `crm_private.agent_scheduler_tick()` · definer
- `crm_private.agreement_quote_guard()` · invoker
- `crm_private.ai_assert_worker_allowed()` · definer
- `crm_private.amount(text,numeric)` · invoker
- `crm_private.assert_approved_offer(text)` · invoker
- `crm_private.attachment_integrity()` · invoker
- `crm_private.attachment_quota()` · invoker
- `crm_private.audit()` · definer
- `crm_private.b2c_log_event()` · definer
- `crm_private.b2c_policy_guard()` · invoker
- `crm_private.b2c_request_guard()` · invoker
- `crm_private.begin_seller_act()` · definer
- `crm_private.calendar_banner_stamp()` · invoker
- `crm_private.calendar_owner_exists(uuid)` · definer
- `crm_private.calendar_staff_alert()` · definer
- `crm_private.can_view_client_finances()` · definer
- `crm_private.catalog_offer_guard()` · invoker
- `crm_private.check_quote_offers(uuid)` · invoker
- `crm_private.client_journal_audit()` · definer
- `crm_private.client_journal_stamp()` · invoker
- `crm_private.client_link_projects()` · definer
- `crm_private.client_workspace_audit()` · definer
- `crm_private.client_workspace_stamp()` · invoker
- `crm_private.commission_events()` · definer
- `crm_private.commission_guard()` · invoker
- `crm_private.consent_guard()` · invoker
- `crm_private.contract_agreement_guard()` · invoker
- `crm_private.contract_events()` · definer
- `crm_private.contract_guard()` · invoker
- `crm_private.day(text,date)` · invoker
- `crm_private.default_owner()` · definer
- `crm_private.dev_bridge_me()` · definer
- `crm_private.document_immutable()` · invoker
- `crm_private.enrolled_mfa_satisfied()` · definer
- `crm_private.event_conflict()` · invoker
- `crm_private.growth_funnel_touch()` · invoker
- `crm_private.installment_state(uuid)` · definer
- `crm_private.invoice_link(uuid)` · definer
- `crm_private.is_operator(uuid)` · definer
- `crm_private.is_owner()` · invoker
- `crm_private.is_seller()` · definer
- `crm_private.lead_last_interaction()` · invoker
- `crm_private.lead_score_apply()` · definer
- `crm_private.lead_stage()` · invoker
- `crm_private.lead_stage_history()` · definer
- `crm_private.log(text,text,text,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text)` · definer
- `crm_private.norm(text)` · invoker
- `crm_private.norm_company(text)` · invoker
- `crm_private.notify(uuid,text,text,text,text,text,text,uuid,uuid,uuid)` · definer
- `crm_private.office_availability_guard()` · invoker
- `crm_private.office_message_guard()` · invoker
- `crm_private.office_message_staff_alert()` · definer
- `crm_private.office_profile_stamp()` · invoker
- `crm_private.office_ref_exists(text,uuid)` · invoker
- `crm_private.office_request_guard()` · invoker
- `crm_private.onboarding_acceptance_guard()` · invoker
- `crm_private.onboarding_audit()` · definer
- `crm_private.onboarding_guard()` · invoker
- `crm_private.outbox_audit()` · definer
- `crm_private.outbox_guard()` · invoker
- `crm_private.payment_events()` · definer
- `crm_private.payment_guard()` · invoker
- `crm_private.project_client_lock()` · invoker
- `crm_private.project_resolve_client()` · invoker
- `crm_private.prospect_approval_evidence()` · invoker
- `crm_private.prospect_approval_guard()` · invoker
- `crm_private.public_inquiry_review_guard()` · invoker
- `crm_private.public_inquiry_review_log()` · definer
- `crm_private.quote_check(jsonb,jsonb,text)` · invoker
- `crm_private.quote_deleted_frozen()` · invoker
- `crm_private.quote_transition_allowed(text,text)` · invoker
- `crm_private.quote_variable_terms_gate()` · invoker
- `crm_private.radar_guard()` · invoker
- `crm_private.radar_log_decision(uuid,integer,text,text[],uuid)` · invoker
- `crm_private.radar_log_decision(uuid,integer,text,text[],uuid,uuid,uuid)` · invoker
- `crm_private.radar_profile_rescore()` · invoker
- `crm_private.radar_rescore()` · invoker
- `crm_private.radar_tier(uuid)` · invoker
- `crm_private.record_prospect_approval(uuid,uuid,text,text)` · definer
- `crm_private.revoke_prospect_approval(uuid)` · definer
- `crm_private.rule_on(text)` · invoker
- `crm_private.sale_lead_company_guard()` · invoker
- `crm_private.sale_settled_due(uuid)` · definer
- `crm_private.sale_terms_immutable()` · invoker
- `crm_private.seller_acting()` · definer
- `crm_private.seller_can(text)` · definer
- `crm_private.seller_owns_lead(uuid)` · definer
- `crm_private.seller_owns_quote(uuid)` · definer
- `crm_private.staff_active()` · invoker
- `crm_private.staff_casefile_stamp()` · invoker
- `crm_private.staff_contact_revoke()` · invoker
- `crm_private.staff_item_audit()` · invoker
- `crm_private.staff_item_guard()` · invoker
- `crm_private.staff_item_visible(uuid)` · invoker
- `crm_private.staff_lead_grant_audit()` · invoker
- `crm_private.staff_message_guard()` · invoker
- `crm_private.staff_mfa_satisfied()` · definer
- `crm_private.staff_own_commercial_history()` · definer
- `crm_private.staff_permissions_audit()` · invoker
- `crm_private.staff_shared_with_me(uuid)` · definer
- `crm_private.staff_text(jsonb,text,integer)` · invoker
- `crm_private.stage_followup()` · invoker
- `crm_private.stage_guard()` · invoker
- `crm_private.stamp()` · invoker
- `crm_private.task_before()` · invoker
- `crm_private.task_events()` · definer
- `crm_private.task_links_guard()` · invoker
- `crm_private.uuid_or_null(text)` · invoker
- `crm_private.valid_template(jsonb)` · invoker
- `crm_private.won_requires_contract()` · invoker
- `crm_private.work_order_events()` · definer
- `crm_prospect_approve(uuid,text)` · definer
- `crm_public_inquiry(jsonb)` · definer
- `crm_quote_close_sale(jsonb)` · definer
- `crm_quote_create(uuid,uuid,jsonb,jsonb,text)` · definer
- `crm_quote_delete(uuid,integer,text)` · definer
- `crm_quote_revise(uuid,integer,jsonb,jsonb,text,text)` · definer
- `crm_quote_summary()` · invoker
- `crm_quote_transition(uuid,integer,text,text)` · definer
- `crm_radar_ingest(jsonb,text,uuid,jsonb)` · definer
- `crm_radar_record_failure(text,jsonb,text,text)` · definer
- `crm_radar_rules_publish(integer,text,integer,integer,text)` · definer
- `crm_radar_worker_convert_verified(uuid)` · invoker
- `crm_radar_worker_record_website_need(uuid)` · invoker
- `crm_record_sale_failure(uuid,text)` · definer
- `crm_refresh_alerts()` · definer
- `crm_register_client_with_opportunity(jsonb)` · definer
- `crm_sale_schedule_set(uuid,jsonb,integer,text)` · definer
- `crm_sale_settlement_record(jsonb)` · definer
- `crm_sale_settlement_transition(uuid,text,text)` · definer
- `crm_sales_metrics()` · invoker
- `crm_sales_with_receivables(text)` · invoker
- `dev_bridge_agent_event(text,jsonb)` · definer
- `dev_bridge_agent_token(text,text,text,integer)` · definer
- `dev_bridge_claim_owner(text)` · definer
- `dev_bridge_commitment_create(text,text,text,date,date,text,integer)` · definer
- `dev_bridge_commitment_transition(uuid,text,text,text,date,integer)` · definer
- `dev_bridge_declare_time(date,integer,text,integer,text,uuid,text)` · definer
- `dev_bridge_import_github(jsonb)` · definer
- `dev_bridge_record(jsonb)` · definer
- `office_directory()` · definer
- `os_bridge_api_import_status(text,uuid,boolean)` · definer
- `os_bridge_api_open_import(text,text,text,text,text,text)` · definer
- `os_code_get_chunk(text,integer,text)` · definer
- `os_code_head(text)` · definer
- `os_code_inbox(text,text)` · definer
- `os_code_my_deliveries(text)` · definer
- `os_code_publish(text,text,text,text,jsonb,uuid[],text)` · definer
- `os_code_put_chunk(text,bigint,integer,text,text)` · definer
- `os_code_review(uuid,text,text)` · definer
- `os_code_set_preview(bigint,text,text)` · definer
- `os_code_set_status(uuid,text,jsonb,text)` · definer
- `os_code_submit(jsonb,text,text)` · definer
- `os_project_restore_version(uuid,text)` · invoker
- `staff_lead_create(jsonb)` · definer
- `staff_lead_update(uuid,integer,jsonb)` · definer
- `staff_my_leads()` · definer
- `staff_own_commercial_history(integer)` · invoker
- `staff_request_quote_deletion(uuid,integer,text)` · definer
- `staff_seller_catalog()` · definer
- `staff_seller_leads()` · definer
- `staff_seller_quote(uuid)` · definer
- `staff_seller_quotes()` · definer
- `staff_seller_sales()` · definer
- `staff_seller_stages()` · definer
