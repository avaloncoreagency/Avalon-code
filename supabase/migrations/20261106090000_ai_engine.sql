-- Avalon AI Engine — persistent profiles (10 seats), departmental objectives, manager memory, AI task state with every
-- provider attempt, and a daily usage ledger whose cost column can ONLY be 0 (free tiers only; a paid call cannot be
-- recorded, and the worker stops the provider before it would be).
-- PREPARED — not applied to any remote database. Writes are service_role only (server worker); owners read through RLS.
-- AI is OFF by default: crm_agent_settings.ai_enabled = false until an owner turns it on.
-- Rollback: drop the four tables and the four functions below; alter table crm_agent_settings drop column ai_enabled.
begin;

alter table public.crm_agent_settings add column ai_enabled boolean not null default false;

create table public.crm_ai_worker_profiles (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,20}$'),
  name text not null check (length(btrim(name)) between 1 and 40),
  department text not null check (length(btrim(department)) between 1 and 120),
  status text not null check (status in ('active', 'reserved')),
  objectives jsonb not null default '[]'::jsonb check (jsonb_typeof(objectives) = 'array'),
  executors jsonb not null default '[]'::jsonb check (jsonb_typeof(executors) = 'array'),
  ai_enabled boolean not null default false,
  suspended boolean not null default false, -- individual stop, independent of the global kill switch
  updated_at timestamptz not null default now(),
  -- A reserved seat has no executors and no AI: nothing can run for it until a human activates it in a reviewed change.
  constraint reserved_is_inert check (status = 'active' or (executors = '[]'::jsonb and objectives = '[]'::jsonb and not ai_enabled))
);
insert into public.crm_ai_worker_profiles (key, name, department, status, objectives, executors, ai_enabled) values
  ('ren', 'REN', 'Dirección y desarrollo', 'active',
   '[{"id":"ren.plan","kpi":"misión diaria completada"},{"id":"ren.dev","kpi":"PR borrador con CI verde / semana"}]',
   '[{"id":"operations_plan","kind":"sql"},{"id":"ren.dev_task","kind":"github_worker","effect":"branch_pr"}]', false),
  ('shin', 'SHIN', 'Seguridad e infraestructura', 'active', '[{"id":"shin.posture","kpi":"hallazgos abiertos por severidad"}]',
   '[{"id":"security_posture","kind":"sql"}]', false),
  ('haru', 'HARU', 'CRM y producto', 'active', '[{"id":"haru.followups","kpi":"seguimientos vencidos sin tarea = 0"}]',
   '[{"id":"crm_followups","kind":"sql"},{"id":"followup_tasks","kind":"sql","effect":"write_internal"}]', false),
  ('sora', 'SORA', 'Lead Hunter y marketing', 'active', '[{"id":"sora.radar","kpi":"pendientes 4–5★ sin revisar"}]',
   '[{"id":"radar_review_queue","kind":"sql"}]', false),
  ('kenji', 'KENJI', 'Calidad, pruebas y costos', 'active',
   '[{"id":"kenji.quality","kpi":"leads sin contacto, fallos 24 h"},{"id":"kenji.cost","kpi":"coste IA acumulado = 0"}]',
   '[{"id":"data_quality_cost","kind":"sql"}]', false),
  ('samuel_1', 'Puesto 6', 'Próxima incorporación — Equipo de Samuel', 'reserved', '[]', '[]', false),
  ('samuel_2', 'Puesto 7', 'Próxima incorporación — Equipo de Samuel', 'reserved', '[]', '[]', false),
  ('samuel_3', 'Puesto 8', 'Próxima incorporación — Equipo de Samuel', 'reserved', '[]', '[]', false),
  ('samuel_4', 'Puesto 9', 'Próxima incorporación — Equipo de Samuel', 'reserved', '[]', '[]', false),
  ('samuel_5', 'Puesto 10', 'Próxima incorporación — Equipo de Samuel', 'reserved', '[]', '[]', false);

