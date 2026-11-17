-- Forward-only compatibility migration: the PR preview branch applied an earlier
-- version of 20261116130000 before quota_window was added to that source file.
-- Safe both for that live preview and a fresh database where the original file
-- already includes this column. Do not rewrite production data.
begin;
alter table public.avalon_ai_credit_snapshots
  add column if not exists quota_window text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.avalon_ai_credit_snapshots'::regclass
    and conname='avalon_ai_credit_quota_window_values') then
    alter table public.avalon_ai_credit_snapshots
      add constraint avalon_ai_credit_quota_window_values
      check (quota_window is null or quota_window in ('session','weekly','monthly','other'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.avalon_ai_credit_snapshots'::regclass
    and conname='avalon_ai_credit_window_metric') then
    alter table public.avalon_ai_credit_snapshots
      add constraint avalon_ai_credit_window_metric
      check ((metric_key='quota_used_pct' and quota_window is not null) or
             (metric_key<>'quota_used_pct' and quota_window is null));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.avalon_ai_credit_snapshots'::regclass
    and conname='avalon_ai_credit_period_complete') then
    alter table public.avalon_ai_credit_snapshots
      add constraint avalon_ai_credit_period_complete
      check ((period_start is null) = (period_end is null));
  end if;
end $$;

drop index if exists public.avalon_ai_credit_snapshots_lookup;
create index avalon_ai_credit_snapshots_lookup
  on public.avalon_ai_credit_snapshots
     (account_key,seat_key,metric_key,quota_window,observed_at desc,id desc);
commit;
