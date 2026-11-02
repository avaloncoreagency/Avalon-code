-- Avalon OS: production owner/member identity foundation.
-- Matches the tested branch's role constraint. Application access remains
-- owner-only until employee authorization is separately implemented.
-- No user, membership, or owner grant is inserted by this migration.
create table if not exists public.agency_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'operator')),
  created_at timestamptz not null default now()
);

alter table public.agency_memberships enable row level security;

drop policy if exists "Members can read their own membership" on public.agency_memberships;
create policy "Members can read their own membership"
on public.agency_memberships
for select to authenticated
using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.agency_memberships from anon, authenticated;
grant select on public.agency_memberships to authenticated;
revoke all on public.agency_memberships from anon;
