-- Manager execution engine: persistent job queue, leases, allowlist, rate limits and kill switch.
-- PREPARED ONLY: apply to an isolated database first; production needs explicit owner approval.
--
-- Trust model (documented, not hidden):
--  * Managers are deterministic, free executors. They are NOT AI models and the schema forbids saying otherwise
--    (executor_kind = 'deterministic').
--  * Nothing here can write to CRM tables. A run can only store its own report.
--  * The browser role can only READ runs (owners only). Every write goes through the narrow SECURITY DEFINER RPCs below,
--    each of which checks crm_private.is_owner(), the capability allowlist, the kill switch and the rate limits.
--  * Owners are the highest privilege in Avalon: an owner calling crm_agent_complete directly could store a forged
--    report. Reports are therefore operational evidence with an authenticated author (requested_by), not proof against
--    an owner. The audit trail (requested_by, timestamps, attempts) makes any such forgery attributable.
--  * No scheduler is installed. automatic_enabled stays false until an administrator wires a scheduler on purpose.
begin;

-- 1. Settings: one row. Kill switch stops every run; automatic runs are off by default. --------------------------
create table public.crm_agent_settings (
  id text primary key default 'avalon' check (id = 'avalon'),
  kill_switch boolean not null default false,
  automatic_enabled boolean not null default false,
  hourly_limit smallint not null default 6 check (hourly_limit between 1 and 60),
  daily_limit smallint not null default 24 check (daily_limit between 1 and 500),
  freshness_hours smallint not null default 24 check (freshness_hours between 1 and 168),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
insert into public.crm_agent_settings (id) values ('avalon');

-- 2. Capability allowlist: a manager can only ever run what is listed here. -----------------------------------
create table public.crm_agent_capabilities (
  manager_key text not null check (manager_key in ('ren', 'shin', 'haru', 'sora', 'kenji')),
  capability text not null check (capability ~ '^[a-z_]{3,40}$'),
  title text not null check (length(btrim(title)) between 1 and 160),
  primary key (manager_key, capability)
);
insert into public.crm_agent_capabilities (manager_key, capability, title) values
  ('ren', 'operations_plan', 'REN · Plan operativo consolidado'),
  ('shin', 'security_posture', 'SHIN · Revisión de postura de seguridad'),
  ('haru', 'crm_followups', 'HARU · Seguimientos y bloqueos del CRM'),
  ('sora', 'radar_review_queue', 'SORA · Cola de revisión del Radar'),
  ('kenji', 'data_quality_cost', 'KENJI · Calidad de datos y consumo');

-- 3. Runs. -------------------------------------------------------------------------------------------------------
create table public.crm_agent_runs (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  manager_key text not null,
  capability text not null,
  task_title text not null check (length(btrim(task_title)) between 1 and 160),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'blocked')),
  trigger text not null default 'manual' check (trigger in ('manual', 'schedule')),
  executor_kind text not null default 'deterministic' check (executor_kind = 'deterministic'),
  requested_by uuid not null references auth.users (id),
  idempotency_key text not null check (length(idempotency_key) between 8 and 120),
  attempts smallint not null default 0 check (attempts between 0 and 3),
  lease_until timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  result_summary text not null default '' check (length(result_summary) <= 2000),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object' and pg_column_size(result) <= 65536),
  evidence_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_refs) = 'array' and jsonb_array_length(evidence_refs) <= 20),
  error_code text check (error_code is null or error_code ~ '^[a-z_]{3,40}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (manager_key, capability) references public.crm_agent_capabilities (manager_key, capability),
  unique (manager_key, idempotency_key),
  check ((status in ('completed', 'failed', 'blocked')) = (finished_at is not null)),
  check ((status in ('failed', 'blocked')) = (error_code is not null))
);
create index crm_agent_runs_manager on public.crm_agent_runs (manager_key, created_at desc);
create index crm_agent_runs_recent on public.crm_agent_runs (created_at desc);

