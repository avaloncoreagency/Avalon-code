-- Avalon HQ 0350 — Managers: missions with dependent steps, a versioned capability registry, SQL-native deterministic
-- executors (one implementation for the owner button AND the scheduler), retries, and an hourly pg_cron tick that does
-- nothing unless an owner turned automation on and the kill switch is off.
-- Managers are deterministic rules, not AI models. The only write capability (haru.followup_tasks) creates INTERNAL
-- crm_tasks, at most 10 per run, deduplicated forever by crm_agent_task_links.dedupe_key.
-- Rollback: select cron.unschedule('avalon-managers-hourly'); drop the functions/tables below; the columns added to
-- crm_agent_capabilities / crm_agent_runs / crm_agent_settings are nullable or defaulted and can stay.
begin;

-- 1. Versioned, configurable capability registry -----------------------------------------------------------------
alter table public.crm_agent_capabilities
  add column contract_version integer not null default 1 check (contract_version > 0),
  add column enabled boolean not null default true,
  add column effect text not null default 'read' check (effect in ('read', 'write_internal')),
  add column description text not null default '' check (length(description) <= 500),
  add column max_writes smallint not null default 0 check (max_writes between 0 and 25);
update public.crm_agent_capabilities set description = case capability
  when 'operations_plan' then 'Consolida los resultados de la misión y el estado del CRM en un plan priorizado.'
  when 'security_posture' then 'Revisa en el catálogo RLS, privilegios anon y funciones definer. No es una auditoría completa.'
  when 'crm_followups' then 'Cuenta seguimientos de leads vencidos y tareas atrasadas.'
  when 'radar_review_queue' then 'Prioriza prospectos pendientes por estrellas con evidencia; no asume necesidades.'
  when 'data_quality_cost' then 'Mide calidad de datos y ejecuciones/costes de los managers (coste incremental 0).' end;
insert into public.crm_agent_capabilities (manager_key, capability, title, effect, max_writes, description) values
  ('haru', 'followup_tasks', 'HARU · Crear tareas internas de seguimiento', 'write_internal', 10,
   'Crea una tarea interna por cada seguimiento de lead vencido (máx. 10 por ejecución, nunca duplicada). No contacta a nadie.');

-- 2. Missions and dependent steps -------------------------------------------------------------------------------
create table public.crm_agent_missions (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  title text not null check (length(btrim(title)) between 1 and 160),
  trigger text not null default 'manual' check (trigger in ('manual', 'schedule')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'blocked')),
  requested_by uuid not null references auth.users (id),
  idempotency_key text not null unique check (length(idempotency_key) between 8 and 120),
  summary text not null default '' check (length(summary) <= 2000),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((status in ('completed', 'failed', 'blocked')) = (finished_at is not null))
);
create index crm_agent_missions_recent on public.crm_agent_missions (created_at desc);

alter table public.crm_agent_runs
  add column mission_id uuid references public.crm_agent_missions (id) on delete cascade,
  add column step smallint check (step between 1 and 20),
  add column depends_on smallint[] not null default '{}' check (cardinality(depends_on) <= 19),
  add column contract_version integer not null default 1;
create unique index crm_agent_runs_mission_step on public.crm_agent_runs (mission_id, step) where mission_id is not null;

alter table public.crm_agent_settings add column automatic_enabled_by uuid references auth.users (id);