create table public.crm_ai_memory (
  id uuid primary key default gen_random_uuid(),
  worker_key text not null references public.crm_ai_worker_profiles (key),
  kind text not null check (kind in ('decision', 'lesson', 'fact', 'result')),
  body text not null check (length(btrim(body)) between 1 and 600),
  source text not null default '' check (length(source) <= 300),
  created_at timestamptz not null default now()
);
create index crm_ai_memory_worker on public.crm_ai_memory (worker_key, created_at desc);

create table public.crm_ai_tasks (
  id text primary key check (length(id) between 8 and 120),
  worker_key text not null references public.crm_ai_worker_profiles (key),
  purpose text not null check (length(btrim(purpose)) between 1 and 200),
  data_class text not null check (data_class in ('synthetic', 'public_repo', 'internal_aggregate')),
  status text not null check (status in ('pending', 'running', 'succeeded', 'failed', 'blocked')),
  attempts jsonb not null default '[]'::jsonb check (jsonb_typeof(attempts) = 'array' and jsonb_array_length(attempts) <= 30),
  steps jsonb not null default '{}'::jsonb check (jsonb_typeof(steps) = 'object' and pg_column_size(steps) <= 65536),
  provider text check (provider in ('groq', 'cloudflare', 'openrouter', 'oracle')),
  model text check (length(model) <= 120),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd = 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_ai_usage (
  day date not null,
  provider text not null check (provider in ('groq', 'cloudflare', 'openrouter', 'oracle')),
  requests integer not null default 0 check (requests >= 0),
  tokens integer not null default 0 check (tokens >= 0),
  neurons integer not null default 0 check (neurons >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd = 0),
  primary key (day, provider)
);

alter table public.crm_ai_worker_profiles enable row level security;
alter table public.crm_ai_memory enable row level security;
alter table public.crm_ai_tasks enable row level security;
alter table public.crm_ai_usage enable row level security;
revoke all on public.crm_ai_worker_profiles, public.crm_ai_memory, public.crm_ai_tasks, public.crm_ai_usage from anon, authenticated, public;
grant select on public.crm_ai_worker_profiles, public.crm_ai_memory, public.crm_ai_tasks, public.crm_ai_usage to authenticated;
grant select on public.crm_ai_worker_profiles to service_role;
grant select, insert on public.crm_ai_memory to service_role;
grant select, insert, update on public.crm_ai_tasks, public.crm_ai_usage to service_role;
create policy ai_profiles_owner_read on public.crm_ai_worker_profiles for select to authenticated using ((select crm_private.is_owner()));
create policy ai_memory_owner_read on public.crm_ai_memory for select to authenticated using ((select crm_private.is_owner()));
create policy ai_tasks_owner_read on public.crm_ai_tasks for select to authenticated using ((select crm_private.is_owner()));
create policy ai_usage_owner_read on public.crm_ai_usage for select to authenticated using ((select crm_private.is_owner()));

-- Writes by the worker are refused for reserved seats and when AI is off or the kill switch is on.
create function crm_private.ai_assert_worker_allowed() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.crm_ai_worker_profiles p where p.key = new.worker_key and p.status = 'active') then
    raise exception 'ai_worker_reserved' using errcode = '42501';
  end if;
  if tg_table_name = 'crm_ai_tasks' and exists (select 1 from public.crm_ai_worker_profiles p where p.key = new.worker_key and p.suspended) then
    raise exception 'ai_worker_suspended' using errcode = '42501';
  end if;
  if tg_table_name = 'crm_ai_tasks' and exists (select 1 from public.crm_agent_settings s where s.id = 'avalon' and (s.kill_switch or not s.ai_enabled)) then
    raise exception 'ai_disabled' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger ai_tasks_worker_allowed before insert or update on public.crm_ai_tasks for each row execute function crm_private.ai_assert_worker_allowed();
create trigger ai_memory_worker_allowed before insert on public.crm_ai_memory for each row execute function crm_private.ai_assert_worker_allowed();

