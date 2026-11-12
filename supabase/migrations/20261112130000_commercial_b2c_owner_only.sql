-- Commercial Foundation / isolated B2C persistence. Safe by default:
-- NO anonymous write or read, NO public API/RPC, NO messages, NO ad publication.
-- Synthetic owner-only lifecycle foundation; explicit owner approval is required
-- before applying any migration to production. B2B crm_leads is untouched.
begin;

create table public.crm_b2c_target_policies (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  campaign_project_id uuid not null references public.os_projects(id),
  version integer not null check (version >= 1),
  contractor_client_id uuid not null references public.crm_clients(id),
  allowed_zips text[] not null default array[]::text[]
    check (cardinality(allowed_zips) between 1 and 100),
  active boolean not null default false,
  signed_contract_verified boolean not null default false,
  license_verified boolean not null default false,
  capacity_available boolean not null default false,
  consent_version text not null check (length(consent_version) between 3 and 80),
  effective_from timestamptz not null,
  effective_until timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique(campaign_project_id,version),
  check (effective_until is null or effective_until > effective_from)
);
create index crm_b2c_target_active_idx on public.crm_b2c_target_policies(campaign_project_id,active,version desc);
alter table public.crm_b2c_target_policies enable row level security;
revoke all on public.crm_b2c_target_policies from anon, authenticated, public;
grant select, insert, update on public.crm_b2c_target_policies to authenticated;
create policy b2c_policy_owner_select on public.crm_b2c_target_policies
  for select to authenticated using ((select crm_private.is_owner()) and agency_key = 'avalon');
create policy b2c_policy_owner_insert on public.crm_b2c_target_policies
  for insert to authenticated with check ((select crm_private.is_owner()) and agency_key = 'avalon' and created_by = (select auth.uid()));
create policy b2c_policy_owner_update on public.crm_b2c_target_policies
  for update to authenticated using ((select crm_private.is_owner()) and agency_key = 'avalon')
  with check ((select crm_private.is_owner()) and agency_key = 'avalon');

create function crm_private.b2c_policy_guard() returns trigger
  language plpgsql security invoker set search_path = '' as $$
declare valid_project boolean;
begin
  if (select auth.uid()) is null or not crm_private.is_owner() then
    raise exception 'b2c_forbidden' using errcode='42501';
  end if;
  if tg_op = 'INSERT' then
    if new.created_by is distinct from auth.uid() then
      raise exception 'b2c_actor_mismatch' using errcode='42501';
    end if;
  elsif (new.agency_key,new.campaign_project_id,new.version,new.contractor_client_id,
         new.allowed_zips,new.signed_contract_verified,new.license_verified,
         new.capacity_available,new.consent_version,new.effective_from,new.effective_until,
         new.created_by,new.created_at)
        is distinct from
        (old.agency_key,old.campaign_project_id,old.version,old.contractor_client_id,
         old.allowed_zips,old.signed_contract_verified,old.license_verified,
         old.capacity_available,old.consent_version,old.effective_from,old.effective_until,
         old.created_by,old.created_at) then
    raise exception 'b2c_policy_immutable' using errcode='23514';
  end if;
  if exists(select 1 from unnest(new.allowed_zips) as z(zip) where z.zip !~ '^[0-9]{5}$') then
    raise exception 'b2c_zip_invalid' using errcode='23514';
  end if;
  select exists(select 1 from public.os_projects where id=new.campaign_project_id
                and module='marketing' and status<>'archived') into valid_project;
  if not valid_project then
    raise exception 'b2c_campaign_missing' using errcode='23514';
  end if;
  if new.active and
     (not new.signed_contract_verified or not new.license_verified or not new.capacity_available) then
    raise exception 'b2c_target_unverified' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function crm_private.b2c_policy_guard() from public, anon, authenticated;
create trigger crm_b2c_policy_guard before insert or update on public.crm_b2c_target_policies
  for each row execute function crm_private.b2c_policy_guard();