-- Internal tasks created by a manager: one row per dedupe key, ever.
create table public.crm_agent_task_links (
  dedupe_key text primary key check (length(dedupe_key) between 8 and 160),
  task_id uuid not null references public.crm_tasks (id) on delete cascade,
  run_id uuid not null references public.crm_agent_runs (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.crm_agent_missions enable row level security;
alter table public.crm_agent_task_links enable row level security;
revoke all on public.crm_agent_missions from anon, authenticated, public;
revoke all on public.crm_agent_task_links from anon, authenticated, public;
grant select on public.crm_agent_missions, public.crm_agent_task_links to authenticated;
create policy agent_missions_owner_read on public.crm_agent_missions for select to authenticated using ((select crm_private.is_owner()));
create policy agent_task_links_owner_read on public.crm_agent_task_links for select to authenticated using ((select crm_private.is_owner()));

-- 3. Deterministic executors (definer; caller identity is checked by the public entry points) ----------------------
create function crm_private.agent_execute(p_run uuid, out summary text, out result jsonb, out evidence jsonb)
language plpgsql security definer set search_path = '' as $$
declare r public.crm_agent_runs; c public.crm_agent_capabilities; n1 int; n2 int; n3 int; created int := 0; t uuid; lead record;
begin
  select * into r from public.crm_agent_runs where id = p_run;
  select * into c from public.crm_agent_capabilities where manager_key = r.manager_key and capability = r.capability;
  evidence := '[]'::jsonb;
  if r.capability = 'crm_followups' then
    select count(*) into n1 from public.crm_leads where not archived and follow_up_at < now();
    select count(*), count(*) filter (where priority in ('high', 'urgent')) into n2, n3
      from public.crm_tasks where status in ('todo', 'in_progress', 'blocked') and due_at < now();
    summary := format('%s seguimientos de leads vencidos y %s tareas atrasadas (%s de prioridad alta/urgente). Sin contacto automático con prospectos.', n1, n2, n3);
    result := jsonb_build_object('overdue_follow_ups', n1, 'overdue_tasks', n2, 'overdue_high_priority_tasks', n3,
      'oldest_follow_up', (select min(follow_up_at) from public.crm_leads where not archived and follow_up_at < now()));
    select coalesce(jsonb_agg(jsonb_build_object('type', 'lead', 'id', x.id, 'label', 'seguimiento vencido')), '[]') into evidence
      from (select id from public.crm_leads where not archived and follow_up_at < now() order by follow_up_at limit 5) x;

  elsif r.capability = 'followup_tasks' then
    perform set_config('request.jwt.claim.sub', r.requested_by::text, true);
    for lead in select l.id, l.company, l.owner_id, l.follow_up_at from public.crm_leads l
        where not l.archived and l.follow_up_at < now()
          and not exists (select 1 from public.crm_agent_task_links k where k.dedupe_key = 'haru:followup:' || l.id || ':' || to_char(l.follow_up_at, 'YYYYMMDD'))
        order by l.follow_up_at limit c.max_writes loop
      insert into public.crm_tasks (title, description, assignee_id, priority, status, due_at, source, created_by)
      values (left('Seguimiento vencido: ' || lead.company, 200),
              'Creada por HARU (regla determinista). El seguimiento previsto venció el ' || to_char(lead.follow_up_at, 'YYYY-MM-DD')
              || '. Ficha: /admin/workspace/crm/pipeline?lead=' || lead.id || '. HARU no contacta al prospecto.',
              lead.owner_id, 'high', 'todo', now() + interval '1 day', 'automation', r.requested_by)
      returning id into t;
      insert into public.crm_agent_task_links (dedupe_key, task_id, run_id)
      values ('haru:followup:' || lead.id || ':' || to_char(lead.follow_up_at, 'YYYYMMDD'), t, r.id);
      perform crm_private.notify(lead.owner_id, 'normal', 'task', left('HARU: seguimiento vencido · ' || lead.company, 160), '',
        '/admin/workspace/crm/tasks?task=' || t, 'haru-task:' || t, null, null, t);
      evidence := evidence || jsonb_build_array(jsonb_build_object('type', 'task', 'id', t, 'label', 'tarea creada'));
      created := created + 1;
    end loop;
    summary := case when created = 0 then 'No hay seguimientos vencidos sin tarea: no se creó nada (idempotente).'
      else format('%s tareas internas de seguimiento creadas y asignadas al responsable de cada lead.', created) end;
    result := jsonb_build_object('tasks_created', created, 'max_writes', c.max_writes);

  elsif r.capability = 'radar_review_queue' then
    with p as (select coalesce(stars_override, stars) s, id from public.crm_prospects where status = 'pending')
    select count(*), count(*) filter (where s >= 4), count(*) filter (where s is null) into n1, n2, n3 from p;
    summary := case when n1 = 0 then 'No hay prospectos pendientes de revisión.' else
      format('%s prospectos pendientes: %s con 4–5 estrellas para revisar primero, %s sin calificar (no se asume necesidad sin evidencia). Sin compras de créditos ni contacto automático.', n1, n2, n3) end;
    result := jsonb_build_object('pending', n1, 'review_first_4_5_stars', n2, 'unscored', n3,
      'by_stars', (select jsonb_agg((select count(*) from public.crm_prospects q where q.status = 'pending' and coalesce(q.stars_override, q.stars) = g) order by g) from generate_series(1, 5) g));
    select coalesce(jsonb_agg(jsonb_build_object('type', 'prospect', 'id', x.id, 'label', 'revisar primero')), '[]') into evidence
      from (select id from public.crm_prospects where status = 'pending' and coalesce(stars_override, stars) >= 4 order by coalesce(stars_override, stars) desc limit 5) x;

  elsif r.capability = 'data_quality_cost' then
    select count(*) into n1 from public.crm_leads where not archived and email is null and phone = '';
    select count(*), count(*) filter (where status in ('failed', 'blocked')) into n2, n3
      from public.crm_agent_runs where created_at > now() - interval '24 hours';
    summary := format('%s leads activos sin email ni teléfono. Últimas 24 h: %s ejecuciones de managers (%s fallidas o bloqueadas). Todas gratuitas: sin proveedor de pago.', n1, n2, n3);
    result := jsonb_build_object('leads_without_contact', n1, 'runs_24h', n2, 'failed_or_blocked_24h', n3, 'incremental_cost_usd', 0);

  elsif r.capability = 'security_posture' then
    result := public.crm_agent_security_posture_internal();
    summary := case when jsonb_array_length(result -> 'findings') > 0
      then format('%s hallazgos de privilegios a corregir. Revisión del catálogo, no una auditoría completa.', jsonb_array_length(result -> 'findings'))
      else 'Sin hallazgos en la revisión del catálogo (RLS, privilegios anon, funciones definer). No equivale a declarar el sistema seguro.' end;

  elsif r.capability = 'operations_plan' then
    select count(*) filter (where status = 'blocked'), count(*) filter (where status in ('todo', 'in_progress') and due_at < now())
      into n1, n2 from public.crm_tasks;
    select count(*) into n3 from public.crm_prospects where status = 'pending';
    result := jsonb_build_object('plan', (select coalesce(jsonb_agg(x.v order by x.p), '[]') from (values
        (1, case when n1 > 0 then jsonb_build_object('priority', 1, 'action', format('Desbloquear %s tareas bloqueadas', n1), 'owner', 'ren') end),
        (2, case when n2 > 0 then jsonb_build_object('priority', 2, 'action', format('Resolver %s tareas atrasadas', n2), 'owner', 'haru') end),
        (3, case when n3 > 0 then jsonb_build_object('priority', 3, 'action', format('Revisar %s prospectos pendientes del Radar', n3), 'owner', 'sora') end)) x(p, v) where x.v is not null),
      'mission_steps', (select coalesce(jsonb_agg(jsonb_build_object('step', s.step, 'manager', s.manager_key, 'capability', s.capability, 'status', s.status, 'summary', left(s.result_summary, 300)) order by s.step), '[]')
        from public.crm_agent_runs s where r.mission_id is not null and s.mission_id = r.mission_id and s.id <> r.id));
    summary := case when jsonb_array_length(result -> 'plan') = 0 then 'Sin bloqueos ni atrasos detectados en CRM.'
      else 'Plan: ' || (select string_agg(e ->> 'action', '; ') from jsonb_array_elements(result -> 'plan') e) || '.' end;

  else
    raise exception 'agent_capability_without_adapter' using errcode = '42501';
  end if;
end $$;
revoke all on function crm_private.agent_execute(uuid) from public, anon, authenticated;

-- Catalog facts for SHIN without the owner check (only callable from definer code).
create function public.crm_agent_security_posture_internal() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare no_rls jsonb; anon_tables jsonb; anon_fns jsonb; findings jsonb := '[]';
begin
  select coalesce(jsonb_agg(c.relname order by c.relname), '[]') into no_rls from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  select coalesce(jsonb_agg(distinct g.table_name), '[]') into anon_tables from information_schema.role_table_grants g where g.table_schema = 'public' and g.grantee = 'anon';
  select coalesce(jsonb_agg(p.proname order by p.proname), '[]') into anon_fns from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and pg_catalog.has_function_privilege('anon', p.oid, 'execute') and p.proname <> 'crm_public_inquiry';
  if jsonb_array_length(no_rls) > 0 then findings := findings || jsonb_build_array(jsonb_build_object('severity', 'high', 'finding', 'Tablas públicas sin RLS: ' || no_rls::text)); end if;
  if jsonb_array_length(anon_tables) > 0 then findings := findings || jsonb_build_array(jsonb_build_object('severity', 'high', 'finding', 'Tablas con privilegios para anon: ' || anon_tables::text)); end if;
  if jsonb_array_length(anon_fns) > 0 then findings := findings || jsonb_build_array(jsonb_build_object('severity', 'high', 'finding', 'Funciones con privilegios de definidor ejecutables por anon: ' || anon_fns::text)); end if;
  return jsonb_build_object('findings', findings, 'scope', 'catalog_review_only',
    'owners', (select count(*) from public.agency_memberships where role = 'owner'),
    'non_owner_members', (select count(*) from public.agency_memberships where role <> 'owner'));
end $$;
revoke all on function public.crm_agent_security_posture_internal() from public, anon, authenticated;

-- 4. Run lifecycle (kill switch, limits, dependencies, retries) -------------------------------------------------------
create function crm_private.agent_process(p_run uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.crm_agent_runs; s public.crm_agent_settings; c public.crm_agent_capabilities; dep_bad int; dep_open int; used_h int; used_d int; out_s text; out_r jsonb; out_e jsonb;
begin
  select * into r from public.crm_agent_runs where id = p_run for update;
  if r.status not in ('queued') then return r.status; end if;
  select * into s from public.crm_agent_settings where id = 'avalon';
  select * into c from public.crm_agent_capabilities where manager_key = r.manager_key and capability = r.capability;
  if s.kill_switch then
    update public.crm_agent_runs set status = 'blocked', error_code = 'kill_switch', finished_at = now(), updated_at = now() where id = r.id; return 'blocked';
  end if;
  if not c.enabled then
    update public.crm_agent_runs set status = 'blocked', error_code = 'capability_disabled', finished_at = now(), updated_at = now() where id = r.id; return 'blocked';
  end if;
  if r.mission_id is not null and cardinality(r.depends_on) > 0 then
    select count(*) filter (where d.status in ('failed', 'blocked')), count(*) filter (where d.status in ('queued', 'running'))
      into dep_bad, dep_open from public.crm_agent_runs d where d.mission_id = r.mission_id and d.step = any (r.depends_on);
    if dep_bad > 0 then
      update public.crm_agent_runs set status = 'blocked', error_code = 'dependency_failed', finished_at = now(), updated_at = now() where id = r.id; return 'blocked';
    end if;
    if dep_open > 0 then return 'waiting'; end if;
  end if;
  select count(*) filter (where x.started_at > now() - interval '1 hour'), count(*) filter (where x.started_at > now() - interval '24 hours')
    into used_h, used_d from public.crm_agent_runs x where x.manager_key = r.manager_key and x.id <> r.id;
  if used_h >= s.hourly_limit or used_d >= s.daily_limit then
    update public.crm_agent_runs set status = 'blocked', error_code = case when used_h >= s.hourly_limit then 'hourly_limit' else 'daily_limit' end,
      finished_at = now(), updated_at = now() where id = r.id; return 'blocked';
  end if;
  update public.crm_agent_runs set status = 'running', attempts = attempts + 1, started_at = coalesce(started_at, now()),
    lease_until = now() + interval '4 minutes', contract_version = c.contract_version, updated_at = now() where id = r.id;
  begin
    select e.summary, e.result, e.evidence into out_s, out_r, out_e from crm_private.agent_execute(r.id) e;
    update public.crm_agent_runs set status = 'completed', result_summary = left(out_s, 2000), result = coalesce(out_r, '{}'),
      evidence_refs = (select coalesce(jsonb_agg(v), '[]') from (select v from jsonb_array_elements(coalesce(out_e, '[]')) v limit 20) q),
      finished_at = now(), lease_until = null, updated_at = now() where id = r.id;
    return 'completed';
  exception when others then
    update public.crm_agent_runs set status = 'failed', error_code = 'executor_error', result_summary = left('Error del ejecutor: ' || sqlerrm, 500),
      finished_at = now(), lease_until = null, updated_at = now() where id = r.id;
    return 'failed';
  end;
end $$;
revoke all on function crm_private.agent_process(uuid) from public, anon, authenticated;

create function crm_private.agent_mission_advance(p_mission uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare progressed boolean := true; x record; st text; total int; done int; bad int;
begin
  update public.crm_agent_missions set status = 'running' where id = p_mission and status = 'queued';
  while progressed loop
    progressed := false;
    for x in select id from public.crm_agent_runs where mission_id = p_mission and status = 'queued' order by step loop
      st := crm_private.agent_process(x.id);
      if st <> 'waiting' then progressed := true; end if;
    end loop;
  end loop;
  select count(*), count(*) filter (where status = 'completed'), count(*) filter (where status in ('failed', 'blocked'))
    into total, done, bad from public.crm_agent_runs where mission_id = p_mission;
  if done + bad = total then
    update public.crm_agent_missions set status = case when bad = 0 then 'completed' when done = 0 then 'failed' else 'blocked' end,
      finished_at = now(), summary = format('%s de %s pasos completados%s.', done, total, case when bad > 0 then format(', %s fallidos o bloqueados', bad) else '' end)
      where id = p_mission and finished_at is null;
  end if;
  return (select status from public.crm_agent_missions where id = p_mission);
end $$;
revoke all on function crm_private.agent_mission_advance(uuid) from public, anon, authenticated;

-- Steps: jsonb array of {manager, capability, depends_on:[step numbers]}; validated against the enabled registry.
create function crm_private.agent_mission_create(p_title text, p_steps jsonb, p_key text, p_by uuid, p_trigger text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare m uuid; e jsonb; i int := 0; deps smallint[]; c public.crm_agent_capabilities;
begin
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) not between 1 and 20 then raise exception 'agent_mission_invalid' using errcode = '22023'; end if;
  select id into m from public.crm_agent_missions where idempotency_key = p_key;
  if m is not null then return m; end if;
  insert into public.crm_agent_missions (title, trigger, requested_by, idempotency_key) values (left(btrim(p_title), 160), p_trigger, p_by, p_key) returning id into m;
  for e in select value from jsonb_array_elements(p_steps) loop
    i := i + 1;
    select * into c from public.crm_agent_capabilities where manager_key = e ->> 'manager' and capability = e ->> 'capability' and enabled;
    if not found then raise exception 'agent_capability_not_allowed' using errcode = '42501'; end if;
    deps := coalesce((select array_agg(v::smallint) from jsonb_array_elements_text(coalesce(e -> 'depends_on', '[]')) v), '{}');
    if exists (select 1 from unnest(deps) d where d < 1 or d >= i) then raise exception 'agent_mission_invalid_dependency' using errcode = '22023'; end if;
    insert into public.crm_agent_runs (manager_key, capability, task_title, requested_by, idempotency_key, trigger, mission_id, step, depends_on, contract_version)
    values (c.manager_key, c.capability, c.title, p_by, left(p_key, 100) || ':' || i, p_trigger, m, i, deps, c.contract_version);
  end loop;
  return m;
end $$;
revoke all on function crm_private.agent_mission_create(text, jsonb, text, uuid, text) from public, anon, authenticated;

create function crm_private.agent_daily_steps() returns jsonb language sql immutable set search_path = '' as $$
  select '[{"manager":"sora","capability":"radar_review_queue"},
           {"manager":"haru","capability":"crm_followups"},
           {"manager":"haru","capability":"followup_tasks","depends_on":[2]},
           {"manager":"kenji","capability":"data_quality_cost"},
           {"manager":"shin","capability":"security_posture"},
           {"manager":"ren","capability":"operations_plan","depends_on":[1,3,4,5]}]'::jsonb
$$;

-- 5. Owner entry points -------------------------------------------------------------------------------------------
create function public.crm_agent_mission_start(p_title text, p_steps jsonb, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m uuid;
begin
  if not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if p_key is null or length(p_key) not between 8 and 100 then raise exception 'agent_invalid_key' using errcode = '22023'; end if;
  m := crm_private.agent_mission_create(coalesce(nullif(btrim(p_title), ''), 'Misión diaria de operaciones'),
    coalesce(p_steps, crm_private.agent_daily_steps()), 'manual:' || p_key, (select auth.uid()), 'manual');
  return jsonb_build_object('mission_id', m, 'status', crm_private.agent_mission_advance(m));
end $$;

-- Single manager button (kept for the Office UI contract): a one-step mission.
create function public.crm_agent_run_now(p_manager text, p_capability text, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m uuid; r public.crm_agent_runs;
begin
  if not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if p_key is null or length(p_key) not between 8 and 100 then raise exception 'agent_invalid_key' using errcode = '22023'; end if;
  m := crm_private.agent_mission_create(p_manager || ' · ' || p_capability, jsonb_build_array(jsonb_build_object('manager', p_manager, 'capability', p_capability)),
    'single:' || p_key, (select auth.uid()), 'manual');
  perform crm_private.agent_mission_advance(m);
  select * into r from public.crm_agent_runs where mission_id = m and step = 1;
  return jsonb_build_object('run_id', r.id, 'status', r.status, 'error_code', r.error_code);
end $$;

create function public.crm_agent_retry(p_run uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.crm_agent_runs;
begin
  if not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into r from public.crm_agent_runs where id = p_run for update;
  if not found then raise exception 'agent_run_not_found' using errcode = 'P0002'; end if;
  if r.status <> 'failed' or r.attempts >= 3 then return r.status; end if;
  update public.crm_agent_runs set status = 'queued', error_code = null, finished_at = null, updated_at = now() where id = r.id;
  if r.mission_id is not null then
    update public.crm_agent_missions set status = 'running', finished_at = null where id = r.mission_id;
    -- Steps blocked only because this one failed get another chance too.
    update public.crm_agent_runs set status = 'queued', error_code = null, finished_at = null, updated_at = now()
      where mission_id = r.mission_id and status = 'blocked' and error_code = 'dependency_failed';
    perform crm_private.agent_mission_advance(r.mission_id);
  else
    perform crm_private.agent_process(r.id);
  end if;
  return (select status from public.crm_agent_runs where id = p_run);
end $$;

create function public.crm_agent_set_automatic(p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  update public.crm_agent_settings set automatic_enabled = coalesce(p_on, false),
    automatic_enabled_by = case when coalesce(p_on, false) then (select auth.uid()) else automatic_enabled_by end,
    updated_by = (select auth.uid()), updated_at = now() where id = 'avalon';
end $$;

create function public.crm_agent_capability_set(p_manager text, p_capability text, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  update public.crm_agent_capabilities set enabled = coalesce(p_enabled, false) where manager_key = p_manager and capability = p_capability;
  if not found then raise exception 'agent_capability_not_allowed' using errcode = '42501'; end if;
end $$;

revoke all on function public.crm_agent_mission_start(text, jsonb, text), public.crm_agent_run_now(text, text, text),
  public.crm_agent_retry(uuid), public.crm_agent_set_automatic(boolean), public.crm_agent_capability_set(text, text, boolean) from public, anon;
grant execute on function public.crm_agent_mission_start(text, jsonb, text), public.crm_agent_run_now(text, text, text),
  public.crm_agent_retry(uuid), public.crm_agent_set_automatic(boolean), public.crm_agent_capability_set(text, text, boolean) to authenticated;

-- 6. Scheduler tick: no-op unless automation is on and the kill switch is off. One daily mission per UTC day. ------
create function crm_private.agent_scheduler_tick() returns text
language plpgsql security definer set search_path = '' as $$
declare s public.crm_agent_settings; m uuid; x record;
begin
  select * into s from public.crm_agent_settings where id = 'avalon';
  if s.kill_switch then return 'kill_switch'; end if;
  if not s.automatic_enabled or s.automatic_enabled_by is null then return 'automatic_disabled'; end if;
  if not exists (select 1 from public.agency_memberships where user_id = s.automatic_enabled_by and role = 'owner') then return 'enabler_not_owner'; end if;
  m := crm_private.agent_mission_create('Misión diaria automática', crm_private.agent_daily_steps(),
    'auto:' || to_char(now() at time zone 'utc', 'YYYY-MM-DD'), s.automatic_enabled_by, 'schedule');
  perform crm_private.agent_mission_advance(m);
  -- Resume anything left queued by an interruption.
  for x in select id from public.crm_agent_missions where status in ('queued', 'running') and id <> m and created_at > now() - interval '3 days' loop
    perform crm_private.agent_mission_advance(x.id);
  end loop;
  return 'ok';
end $$;
revoke all on function crm_private.agent_scheduler_tick() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('avalon-managers-hourly', '23 * * * *', 'select crm_private.agent_scheduler_tick()');
  end if;
end $$;

commit;
