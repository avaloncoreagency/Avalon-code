-- CRM TITAN · backend (Claude Code). Additive: new columns have safe defaults, new functions, and guards that only act
-- on NEW writes (existing rows are never rewritten or deleted). Prepared for isolated verification; applying it to
-- production requires the owner's explicit approval.
--
--  1. Commissions: an approval can no longer be attributed to another owner, and changing the commission terms after
--     approval requires approving them again (who and when are recorded and audited).
--  2. Duplicates: server-side candidate search (phone digits, e-mail, domain, normalized name) instead of reading at
--     most 5,000 leads into the server.
--  3. Canonical links: a task cannot point at a sale or project of a different client.
--  4. Finance: explicit capability read (no e-mail comparison) and an exact SQL aggregate per currency for Client 360°.
--  5. Radar: provider failures are recorded (status, provider, code) and count against the daily cap; each run
--     distinguishes new, refreshed and already-known businesses.
--  6. Funnel Builder → CRM: the #155 prototype becomes a real migration with consent provenance, durable abuse limits,
--     restored identity after the audited insert, and client (Type B) funnels kept out of Avalon's B2B CRM.
begin;

-- ── 1. Commission approval ───────────────────────────────────────────────────────────────────────────────────────
alter table public.crm_commercial_terms add column if not exists commission_approved_at timestamptz;

create function crm_private.commission_guard() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and (new.commission_pct, new.commission_base, new.billing_model, new.commission_approved_by)
       is not distinct from (old.commission_pct, old.commission_base, old.billing_model, old.commission_approved_by) then
    new.commission_approved_at := old.commission_approved_at;   -- unrelated edits keep the original approval
    return new;
  end if;
  if new.commission_approved_by is null then
    new.commission_approved_at := null;
    return new;
  end if;
  -- Whoever changes the commission (or approves it) must be the approver: no approval on someone else's behalf, and no
  -- stale approval surviving a new percentage, base or billing model.
  if new.commission_approved_by is distinct from auth.uid() then
    raise exception 'commission_approval_forged' using errcode = '42501',
      hint = 'Solo quien aprueba la comisión puede figurar como aprobador; un cambio de condiciones exige aprobarla de nuevo.';
  end if;
  new.commission_approved_at := now();
  return new;
end $$;
revoke all on function crm_private.commission_guard() from public;
create trigger crm_terms_commission_guard before insert or update on public.crm_commercial_terms
  for each row execute function crm_private.commission_guard();

create function crm_private.commission_events() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.commission_approved_by is not null
     and (TG_OP = 'INSERT' or (new.commission_pct, new.commission_base, new.billing_model, new.commission_approved_by)
       is distinct from (old.commission_pct, old.commission_base, old.billing_model, old.commission_approved_by)) then
    perform crm_private.log('commission.approved', 'crm', 'crm_commercial_terms', new.id, to_state => new.kind,
      detail => coalesce(new.commission_pct::text, '-') || '% · ' || coalesce(new.commission_base, '-') || ' · ' || coalesce(new.billing_model, '-'));
  elsif TG_OP = 'UPDATE' and old.commission_approved_by is not null and new.commission_approved_by is null then
    perform crm_private.log('commission.approval_cleared', 'crm', 'crm_commercial_terms', new.id, to_state => new.kind,
      detail => coalesce(new.commission_pct::text, '-') || '%');
  end if;
  return null;
end $$;
revoke all on function crm_private.commission_events() from public, anon, authenticated;
create trigger crm_terms_commission_events after insert or update on public.crm_commercial_terms
  for each row execute function crm_private.commission_events();

-- ── 2. Duplicate candidates ──────────────────────────────────────────────────────────────────────────────────────
-- Same normalization as src/lib/crm/intel/duplicates.ts normName (accents, legal suffixes, punctuation).
create function crm_private.norm_company(t text) returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(
    translate(lower(coalesce(t, '')), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc'),
    '\m(llc|inc|corp|co|ltd|the)\M', '', 'g'), '[^a-z0-9]+', ' ', 'g'));
$$;
revoke all on function crm_private.norm_company(text) from public, anon;
grant execute on function crm_private.norm_company(text) to authenticated;

