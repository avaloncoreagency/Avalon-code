-- Avalon engine registry: ONE honest record per planned engine (REN…ECHO). It reuses the existing execution backbone
-- instead of creating a parallel one:
--   crm_agent_settings      → global kill switch + hourly/daily limits
--   crm_agent_capabilities  → allowlist of what each manager may run
--   crm_agent_runs          → durable queue (idempotency key, ≤3 attempts, lease, status, evidence, history)
--   crm_ai_worker_profiles  → per-seat suspension
-- An engine starts NOT_CONFIGURED. Nothing here installs, starts or calls any engine. The registry only records state
-- that a human or a verified runner reported, and refuses optimistic states (READY without verified configuration;
-- RUNNING/RATE_LIMITED/FAILED can only be reported by the execution layer, never typed by a person).

create table public.crm_engine_registry (
  engine_id text primary key check (engine_id ~ '^[a-z][a-z0-9_]{1,30}$'),
  manager text not null unique check (manager ~ '^[A-Z]{2,12}$'),
  name text not null check (length(btrim(name)) between 1 and 60),          -- framework/tool, NOT an AI model
  responsibility text not null check (length(btrim(responsibility)) between 1 and 200),
  capabilities text[] not null default '{}' check (cardinality(capabilities) <= 20),
  provider text not null default 'self_hosted' check (provider in ('self_hosted', 'managed', 'external_api', 'unknown')),
  runtime_type text not null check (runtime_type in ('library', 'cli_scanner', 'service', 'browser', 'gpu_service', 'agent_platform')),
  requires_gpu boolean not null default false,
  deployment_status text not null default 'NOT_CONFIGURED'
    check (deployment_status in ('NOT_CONFIGURED', 'READY', 'RUNNING', 'PAUSED', 'RATE_LIMITED', 'FAILED', 'UNAVAILABLE')),
  configuration_status text not null default 'not_configured' check (configuration_status in ('not_configured', 'configured', 'verified')),
  health_status text not null default 'unknown' check (health_status in ('unknown', 'healthy', 'degraded', 'down')),
  quota_status text not null default 'unknown' check (quota_status in ('unknown', 'ok', 'near_limit', 'exhausted')),
  license_verified boolean not null default false,
  license text check (license is null or length(license) <= 60),
  worker_key text references public.crm_ai_worker_profiles (key),          -- existing seat that will run it, if any
  last_execution_id uuid references public.crm_agent_runs (id),
  last_execution_at timestamptz,
  estimated_cost_usd numeric(10, 4) check (estimated_cost_usd is null or estimated_cost_usd >= 0), -- null = unknown
  error_code text check (error_code is null or error_code ~ '^[a-z_]{3,40}$'),
  notes text not null default '' check (length(notes) <= 1000),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  -- Honest states: READY needs a verified configuration and license; an error state needs an error code.
  constraint ready_requires_verification check (deployment_status not in ('READY', 'RUNNING') or (configuration_status = 'verified' and license_verified)),
  constraint failure_has_code check ((deployment_status in ('FAILED', 'RATE_LIMITED', 'UNAVAILABLE')) = (error_code is not null))
);

insert into public.crm_engine_registry (engine_id, manager, name, responsibility, capabilities, runtime_type, requires_gpu, worker_key) values
  ('ren',   'REN',   'LangGraph',  'Orquestación y dirección de tareas', '{orchestration,planning}',          'library',        false, 'ren'),
  ('shin',  'SHIN',  'Trivy',      'Auditorías de seguridad',            '{vulnerability_scan,sbom}',         'cli_scanner',    false, 'shin'),
  ('haru',  'HARU',  'Crawl4AI',   'Investigación y datos comerciales',  '{web_research,extraction}',         'service',        false, 'haru'),
  ('sora',  'SORA',  'Node-RED',   'Automatizaciones e integraciones',   '{automation,integrations}',         'service',        false, 'sora'),
  ('kenji', 'KENJI', 'Playwright', 'Pruebas de calidad',                 '{e2e_testing,browser_checks}',      'browser',        false, 'kenji'),
  ('akira', 'AKIRA', 'OpenHands',  'Desarrollo de software',             '{code_changes}',                    'agent_platform', false, null),
  ('nova',  'NOVA',  'bolt.diy',   'Generación de aplicaciones',         '{app_generation}',                  'service',        false, null),
  ('lumi',  'LUMI',  'ComfyUI',    'Generación de imágenes',             '{image_generation}',                'gpu_service',    true,  null),
  ('vega',  'VEGA',  'Wan2.2',     'Generación de video',                '{video_generation}',                'gpu_service',    true,  null),
  ('echo',  'ECHO',  'Pipecat',    'Sistemas de voz',                    '{voice_pipeline}',                  'service',        false, null);

alter table public.crm_engine_registry enable row level security;
revoke all on public.crm_engine_registry from anon, authenticated, public;
grant select on public.crm_engine_registry to authenticated;
create policy engine_registry_owner_read on public.crm_engine_registry for select to authenticated using ((select crm_private.is_owner()));

-- Effective status for the UI: the global kill switch and the per-seat suspension pause an engine without rewriting its
-- recorded state. security_invoker → the caller's RLS applies (owners only).
create view public.crm_engine_status with (security_invoker = true) as
select e.*,
  case
    when (select s.kill_switch from public.crm_agent_settings s where s.id = 'avalon') then 'PAUSED'
    when w.suspended then 'PAUSED'
    else e.deployment_status
  end as effective_status,
  case
    when (select s.kill_switch from public.crm_agent_settings s where s.id = 'avalon') then 'kill_switch'
    when w.suspended then 'seat_suspended'
    else null
  end as paused_reason
from public.crm_engine_registry e left join public.crm_ai_worker_profiles w on w.key = e.worker_key;
revoke all on public.crm_engine_status from anon, public;
grant select on public.crm_engine_status to authenticated;

-- Owner updates: configuration facts and operator states only. RUNNING / RATE_LIMITED / FAILED are reported by the
-- execution layer, never typed by a person; READY is refused until configuration and license are verified (constraint).
create or replace function public.crm_engine_update(p_engine text, p_deployment_status text default null,
  p_configuration_status text default null, p_license text default null, p_license_verified boolean default null,
  p_error_code text default null, p_notes text default null)
returns public.crm_engine_registry language plpgsql security definer set search_path = '' as $$
declare r public.crm_engine_registry;
begin
  if not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if p_deployment_status is not null and p_deployment_status not in ('NOT_CONFIGURED', 'READY', 'PAUSED', 'UNAVAILABLE') then
    raise exception 'engine_state_reserved_for_executor' using errcode = '22023';
  end if;
  update public.crm_engine_registry set
    deployment_status = coalesce(p_deployment_status, deployment_status),
    configuration_status = coalesce(p_configuration_status, configuration_status),
    license = coalesce(p_license, license),
    license_verified = coalesce(p_license_verified, license_verified),
    error_code = case when coalesce(p_deployment_status, deployment_status) in ('FAILED', 'RATE_LIMITED', 'UNAVAILABLE')
                      then coalesce(p_error_code, error_code) else null end,
    notes = coalesce(p_notes, notes),
    updated_by = auth.uid(), updated_at = now()
  where engine_id = p_engine returning * into r;
  if r.engine_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return r;
end;
$$;
revoke all on function public.crm_engine_update(text, text, text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.crm_engine_update(text, text, text, text, boolean, text, text) to authenticated;
