-- Avalon AI Credit Center: append-only, owner-only manual observations.
-- Prepared migration. Do NOT apply to production until separately approved and staged.
-- An account key is a logical display bucket, not proof of identity at the provider.
-- Missing provider readings are absent rows, never an invented zero.
begin;

create table public.avalon_ai_credit_snapshots (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  account_key text not null check (account_key in
    ('chatgpt_business', 'claude_miguel', 'claude_samuel', 'higgsfield_team')),
  seat_key text check (seat_key in ('miguel', 'samuel')),
  metric_key text not null check (metric_key in
    ('quota_used_pct', 'credits_available', 'tokens_used', 'api_spend_usd',
     'extra_spend_usd', 'generations_available')),
  unit text not null check (unit in ('%', 'creditos', 'tokens', 'USD', 'generaciones')),
  amount numeric(18,4) not null check (amount >= 0 and amount <= 1e14),
  limit_value numeric(18,4) check (limit_value >= 0 and limit_value <= 1e14),
  period_start timestamptz,
  period_end timestamptz,
  source_label text not null check (length(trim(source_label)) between 1 and 180),
  mode text not null default 'manual' check (mode = 'manual'),
  observed_at timestamptz not null default now(),
  recorded_by uuid not null default auth.uid() references auth.users(id),
  check (period_end is null or period_start is null or period_end > period_start),
  check ((metric_key = 'quota_used_pct' and unit = '%' and amount <= 100 and
          (limit_value is null or limit_value = 100)) or
         (metric_key = 'credits_available' and unit = 'creditos') or
         (metric_key = 'tokens_used' and unit = 'tokens') or
         (metric_key in ('api_spend_usd', 'extra_spend_usd') and unit = 'USD') or
         (metric_key = 'generations_available' and unit = 'generaciones')),
  check (
    (account_key = 'chatgpt_business' and
       ((seat_key is null and metric_key in ('credits_available', 'api_spend_usd')) or
        (seat_key in ('miguel', 'samuel') and metric_key in ('quota_used_pct', 'tokens_used')))) or
    (account_key in ('claude_miguel', 'claude_samuel') and seat_key is null and
       metric_key in ('quota_used_pct', 'extra_spend_usd', 'tokens_used')) or
    (account_key = 'higgsfield_team' and seat_key is null and
       metric_key in ('credits_available', 'generations_available', 'api_spend_usd'))
  )
);
create index avalon_ai_credit_snapshots_lookup
  on public.avalon_ai_credit_snapshots (account_key, seat_key, metric_key, observed_at desc, id desc);

-- Always stamp observations with the actual authenticated owner and server time.
-- An untrusted client cannot submit a false observation timestamp or actor ID.
create function crm_private.stamp_ai_credit_snapshot()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not crm_private.is_owner() then
    raise exception 'AI credit center forbidden' using errcode = '42501';
  end if;
  new.agency_key := 'avalon';
  new.mode := 'manual';
  new.observed_at := now();
  new.recorded_by := auth.uid();
  return new;
end $$;
revoke all on function crm_private.stamp_ai_credit_snapshot() from public;
create trigger avalon_ai_credit_snapshot_stamp
  before insert on public.avalon_ai_credit_snapshots
  for each row execute function crm_private.stamp_ai_credit_snapshot();

alter table public.avalon_ai_credit_snapshots enable row level security;
revoke all on public.avalon_ai_credit_snapshots from anon, authenticated;
grant select, insert on public.avalon_ai_credit_snapshots to authenticated;
create policy avalon_ai_credits_owner_read on public.avalon_ai_credit_snapshots
  for select to authenticated
  using ((select crm_private.is_owner()) and agency_key = 'avalon');
create policy avalon_ai_credits_owner_insert on public.avalon_ai_credit_snapshots
  for insert to authenticated
  with check ((select crm_private.is_owner()) and agency_key = 'avalon');

commit;
