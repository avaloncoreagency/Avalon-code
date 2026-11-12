-- Extend the existing owner-only OS project catalog with AI Chatbots.
-- No data migration, service providers, privileges or external messaging.
-- Apply only in an isolated environment first; production requires owner approval.
begin;

alter table public.os_projects
  drop constraint os_projects_module_check;

alter table public.os_projects
  add constraint os_projects_module_check
  check (module in ('website', 'ecommerce', 'crm_creator', 'receptionist', 'marketing', 'apps', 'chatbots'));

-- Keep the existing 'apps' module from the isolated/shared schema as well.\n-- Existing RLS, audit, immutable columns and version triggers are preserved.
commit;
