-- Lead Hunter Radar 2.0 (issue #40): persistent discovered businesses, evidence-based
-- need matrix, explainable 1–5 star tier separate from evidence confidence, idempotent
-- ingest with dedupe, campaigns/runs for authorized scheduled discovery.
-- PREPARED ONLY — isolated database first; production needs owner approval.
--
-- Reuses crm_prospects (Lead Hunter) as the single "found business" entity: the
-- existing human approval + crm_convert_prospect remain the ONLY way into the pipeline.
-- Additive: no table dropped, no row deleted. One index is narrowed (see §1).
begin;

-- 1. Discovered-business fields on the existing prospects table --------------------
alter table public.crm_prospects
  add column source_kind text not null default 'manual' check (source_kind in ('manual', 'osm', 'overture', 'licensed', 'web_form')),
  add column source_ref text check (source_ref is null or source_ref ~ '^[a-z0-9_]+:[A-Za-z0-9/_.:-]{1,120}$'),
  add column lat double precision check (lat is null or lat between -90 and 90),
  add column lon double precision check (lon is null or lon between -180 and 180),
  add column website text not null default '' check (length(website) <= 500),
  add column category text not null default '' check (length(category) <= 120),
  add column license text not null default '' check (length(license) <= 200),
  add column first_seen_at timestamptz,
  add column last_seen_at timestamptz,
  add column do_not_contact boolean not null default false,
  add column research_status text not null default 'new' check (research_status in ('new', 'researching', 'qualified')),
  add column stars smallint check (stars between 1 and 5),
  add column stars_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(stars_reasons) = 'array'),
  add column confidence text not null default 'none' check (confidence in ('none', 'low', 'medium', 'high')),
  add column stars_override smallint check (stars_override between 1 and 5),
  add column override_reason text not null default '' check (length(override_reason) <= 1000),
  add column campaign_id uuid,
  add check ((lat is null) = (lon is null)),
  add check (stars_override is null or length(btrim(override_reason)) >= 10);
-- One business per source id across zones and campaigns (dedupe key).
create unique index crm_prospects_source_ref on public.crm_prospects (source_ref) where source_ref is not null;
create index crm_prospects_geo on public.crm_prospects (lat, lon) where lat is not null;
create index crm_prospects_stars on public.crm_prospects (coalesce(stars_override, stars) desc nulls last, last_seen_at desc);
-- The name+contact guard is meant for hand-entered prospects without e-mail. Map
-- sources legitimately contain several branches with the same name (chains) and no
-- contact person, which are already deduplicated by source_ref.
drop index public.crm_prospects_contact_unique;
create unique index crm_prospects_contact_unique on public.crm_prospects (lower(trim(company)), lower(trim(contact)))
  where email is null and source_ref is null;

-- 2. Need matrix: one row per business and service, with evidence ----------------
create table public.crm_prospect_needs (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  prospect_id uuid not null references public.crm_prospects (id),
  service text not null check (service in ('website', 'ecommerce', 'crm', 'receptionist', 'marketing', 'automation')),
  state text not null default 'unverified' check (state in ('verified_missing', 'verified_present', 'opportunity_to_improve', 'unverified', 'not_applicable')),
  evidence_url text not null default '' check (evidence_url = '' or (length(evidence_url) <= 500 and evidence_url ~ '^https?://[^[:space:]<>"]+$')),
  method text not null default '' check (method in ('', 'call', 'website_review', 'public_listing', 'owner_statement', 'visit', 'other')),
  note text not null default '' check (length(note) <= 2000),
  confidence text not null default 'low' check (confidence in ('low', 'medium', 'high')),
  verified_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (prospect_id, service),
  -- A verified state needs a method; "unverified" never counts as evidence.
  check (state in ('unverified', 'not_applicable') or method <> '')
);
create index crm_prospect_needs_prospect on public.crm_prospect_needs (prospect_id);

-- 3. Explainable tier. Pure function of the need matrix; never rewards missing data.
-- verified_missing = 1 point, opportunity_to_improve = 0.5, verified_present = 0,
-- unverified / not_applicable = not assessed. Fewer than two assessed services and no
-- verified need → "Sin calificar".
create function crm_private.radar_tier(p uuid, out stars smallint, out confidence text, out reasons jsonb)
language plpgsql stable security invoker set search_path = '' as $$
declare missing int; improve int; present int; assessed int; high int; applicable int;
begin
  select count(*) filter (where n.state = 'verified_missing'),
         count(*) filter (where n.state = 'opportunity_to_improve'),
         count(*) filter (where n.state = 'verified_present'),
         count(*) filter (where n.state in ('verified_missing', 'opportunity_to_improve', 'verified_present')),
         count(*) filter (where n.state in ('verified_missing', 'opportunity_to_improve', 'verified_present') and n.confidence = 'high'),
         6 - count(*) filter (where n.state = 'not_applicable')
    into missing, improve, present, assessed, high, applicable
    from public.crm_prospect_needs n where n.prospect_id = p;
  reasons := jsonb_build_array(
    missing || ' necesidad(es) verificada(s)', improve || ' oportunidad(es) de mejora verificada(s)',
    present || ' herramienta(s) presente(s) verificada(s)', assessed || '/' || applicable || ' servicios aplicables evaluados');
  if assessed = 0 or (assessed < 2 and missing = 0) then
    stars := null; confidence := 'none';
    reasons := reasons || jsonb_build_array('Sin calificar: evidencia insuficiente (la falta de datos no cuenta como necesidad)');
    return;
  end if;
  stars := case
    when missing >= 3 and missing >= applicable - 1 then 5
    when missing >= 3 or (missing >= 2 and improve >= 1) then 4
    when missing >= 1 then 3
    when improve >= 1 then 2
    else 1 end;
  confidence := case
    when assessed >= applicable - 1 and high >= 2 then 'high'
    when assessed >= greatest(2, applicable / 2) then 'medium'
    else 'low' end;
