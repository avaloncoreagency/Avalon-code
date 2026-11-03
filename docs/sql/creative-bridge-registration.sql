-- REVIEW-ONLY SQL PROPOSAL. DO NOT APPLY TO PRODUCTION AUTOMATICALLY.
-- After security review, create a real migration with supabase CLI and test
-- the copied SQL against an isolated, synthetic Supabase preview database.
-- Neither this file nor the creative-bridge route applies database changes.
begin;

-- Atomic, cross-request replay guard, scoped by module and completed source ID.
-- FIRST audit existing rows for duplicates; CREATE UNIQUE INDEX will refuse them.
create unique index if not exists os_projects_higgsfield_source_unique
  on public.os_projects (module, (settings #>> '{creative,external_ref}'))
  where (settings #>> '{creative,provider}') = 'higgsfield'
    and (settings #>> '{creative,external_ref}') is not null;

-- This routine is reachable ONLY by the server-side service_role key, never by
-- anon/authenticated or the agents. SECURITY INVOKER retains caller privileges.
-- It creates a draft product and links a lead in ONE transaction; no sale writes.
create or replace function public.os_receive_creative_delivery(
  p_module text,
  p_source_ref text,
  p_company_name text,
  p_existing_lead_id uuid,
  p_product_name text,
  p_description text,
  p_project_url text,
  p_repository_url text,
  p_owner_id uuid,
  p_agent text
) returns jsonb
language plpgsql security invoker set search_path = ''
as $function$
declare
  v_project record;
  v_project_id uuid;
  v_lead_id uuid;
  v_existing_company text;
  v_match_count integer;
  v_daily_count integer;
  v_lead_created boolean := false;
  v_settings jsonb;
begin
  if current_user <> 'service_role' then
    raise exception 'machine endpoint only' using errcode = '42501';
  end if;
  if p_module not in ('website', 'ecommerce', 'crm_creator')
    or p_agent not in ('codex', 'claude')
    or p_source_ref is null or length(p_source_ref) > 120
    or p_source_ref !~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$'
    or p_company_name is null or length(btrim(p_company_name)) not between 1 and 200
    or p_company_name ~ '[[:cntrl:]]' or position('@' in p_company_name) > 0
    or p_product_name is null or length(btrim(p_product_name)) not between 1 and 120
    or p_description is null or length(p_description) > 2000
    or p_owner_id is null
    or p_project_url is null or length(p_project_url) > 500
    or p_repository_url is null or length(p_repository_url) > 500
    or ((p_project_url = '') and (p_repository_url = ''))
    or (p_project_url <> '' and p_project_url !~ '^https://')
    or (p_repository_url <> '' and p_repository_url !~ '^https://')
  then
    raise exception 'invalid creative delivery' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.agency_memberships where user_id = p_owner_id and role = 'owner'
  ) then
    raise exception 'unknown delivery owner' using errcode = '42501';
  end if;

  -- The duplicate check is serialized even if two agents submit concurrently.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('avalon-creative-source:' || p_module || ':' || p_source_ref, 0)
  );
  select id, name, settings into v_project
    from public.os_projects
    where module = p_module and settings #>> '{creative,provider}' = 'higgsfield'
      and settings #>> '{creative,external_ref}' = p_source_ref
    limit 1;
  if found then
    v_lead_id := nullif(v_project.settings #>> '{operations,client_lead_id}', '')::uuid;
    select company into v_existing_company from public.crm_leads where id = v_lead_id;
    if v_lead_id is null or lower(btrim(coalesce(v_existing_company, ''))) <> lower(btrim(p_company_name))
      or btrim(v_project.name) <> btrim(p_product_name)
      or (p_existing_lead_id is not null and p_existing_lead_id <> v_lead_id)
    then
      raise exception 'source collision' using errcode = '22023';
    end if;
    return jsonb_build_object('project_id', v_project.id, 'lead_id', v_lead_id,
      'created', false, 'lead_created', false);
  end if;

  -- Small bounded quota prevents a leaked agent key from flooding the CRM.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('avalon-creative-daily-limit', 0)
  );
  select count(*) into v_daily_count
    from public.os_projects
    where settings #>> '{creative,provider}' = 'higgsfield'
      and settings #>> '{creative,ingestion}' = 'signed_agent'
      and created_at >= now() - interval '24 hours';
  if v_daily_count >= 30 then
    raise exception 'creative daily limit exceeded' using errcode = '54000';
  end if;

  -- Serialize company-name creation across distinct source jobs too.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('avalon-creative-company:' || lower(btrim(p_company_name)), 0)
  );
  if p_existing_lead_id is not null then
    select id, company into v_lead_id, v_existing_company
      from public.crm_leads where id = p_existing_lead_id and not archived;
    if v_lead_id is null or lower(btrim(v_existing_company)) <> lower(btrim(p_company_name)) then
      raise exception 'lead identity mismatch' using errcode = '22023';
    end if;
  else
    select count(*), min(id) into v_match_count, v_lead_id
      from public.crm_leads
      where not archived and lower(btrim(company)) = lower(btrim(p_company_name));
    if v_match_count > 1 then
      raise exception 'ambiguous company identity' using errcode = '22023';
    end if;
    if v_match_count = 0 then
      -- These fields are deliberately blank: no invented person, email or sale.
      -- created_by assigns ownership on behalf of the signed agent integration;
      -- the creative source fields below preserve integration attribution.
      insert into public.crm_leads
        (company, contact, email, phone, source, owner_id, created_by,
         stage_id, value, probability, priority)
      values
        (btrim(p_company_name), '', null, '', 'Avalon OS - Higgsfield agent',
         p_owner_id, p_owner_id, 'new', 0, 0, 'normal')
      returning id into v_lead_id;
      v_lead_created := true;
    end if;
  end if;

  v_settings := case p_module
    when 'ecommerce' then jsonb_build_object('currency', 'USD')
    when 'crm_creator' then jsonb_build_object('blueprint',
      jsonb_build_object('schemaVersion', 1, 'entities', '[]'::jsonb,
        'pipelines', '[]'::jsonb, 'roles', '[]'::jsonb))
    else '{}'::jsonb
  end;
  v_settings := v_settings || jsonb_build_object(
    'operations', jsonb_build_object(
      'client_lead_id', v_lead_id::text,
      'responsible', '', 'url', p_project_url, 'repository', p_repository_url,
      'deployment', '', 'integrations', '', 'resources', '', 'tasks', '',
      'important_dates', ''
    ),
    'creative', jsonb_build_object(
      'provider', 'higgsfield', 'external_ref', p_source_ref,
      'agent', p_agent, 'ingestion', 'signed_agent',
      'state', 'reference_only', 'added_at', now()
    )
  );
  insert into public.os_projects
    (module, name, description, status, settings, created_by)
  values (p_module, btrim(p_product_name), p_description, 'draft', v_settings, p_owner_id)
  returning id into v_project_id;

  return jsonb_build_object('project_id', v_project_id, 'lead_id', v_lead_id,
    'created', true, 'lead_created', v_lead_created);
end;
$function$;

-- Explicitly remove Postgres's default PUBLIC EXECUTE grant on new functions.
revoke all on function public.os_receive_creative_delivery(
  text, text, text, uuid, text, text, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.os_receive_creative_delivery(
  text, text, text, uuid, text, text, text, text, uuid, text
) to service_role;
commit;
