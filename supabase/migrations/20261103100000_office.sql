-- Avalon Office: member profiles, dynamic directory, private messages and an AI-manager request inbox.
-- PREPARED ONLY — isolated database first; production needs explicit owner approval.
-- Principles: identities come from agency_memberships (never from editable metadata); a profile and its
-- photo can only be written by the person themselves; messages are visible only to sender and recipient;
-- AI-manager requests are *registered*, never marked as executed, because no execution backend exists.
begin;

-- 1. Profiles (one per member, written only by that member) -------------------------
create table public.office_profiles (
  user_id uuid primary key references public.agency_memberships (user_id) on delete cascade,
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  display_name text not null default '' check (length(display_name) <= 80),
  title text not null default '' check (length(title) <= 80),
  department text not null default '' check (length(department) <= 80),
  bio text not null default '' check (length(bio) <= 600),
  specialties text[] not null default '{}' check (cardinality(specialties) <= 8),
  photo bytea check (photo is null or octet_length(photo) between 1 and 716800),
  photo_mime text check (photo_mime is null or photo_mime in ('image/png', 'image/jpeg', 'image/webp')),
  photo_sha256 text check (photo_sha256 is null or photo_sha256 ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now(),
  check ((photo is null) = (photo_mime is null) and (photo is null) = (photo_sha256 is null))
);

create function crm_private.office_profile_stamp() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.user_id is distinct from (select auth.uid()) then raise exception 'office_profile_self_only' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then raise exception 'office_profile_self_only' using errcode = '42501'; end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function crm_private.office_profile_stamp() from public;
create trigger office_profile_stamp before insert or update on public.office_profiles for each row execute function crm_private.office_profile_stamp();

-- 2. Private messages between members, optionally linked to real CRM records --------
create table public.office_messages (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  sender_id uuid not null default auth.uid() references public.agency_memberships (user_id),
  recipient_id uuid not null references public.agency_memberships (user_id),
  body text not null check (length(btrim(body)) between 1 and 4000),
  ref_type text check (ref_type in ('lead', 'client', 'sale', 'project', 'task')),
  ref_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check ((ref_type is null) = (ref_id is null)),
  check (sender_id <> recipient_id)
);
create index office_messages_pair on public.office_messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at desc);
create index office_messages_unread on public.office_messages (recipient_id, created_at desc) where read_at is null;