end $$;
revoke all on function crm_private.radar_tier(uuid) from public;
grant execute on function crm_private.radar_tier(uuid) to authenticated;

create function crm_private.radar_rescore() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare t record; pid uuid := coalesce(new.prospect_id, old.prospect_id);
begin
  select * into t from crm_private.radar_tier(pid);
  update public.crm_prospects set stars = t.stars, confidence = t.confidence, stars_reasons = t.reasons,
    research_status = case when research_status = 'new' then 'researching' else research_status end
  where id = pid and status <> 'converted';
  return null;
end $$;
revoke all on function crm_private.radar_rescore() from public;
create trigger crm_prospect_needs_rescore after insert or update on public.crm_prospect_needs
  for each row execute function crm_private.radar_rescore();

-- 4. Guard: discovered businesses marked "do not contact" cannot be approved/converted.
create function crm_private.radar_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.do_not_contact and new.status in ('approved', 'converted') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    raise exception 'radar_do_not_contact' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function crm_private.radar_guard() from public;
create trigger crm_prospects_radar_guard before insert or update on public.crm_prospects
  for each row execute function crm_private.radar_guard();

-- 5. Campaigns and runs (authorized scheduled discovery) --------------------------
create table public.crm_radar_campaigns (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  name text not null check (length(btrim(name)) between 1 and 120),
  center_lat double precision not null check (center_lat between -90 and 90),
  center_lon double precision not null check (center_lon between -180 and 180),
  radius_m integer not null check (radius_m between 100 and 80467),
  place_label text not null default '' check (length(place_label) <= 200),
  categories text[] not null default '{}' check (cardinality(categories) <= 20),
  services text[] not null default '{}' check (cardinality(services) <= 6),
  frequency text not null default 'weekly' check (frequency in ('daily', 'weekly', 'monthly')),
  run_hour smallint not null default 9 check (run_hour between 0 and 23),
  timezone text not null default 'America/New_York' check (length(timezone) between 1 and 100),
  source text not null default 'osm' check (source in ('osm', 'overture', 'licensed')),
  max_results integer not null default 100 check (max_results between 1 and 1000),
  monthly_budget_usd numeric(10, 2) not null default 0 check (monthly_budget_usd >= 0),
  status text not null default 'paused' check (status in ('active', 'paused')),
  owner_id uuid not null references public.agency_memberships (user_id),
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1
);
alter table public.crm_prospects add constraint crm_prospects_campaign_fk foreign key (campaign_id) references public.crm_radar_campaigns (id);

create table public.crm_radar_runs (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  campaign_id uuid references public.crm_radar_campaigns (id),
  idempotency_key text not null unique check (length(idempotency_key) between 8 and 120),
  trigger text not null check (trigger in ('manual', 'schedule')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'blocked')),
  found integer not null default 0, inserted integer not null default 0, updated integer not null default 0,
  attempts smallint not null default 1 check (attempts between 1 and 5),
  error text not null default '' check (length(error) <= 500),
  cost_usd numeric(10, 4) not null default 0,
  started_at timestamptz not null default now(), finished_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id)
);
create index crm_radar_runs_campaign on public.crm_radar_runs (campaign_id, started_at desc);

-- 6. Idempotent ingest: new businesses are inserted pending; known ones only get
-- last_seen/contact fields refreshed (never their review status or stars).
create function public.crm_radar_ingest(places jsonb, run_key text, campaign uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function public.crm_radar_ingest(jsonb, text, uuid) from public, anon;
grant execute on function public.crm_radar_ingest(jsonb, text, uuid) to authenticated;

-- 7. RLS, grants, stamps and audit -----------------------------------------------
do $$ declare t text; begin
  foreach t in array array['crm_prospect_needs', 'crm_radar_campaigns', 'crm_radar_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy crm_read on public.%I for select to authenticated using ((select crm_private.is_owner()) and agency_key = ''avalon'')', t);
  end loop;
  foreach t in array array['crm_prospect_needs', 'crm_radar_campaigns'] loop
    execute format('grant insert, update on public.%I to authenticated', t);
    execute format('create policy crm_insert on public.%I for insert to authenticated with check ((select crm_private.is_owner()) and agency_key = ''avalon'')', t);
    execute format('create policy crm_update on public.%I for update to authenticated using ((select crm_private.is_owner()) and agency_key = ''avalon'') with check ((select crm_private.is_owner()) and agency_key = ''avalon'')', t);
    execute format('create trigger crm_stamp before insert or update on public.%I for each row execute function crm_private.stamp()', t);
    execute format('create trigger crm_audit after insert or update on public.%I for each row execute function crm_private.audit()', t);
  end loop;
end $$;

commit;