-- Owners turn AI on/off (separate from the deterministic managers' automatic mode).
create function public.crm_ai_set_enabled(p_on boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  update public.crm_agent_settings set ai_enabled = p_on, updated_by = (select auth.uid()), updated_at = now() where id = 'avalon';
end $$;
revoke all on function public.crm_ai_set_enabled(boolean) from public, anon;
grant execute on function public.crm_ai_set_enabled(boolean) to authenticated;
-- Owners suspend / resume one manager without touching the others.
create function public.crm_ai_set_suspended(p_worker text, p_on boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  update public.crm_ai_worker_profiles set suspended = p_on, updated_at = now() where key = p_worker and status = 'active';
  if not found then raise exception 'ai_worker_not_active' using errcode = '22023'; end if;
end $$;
revoke all on function public.crm_ai_set_suspended(text, boolean) from public, anon;
grant execute on function public.crm_ai_set_suspended(text, boolean) to authenticated;
-- ONE operational control for every executor. The GitHub Actions worker has no database credentials: it calls this with
-- the PUBLIC publishable key and obeys it (unreachable → it stops). Exposes only switches and suspended manager keys.
create function public.crm_ai_public_control() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'kill_switch', coalesce((select s.kill_switch from public.crm_agent_settings s where s.id = 'avalon'), true),
    'automatic_enabled', coalesce((select s.automatic_enabled from public.crm_agent_settings s where s.id = 'avalon'), false),
    'ai_enabled', coalesce((select s.ai_enabled from public.crm_agent_settings s where s.id = 'avalon'), false),
    'suspended', coalesce((select jsonb_agg(p.key order by p.key) from public.crm_ai_worker_profiles p where p.suspended), '[]'::jsonb));
$$;
revoke all on function public.crm_ai_public_control() from public;
grant execute on function public.crm_ai_public_control() to anon, authenticated, service_role;
revoke all on function crm_private.ai_assert_worker_allowed() from public, anon, authenticated;

-- SHIN's catalog review flags every SECURITY DEFINER function callable by anon. crm_ai_public_control() is a reviewed
-- exception exactly like crm_public_inquiry (switches only; locked by tests/security.test.cjs). Same body otherwise.
create or replace function public.crm_agent_security_posture_internal() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare no_rls jsonb; anon_tables jsonb; anon_fns jsonb; findings jsonb := '[]';
begin
  select coalesce(jsonb_agg(c.relname order by c.relname), '[]') into no_rls from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  select coalesce(jsonb_agg(distinct g.table_name), '[]') into anon_tables from information_schema.role_table_grants g where g.table_schema = 'public' and g.grantee = 'anon';
  select coalesce(jsonb_agg(p.proname order by p.proname), '[]') into anon_fns from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and pg_catalog.has_function_privilege('anon', p.oid, 'execute') and p.proname not in ('crm_public_inquiry', 'crm_ai_public_control');
  if jsonb_array_length(no_rls) > 0 then findings := findings || jsonb_build_array(jsonb_build_object('severity', 'high', 'finding', 'Tablas públicas sin RLS: ' || no_rls::text)); end if;
  if jsonb_array_length(anon_tables) > 0 then findings := findings || jsonb_build_array(jsonb_build_object('severity', 'high', 'finding', 'Tablas con privilegios para anon: ' || anon_tables::text)); end if;
  if jsonb_array_length(anon_fns) > 0 then findings := findings || jsonb_build_array(jsonb_build_object('severity', 'high', 'finding', 'Funciones con privilegios de definidor ejecutables por anon: ' || anon_fns::text)); end if;
  return jsonb_build_object('findings', findings, 'scope', 'catalog_review_only',
    'owners', (select count(*) from public.agency_memberships where role = 'owner'),
    'non_owner_members', (select count(*) from public.agency_memberships where role <> 'owner'));
end $$;
revoke all on function public.crm_agent_security_posture_internal() from public, anon, authenticated;

commit;
