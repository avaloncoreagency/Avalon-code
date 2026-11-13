-- AVALON PRODUCT CONTROL - SECURITY REVIEW ONLY, NOT AN APPLIED MIGRATION.
-- Forward-only proposal; Claude Code owns Supabase migration-history reconciliation.
-- PR #175 must not apply this until an isolated Supabase test and explicit owner release approval.
-- The original Project Bridge importer admits only website/ecommerce/crm_creator/apps.
-- This allows the SAME audited import system to store product artifacts for marketing/agents.
-- Does not change grants, RLS, tokens, storage policies, code execution or publication.
begin;
do $review$
begin
  if to_regclass('public.os_project_imports') is null or to_regclass('public.os_projects') is null then
    raise exception 'Project Bridge and OS projects schema must exist before this migration';
  end if;
end $review$;
alter table public.os_project_imports drop constraint if exists os_project_imports_category_check;
alter table public.os_project_imports add constraint os_project_imports_category_check
  check (category in ('website','ecommerce','crm_creator','apps','receptionist','chatbots','marketing'));
-- Preserve apps and chatbots as well as the original module categories.
alter table public.os_projects drop constraint if exists os_projects_module_check;
alter table public.os_projects add constraint os_projects_module_check
  check (module in ('website','ecommerce','crm_creator','apps','receptionist','chatbots','marketing'));
commit;
-- Must verify against actual production DDL and RLS before publishing;
-- avoid blind db push or rewriting existing migration history.
