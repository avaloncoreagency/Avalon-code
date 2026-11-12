-- CRM TITAN consent-version hardening (2026-11-12).
-- Append-only hotfix. This migration does not grant anonymous privileges,
-- publish funnels, or change CRM sales or customer records.
-- Applied and inspected in isolated Supabase Preview before source integration.
-- The CREATE OR REPLACE keeps the existing function signature and privileges.
begin;
create or replace function public.crm_growth_funnel_submit(request jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_slug text := btrim(coalesce(request ->> 'slug', ''));
  v_company text := btrim(coalesce(request ->> 'company', ''));
  v_name text := btrim(coalesce(request ->> 'name', ''));
  v_email text := lower(btrim(coalesce(request ->> 'email', '')));
  v_phone text := btrim(coalesce(request ->> 'phone', ''));
  v_message text := btrim(coalesce(request ->> 'message', ''));
  v_consent_version text := btrim(coalesce(request ->> 'consent_version', ''));
  v_referrer text := lower(btrim(coalesce(request ->> 'referrer_host', '')));
  v_fp text := lower(btrim(coalesce(request ->> 'fingerprint', '')));
  v_utm jsonb := '{}'::jsonb;
  v_hash text; v_prev_sub text; v_lead uuid; f public.crm_growth_funnels; k text;
begin
  if jsonb_typeof(request) <> 'object' or pg_column_size(request) > 4096 then return 'invalid'; end if;
  if coalesce(request ->> 'website_url', '') <> '' then return 'ok'; end if;   -- honeypot: generic answer, no write
  if request -> 'consent' is distinct from 'true'::jsonb then return 'invalid'; end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) not between 3 and 60
     or length(v_company) not between 2 and 200 or length(v_name) not between 2 and 160
     or length(v_phone) > 40 or length(v_email) > 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or length(v_message) not between 10 and 2000 then return 'invalid'; end if;
  if v_referrer <> '' and (length(v_referrer) > 253 or v_referrer !~ '^[a-z0-9.-]+$') then v_referrer := ''; end if;
  if v_fp !~ '^[0-9a-f]{64}$' then v_fp := ''; end if;
  if jsonb_typeof(request -> 'utm') = 'object' then
    for k in select key from jsonb_each_text(request -> 'utm') loop
      if k in ('source', 'medium', 'campaign', 'content', 'term') then
        v_utm := v_utm || jsonb_build_object(k, left(regexp_replace(request -> 'utm' ->> k, '[^A-Za-z0-9 ._-]', '', 'g'), 100));
      end if;
    end loop;
  end if;

  select * into f from public.crm_growth_funnels where slug = v_slug and status = 'active';
  if not found or f.client_id is not null
     or not exists (select 1 from public.agency_memberships m where m.user_id = f.created_by and m.role = 'owner') then
    return 'unavailable';
  end if;
  -- The visitor must have seen the consent text that is current for this funnel.
  if v_consent_version = '' or v_consent_version <> f.consent_version then return 'invalid'; end if;
  v_hash := encode(sha256(convert_to(v_email, 'UTF8')), 'hex');

  -- Serialize submissions: durable limits and the one-lead-per-e-mail rule cannot race.
  perform pg_catalog.pg_advisory_xact_lock(7251837);
  if exists (select 1 from public.crm_growth_funnel_submissions s where s.funnel_id = f.id and s.email_hash = v_hash) then
    return 'ok';   -- replay: idempotent, reveals nothing
  end if;
  if (select count(*) from public.crm_growth_funnel_submissions s
        where s.email_hash = v_hash and s.created_at > now() - interval '24 hours') >= 3
     or (v_fp <> '' and (select count(*) from public.crm_growth_funnel_submissions s
        where s.fingerprint_hash = v_fp and s.created_at > now() - interval '1 hour') >= 5)
     or (select count(*) from public.crm_growth_funnel_submissions s
        where s.funnel_id = f.id and s.created_at > now() - interval '1 hour') >= 30
     or (select count(*) from public.crm_growth_funnel_submissions s
        where s.created_at > now() - interval '1 hour') >= 120 then
    return 'throttled';
  end if;

  select l.id into v_lead from public.crm_leads l where lower(btrim(l.email)) = v_email and not l.archived limit 1;
  if v_lead is null then
    -- The CRM stamp/audit triggers require an owner identity: act as the funnel's owner for this insert only, then
    -- restore the caller's identity so nothing else in this call runs with owner rights.
    v_prev_sub := current_setting('request.jwt.claim.sub', true);
    perform set_config('request.jwt.claim.sub', f.created_by::text, true);
    begin
      insert into public.crm_leads (company, contact, email, phone, source, owner_id, stage_id, origin)
      values (v_company, v_name, v_email, v_phone, left('Funnel: ' || f.slug, 200), f.created_by, 'new', 'campaign')
      returning id into v_lead;
    exception when unique_violation then
      select l.id into v_lead from public.crm_leads l where lower(btrim(l.email)) = v_email and not l.archived limit 1;
    end;
    perform set_config('request.jwt.claim.sub', coalesce(v_prev_sub, ''), true);
    if v_lead is null then return 'unavailable'; end if;
  end if;
  insert into public.crm_growth_funnel_submissions (funnel_id, lead_id, email_hash, message, consent_at, consent_version,
    referrer_host, utm, fingerprint_hash)
  values (f.id, v_lead, v_hash, v_message, now(), f.consent_version, v_referrer, v_utm, v_fp);
  return 'ok';
end $$;
commit;
