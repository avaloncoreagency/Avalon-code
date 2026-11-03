-- Source-verified business research (owner-initiated; append-only).
-- Records observations, sources, timestamps and unknowns. It is not a CRM
-- lead and does not trigger approval, conversion, outreach or bulk crawling.
begin;

create table public.crm_radar_research_reports (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  prospect_id uuid not null references public.crm_prospects (id),
  website text not null check (length(website) between 9 and 500 and website ~ '^https://'),
  status text not null check (status in ('complete', 'limited', 'blocked')),
  report jsonb not null check (jsonb_typeof(report) = 'object' and octet_length(report::text) <= 32768),
  scanned_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id)
);
create index crm_radar_research_latest on public.crm_radar_research_reports (prospect_id, scanned_at desc);
create index crm_radar_research_daily on public.crm_radar_research_reports (created_by, scanned_at desc);
alter table public.crm_radar_research_reports enable row level security;
revoke all on public.crm_radar_research_reports from anon, authenticated;
revoke all on public.crm_radar_research_reports from public;
grant select, insert on public.crm_radar_research_reports to authenticated;
create policy crm_radar_research_read on public.crm_radar_research_reports
  for select to authenticated
  using (agency_key = 'avalon' and (select crm_private.is_owner()));
create policy crm_radar_research_insert on public.crm_radar_research_reports
  for insert to authenticated
  with check (
    agency_key = 'avalon'
    and created_by = (select auth.uid())
    and (select crm_private.is_owner())
    and exists (select 1 from public.crm_prospects p where p.id = prospect_id and p.agency_key = 'avalon')
  );

commit;
