-- Avalon shared calendar: additive metadata, important-day banners, and owner-only access.
-- Apply first in an isolated Preview database. Do not copy Preview secrets to production.
begin;

alter table public.crm_events
  add column description text not null default '' check (char_length(description) <= 4000),
  add column location text not null default '' check (char_length(location) <= 300),
  add column meeting_url text not null default '' check (
    char_length(meeting_url) <= 500 and (meeting_url = '' or meeting_url ~ '^https://[^[:space:]]+$')
  ),
  add column color text not null default '#8b5cf6' check (
    color in ('#8b5cf6','#3b82f6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#64748b')
  ),
  add column all_day boolean not null default false,
  add column attendee_ids uuid[] not null default '{}'::uuid[]
    check (cardinality(attendee_ids) <= 10);

-- Preserve existing meeting/call/follow-up/task values and extend the permitted types.
alter table public.crm_events drop constraint if exists crm_events_kind_check;
alter table public.crm_events add constraint crm_events_kind_check
  check (kind in ('meeting','appointment','call','follow-up','task','personal'));

create index crm_events_shared_range on public.crm_events(starts_at,ends_at)
  where status = 'scheduled';

-- Membership table RLS exposes each owner only to themselves. A narrow
-- SECURITY DEFINER function validates invited owners without exposing
-- membership rows to other authenticated users or anonymous callers.
-- It still verifies that the current caller is an owner before any lookup.
create function crm_private.calendar_owner_exists(candidate uuid) returns boolean
language sql stable security definer set search_path = '' as $
  select crm_private.is_owner()
    and exists (
      select 1 from public.agency_memberships
      where user_id = candidate and role = 'owner'
    );
$;
revoke all on function crm_private.calendar_owner_exists(uuid) from public, anon;
grant execute on function crm_private.calendar_owner_exists(uuid) to authenticated;

-- Retain the original serialized anti-overlap protection and free-text guest
-- matching, while also protecting BOTH owners when they participate in meetings.
-- All-day informational events are intentionally non-blocking.
create or replace function crm_private.event_conflict() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Zona horaria inválida' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(new.attendee_ids) as a(user_id)
    where not crm_private.calendar_owner_exists(a.user_id)
  ) then
    raise exception 'Un participante no es propietario autorizado' using errcode = '23514';
  end if;
  -- Same transaction-wide lock as the original CRM scheduler.
  perform pg_catalog.pg_advisory_xact_lock(7251801);
  if new.status = 'scheduled' and not new.all_day and exists (
    select 1 from public.crm_events e
    where e.id <> new.id and e.status = 'scheduled' and not e.all_day
      and e.starts_at < new.ends_at and e.ends_at > new.starts_at
      and (
        e.owner_id = new.owner_id
        or e.owner_id = any(new.attendee_ids)
        or new.owner_id = any(e.attendee_ids)
        or e.attendee_ids && new.attendee_ids
        or exists (
          select 1 from unnest(string_to_array(e.participants, ',')) a
          join unnest(string_to_array(new.participants, ',')) b
            on lower(trim(a)) = lower(trim(b))
          where length(trim(a)) > 0
        )
      )
  ) then
    raise exception 'Conflicto de horario del responsable o participantes'
      using errcode = '23P01';
  end if;
  return new;
end $$;

create table public.crm_calendar_banners (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  day date not null,
  title text not null check (length(btrim(title)) between 1 and 120),
  subtitle text not null default '' check (length(subtitle) <= 300),
  emoji text not null default '🎉' check (length(emoji) between 1 and 16),
  theme text not null default 'violet' check (
    theme in ('violet','blue','teal','green','amber','rose')
  ),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_key, day)
);
create index crm_calendar_banners_day on public.crm_calendar_banners(day);

create function crm_private.calendar_banner_stamp() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not crm_private.is_owner() then
    raise exception 'Calendario reservado a propietarios' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.version := 1;
    new.created_at := now();
  else
    new.id := old.id;
    new.agency_key := old.agency_key;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.version := old.version + 1;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger crm_calendar_banners_stamp
before insert or update on public.crm_calendar_banners
for each row execute function crm_private.calendar_banner_stamp();

alter table public.crm_calendar_banners enable row level security;
create policy calendar_banners_read on public.crm_calendar_banners
for select to authenticated
using ((select crm_private.is_owner()) and agency_key = 'avalon');
create policy calendar_banners_insert on public.crm_calendar_banners
for insert to authenticated
with check ((select crm_private.is_owner()) and agency_key = 'avalon');
create policy calendar_banners_update on public.crm_calendar_banners
for update to authenticated
using ((select crm_private.is_owner()) and agency_key = 'avalon')
with check ((select crm_private.is_owner()) and agency_key = 'avalon');
create policy calendar_banners_delete on public.crm_calendar_banners
for delete to authenticated
using ((select crm_private.is_owner()) and agency_key = 'avalon');

revoke all on public.crm_calendar_banners from anon;
revoke all on public.crm_calendar_banners from authenticated;
revoke all on public.crm_calendar_banners from public;
grant select, insert, update, delete on public.crm_calendar_banners to authenticated;

commit;
