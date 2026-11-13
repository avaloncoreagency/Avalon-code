-- Operation Phoenix (2026-11-13): restore 'chatbots' in os_projects_module_check for fresh installs.
-- 20261108100000_project_bridge re-created the check WITHOUT 'chatbots', silently undoing 20261107090000_ai_chatbots_module
-- on any database built from the repo chain (production and the isolated staging branch already allow it, because there
-- the chatbots migration ran after project_bridge). Idempotent: same final constraint everywhere; no row is touched.
alter table public.os_projects drop constraint if exists os_projects_module_check;
alter table public.os_projects add constraint os_projects_module_check
  check (module in ('website', 'ecommerce', 'crm_creator', 'receptionist', 'marketing', 'apps', 'chatbots'));