create table public.crm_b2c_requests (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  request_key uuid not null unique,
  policy_id uuid not null references public.crm_b2c_target_policies(id),
  campaign_project_id uuid not null references public.os_projects(id),
  policy_version integer not null check (policy_version >= 1),
  contractor_client_id uuid not null references public.crm_clients(id),
  displayed_contractor_id uuid not null references public.crm_clients(id),
  consented_contractor_id uuid not null references public.crm_clients(id),
  consent_version text not null check (length(consent_version) between 3 and 80),
  consent_at timestamptz not null,
  zip text not null check (zip ~ '^[0-9]{5}$'),
  status text not null default 'routed' check (status in ('routed','acknowledged','contacted','quote_sent','won','lost')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (displayed_contractor_id=consented_contractor_id),
  check (contractor_client_id=displayed_contractor_id)
);
create index crm_b2c_requests_target_idx on public.crm_b2c_requests(contractor_client_id,created_at desc);
alter table public.crm_b2c_requests enable row level security;
revoke all on public.crm_b2c_requests from anon, authenticated, public;
grant select,insert,update on public.crm_b2c_requests to authenticated;
create policy b2c_request_owner_read on public.crm_b2c_requests
 for select to authenticated using ((select crm_private.is_owner()) and agency_key='avalon');
create policy b2c_request_owner_insert on public.crm_b2c_requests
 for insert to authenticated with check ((select crm_private.is_owner()) and agency_key='avalon' and created_by=(select auth.uid()));
create policy b2c_request_owner_update on public.crm_b2c_requests
 for update to authenticated using ((select crm_private.is_owner()) and agency_key='avalon')
 with check ((select crm_private.is_owner()) and agency_key='avalon');

create function crm_private.b2c_request_guard() returns trigger
 language plpgsql security invoker set search_path='' as $$
declare p public.crm_b2c_target_policies;
begin
 if (select auth.uid()) is null or not crm_private.is_owner() then
   raise exception 'b2c_forbidden' using errcode='42501';
 end if;
 if tg_op='INSERT' then
  if new.created_by is distinct from auth.uid() then
   raise exception 'b2c_actor_mismatch' using errcode='42501';
  end if;
  select * into p from public.crm_b2c_target_policies where id=new.policy_id;
  if not found or not p.active or not p.signed_contract_verified
    or not p.license_verified or not p.capacity_available
    or not (new.zip = any(p.allowed_zips))
    or now() < p.effective_from or (p.effective_until is not null and now() >= p.effective_until)
    or new.campaign_project_id is distinct from p.campaign_project_id
    or new.policy_version is distinct from p.version
    or new.contractor_client_id is distinct from p.contractor_client_id
    or new.displayed_contractor_id is distinct from p.contractor_client_id
    or new.consented_contractor_id is distinct from p.contractor_client_id
    or new.consent_version is distinct from p.consent_version
    or new.consent_at is null or new.consent_at > now() then
   raise exception 'b2c_request_ineligible' using errcode='23514';
  end if;
  if new.status<>'routed' then
   raise exception 'b2c_status_invalid' using errcode='23514';
  end if;
 else
  if (new.agency_key,new.request_key,new.policy_id,new.campaign_project_id,
      new.policy_version,new.contractor_client_id,new.displayed_contractor_id,
      new.consented_contractor_id,new.consent_version,new.consent_at,new.zip,
      new.created_by,new.created_at)
    is distinct from
     (old.agency_key,old.request_key,old.policy_id,old.campaign_project_id,
      old.policy_version,old.contractor_client_id,old.displayed_contractor_id,
      old.consented_contractor_id,old.consent_version,old.consent_at,old.zip,
      old.created_by,old.created_at) then
   raise exception 'b2c_assignment_immutable' using errcode='23514';
  end if;
  if new.status is distinct from old.status and not (
    (old.status='routed' and new.status in ('acknowledged','lost')) or
    (old.status='acknowledged' and new.status in ('contacted','lost')) or
    (old.status='contacted' and new.status in ('quote_sent','lost')) or
    (old.status='quote_sent' and new.status in ('won','lost'))
  ) then
    raise exception 'b2c_status_transition_invalid' using errcode='23514';
  end if;
  new.updated_at=now();
 end if;
 return new;
end $$;
revoke all on function crm_private.b2c_request_guard() from public,anon,authenticated;
create trigger crm_b2c_request_guard before insert or update on public.crm_b2c_requests
 for each row execute function crm_private.b2c_request_guard();

-- Private audit; never trust a client-supplied change history.
create table public.crm_b2c_request_events (
 id bigint generated always as identity primary key,
 agency_key text not null default 'avalon' check(agency_key='avalon'),
 request_id uuid not null references public.crm_b2c_requests(id),
 actor_id uuid not null,
 old_status text,
 new_status text not null,
 created_at timestamptz not null default now()
);
alter table public.crm_b2c_request_events enable row level security;
revoke all on public.crm_b2c_request_events from anon, authenticated, public;
grant select on public.crm_b2c_request_events to authenticated;
create policy b2c_event_owner_read on public.crm_b2c_request_events
 for select to authenticated using ((select crm_private.is_owner()) and agency_key='avalon');
create function crm_private.b2c_log_event() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into public.crm_b2c_request_events(request_id,actor_id,old_status,new_status)
    values(new.id,auth.uid(),null,new.status);
 elsif new.status is distinct from old.status then
  insert into public.crm_b2c_request_events(request_id,actor_id,old_status,new_status)
    values(new.id,auth.uid(),old.status,new.status);
 end if;
 return null;
end $$;
revoke all on function crm_private.b2c_log_event() from public,anon,authenticated;
create trigger crm_b2c_log_event after insert or update on public.crm_b2c_requests
 for each row execute function crm_private.b2c_log_event();

-- Intentionally no RPC or GRANT to anon. No public launch or transfer.
commit;
