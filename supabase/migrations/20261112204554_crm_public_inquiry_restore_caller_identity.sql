-- Restore the anonymous request's original JWT subject after creating a pending inquiry.
-- A SECURITY DEFINER function must not leave impersonation in its caller transaction.
-- Does not alter grants, quota limits, statuses, leads, or archived customer data.
begin;
create or replace function public.crm_public_inquiry(request jsonb) returns text
language plpgsql security definer set search_path = '' as $$
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
  v_prev_sub text;
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
    v_prev_sub := current_setting('request.jwt.claim.sub', true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    insert into public.crm_prospects (company, contact, email, phone, source, owner_id, industry, location, opportunity, acquired_at, status, source_kind)
    values (left(v_company, 200), left(v_contact, 160), v_email, left(v_phone, 40), 'Web · solicitud de cotización', v_owner, '', '',
      left('Solicitud web (' || v_lang || ')' || case when cardinality(v_services) > 0 then ' · servicios: ' || array_to_string(v_services, ', ') else '' end || E'\n' || v_message, 1000),
      now(), 'pending', 'web_form')
    returning id into v_pid;
    perform set_config('request.jwt.claim.sub', coalesce(v_prev_sub, ''), true);
  end if;
  insert into public.crm_public_inquiries (prospect_id, email_hash, services, language) values (v_pid, v_hash, v_services, v_lang);
  return 'ok';
end $$;
commit;
