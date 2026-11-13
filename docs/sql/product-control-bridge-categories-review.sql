-- AVALON PRODUCT CONTROL - SECURITY REVIEW ONLY, NOT AN APPLIED MIGRATION.
-- Forward-only proposal. Claude Code owns the Supabase migration-history reconciliation.
-- READ-ONLY inspection (2026-11-13): os_projects_module_check ALREADY accepts the
-- seven module categories; os_project_imports_category_check accepts only four.
-- Avoid touching os_projects here: recreating a correct constraint adds lock risk.
-- Reconfirm both constraints against the exact target database before approval.
-- Must first test against an isolated restored schema. Never run via blind db push.
-- This changes no grants, RLS, tokens, storage, execution or publication behavior.
begin;
do $review$
declare
  project_modules text;
  current_imports text;
  category text;
begin
  if to_regclass('public.os_project_imports') is null or to_regclass('public.os_projects') is null then
    raise exception 'Project Bridge and OS projects schema must exist before this migration';
  end if;
  select pg_get_constraintdef(oid) into project_modules from pg_constraint
    where conrelid = 'public.os_projects'::regclass and conname = 'os_projects_module_check';
  select pg_get_constraintdef(oid) into current_imports from pg_constraint
    where conrelid = 'public.os_project_imports'::regclass and conname = 'os_project_imports_category_check';
  if project_modules is null or current_imports is null then
    raise exception 'Unexpected Project Control constraint schema; review manually';
  end if;
  foreach category in array array['website','ecommerce','crm_creator','apps','receptionist','chatbots','marketing'] loop
    if position(quote_literal(category) in project_modules) = 0 then
      raise exception 'os_projects_module_check lacks category %, stop and review', category;
    end if;
  end loop;
end $review$;
alter table public.os_project_imports drop constraint os_project_imports_category_check;
alter table public.os_project_imports add constraint os_project_imports_category_check
  check (category in ('website','ecommerce','crm_creator','apps','receptionist','chatbots','marketing'));
commit;
-- STOP: review actual DDL/RLS, backup + isolated restore, authorized migration batch.
-- Do not enable AVALON_PRODUCT_CONTROL_EXTENDED_UPLOADS until the migration is verified.