-- 4. RLS: owners read; nobody writes directly. ---------------------------------------------------------------------
alter table public.crm_agent_settings enable row level security;
alter table public.crm_agent_capabilities enable row level security;
alter table public.crm_agent_runs enable row level security;
revoke all on public.crm_agent_settings from anon, authenticated, public;
revoke all on public.crm_agent_capabilities from anon, authenticated, public;
revoke all on public.crm_agent_runs from anon, authenticated, public;
grant select on public.crm_agent_settings, public.crm_agent_capabilities, public.crm_agent_runs to authenticated;
create policy agent_settings_owner_read on public.crm_agent_settings for select to authenticated using ((select crm_private.is_owner()));
create policy agent_capabilities_owner_read on public.crm_agent_capabilities for select to authenticated using ((select crm_private.is_owner()));
create policy agent_runs_owner_read on public.crm_agent_runs for select to authenticated
  using ((select crm_private.is_owner()) and agency_key = 'avalon');

-- 5. RPCs. All SECURITY DEFINER with an empty search_path and an owner check. ---------------------------------------

-- Queue a run. Idempotent per (manager, key): repeating a request returns the same run and never executes twice.
create function public.crm_agent_enqueue(p_manager text, p_capability text, p_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_title text;
begin
  if not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select c.title into v_title from public.crm_agent_capabilities c where c.manager_key = p_manager and c.capability = p_capability;
  if v_title is null then raise exception 'agent_capability_not_allowed' using errcode = '42501'; end if;
  if p_key is null or length(p_key) not between 8 and 120 then raise exception 'agent_invalid_key' using errcode = '22023'; end if;
  insert into public.crm_agent_runs (manager_key, capability, task_title, requested_by, idempotency_key)
  values (p_manager, p_capability, v_title, (select auth.uid()), p_key)
  on conflict (manager_key, idempotency_key) do nothing
  returning id into v_id;
  if v_id is null then
    select r.id into v_id from public.crm_agent_runs r where r.manager_key = p_manager and r.idempotency_key = p_key;
  end if;
  return v_id;
end $$;

-- Claim a queued run (or reclaim one whose lease expired). Applies kill switch and rate limits BEFORE any work starts.
-- Returns {claimed, status, error_code}. A finished run is never re-executed.
create function public.crm_agent_claim(p_run uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.crm_agent_runs; s public.crm_agent_settings; used_hour int; used_day int;
begin
  if not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into r from public.crm_agent_runs where id = p_run for update;
  if not found then raise exception 'agent_run_not_found' using errcode = 'P0002'; end if;
  if r.requested_by <> (select auth.uid()) then raise exception 'agent_run_not_yours' using errcode = '42501'; end if;
  if r.status in ('completed', 'failed', 'blocked') then
    return jsonb_build_object('claimed', false, 'status', r.status, 'error_code', r.error_code);
  end if;
  if r.status = 'running' and r.lease_until > now() then
    return jsonb_build_object('claimed', false, 'status', 'running', 'error_code', null);
  end if;
  select * into s from public.crm_agent_settings where id = 'avalon';
  if s.kill_switch then
    update public.crm_agent_runs set status = 'blocked', error_code = 'kill_switch', finished_at = now(), lease_until = null, updated_at = now() where id = r.id;
    return jsonb_build_object('claimed', false, 'status', 'blocked', 'error_code', 'kill_switch');
  end if;
  if r.attempts >= 3 then
    update public.crm_agent_runs set status = 'failed', error_code = 'lease_expired', finished_at = now(), lease_until = null, updated_at = now() where id = r.id;
    return jsonb_build_object('claimed', false, 'status', 'failed', 'error_code', 'lease_expired');
  end if;
  select count(*) into used_hour from public.crm_agent_runs x
    where x.manager_key = r.manager_key and x.id <> r.id and x.started_at > now() - interval '1 hour';
  select count(*) into used_day from public.crm_agent_runs x
    where x.manager_key = r.manager_key and x.id <> r.id and x.started_at > now() - interval '24 hours';
  if used_hour >= s.hourly_limit then
    update public.crm_agent_runs set status = 'blocked', error_code = 'hourly_limit', finished_at = now(), lease_until = null, updated_at = now() where id = r.id;
    return jsonb_build_object('claimed', false, 'status', 'blocked', 'error_code', 'hourly_limit');
  end if;
  if used_day >= s.daily_limit then
    update public.crm_agent_runs set status = 'blocked', error_code = 'daily_limit', finished_at = now(), lease_until = null, updated_at = now() where id = r.id;
    return jsonb_build_object('claimed', false, 'status', 'blocked', 'error_code', 'daily_limit');
  end if;
  update public.crm_agent_runs set status = 'running', attempts = attempts + 1, lease_until = now() + interval '4 minutes',
    started_at = coalesce(started_at, now()), updated_at = now() where id = r.id;
  return jsonb_build_object('claimed', true, 'status', 'running', 'error_code', null);
end $$;

-- Store the report of a run that this owner claimed. Only a running run with a valid lease can complete.
create function public.crm_agent_complete(p_run uuid, p_summary text, p_result jsonb, p_evidence jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.crm_agent_runs;
begin
  if not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into r from public.crm_agent_runs where id = p_run for update;
  if not found then raise exception 'agent_run_not_found' using errcode = 'P0002'; end if;
  if r.requested_by <> (select auth.uid()) then raise exception 'agent_run_not_yours' using errcode = '42501'; end if;
  if r.status <> 'running' or r.lease_until is null or r.lease_until <= now() then raise exception 'agent_run_not_running' using errcode = '55000'; end if;
  update public.crm_agent_runs set status = 'completed', result_summary = left(coalesce(p_summary, ''), 2000),
    result = coalesce(p_result, '{}'::jsonb), evidence_refs = coalesce(p_evidence, '[]'::jsonb),
    finished_at = now(), lease_until = null, error_code = null, updated_at = now() where id = r.id;
end $$;

create function public.crm_agent_fail(p_run uuid, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.crm_agent_runs;
begin
  if not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into r from public.crm_agent_runs where id = p_run for update;
  if not found then raise exception 'agent_run_not_found' using errcode = 'P0002'; end if;
  if r.requested_by <> (select auth.uid()) then raise exception 'agent_run_not_yours' using errcode = '42501'; end if;
  if r.status not in ('queued', 'running') then return; end if;
  update public.crm_agent_runs set status = 'failed', error_code = case when p_code ~ '^[a-z_]{3,40}$' then p_code else 'executor_error' end,
    finished_at = now(), lease_until = null, updated_at = now() where id = r.id;
end $$;

-- Emergency stop. true = nothing starts (manual or scheduled). Owner only; attributable.
create function public.crm_agent_set_kill_switch(p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  update public.crm_agent_settings set kill_switch = coalesce(p_on, true), updated_by = (select auth.uid()), updated_at = now() where id = 'avalon';
end $$;

-- Read-only catalog review used by SHIN. It reports facts about privileges; it never changes anything.
create function public.crm_agent_security_posture()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'tables_without_rls', (select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
    'tables_readable_by_anon', (select coalesce(jsonb_agg(t.table_name order by t.table_name), '[]'::jsonb) from (
      select distinct g.table_name from information_schema.role_table_grants g
      where g.table_schema = 'public' and g.grantee = 'anon') t),
    'definer_functions_callable_by_anon', (select coalesce(jsonb_agg(p.proname order by p.proname), '[]'::jsonb)
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and pg_catalog.has_function_privilege('anon', p.oid, 'execute')),
    'definer_functions_total', (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef),
    'owner_memberships', (select count(*) from public.agency_memberships where role = 'owner'),
    'other_memberships', (select count(*) from public.agency_memberships where role <> 'owner'),
    'kill_switch', (select kill_switch from public.crm_agent_settings where id = 'avalon'),
    'checked_at', now()
  );
end $$;

-- 6. Execute grants: owners (authenticated) only; never anon or PUBLIC. ----------------------------------------------
revoke all on function public.crm_agent_enqueue(text, text, text), public.crm_agent_claim(uuid),
  public.crm_agent_complete(uuid, text, jsonb, jsonb), public.crm_agent_fail(uuid, text),
  public.crm_agent_set_kill_switch(boolean), public.crm_agent_security_posture() from public, anon;
grant execute on function public.crm_agent_enqueue(text, text, text), public.crm_agent_claim(uuid),
  public.crm_agent_complete(uuid, text, jsonb, jsonb), public.crm_agent_fail(uuid, text),
  public.crm_agent_set_kill_switch(boolean), public.crm_agent_security_posture() to authenticated;

commit;