-- 3. Requests to AI managers: recorded for follow-up, never presented as executed ----
create table public.office_agent_requests (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  agent text not null check (agent in ('ren', 'shin', 'haru', 'sora', 'kenji')),
  body text not null check (length(btrim(body)) between 1 and 2000),
  ref_type text check (ref_type in ('lead', 'client', 'sale', 'project', 'task')),
  ref_id uuid,
  status text not null default 'registered' check (status in ('registered', 'cancelled')),
  created_by uuid not null default auth.uid() references public.agency_memberships (user_id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check ((ref_type is null) = (ref_id is null)),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create index office_agent_requests_agent on public.office_agent_requests (agent, created_at desc);

-- 4. Shared guards --------------------------------------------------------------------
-- A linked record must exist and be visible to the writer (invoker → RLS applies).
create function crm_private.office_ref_exists(kind text, rid uuid) returns boolean
language plpgsql stable security invoker set search_path = '' as $$
begin
  return case kind
    when 'lead' then exists (select 1 from public.crm_leads where id = rid)
    when 'client' then exists (select 1 from public.crm_clients where id = rid)
    when 'sale' then exists (select 1 from public.crm_sales where id = rid)
    when 'project' then exists (select 1 from public.os_projects where id = rid)
    when 'task' then exists (select 1 from public.crm_tasks where id = rid)
    else false end;
end $$;
revoke all on function crm_private.office_ref_exists(text, uuid) from public;
grant execute on function crm_private.office_ref_exists(text, uuid) to authenticated;

create function crm_private.office_message_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.sender_id := (select auth.uid());
    new.created_at := now();
    new.read_at := null;
    if new.ref_type is not null and not crm_private.office_ref_exists(new.ref_type, new.ref_id) then
      raise exception 'office_ref_missing' using errcode = '23503';
    end if;
    -- Abuse bound: 200 messages per sender per hour.
    if (select count(*) from public.office_messages m where m.sender_id = new.sender_id and m.created_at > now() - interval '1 hour') >= 200 then
      raise exception 'office_rate_limited' using errcode = '54000';
    end if;
  else
    -- Only read_at is updatable (column grant); it can be set once and never cleared.
    new.read_at := coalesce(old.read_at, now());
  end if;
  return new;
end $$;
revoke all on function crm_private.office_message_guard() from public;
create trigger office_message_guard before insert or update on public.office_messages for each row execute function crm_private.office_message_guard();

create function crm_private.office_request_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.created_at := now();
    new.status := 'registered';
    new.cancelled_at := null;
    if new.ref_type is not null and not crm_private.office_ref_exists(new.ref_type, new.ref_id) then
      raise exception 'office_ref_missing' using errcode = '23503';
    end if;
    if (select count(*) from public.office_agent_requests r where r.created_by = new.created_by and r.created_at > now() - interval '1 hour') >= 60 then
      raise exception 'office_rate_limited' using errcode = '54000';
    end if;
  else
    if old.status <> 'registered' or new.status <> 'cancelled' then raise exception 'office_request_final' using errcode = '23514'; end if;
    new.cancelled_at := now();
  end if;
  return new;
end $$;
revoke all on function crm_private.office_request_guard() from public;
create trigger office_request_guard before insert or update on public.office_agent_requests for each row execute function crm_private.office_request_guard();

-- 5. RLS and least-privilege grants -----------------------------------------------------
alter table public.office_profiles enable row level security;
alter table public.office_messages enable row level security;
alter table public.office_agent_requests enable row level security;
revoke all on public.office_profiles, public.office_messages, public.office_agent_requests from anon, authenticated;

grant select, insert on public.office_profiles to authenticated;
grant update (user_id, display_name, title, department, bio, specialties, photo, photo_mime, photo_sha256) on public.office_profiles to authenticated;
create policy office_read on public.office_profiles for select to authenticated using ((select crm_private.is_owner()));
create policy office_insert on public.office_profiles for insert to authenticated with check ((select crm_private.is_owner()) and user_id = (select auth.uid()));
create policy office_update on public.office_profiles for update to authenticated
  using ((select crm_private.is_owner()) and user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert on public.office_messages to authenticated;
grant update (read_at) on public.office_messages to authenticated;
create policy office_read on public.office_messages for select to authenticated
  using ((select crm_private.is_owner()) and (sender_id = (select auth.uid()) or recipient_id = (select auth.uid())));
create policy office_insert on public.office_messages for insert to authenticated
  with check ((select crm_private.is_owner()) and sender_id = (select auth.uid()));
create policy office_mark_read on public.office_messages for update to authenticated
  using ((select crm_private.is_owner()) and recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

grant select, insert on public.office_agent_requests to authenticated;
grant update (status) on public.office_agent_requests to authenticated;
create policy office_read on public.office_agent_requests for select to authenticated using ((select crm_private.is_owner()));
create policy office_insert on public.office_agent_requests for insert to authenticated
  with check ((select crm_private.is_owner()) and created_by = (select auth.uid()));
create policy office_cancel on public.office_agent_requests for update to authenticated
  using ((select crm_private.is_owner()) and created_by = (select auth.uid())) with check (created_by = (select auth.uid()));

-- 6. Directory: every authorized member (all roles), with their self-written profile ----
-- Definer only to read auth.users e-mail; returns nothing unless the caller is an owner.
create function public.office_directory()
returns table (user_id uuid, role text, email text, joined_at timestamptz, display_name text, title text,
  department text, bio text, specialties text[], has_photo boolean, profile_updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.role, coalesce(u.email, ''), m.created_at, coalesce(p.display_name, ''), coalesce(p.title, ''),
    coalesce(p.department, ''), coalesce(p.bio, ''), coalesce(p.specialties, '{}'), p.photo is not null, p.updated_at
  from public.agency_memberships m
  join auth.users u on u.id = m.user_id
  left join public.office_profiles p on p.user_id = m.user_id
  where crm_private.is_owner()
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.created_at, u.email
$$;
revoke all on function public.office_directory() from public, anon;
grant execute on function public.office_directory() to authenticated;

commit;