-- Returns a bounded superset of possible duplicates; the caller applies the exact rules (findDuplicates). Only WARNS:
-- nothing is merged. Owners only (RLS on crm_leads also applies: security invoker).
create function public.crm_lead_duplicate_candidates(p_phone text default '', p_email text default '',
  p_domain text default '', p_name text default '')
returns table (id uuid, company text, phone text, email text, website text, zip text, city text)
language plpgsql stable security invoker set search_path = '' as $$
declare d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  e text := lower(btrim(coalesce(p_email, '')));
  dom text := lower(btrim(coalesce(p_domain, '')));
  n text := crm_private.norm_company(left(coalesce(p_name, ''), 200));
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if length(d) = 11 and left(d, 1) = '1' then d := substr(d, 2); end if;
  if length(d) < 7 or length(d) > 15 then d := ''; end if;
  if dom !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' or length(dom) > 253 then dom := ''; end if;
  if length(e) > 254 or e !~ '^[^[:space:]@]+@[^[:space:]@]+$' then e := ''; end if;
  if length(n) < 2 then n := ''; end if;
  return query
    select l.id, l.company, l.phone, l.email, l.website, l.zip, l.city
    from public.crm_leads l
    where not l.archived and (
      (d <> '' and l.phone <> '' and regexp_replace(l.phone, '\D', '', 'g') in (d, '1' || d))
      or (e <> '' and lower(btrim(l.email)) = e)
      or (dom <> '' and (lower(l.website) like '%' || dom || '%' or lower(btrim(l.email)) like '%@' || dom))
      or (n <> '' and crm_private.norm_company(l.company) = n))
    order by l.created_at desc
    limit 50;
end $$;
revoke all on function public.crm_lead_duplicate_candidates(text, text, text, text) from public, anon;
grant execute on function public.crm_lead_duplicate_candidates(text, text, text, text) to authenticated;

-- ── 3. Canonical links client → sale → project → task ────────────────────────────────────────────────────────────
-- Checked only when a task's links are written (insert, or an actual change), so legacy rows keep working.
create function crm_private.task_links_guard() returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_client uuid;
begin
  if TG_OP = 'UPDATE' and (new.client_id, new.project_id, new.sale_id)
       is not distinct from (old.client_id, old.project_id, old.sale_id) then
    return new;
  end if;
  if new.sale_id is not null then
    select s.client_id into v_client from public.crm_sales s where s.id = new.sale_id;
    if v_client is not null then
      if new.client_id is null then new.client_id := v_client;
      elsif new.client_id <> v_client then
        raise exception 'task_link_mismatch' using errcode = '23514', detail = 'La venta pertenece a otro cliente.';
      end if;
    end if;
  end if;
  if new.project_id is not null then
    v_client := null;
    select p.client_id into v_client from public.os_projects p where p.id = new.project_id;
    if v_client is not null then
      if new.client_id is null then new.client_id := v_client;
      elsif new.client_id <> v_client then
        raise exception 'task_link_mismatch' using errcode = '23514', detail = 'El proyecto pertenece a otro cliente.';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function crm_private.task_links_guard() from public;
create trigger crm_tasks_links_guard before insert or update of client_id, project_id, sale_id on public.crm_tasks
  for each row execute function crm_private.task_links_guard();

-- ── 4. Finance capability and exact aggregate ────────────────────────────────────────────────────────────────────
-- Capabilities come from PostgreSQL (agency_memberships + crm_private.finance_access), never from comparing an e-mail.
-- No new permission is granted here: finance_view is exactly what the existing allow-list already says.
create function public.crm_my_capabilities() returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'owner', coalesce((select auth.uid()) is not null and crm_private.is_owner(), false),
    'finance_view', coalesce((select auth.uid()) is not null and crm_private.can_view_client_finances(), false),
    'commission_approve', coalesce((select auth.uid()) is not null and crm_private.is_owner(), false));
$$;
revoke all on function public.crm_my_capabilities() from public, anon;
grant execute on function public.crm_my_capabilities() to authenticated;

