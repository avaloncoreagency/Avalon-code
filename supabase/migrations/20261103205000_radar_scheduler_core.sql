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
  using (agency_key = 'avalon' and exists (
    select 1 from public.agency_memberships m
    where m.user_id = (select auth.uid()) and m.role = 'owner'
  ));

-- Existing CRM triggers use crm_private helpers when a server-only conversion changes stage and status.
-- This grants schema resolution to the server role only; no anon/authenticated grants.
grant usage on schema crm_private to service_role;
grant execute on function crm_private.is_owner() to service_role;
grant execute on function crm_private.radar_tier(uuid) to service_role;

-- The worker must never write a generic "need" with an unauthenticated session.
-- This narrow RPC reads a stored source report, validates the evidence, and
-- records at most one website need using the owning agency membership.
create or replace function public.crm_radar_worker_record_website_need(prospect_id uuid)
returns boolean
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  p public.crm_prospects;
  suggestion jsonb;
  source_report jsonb;
  existing public.crm_prospect_needs;
  actor uuid;
  v_need_state text;
  evidence text;
  note_text text;
begin
  if current_user <> 'service_role' then
    raise exception 'service_role only' using errcode='42501';
  end if;
  select * into p from public.crm_prospects where id = prospect_id for update;
  if not found or p.status not in ('pending','approved') or p.do_not_contact or p.source_ref is null then return false; end if;
  select report into source_report from public.crm_radar_research_reports
    where crm_radar_research_reports.prospect_id = p.id
      and status in ('complete','limited') order by scanned_at desc limit 1;
  if not found or (source_report->>'identity_matched') is distinct from 'true' then return false; end if;
  select item into suggestion
    from jsonb_array_elements(coalesce(source_report->'suggested_needs','[]'::jsonb)) as item
    where item->>'service' = 'website' limit 1;
  if not found then return false; end if;
  v_need_state := suggestion->>'state';
  evidence := suggestion->>'evidence_url';
  note_text := suggestion->>'note';
  if v_need_state not in ('verified_present','opportunity_to_improve') or evidence is null
    or evidence not like 'https://%' or length(evidence) > 500
    or note_text is null or length(note_text) < 12 or length(note_text) > 2000
    or suggestion->>'method' <> 'website_review'
    or suggestion->>'confidence' <> 'medium' then return false; end if;
  select user_id into actor from public.agency_memberships
    where user_id = p.owner_id and role = 'owner' limit 1;
  if actor is null then
    select user_id into actor from public.agency_memberships
      where role='owner' order by created_at limit 1;
  end if;
  if actor is null then return false; end if;
  select * into existing from public.crm_prospect_needs
    where crm_prospect_needs.prospect_id=p.id and service='website' for update;
  if found and not (
    existing.method='website_review'
    and existing.state='verified_present'
    and existing.note like 'Web oficial accesible por HTTPS%'
    and v_need_state='opportunity_to_improve'
  ) then return false; end if;
  -- Local transaction claim, used only inside this server-only RPC; no
  -- persistent impersonated login cookie or externally visible session.
  perform set_config('request.jwt.claim.sub',actor::text,true);
  if existing.id is not null then
    update public.crm_prospect_needs set
      state=v_need_state,method='website_review',confidence='medium',
      evidence_url=evidence,note=note_text,verified_at=now()
      where id=existing.id;
  else
    insert into public.crm_prospect_needs(
      prospect_id,service,state,method,confidence,evidence_url,note,created_by
    ) values (p.id,'website',v_need_state,'website_review','medium',evidence,note_text,actor);
  end if;
  return true;
end $function$;
revoke all on function public.crm_radar_worker_record_website_need(uuid) from public, anon, authenticated;
grant execute on function public.crm_radar_worker_record_website_need(uuid) to service_role;

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
  if current_user <> 'service_role' then
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

  select count(distinct n.service)::integer into strong_services
  from public.crm_prospect_needs n
  where n.prospect_id = p.id
    and state in ('verified_missing','opportunity_to_improve')
    and confidence = 'high'
    and method <> ''
    and evidence_url like 'https://%'
    and length(btrim(note)) >= 12;

  -- A single site's SEO tags cannot promote a lead by itself.
  if strong_services < 2 then return null; end if;
  select user_id into actor from public.agency_memberships
    where user_id=p.owner_id and role='owner' limit 1;
  if actor is null then
    select user_id into actor from public.agency_memberships
      where role='owner' order by created_at limit 1;
  end if;
  if actor is null then return null; end if;
  -- Existing audit and stamp triggers require a verified owner and the
  -- ordinary approved -> converted transition. The dedicated service-role
  -- RPC supplies that owner only inside its current transaction.
  perform set_config('request.jwt.claim.sub',actor::text,true);
  begin
    if p.status='pending' then
      update public.crm_prospects set status='approved' where id=p.id;
    end if;
    insert into public.crm_leads(
      company,contact,email,phone,source,owner_id,created_by,
      stage_id,prospect_id,website,industry,location,priority
    ) values(
      p.company,p.contact,p.email,p.phone,
      'Radar automático: ' || left(p.source,160),actor,actor,
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
