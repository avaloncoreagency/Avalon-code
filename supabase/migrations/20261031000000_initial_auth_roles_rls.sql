-- DRAFT ONLY. Review and test locally before applying to a database.
-- Authentication identities are managed by Supabase Auth (auth.users).
-- Memberships must be provisioned by a trusted database administrator;
-- clients cannot grant themselves access or change their role.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 120),
  created_at timestamptz not null default now()
);

create table if not exists public.agency_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'operator')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.agency_memberships enable row level security;

-- Revoke broad API grants; grant only read access under RLS.
revoke all on public.profiles from anon, authenticated;
revoke all on public.agency_memberships from anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.agency_memberships to authenticated;

create policy "members read own profile"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  and exists (
    select 1 from public.agency_memberships m
    where m.user_id = (select auth.uid())
  )
);

create policy "members read own membership"
on public.agency_memberships for select to authenticated
using (user_id = (select auth.uid()));

-- No INSERT, UPDATE or DELETE policies for application users.
-- Bootstrap founders only via trusted administrator after verifying auth.users IDs.
-- No client may promote itself to owner/admin.
