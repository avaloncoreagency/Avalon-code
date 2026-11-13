-- Operation Phoenix · ROLLBACK of the 11 pending migrations (generated + verified by scripts/recovery/phoenix-batch-rollback.cjs).
-- Returns production to the 26-migration schema it had on 2026-11-13. Use ONLY if the batch must be undone.
-- WARNING: drops the new tables/columns, so anything written into them after the batch is lost. Existing data is untouched.
begin;
drop trigger if exists crm_leads_won_gate on public.crm_leads;
drop trigger if exists crm_activities_last_interaction on public.crm_activities;
drop trigger if exists crm_tasks_links_guard on public.crm_tasks;
drop trigger if exists crm_attachments_integrity on public.crm_attachments;
drop index if exists public.crm_leads_industry;
drop index if exists public.crm_leads_phone_digits;
drop index if exists public.crm_radar_runs_started;
drop table if exists public.crm_radar_run_places cascade;
drop table if exists public.crm_lead_assessments cascade;
drop table if exists public.crm_growth_funnels cascade;
drop table if exists public.crm_contract_events cascade;
drop table if exists public.crm_lead_recommendations cascade;
drop table if exists public.crm_contracts cascade;
drop table if exists public.crm_lead_scores cascade;
drop table if exists public.crm_lead_assessment_revisions cascade;
drop table if exists public.crm_commercial_terms cascade;
drop table if exists public.crm_growth_funnel_submissions cascade;
drop table if exists public.crm_b2c_target_policies cascade;
drop table if exists public.crm_b2c_requests cascade;
drop table if exists public.crm_b2c_request_events cascade;
alter table public.crm_leads drop column if exists legal_name;
alter table public.crm_leads drop column if exists contact_title;
alter table public.crm_leads drop column if exists google_business_url;
alter table public.crm_leads drop column if exists address;
alter table public.crm_leads drop column if exists city;
alter table public.crm_leads drop column if exists zip;
alter table public.crm_leads drop column if exists specialty;
alter table public.crm_leads drop column if exists service_area;
alter table public.crm_leads drop column if exists origin;
alter table public.crm_leads drop column if exists audience;
alter table public.crm_leads drop column if exists industry_key;
alter table public.crm_leads drop column if exists next_action;
alter table public.crm_leads drop column if exists last_interaction_at;
alter table public.crm_leads drop column if exists diagnosis_status;
alter table public.crm_leads drop column if exists lead_score;
alter table public.crm_leads drop column if exists lead_grade;
alter table public.crm_leads drop column if exists contract_status;
alter table public.crm_radar_runs drop column if exists center_lat;
alter table public.crm_radar_runs drop column if exists center_lon;
alter table public.crm_radar_runs drop column if exists radius_m;
alter table public.crm_radar_runs drop column if exists label;
alter table public.crm_radar_runs drop column if exists query_kind;
alter table public.crm_radar_runs drop column if exists industries;
alter table public.crm_radar_runs drop column if exists provider;
alter table public.crm_radar_runs drop column if exists error_code;
drop function if exists public.crm_my_capabilities() cascade;
drop function if exists public.crm_radar_ingest(jsonb,text,uuid,jsonb) cascade;
drop function if exists public.crm_assessment_save(uuid,text,text,jsonb,text,integer) cascade;
drop function if exists crm_private.lead_score_apply() cascade;
drop function if exists crm_private.contract_guard() cascade;
drop function if exists crm_private.contract_events() cascade;
drop function if exists crm_private.won_requires_contract() cascade;
drop function if exists crm_private.lead_last_interaction() cascade;
drop function if exists crm_private.commission_guard() cascade;
drop function if exists crm_private.commission_events() cascade;
drop function if exists crm_private.norm_company(text) cascade;
drop function if exists crm_private.task_links_guard() cascade;
drop function if exists public.crm_lead_duplicate_candidates(text,text,text,text) cascade;
drop function if exists public.crm_client_finance_summary(uuid) cascade;
drop function if exists public.crm_radar_record_failure(text,jsonb,text,text) cascade;
drop function if exists crm_private.growth_funnel_touch() cascade;
drop function if exists public.crm_growth_funnel_submit(jsonb) cascade;
drop function if exists crm_private.attachment_integrity() cascade;
drop function if exists public.crm_growth_funnel_view(text) cascade;
drop function if exists crm_private.b2c_policy_guard() cascade;
drop function if exists crm_private.b2c_request_guard() cascade;
drop function if exists crm_private.b2c_log_event() cascade;
CREATE OR REPLACE FUNCTION public.crm_public_inquiry(request jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company text := btrim(coalesce(request ->> 'company', ''));
  v_contact text := btrim(coalesce(request ->> 'name', ''));
  v_email text := lower(btrim(coalesce(request ->> 'email', '')));
  v_phone text := btrim(coalesce(request ->> 'phone', ''));
  v_message text := btrim(coalesce(request ->> 'message', ''));
  v_lang text := case when request ->> 'language' = 'en' then 'en' else 'es' end;
  v_services text[];
  v_hash text;
  v_owner uuid;
  v_pid uuid;
begin
  if jsonb_typeof(request) <> 'object' or pg_column_size(request) > 8192 then return 'invalid'; end if;
  -- Honeypot: bots fill hidden fields. Answer "ok" so they learn nothing.
  if coalesce(request ->> 'website_url', '') <> '' then return 'ok'; end if;
  if length(v_company) not between 2 and 200 or length(v_contact) not between 2 and 160 or length(v_message) not between 10 and 2000
     or length(v_phone) > 40 or length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return 'invalid';
  end if;
  select coalesce(array_agg(distinct s), '{}') into v_services from jsonb_array_elements_text(coalesce(request -> 'services', '[]'::jsonb)) s
    where s in ('website', 'ecommerce', 'crm', 'receptionist', 'marketing', 'automation');
  v_hash := encode(sha256(convert_to(v_email, 'UTF8')), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(7251802);
  if (select count(*) from public.crm_public_inquiries i where i.email_hash = v_hash and i.created_at > now() - interval '24 hours') >= 3
     or (select count(*) from public.crm_public_inquiries i where i.created_at > now() - interval '1 hour') >= 30 then
    return 'throttled';
  end if;
  -- Assign to the longest-standing owner; owners re-assign during review.
  select m.user_id into v_owner from public.agency_memberships m where m.role = 'owner' order by m.created_at, m.user_id limit 1;
  if v_owner is null then return 'unavailable'; end if;
  -- Same e-mail already in Lead Hunter: record the request, do not duplicate the business.
  select p.id into v_pid from public.crm_prospects p where lower(btrim(p.email)) = v_email limit 1;
  if v_pid is null then
    -- The stamp/audit triggers require an owner identity: act as the assigned owner inside this definer call only.
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    insert into public.crm_prospects (company, contact, email, phone, source, owner_id, industry, location, opportunity, acquired_at, status, source_kind)
    values (left(v_company, 200), left(v_contact, 160), v_email, left(v_phone, 40), 'Web · solicitud de cotización', v_owner, '', '',
      left('Solicitud web (' || v_lang || ')' || case when cardinality(v_services) > 0 then ' · servicios: ' || array_to_string(v_services, ', ') else '' end || E'\n' || v_message, 1000),
      now(), 'pending', 'web_form')
    returning id into v_pid;
  end if;
  insert into public.crm_public_inquiries (prospect_id, email_hash, services, language) values (v_pid, v_hash, v_services, v_lang);
  return 'ok';
end $function$;
revoke all on function public.crm_public_inquiry(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.crm_public_inquiry(jsonb) to postgres;
grant execute on function public.crm_public_inquiry(jsonb) to anon;
grant execute on function public.crm_public_inquiry(jsonb) to authenticated;
grant execute on function public.crm_public_inquiry(jsonb) to service_role;
CREATE OR REPLACE FUNCTION public.crm_agent_security_posture_internal()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare no_rls jsonb; anon_tables jsonb; anon_fns jsonb; findings jsonb := '[]';
begin
  select coalesce(jsonb_agg(c.relname order by c.relname), '[]') into no_rls from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  select coalesce(jsonb_agg(distinct g.table_name), '[]') into anon_tables from information_schema.role_table_grants g where g.table_schema = 'public' and g.grantee = 'anon';
  select coalesce(jsonb_agg(p.proname order by p.proname), '[]') into anon_fns from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and pg_catalog.has_function_privilege('anon', p.oid, 'execute') and p.proname not in ('crm_public_inquiry', 'crm_ai_public_control', 'os_bridge_api_open_import', 'os_bridge_api_import_status');
  if jsonb_array_length(no_rls) > 0 then findings := findings || jsonb_build_array(jsonb_build_object('severity', 'high', 'finding', 'Tablas públicas sin RLS: ' || no_rls::text)); end if;
  if jsonb_array_length(anon_tables) > 0 then findings := findings || jsonb_build_array(jsonb_build_object('severity', 'high', 'finding', 'Tablas con privilegios para anon: ' || anon_tables::text)); end if;
  if jsonb_array_length(anon_fns) > 0 then findings := findings || jsonb_build_array(jsonb_build_object('severity', 'high', 'finding', 'Funciones con privilegios de definidor ejecutables por anon: ' || anon_fns::text)); end if;
  return jsonb_build_object('findings', findings, 'scope', 'catalog_review_only',
    'owners', (select count(*) from public.agency_memberships where role = 'owner'),
    'non_owner_members', (select count(*) from public.agency_memberships where role <> 'owner'));
end $function$;
revoke all on function public.crm_agent_security_posture_internal() from public, anon, authenticated, service_role;
grant execute on function public.crm_agent_security_posture_internal() to postgres;
grant execute on function public.crm_agent_security_posture_internal() to service_role;
CREATE OR REPLACE FUNCTION public.os_bridge_api_import_status(p_token_sha256 text, p_import uuid, p_mark_uploaded boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  t public.os_project_api_tokens; i public.os_project_imports; v public.os_project_versions;
begin
  select * into t from public.os_project_api_tokens where token_sha256 = p_token_sha256;
  if t.id is null or t.revoked_at is not null or t.expires_at < now() or not ('import:read' = any (t.scopes) or 'import:create' = any (t.scopes)) then
    raise exception 'invalid_token' using errcode = '28000';
  end if;
  select * into i from public.os_project_imports where id = p_import and api_token_id = t.id;
  if i.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_mark_uploaded and i.status = 'awaiting_upload' then
    if not exists (select 1 from os_private.bridge_inbox_objects o where o.name = i.archive_path) then
      raise exception 'archive_not_uploaded' using errcode = '22023';
    end if;
    update public.os_project_imports set status = 'received' where id = i.id returning * into i;
  end if;
  select * into v from public.os_project_versions where id = i.version_id;
  return jsonb_build_object('import_id', i.id, 'status', i.status, 'error_code', i.error_code, 'problems', i.problems,
    'version', case when v.id is null then null else jsonb_build_object('number', v.number, 'files', v.file_count) end);
end;
$function$;
revoke all on function public.os_bridge_api_import_status(text,uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function public.os_bridge_api_import_status(text,uuid,boolean) to postgres;
grant execute on function public.os_bridge_api_import_status(text,uuid,boolean) to anon;
grant execute on function public.os_bridge_api_import_status(text,uuid,boolean) to authenticated;
grant execute on function public.os_bridge_api_import_status(text,uuid,boolean) to service_role;
CREATE OR REPLACE FUNCTION public.crm_radar_ingest(places jsonb, run_key text, campaign uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p jsonb; ref text; inserted int := 0; updated int := 0; seen int := 0; rows int; run public.crm_radar_runs; owner uuid := auth.uid();
begin
  if owner is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(places) <> 'array' or jsonb_array_length(places) > 500 then raise exception 'radar_invalid' using errcode = '22023'; end if;
  if run_key is null or length(run_key) not between 8 and 120 then raise exception 'radar_invalid' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('radar:' || run_key, 0));
  select * into run from public.crm_radar_runs r where r.idempotency_key = run_key;
  if found then
    return jsonb_build_object('run_id', run.id, 'found', run.found, 'inserted', run.inserted, 'updated', run.updated, 'replayed', true);
  end if;
  for p in select value from jsonb_array_elements(places) loop
    ref := p ->> 'source_ref';
    continue when ref is null or ref !~ '^[a-z0-9_]+:[A-Za-z0-9/_.:-]{1,120}$' or length(btrim(coalesce(p ->> 'name', ''))) = 0;
    seen := seen + 1;
    update public.crm_prospects set last_seen_at = now(),
      phone = case when phone = '' then left(coalesce(p ->> 'phone', ''), 40) else phone end,
      website = case when website = '' then left(coalesce(p ->> 'website', ''), 500) else website end
    where source_ref = ref and status <> 'converted';
    get diagnostics rows = row_count;
    -- Converted prospects are immutable (crm_core): recognise them, never rewrite.
    if rows > 0 or exists (select 1 from public.crm_prospects x where x.source_ref = ref) then updated := updated + 1; continue; end if;
    insert into public.crm_prospects (company, contact, email, phone, source, owner_id, industry, location, opportunity,
      acquired_at, status, source_kind, source_ref, lat, lon, website, category, license, first_seen_at, last_seen_at, campaign_id)
    values (left(btrim(p ->> 'name'), 200), '',
      case when coalesce(p ->> 'email', '') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then left(p ->> 'email', 254) end,
      left(coalesce(p ->> 'phone', ''), 40), left(coalesce(nullif(p ->> 'source_label', ''), 'Radar'), 200), owner,
      left(coalesce(p ->> 'industry', ''), 120), left(coalesce(p ->> 'location', ''), 200),
      left(coalesce(nullif(p ->> 'opportunity', ''), 'Oportunidad por verificar'), 1000), now(), 'pending',
      case when p ->> 'source_kind' in ('osm', 'overture', 'licensed') then p ->> 'source_kind' else 'osm' end, ref,
      (p ->> 'lat')::double precision, (p ->> 'lon')::double precision, left(coalesce(p ->> 'website', ''), 500),
      left(coalesce(p ->> 'category', ''), 120), left(coalesce(p ->> 'license', ''), 200), now(), now(), campaign)
    on conflict do nothing;
    get diagnostics rows = row_count;
    if rows > 0 then inserted := inserted + 1; else updated := updated + 1; end if;
  end loop;
  insert into public.crm_radar_runs (campaign_id, idempotency_key, trigger, status, found, inserted, updated, finished_at)
  values (campaign, run_key, case when campaign is null then 'manual' else 'schedule' end, 'succeeded', seen, inserted, updated, now())
  returning * into run;
  if campaign is not null then update public.crm_radar_campaigns set last_run_at = now() where id = campaign; end if;
  return jsonb_build_object('run_id', run.id, 'found', seen, 'inserted', inserted, 'updated', updated, 'replayed', false);
end $function$;
revoke all on function public.crm_radar_ingest(jsonb,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.crm_radar_ingest(jsonb,text,uuid) to postgres;
grant execute on function public.crm_radar_ingest(jsonb,text,uuid) to authenticated;
grant execute on function public.crm_radar_ingest(jsonb,text,uuid) to service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated;
alter default privileges for role postgres grant execute on functions to public;
commit;
