-- Avalon Product Control: enable storage of externally created communication / marketing ZIP artifacts.
-- Safe, additive category expansion on the EXISTING Project Bridge. No new service, grants,
-- RLS bypass, token scope, storage bucket, code execution, publication, or data deletion.
-- NOT AUTHORIZED FOR PRODUCTION without backup + restore validation and owner release gate.
-- Apply in isolated Supabase first, verify with the Project Bridge regression suites.
do $product_control_category_review$
declare
  modules_rule text;
  imports_rule text;
  label text;
  extended_present integer := 0;
begin
  if to_regclass('public.os_projects') is null or to_regclass('public.os_project_imports') is null then
    raise exception 'Missing canonical Project Control tables; migration must not bootstrap them';
  end if;
  select pg_get_constraintdef(c.oid) into modules_rule from pg_constraint c
   where c.conrelid = 'public.os_projects'::regclass and c.conname = 'os_projects_module_check';
  select pg_get_constraintdef(c.oid) into imports_rule from pg_constraint c
   where c.conrelid = 'public.os_project_imports'::regclass and c.conname = 'os_project_imports_category_check';
  if modules_rule is null or imports_rule is null then
    raise exception 'Unknown Project Control constraint shape; manual reconciliation required';
  end if;
  foreach label in array array['website','ecommerce','crm_creator','apps','receptionist','chatbots','marketing'] loop
    if position(quote_literal(label) in modules_rule) = 0 then
      raise exception 'os_projects_module_check lacks category %, refusing to change imports', label;
    end if;
  end loop;
  foreach label in array array['website','ecommerce','crm_creator','apps'] loop
    if position(quote_literal(label) in imports_rule) = 0 then
      raise exception 'os_project_imports_category_check lacks legacy category %, refusing to replace', label;
    end if;
  end loop;
  foreach label in array array['receptionist','chatbots','marketing'] loop
    if position(quote_literal(label) in imports_rule) > 0 then
      extended_present := extended_present + 1;
    end if;
  end loop;
  if extended_present = 3 then
    -- Already expanded: do not lock or rewrite existing constraints.
    return;
  end if;
  if extended_present <> 0 then
    raise exception 'Partial category expansion detected; inspect and reconcile manually';
  end if;
  alter table public.os_project_imports drop constraint os_project_imports_category_check;
  alter table public.os_project_imports add constraint os_project_imports_category_check
    check (category in ('website','ecommerce','crm_creator','apps','receptionist','chatbots','marketing'));
end
$product_control_category_review$;
-- Note: AVALON_PRODUCT_CONTROL_EXTENDED_UPLOADS must remain OFF until this migration
-- is applied to the SPECIFIC target database and the release has been approved.
