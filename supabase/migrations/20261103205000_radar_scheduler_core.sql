-- Avalon Radar: dedicated background-job audit and least-privilege state.
-- No secret/token literal may be committed. The operational secret stays in Vault.
begin;

create table public.crm_radar_worker_config (
  id text primary key default 'avalon' check (id = 'avalon'),
  enabled boolean not null default false,
  token_sha256 text not null default '' check (token_sha256 = '' or token_sha256 ~ '^[a-f0-9]{64}$'),
  lease_until timestamptz not null default to_timestamp(0),
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_message text not null default '' check (length(last_message) <= 500),
  updated_at timestamptz not null default now()
);

alter table public.crm_radar_worker_config enable row level security;
revoke all on public.crm_radar_worker_config from anon;
revoke all on public.crm_radar_worker_config from authenticated;
revoke all on public.crm_radar_worker_config from public;
grant select, update on public.crm_radar_worker_config to service_role;
insert into public.crm_radar_worker_config(id) values ('avalon');

create table public.crm_radar_worker_runs (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  status text not null check (status in ('ok','partial','error','limited')),
  checked integer not null default 0 check (checked >= 0 and checked <= 12),
  rated integer not null default 0 check (rated >= 0 and rated <= 12),
  converted integer not null default 0 check (converted >= 0 and converted <= 12),
  blocked integer not null default 0 check (blocked >= 0 and blocked <= 12),
  message text not null default '' check (length(message) <= 500)
);
create index crm_radar_worker_runs_recent on public.crm_radar_worker_runs (finished_at desc);
alter table public.crm_radar_worker_runs enable row level security;
revoke all on public.crm_radar_worker_runs from anon;
revoke all on public.crm_radar_worker_runs from authenticated;
revoke all on public.crm_radar_worker_runs from public;
grant select on public.crm_radar_worker_runs to authenticated;
grant select, insert on public.crm_radar_worker_runs to service_role;
create policy crm_radar_worker_runs_owner_read on public.crm_radar_worker_runs
  for select to authenticated
  using (agency_key = 'avalon' and (select crm_private.is_owner()));

-- Only a service_role request can promote independently verified, high-confidence leads.
-- Invoker privileges, row lock, uniqueness and check constraints prevent duplicates.
create or replace function public.crm_radar_worker_convert_verified(prospect_id uuid)
returns uuid
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  p public.crm_prospects;
  result uuid;
  strong_services integer := 0;
  actor uuid;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'service_role only' using errcode = '42501';
  end if;
  select * into p from public.crm_prospects where id = prospect_id for update;
  if not found or p.source_ref is null or p.do_not_contact or p.status = 'rejected' then
    return null;
  end if;
  if p.status = 'converted' then return p.lead_id; end if;
  if p.status not in ('pending','approved')
    or p.stars_override is not null
    or p.stars < 4
    or p.confidence <> 'high' then
    return null;
  end if;

  select count(distinct service)::integer into strong_services
  from public.crm_prospect_needs
  where prospect_id = p.id
    and state in ('verified_missing','opportunity_to_improve')
    and confidence = 'high'
    and method <> ''
    and evidence_url like 'https://%'
    and length(btrim(note)) >= 12;

  -- A single site's SEO tags cannot promote a lead by itself.
  if strong_services < 2 then return null; end if;
  select coalesce(p.owner_id, (
    select user_id from public.agency_memberships where role = 'owner'
    order by created_at limit 1
  )) into actor;
  if actor is null then return null; end if;
  begin
    insert into public.crm_leads(
      company,contact,email,phone,source,owner_id,created_by,
      stage_id,prospect_id,website,industry,location,priority
    ) values(
      p.company,p.contact,p.email,p.phone,p.source,actor,actor,
      'new',p.id,left(p.website,300),p.industry,p.location,'high'
    ) returning id into result;
  exception when unique_violation then
    -- Another person may already have added the same business.
    return null;
  end;

  update public.crm_prospects
  set status='converted', lead_id=result, research_status='qualified'
  where id=p.id;
  return result;
end
$function$;
revoke all on function public.crm_radar_worker_convert_verified(uuid) from public, anon, authenticated;
grant execute on function public.crm_radar_worker_convert_verified(uuid) to service_role;

commit;
