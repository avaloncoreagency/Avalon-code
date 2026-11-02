-- Avalon OS: production-ready owner membership schema proposal.
-- REVIEW BEFORE APPLYING. Does not create users or grant owner membership.
-- All roles default to no access; only a trusted administrator may provision
-- verified auth.users UUIDs using a privileged, audited process.
create table if not exists public.agency_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner')),
  created_at timestamptz not null default now()
);

alter table public.agency_memberships enable row level security;

-- Idempotent policy for each signed-in user to read their own membership.
drop policy if exists "Members can read their own membership" on public.agency_memberships;
create policy "Members can read their own membership"
on public.agency_memberships
for select to authenticated
using ((select auth.uid()) = user_id);

-- No INSERT, UPDATE or DELETE policy is provided to API roles.
-- Revoke direct mutation grants even if a permissive legacy grant exists.
revoke insert, update, delete on public.agency_memberships from anon, authenticated;
grant select on public.agency_memberships to authenticated;
revoke all on public.agency_memberships from anon;
