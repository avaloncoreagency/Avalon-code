-- Public quote requests (website) → Lead Hunter review queue. PREPARED ONLY.
-- The ONLY anonymous write path in Avalon. It inserts a *pending* prospect
-- (source_kind 'web_form'); it never creates leads, clients or sales.
-- Abuse controls live in SQL so they hold even if the RPC is called directly:
-- strict validation, honeypot, 3 per e-mail per 24 h, 30 per hour globally.
begin;

create table public.crm_public_inquiries (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  prospect_id uuid references public.crm_prospects (id),
  email_hash text not null check (length(email_hash) = 64),
  services text[] not null default '{}' check (cardinality(services) <= 6),
  language text not null default 'es' check (language in ('es', 'en')),
  created_at timestamptz not null default now()
);
create index crm_public_inquiries_rate on public.crm_public_inquiries (email_hash, created_at desc);
create index crm_public_inquiries_recent on public.crm_public_inquiries (created_at desc);
alter table public.crm_public_inquiries enable row level security;
revoke all on public.crm_public_inquiries from anon, authenticated;
grant select on public.crm_public_inquiries to authenticated;
create policy crm_read on public.crm_public_inquiries for select to authenticated using ((select crm_private.is_owner()) and agency_key = 'avalon');

create function public.crm_public_inquiry(request jsonb) returns text
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
end $$;
revoke all on function public.crm_public_inquiry(jsonb) from public;
grant execute on function public.crm_public_inquiry(jsonb) to anon, authenticated;

commit;
