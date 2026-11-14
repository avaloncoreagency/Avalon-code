-- Performance (2026-11-14): indexes for foreign keys the app actually filters or joins on (lists by lead/sale/client,
-- detail pages, cascades and FK checks on parent deletes). Audit-only columns (created_by, updated_by, ...) are left
-- unindexed on purpose: they are rarely queried and every extra index slows writes.
-- Additive and idempotent: no data, policy or grant changes.
create index if not exists crm_sales_lead_idx on public.crm_sales (lead_id);
create index if not exists crm_sales_seller_idx on public.crm_sales (seller_id);
create index if not exists crm_sale_lines_service_idx on public.crm_sale_lines (service_id);
create index if not exists crm_sale_lines_assignee_idx on public.crm_sale_lines (assignee_id);
create index if not exists crm_tasks_sale_idx on public.crm_tasks (sale_id);
create index if not exists crm_tasks_department_idx on public.crm_tasks (department_id);
create index if not exists crm_work_orders_assignee_idx on public.crm_work_orders (assignee_id);
create index if not exists crm_notifications_client_idx on public.crm_notifications (client_id);
create index if not exists crm_notifications_sale_idx on public.crm_notifications (sale_id);
create index if not exists crm_notifications_task_idx on public.crm_notifications (task_id);
create index if not exists crm_conversions_client_idx on public.crm_conversions (client_id);
create index if not exists crm_prospects_owner_idx on public.crm_prospects (owner_id);
create index if not exists crm_prospects_campaign_idx on public.crm_prospects (campaign_id);
create index if not exists crm_public_inquiries_prospect_idx on public.crm_public_inquiries (prospect_id);
create index if not exists crm_radar_decisions_lead_idx on public.crm_radar_decisions (lead_id);
create index if not exists crm_agent_task_links_run_idx on public.crm_agent_task_links (run_id);
create index if not exists crm_agent_task_links_task_idx on public.crm_agent_task_links (task_id);
create index if not exists crm_lead_assessment_revisions_assessment_idx on public.crm_lead_assessment_revisions (assessment_id);
create index if not exists crm_lead_scores_assessment_idx on public.crm_lead_scores (assessment_id);
create index if not exists crm_contract_events_lead_idx on public.crm_contract_events (lead_id);
create index if not exists crm_contracts_terms_idx on public.crm_contracts (terms_id);
create index if not exists crm_contracts_attachment_idx on public.crm_contracts (attachment_id);
create index if not exists crm_growth_funnels_project_idx on public.crm_growth_funnels (project_id);
create index if not exists crm_b2c_requests_policy_idx on public.crm_b2c_requests (policy_id);
create index if not exists crm_b2c_request_events_request_idx on public.crm_b2c_request_events (request_id);
create index if not exists os_project_imports_version_idx on public.os_project_imports (version_id);
