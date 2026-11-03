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
revoke all on public.crm_radar_worker_config from public, anon, authenticated;
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
revoke all on public.crm_radar_worker_runs from public, anon, authenticated;
grant select on public.crm_radar_worker_runs to authenticated;
grant select, insert on public.crm_radar_worker_runs to service_role;
create policy crm_radar_worker_runs_owner_read on public.crm_radar_worker_runs
  for select to authenticated
  using (agency_key = 'avalon' and (select crm_private.is_owner()));

commit;
