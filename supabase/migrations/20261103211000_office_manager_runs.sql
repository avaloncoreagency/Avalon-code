-- Avalon Office manager runner: staging-first, result ledger without changing existing
-- office_agent_requests semantics. PREPARED ONLY; never apply to production automatically.
-- A service worker may record results; authorized owners can only SELECT via RLS.
begin;

create table public.office_manager_runs (
  run_key text primary key
    check (run_key ~ '^scheduled:(ren|shin|haru|sora|kenji):[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}$'
      or run_key ~ '^request:[0-9a-f-]{36}$'),
  manager text not null check (manager in ('ren','shin','haru','sora','kenji')),
  source text not null check (source in ('scheduled','requested')),
  request_id uuid unique references public.office_agent_requests (id) on delete cascade,
  status text not null check (status in ('running','completed','failed')),
  claim_token uuid not null default gen_random_uuid(),
  attempt_count integer not null default 1 check (attempt_count between 1 and 3),
  lease_until timestamptz not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb,
  error_code text check (error_code is null or error_code in ('check_unavailable')),
  created_at timestamptz not null default now(),
  check ((source = 'requested') = (request_id is not null)),
  check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 12000)),
  check ((status = 'running') = (finished_at is null))
);
create index office_manager_runs_recent on public.office_manager_runs (manager, started_at desc);
create index office_manager_runs_status on public.office_manager_runs (status, lease_until);

alter table public.office_manager_runs enable row level security;
revoke all on public.office_manager_runs from anon, authenticated;
revoke all on public.office_manager_runs from public;
grant select on public.office_manager_runs to authenticated;
grant select, insert, update on public.office_manager_runs to service_role;
create policy office_manager_runs_owner_read on public.office_manager_runs
  for select to authenticated using ((select crm_private.is_owner()));

-- Atomic claim: only service_role may call, and only fixed system diagnostics
-- are eligible for requested execution. Free-text requests remain unexecuted.
create function public.office_manager_claim_run(
  p_run_key text, p_manager text, p_source text, p_request_id uuid default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_token uuid;
begin
  if p_manager not in ('ren','shin','haru','sora','kenji')
    or p_source not in ('scheduled','requested') then
    raise exception 'office_manager_invalid_job' using errcode = '22023';
  end if;
  if p_source = 'requested' then
    if p_request_id is null
      or p_run_key <> 'request:' || p_request_id::text
      or not exists (
        select 1 from public.office_agent_requests r
        join public.agency_memberships m on m.user_id = r.created_by
        where r.id = p_request_id and r.agent = p_manager
          and r.status = 'registered' and r.body = 'AVALON_MANAGER_CHECK_V1'
          and m.role = 'owner'
      ) then
      raise exception 'office_manager_request_not_eligible' using errcode = '22023';
    end if;
  elsif p_request_id is not null
    or p_run_key !~ ('^scheduled:' || p_manager || ':[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}$') then
    raise exception 'office_manager_schedule_invalid' using errcode = '22023';
  end if;
  insert into public.office_manager_runs
    (run_key, manager, source, request_id, status, claim_token, lease_until)
  values (p_run_key, p_manager, p_source, p_request_id, 'running',
    gen_random_uuid(), now() + interval '4 minutes')
  on conflict (run_key) do update set
    claim_token = gen_random_uuid(),
    status = 'running', attempt_count = public.office_manager_runs.attempt_count + 1,
    lease_until = now() + interval '4 minutes', started_at = now(),
    finished_at = null, result = null, error_code = null
  where public.office_manager_runs.manager = excluded.manager
    and public.office_manager_runs.source = excluded.source
    and public.office_manager_runs.request_id is not distinct from excluded.request_id
    and public.office_manager_runs.attempt_count < 3
    and (public.office_manager_runs.status = 'failed'
      or (public.office_manager_runs.status = 'running' and public.office_manager_runs.lease_until < now()))
  returning claim_token into v_token;
  return v_token; -- null when already finished, running or retried three times
end;
$$;
revoke all on function public.office_manager_claim_run(text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.office_manager_claim_run(text,text,text,uuid) to service_role;

create function public.office_manager_finish_run(
  p_run_key text, p_token uuid, p_status text, p_result jsonb default null,
  p_error_code text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if p_status not in ('completed','failed') or
    (p_status = 'completed' and (p_result is null or p_error_code is not null)) or
    (p_status = 'failed' and (p_result is not null or p_error_code is distinct from 'check_unavailable'))
    then raise exception 'office_manager_invalid_finish' using errcode = '22023';
  end if;
  update public.office_manager_runs
    set status = p_status, result = p_result,
        error_code = p_error_code, finished_at = now()
    where run_key = p_run_key and claim_token = p_token
      and status = 'running' and lease_until > now();
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.office_manager_finish_run(text,uuid,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.office_manager_finish_run(text,uuid,text,jsonb,text) to service_role;

commit;
