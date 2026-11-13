-- Avalon Product Control: forward-only category reconciliation for externally made ZIP artifacts.
-- Historical replay caveat: the pre-existing 20261108100000_project_bridge.sql resets os_projects
-- after 20261107090000_ai_chatbots_module.sql, so a clean repository replay has six modules,
-- whereas existing isolated/production databases may already have seven. NEVER edit the old migrations.
-- This migration repairs ONLY an exact recognized legacy constraint, and is a NO-OP if already correct.
-- It does not change privileges, RLS, tokens, storage policies, execution, publication or data rows.
-- Production requires confirmed backup/restore, release authorization and controlled batch rollout.
do $product_control_categories$
declare
  modules_rule text;
  imports_rule text;
  module_values text[];
  import_values text[];
  legacy_modules constant text[] := array['apps','crm_creator','ecommerce','marketing','receptionist','website'];
  all_modules constant text[] := array['apps','chatbots','crm_creator','ecommerce','marketing','receptionist','website'];
  legacy_imports constant text[] := array['apps','crm_creator','ecommerce','website'];
  all_imports constant text[] := array['apps','chatbots','crm_creator','ecommerce','marketing','receptionist','website'];
begin
  if to_regclass('public.os_projects') is null or to_regclass('public.os_project_imports') is null then
    raise exception 'Missing canonical Product Control tables; refusing to create or guess them';
  end if;
  select pg_get_constraintdef(c.oid) into modules_rule from pg_constraint c
    where c.conrelid='public.os_projects'::regclass and c.conname='os_projects_module_check';
  select pg_get_constraintdef(c.oid) into imports_rule from pg_constraint c
    where c.conrelid='public.os_project_imports'::regclass and c.conname='os_project_imports_category_check';
  if modules_rule is null or imports_rule is null then
    raise exception 'Unknown Product Control constraints: reconcile actual DDL first';
  end if;
  select array_agg(m.value[1] order by m.value[1]) into module_values
    from regexp_matches(modules_rule, $$'([^']+)'$$, 'g') as m(value);
  select array_agg(m.value[1] order by m.value[1]) into import_values
    from regexp_matches(imports_rule, $$'([^']+)'$$, 'g') as m(value);
  if module_values is distinct from legacy_modules and module_values is distinct from all_modules then
    raise exception 'Unexpected os_projects module constraint: manual reconciliation required';
  end if;
  if import_values is distinct from legacy_imports and import_values is distinct from all_imports then
    raise exception 'Unexpected os_project_imports category constraint: manual reconciliation required';
  end if;
  if module_values is distinct from all_modules then
    alter table public.os_projects drop constraint os_projects_module_check;
    alter table public.os_projects add constraint os_projects_module_check
      check (module in ('website','ecommerce','crm_creator','receptionist','marketing','apps','chatbots'));
  end if;
  if import_values is distinct from all_imports then
    alter table public.os_project_imports drop constraint os_project_imports_category_check;
    alter table public.os_project_imports add constraint os_project_imports_category_check
      check (category in ('website','ecommerce','crm_creator','apps','receptionist','chatbots','marketing'));
  end if;
end
$product_control_categories$;
-- The application-side AVALON_PRODUCT_CONTROL_EXTENDED_UPLOADS switch must remain OFF
-- until this schema is verified in its target environment and owner approval is recorded.
