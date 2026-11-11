-- Radar: every search knows its own results.
-- Before: crm_radar_ingest stored businesses in crm_prospects but not WHICH run found them, so after a ZIP/address
-- search the UI reloaded the whole accumulated inbox (sorted by stars, limit 300) and a new zone's businesses could be
-- missing or mixed with old ones. Now:
--   * crm_radar_run_places links run → prospect (inserted OR already known), so results are scoped by run_id.
--   * crm_radar_runs records what was searched (center, radius, label, query kind, industries) → persistent history.
--   * Replaying a run key returns the SAME run and its same results (no provider call, no duplicates).
-- Discovery still never approves: rows stay pending; conversion keeps going only through the existing owner approval.

alter table public.crm_radar_runs
  add column if not exists center_lat double precision check (center_lat is null or center_lat between -90 and 90),
  add column if not exists center_lon double precision check (center_lon is null or center_lon between -180 and 180),
  add column if not exists radius_m integer check (radius_m is null or radius_m between 100 and 80467),
  add column if not exists label text not null default '' check (length(label) <= 200),
  add column if not exists query_kind text not null default 'unknown'
    check (query_kind in ('unknown', 'coordinates', 'postcode', 'address', 'place', 'map', 'campaign')),
  add column if not exists industries text[] not null default '{}' check (cardinality(industries) <= 10);
create index if not exists crm_radar_runs_started on public.crm_radar_runs (started_at desc);

create table public.crm_radar_run_places (
  run_id uuid not null references public.crm_radar_runs (id) on delete cascade,
  prospect_id uuid not null references public.crm_prospects (id),
  outcome text not null check (outcome in ('inserted', 'known')),
  primary key (run_id, prospect_id)
);
create index crm_radar_run_places_prospect on public.crm_radar_run_places (prospect_id);
alter table public.crm_radar_run_places enable row level security;
revoke all on public.crm_radar_run_places from anon, authenticated, public;
grant select on public.crm_radar_run_places to authenticated;
create policy radar_run_places_owner_read on public.crm_radar_run_places for select to authenticated
  using ((select crm_private.is_owner()));

-- Same signature as before (callers unchanged) + an optional search descriptor. The 3-argument call keeps working.
drop function if exists public.crm_radar_ingest(jsonb, text, uuid);
create function public.crm_radar_ingest(places jsonb, run_key text, campaign uuid default null, search jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p jsonb; ref text; n_ins int := 0; n_upd int := 0; seen int := 0; pid uuid;
  run public.crm_radar_runs; owner uuid := auth.uid(); kind text; lat double precision; lon double precision; radius int;
  inds text[];
begin
  if owner is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(places) <> 'array' or jsonb_array_length(places) > 500 then raise exception 'radar_invalid' using errcode = '22023'; end if;
  if run_key is null or length(run_key) not between 8 and 120 then raise exception 'radar_invalid' using errcode = '22023'; end if;
  if search is not null and jsonb_typeof(search) <> 'object' then raise exception 'radar_invalid' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('radar:' || run_key, 0));
  select * into run from public.crm_radar_runs r where r.idempotency_key = run_key;
  if found then
    return jsonb_build_object('run_id', run.id, 'found', run.found, 'inserted', run.inserted, 'updated', run.updated, 'replayed', true);
  end if;

  kind := coalesce(search ->> 'kind', case when campaign is null then 'unknown' else 'campaign' end);
  if kind not in ('unknown', 'coordinates', 'postcode', 'address', 'place', 'map', 'campaign') then kind := 'unknown'; end if;
  lat := case when jsonb_typeof(search -> 'lat') = 'number' then (search ->> 'lat')::double precision end;
  lon := case when jsonb_typeof(search -> 'lon') = 'number' then (search ->> 'lon')::double precision end;
  radius := case when jsonb_typeof(search -> 'radius_m') = 'number' then round((search ->> 'radius_m')::numeric)::int end;
  inds := case when jsonb_typeof(search -> 'industries') = 'array'
    then (select coalesce(array_agg(left(x, 40)), '{}') from (select jsonb_array_elements_text(search -> 'industries') x limit 10) i) else '{}' end;

  -- The run row exists first so every result can point at it.
  insert into public.crm_radar_runs (campaign_id, idempotency_key, trigger, status, center_lat, center_lon, radius_m, label, query_kind, industries)
  values (campaign, run_key, case when campaign is null then 'manual' else 'schedule' end, 'running', lat, lon, radius,
          left(coalesce(search ->> 'label', ''), 200), kind, inds)
  returning * into run;

  for p in select value from jsonb_array_elements(places) loop
    ref := p ->> 'source_ref';
    continue when ref is null or ref !~ '^[a-z0-9_]+:[A-Za-z0-9/_.:-]{1,120}$' or length(btrim(coalesce(p ->> 'name', ''))) = 0;
    seen := seen + 1;
    update public.crm_prospects set last_seen_at = now(),
      phone = case when phone = '' then left(coalesce(p ->> 'phone', ''), 40) else phone end,
      website = case when website = '' then left(coalesce(p ->> 'website', ''), 500) else website end
    where source_ref = ref and status <> 'converted';
    -- Converted prospects are immutable (crm_core): recognise them, never rewrite.
    select x.id into pid from public.crm_prospects x where x.source_ref = ref;
    if pid is not null then
      n_upd := n_upd + 1;
      insert into public.crm_radar_run_places (run_id, prospect_id, outcome) values (run.id, pid, 'known') on conflict do nothing;
      continue;
    end if;
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
    on conflict do nothing
    returning id into pid;
    if pid is not null then
      n_ins := n_ins + 1;
      insert into public.crm_radar_run_places (run_id, prospect_id, outcome) values (run.id, pid, 'inserted') on conflict do nothing;
    else
      -- Lost to another unique guard (e.g. hand-entered company + contact): counted as known, not linked to a guess.
      n_upd := n_upd + 1;
    end if;
  end loop;

  update public.crm_radar_runs r set status = 'succeeded', found = seen, inserted = n_ins, updated = n_upd, finished_at = now()
  where r.id = run.id;
  if campaign is not null then update public.crm_radar_campaigns set last_run_at = now() where id = campaign; end if;
  return jsonb_build_object('run_id', run.id, 'found', seen, 'inserted', n_ins, 'updated', n_upd, 'replayed', false);
end $$;
revoke all on function public.crm_radar_ingest(jsonb, text, uuid, jsonb) from public, anon;
grant execute on function public.crm_radar_ingest(jsonb, text, uuid, jsonb) to authenticated;