-- One SQL snapshot over EVERY row (no page size, no 100/200 cap). Only confirmed sales count; cancelled sales are
-- reported apart. Currencies are never mixed or converted. Amounts are exact numeric rendered as text.
create function public.crm_client_finance_summary(p_client uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare cur jsonb; n_confirmed int; n_cancelled int; n_costs int;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if not crm_private.can_view_client_finances() then raise exception 'finance_forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.crm_clients c where c.id = p_client) then
    raise exception 'client_not_found' using errcode = 'P0002';
  end if;
  select count(*) filter (where s.status = 'confirmed'), count(*) filter (where s.status = 'cancelled')
    into n_confirmed, n_cancelled from public.crm_sales s where s.client_id = p_client;
  select count(*) into n_costs from public.crm_client_costs c where c.client_id = p_client;
  with s as (
    select x.currency, count(*) as n, sum(x.total) as contracted, sum(x.recurring_monthly) as recurring,
           count(*) filter (where x.contract_status = 'cancelled') as cancelled_contracts
    from public.crm_sales x where x.client_id = p_client and x.status = 'confirmed' group by x.currency),
  p as (
    select pay.currency, sum(pay.amount) as collected
    from public.crm_payments pay join public.crm_sales x on x.id = pay.sale_id
    where x.client_id = p_client and x.status = 'confirmed' group by pay.currency),
  c as (
    select k.currency, count(*) as n, sum(k.amount) as expenses
    from public.crm_client_costs k where k.client_id = p_client group by k.currency),
  cur_keys as (select s.currency from s union select p.currency from p union select c.currency from c)
  select coalesce(jsonb_agg(jsonb_build_object(
      'currency', k.currency,
      'sales', coalesce(s.n, 0),
      'costs', coalesce(c.n, 0),
      'contracted', coalesce(s.contracted, 0)::text,
      'collected', coalesce(p.collected, 0)::text,
      'recurring_monthly', coalesce(s.recurring, 0)::text,
      'expenses', coalesce(c.expenses, 0)::text,
      'profit', (coalesce(p.collected, 0) - coalesce(c.expenses, 0))::text,
      'cancelled_contracts', coalesce(s.cancelled_contracts, 0)) order by k.currency), '[]'::jsonb)
    into cur
  from cur_keys k left join s on s.currency = k.currency left join p on p.currency = k.currency left join c on c.currency = k.currency;
  return jsonb_build_object('client_id', p_client, 'complete', true, 'source', 'sql_aggregate',
    'sales_confirmed', n_confirmed, 'sales_cancelled', n_cancelled, 'costs', n_costs, 'currencies', cur, 'as_of', now());
end $$;
revoke all on function public.crm_client_finance_summary(uuid) from public, anon;
grant execute on function public.crm_client_finance_summary(uuid) to authenticated;

-- ── 5. Radar: provider, failures and run outcomes ────────────────────────────────────────────────────────────────
alter table public.crm_radar_runs
  add column if not exists provider text not null default '' check (provider in ('', 'geoapify', 'overpass')),
  add column if not exists error_code text not null default '' check (error_code ~ '^[a-z0-9_]{0,40}$');
alter table public.crm_radar_run_places drop constraint if exists crm_radar_run_places_outcome_check;
alter table public.crm_radar_run_places add constraint crm_radar_run_places_outcome_check
  check (outcome in ('inserted', 'refreshed', 'known'));

-- Same signature and return keys as 20261110140000 (callers unchanged). Additions: `known` and `refreshed` counters
-- (`updated` keeps meaning "matched an existing business" = known + refreshed) and the provider stored on the run.
create or replace function public.crm_radar_ingest(places jsonb, run_key text, campaign uuid default null, search jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p jsonb; ref text; n_ins int := 0; n_upd int := 0; n_ref int := 0; seen int := 0; pid uuid; filled uuid;
  run public.crm_radar_runs; owner uuid := auth.uid(); kind text; lat double precision; lon double precision; radius int;
  inds text[]; prov text;
begin
  if owner is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(places) <> 'array' or jsonb_array_length(places) > 500 then raise exception 'radar_invalid' using errcode = '22023'; end if;
  if run_key is null or length(run_key) not between 8 and 120 then raise exception 'radar_invalid' using errcode = '22023'; end if;
  if search is not null and jsonb_typeof(search) <> 'object' then raise exception 'radar_invalid' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('radar:' || run_key, 0));
  select * into run from public.crm_radar_runs r where r.idempotency_key = run_key;
  if found then
    return jsonb_build_object('run_id', run.id, 'found', run.found, 'inserted', run.inserted, 'updated', run.updated,
      'status', run.status, 'replayed', true);
  end if;

  kind := coalesce(search ->> 'kind', case when campaign is null then 'unknown' else 'campaign' end);
  if kind not in ('unknown', 'coordinates', 'postcode', 'address', 'place', 'map', 'campaign') then kind := 'unknown'; end if;
  lat := case when jsonb_typeof(search -> 'lat') = 'number' then (search ->> 'lat')::double precision end;
  lon := case when jsonb_typeof(search -> 'lon') = 'number' then (search ->> 'lon')::double precision end;
  radius := case when jsonb_typeof(search -> 'radius_m') = 'number' then round((search ->> 'radius_m')::numeric)::int end;
  inds := case when jsonb_typeof(search -> 'industries') = 'array'
    then (select coalesce(array_agg(left(x, 40)), '{}') from (select jsonb_array_elements_text(search -> 'industries') x limit 10) i) else '{}' end;
  prov := case when search ->> 'provider' in ('geoapify', 'overpass') then search ->> 'provider' else '' end;

  insert into public.crm_radar_runs (campaign_id, idempotency_key, trigger, status, center_lat, center_lon, radius_m, label,
    query_kind, industries, provider)
  values (campaign, run_key, case when campaign is null then 'manual' else 'schedule' end, 'running', lat, lon, radius,
          left(coalesce(search ->> 'label', ''), 200), kind, inds, prov)
  returning * into run;

  for p in select value from jsonb_array_elements(places) loop
    ref := p ->> 'source_ref';
    continue when ref is null or ref !~ '^[a-z0-9_]+:[A-Za-z0-9/_.:-]{1,120}$' or length(btrim(coalesce(p ->> 'name', ''))) = 0;
    seen := seen + 1;
    pid := null; filled := null;
    select x.id into pid from public.crm_prospects x where x.source_ref = ref;
    if pid is not null then
      -- Known business: refresh last_seen; fill ONLY empty contact fields (never overwrite, never touch review data).
      update public.crm_prospects set last_seen_at = now() where id = pid and status <> 'converted';
      update public.crm_prospects set
        phone = case when phone = '' then left(coalesce(p ->> 'phone', ''), 40) else phone end,
        website = case when website = '' then left(coalesce(p ->> 'website', ''), 500) else website end
      where id = pid and status <> 'converted'
        and ((phone = '' and coalesce(p ->> 'phone', '') <> '') or (website = '' and coalesce(p ->> 'website', '') <> ''))
      returning id into filled;
      n_upd := n_upd + 1;
      if filled is not null then n_ref := n_ref + 1; end if;
      insert into public.crm_radar_run_places (run_id, prospect_id, outcome)
      values (run.id, pid, case when filled is not null then 'refreshed' else 'known' end) on conflict do nothing;
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
      n_upd := n_upd + 1;   -- lost to another unique guard: counted as known, never linked to a guess
    end if;
  end loop;

  update public.crm_radar_runs r set status = 'succeeded', found = seen, inserted = n_ins, updated = n_upd, finished_at = now()
  where r.id = run.id;
  if campaign is not null then update public.crm_radar_campaigns set last_run_at = now() where id = campaign; end if;
  return jsonb_build_object('run_id', run.id, 'found', seen, 'inserted', n_ins, 'updated', n_upd,
    'refreshed', n_ref, 'known', n_upd - n_ref, 'status', 'succeeded', 'replayed', false);
end $$;
revoke all on function public.crm_radar_ingest(jsonb, text, uuid, jsonb) from public, anon;
grant execute on function public.crm_radar_ingest(jsonb, text, uuid, jsonb) to authenticated;

-- A provider call that failed is still a run: it is visible in the history with its provider and error code, and it
-- counts against the daily search cap (it may have spent provider credits). Idempotent per run key. Never stores the
-- provider's raw message (it could echo the request), only a fixed code.
create function public.crm_radar_record_failure(run_key text, search jsonb, provider text, code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare run public.crm_radar_runs; kind text; prov text;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if run_key is null or length(run_key) not between 8 and 120 then raise exception 'radar_invalid' using errcode = '22023'; end if;
  if code is null or code not in ('provider_rate_limited', 'provider_auth', 'provider_http', 'provider_timeout',
       'provider_parse', 'provider_network', 'provider_too_large', 'ingest_failed') then
    raise exception 'radar_invalid' using errcode = '22023';
  end if;
  if search is not null and jsonb_typeof(search) <> 'object' then raise exception 'radar_invalid' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('radar:' || run_key, 0));
  select * into run from public.crm_radar_runs r where r.idempotency_key = run_key;
  if found then return jsonb_build_object('run_id', run.id, 'status', run.status, 'replayed', true); end if;
  kind := coalesce(search ->> 'kind', 'unknown');
  if kind not in ('unknown', 'coordinates', 'postcode', 'address', 'place', 'map', 'campaign') then kind := 'unknown'; end if;
  prov := case when provider in ('geoapify', 'overpass') then provider else '' end;
  insert into public.crm_radar_runs (idempotency_key, trigger, status, label, query_kind, provider, error, error_code,
    center_lat, center_lon, radius_m, finished_at)
  values (run_key, 'manual', 'failed', left(coalesce(search ->> 'label', ''), 200), kind, prov, code, code,
    case when jsonb_typeof(search -> 'lat') = 'number' and (search ->> 'lat')::double precision between -90 and 90 then (search ->> 'lat')::double precision end,
    case when jsonb_typeof(search -> 'lon') = 'number' and (search ->> 'lon')::double precision between -180 and 180 then (search ->> 'lon')::double precision end,
    case when jsonb_typeof(search -> 'radius_m') = 'number' and (search ->> 'radius_m')::numeric between 100 and 80467 then round((search ->> 'radius_m')::numeric)::int end,
    now())
  returning * into run;
  return jsonb_build_object('run_id', run.id, 'status', 'failed', 'replayed', false);
end $$;
revoke all on function public.crm_radar_record_failure(text, jsonb, text, text) from public, anon;
grant execute on function public.crm_radar_record_failure(text, jsonb, text, text) to authenticated;

-- ── 6. Funnel Builder → CRM (from the docs/sql/growth-funnel-prototype.sql reviewed in #155) ─────────────────────
create table public.crm_growth_funnels (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  slug text not null unique check (length(slug) between 3 and 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(btrim(title)) between 4 and 120),
  subheading text not null default '' check (length(subheading) <= 500),
  cta text not null default 'Solicitar información' check (length(btrim(cta)) between 4 and 80),
  template text not null check (template in ('capture', 'sales', 'appointments')),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  -- A funnel linked to a client collects THAT client's consumers (Type B). They never enter Avalon's B2B CRM.
  client_id uuid references public.crm_clients (id),
  project_id uuid references public.os_projects (id),
  consent_version text not null default 'avalon-optin-v1' check (consent_version ~ '^[a-z0-9._-]{3,40}$'),
  created_by uuid not null default auth.uid() references public.agency_memberships (user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);
create index crm_growth_funnels_client_idx on public.crm_growth_funnels (client_id, status);
alter table public.crm_growth_funnels enable row level security;
revoke all on public.crm_growth_funnels from anon, authenticated, public;
grant select, insert, update on public.crm_growth_funnels to authenticated;
create policy growth_owner_read on public.crm_growth_funnels
  for select to authenticated using ((select crm_private.is_owner()) and agency_key = 'avalon');
create policy growth_owner_insert on public.crm_growth_funnels
  for insert to authenticated with check ((select crm_private.is_owner()) and agency_key = 'avalon'
    and created_by = (select auth.uid()));
create policy growth_owner_update on public.crm_growth_funnels
  for update to authenticated using ((select crm_private.is_owner()) and agency_key = 'avalon')
  with check ((select crm_private.is_owner()) and agency_key = 'avalon');

create function crm_private.growth_funnel_touch() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.created_by is distinct from old.created_by
     or new.agency_key is distinct from old.agency_key then
    raise exception 'Funnel identity is immutable' using errcode = '42501';
  end if;
  if new.version <> old.version + 1 then raise exception 'Funnel version conflict' using errcode = '23514'; end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function crm_private.growth_funnel_touch() from public, anon, authenticated;
create trigger crm_growth_funnel_touch before update on public.crm_growth_funnels
  for each row execute function crm_private.growth_funnel_touch();

create table public.crm_growth_funnel_submissions (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  funnel_id uuid not null references public.crm_growth_funnels (id),
  lead_id uuid not null references public.crm_leads (id),
  email_hash text not null check (length(email_hash) = 64),
  message text not null check (length(btrim(message)) between 10 and 2000),
  -- Consent and provenance: what the visitor agreed to, when, and where the request came from (no IP stored).
  consent_at timestamptz not null,
  consent_version text not null check (consent_version ~ '^[a-z0-9._-]{3,40}$'),
  referrer_host text not null default '' check (referrer_host = '' or (length(referrer_host) <= 253 and referrer_host ~ '^[a-z0-9.-]+$')),
  utm jsonb not null default '{}'::jsonb check (jsonb_typeof(utm) = 'object' and octet_length(utm::text) <= 600),
  fingerprint_hash text not null default '' check (fingerprint_hash = '' or fingerprint_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (funnel_id, email_hash)
);
create index crm_growth_funnel_submissions_recent on public.crm_growth_funnel_submissions (created_at desc);
create index crm_growth_funnel_submissions_funnel on public.crm_growth_funnel_submissions (funnel_id, created_at desc);
create index crm_growth_funnel_submissions_fp on public.crm_growth_funnel_submissions (fingerprint_hash, created_at desc) where fingerprint_hash <> '';
create index crm_growth_funnel_submissions_lead on public.crm_growth_funnel_submissions (lead_id);
alter table public.crm_growth_funnel_submissions enable row level security;
revoke all on public.crm_growth_funnel_submissions from anon, authenticated, public;
grant select on public.crm_growth_funnel_submissions to authenticated;
create policy growth_submissions_owner_read on public.crm_growth_funnel_submissions
  for select to authenticated using ((select crm_private.is_owner()) and agency_key = 'avalon');

-- Public read: display strings only (no ids, owners, clients, metrics). Client (Type B) funnels are not served here.
create function public.crm_growth_funnel_view(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare f public.crm_growth_funnels;
begin
  if p_slug is null or length(p_slug) not between 3 and 60 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then return null; end if;
  select * into f from public.crm_growth_funnels where slug = p_slug and status = 'active' and client_id is null;
  if not found then return null; end if;
  return jsonb_build_object('slug', f.slug, 'title', f.title, 'subheading', f.subheading, 'cta', f.cta,
    'template', f.template, 'consent_version', f.consent_version);
end $$;
revoke all on function public.crm_growth_funnel_view(text) from public, anon, authenticated;
grant execute on function public.crm_growth_funnel_view(text) to authenticated;

-- The only anonymous write: bounded, validated, single purpose. Returns 'ok' | 'invalid' | 'throttled' | 'unavailable'.
-- Creates at most ONE lead at stage "new" (or reuses the lead with the same e-mail). Never a client, sale, appointment
-- or outbound message.
create function public.crm_growth_funnel_submit(request jsonb) returns text
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
  if v_consent_version <> '' and v_consent_version <> f.consent_version then return 'invalid'; end if;
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
revoke all on function public.crm_growth_funnel_submit(jsonb) from public, anon, authenticated;
-- Deliberately NOT granted to anon here. Exposing a SECURITY DEFINER function to anonymous visitors needs the owner's
-- explicit security approval: the grant lives in docs/sql/growth-funnel-public-grant.sql (review in
-- docs/handoff/CRM_BACKEND_CONTRACT.md §6). Until then the public form answers "unavailable" and nothing is written.

commit;
