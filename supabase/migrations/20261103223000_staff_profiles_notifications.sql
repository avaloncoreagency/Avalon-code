-- Staff profile availability and persistent global notifications.
-- Additive migration: existing membership roles, CRM flows and financial privacy remain intact.
begin;

create table public.office_availability (
  user_id uuid primary key references public.agency_memberships(user_id) on delete cascade,
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  timezone text not null default 'America/New_York' check (char_length(timezone) between 3 and 80),
  weekly_hours jsonb not null default '{"mon":["09:00","17:00"],"tue":["09:00","17:00"],"wed":["09:00","17:00"],"thu":["09:00","17:00"],"fri":["09:00","17:00"]}'::jsonb,
  quiet_start text not null default '18:00' check (quiet_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  quiet_end text not null default '09:00' check (quiet_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(weekly_hours) = 'object' and pg_column_size(weekly_hours) <= 2048)
);
alter table public.office_availability enable row level security;
revoke all on public.office_availability from public, anon, authenticated;
grant select on public.office_availability to authenticated;
grant insert (user_id,timezone,weekly_hours,quiet_start,quiet_end) on public.office_availability to authenticated;
grant update (timezone,weekly_hours,quiet_start,quiet_end) on public.office_availability to authenticated;
create policy office_availability_read on public.office_availability
 for select to authenticated using ((select crm_private.is_owner()) and agency_key='avalon');
create policy office_availability_write on public.office_availability
 for insert to authenticated with check ((select crm_private.is_owner()) and user_id=(select auth.uid()) and agency_key='avalon');
create policy office_availability_update on public.office_availability
 for update to authenticated using ((select crm_private.is_owner()) and user_id=(select auth.uid()) and agency_key='avalon')
 with check ((select crm_private.is_owner()) and user_id=(select auth.uid()) and agency_key='avalon');

create function crm_private.office_availability_guard() returns trigger
language plpgsql security invoker set search_path = '' as $officeguard$
declare k text; slot jsonb;
begin
 if new.user_id is distinct from (select auth.uid()) then raise exception 'self_only' using errcode='42501'; end if;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then
   raise exception 'invalid_timezone' using errcode='23514';
 end if;
 for k, slot in select key,value from jsonb_each(new.weekly_hours) loop
   if k not in ('mon','tue','wed','thu','fri','sat','sun')
     or jsonb_typeof(slot)<>'array' or jsonb_array_length(slot)<>2
     or (slot->>0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or (slot->>1) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or (slot->>0) >= (slot->>1) then
       raise exception 'invalid_working_hours' using errcode='23514';
   end if;
 end loop;
 if tg_op='UPDATE' then new.user_id:=old.user_id; end if;
 new.updated_at:=clock_timestamp();
 return new;
end $officeguard$;
revoke all on function crm_private.office_availability_guard() from public, anon, authenticated;
create trigger office_availability_guard before insert or update on public.office_availability
 for each row execute function crm_private.office_availability_guard();

create table public.office_time_off (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.agency_memberships(user_id) on delete cascade,
 agency_key text not null default 'avalon' check (agency_key='avalon'),
 starts_on date not null,
 ends_on date not null,
 reason text not null default '' check (char_length(reason) <= 200),
 created_at timestamptz not null default now(),
 check (ends_on >= starts_on and ends_on <= starts_on + 365)
);
create index office_time_off_person on public.office_time_off(user_id,starts_on,ends_on);
alter table public.office_time_off enable row level security;
revoke all on public.office_time_off from public,anon,authenticated;
grant select on public.office_time_off to authenticated;
grant insert(user_id,starts_on,ends_on,reason) on public.office_time_off to authenticated;
grant delete on public.office_time_off to authenticated;
create policy office_time_off_read on public.office_time_off for select to authenticated
 using ((select crm_private.is_owner()) and agency_key='avalon');
create policy office_time_off_insert on public.office_time_off for insert to authenticated
 with check ((select crm_private.is_owner()) and user_id=(select auth.uid()) and agency_key='avalon');
create policy office_time_off_delete on public.office_time_off for delete to authenticated
 using ((select crm_private.is_owner()) and user_id=(select auth.uid()) and agency_key='avalon');

-- The existing CRM inbox is the single persisted inbox for the OS.
alter table public.crm_notifications drop constraint crm_notifications_category_check;
alter table public.crm_notifications add constraint crm_notifications_category_check
 check (category in ('sales','delivery','task','pipeline','calendar','message','project'));

-- Calendar invitations and updates notify each attendee, but not the editing actor.
create function crm_private.calendar_staff_alert() returns trigger
language plpgsql security definer set search_path = '' as $calnotice$
declare recipient uuid; title_text text; severity_text text := 'normal';
begin
 if tg_op='UPDATE'
    and new.status is not distinct from old.status
    and new.starts_at is not distinct from old.starts_at
    and new.ends_at is not distinct from old.ends_at
    and new.title is not distinct from old.title
    and new.attendee_ids is not distinct from old.attendee_ids then
   return null;
 end if;
 if new.status = 'cancelled' then title_text := 'Evento cancelado: '||left(new.title,150);
 else title_text := case when tg_op='INSERT' then 'Invitación de calendario: ' else 'Calendario actualizado: ' end ||left(new.title,150); end if;
 for recipient in select distinct x from unnest(new.attendee_ids) x loop
   if recipient is not null and recipient is distinct from auth.uid()
     and exists (select 1 from public.agency_memberships m where m.user_id=recipient and m.role='owner') then
     perform crm_private.notify(recipient,severity_text,'calendar',title_text,
       'Revisa el evento y tu disponibilidad.', '/admin/workspace/crm/calendar',
       'calendar:'||new.id||':'||new.version||':'||recipient);
   end if;
 end loop;
 return null;
end $calnotice$;
revoke all on function crm_private.calendar_staff_alert() from public,anon,authenticated;
create trigger crm_event_staff_alert after insert or update on public.crm_events
 for each row execute function crm_private.calendar_staff_alert();

-- Private Office messages also appear in the global inbox.
create function crm_private.office_message_staff_alert() returns trigger
language plpgsql security definer set search_path = '' as $msgn$
begin
 if new.recipient_id is distinct from new.sender_id then
   perform crm_private.notify(new.recipient_id,'normal','message','Nuevo mensaje en Oficina',
     'Tienes un mensaje privado de un compañero.','/admin/workspace/crm/office',
     'office-message:'||new.id);
 end if;
 return null;
end $msgn$;
revoke all on function crm_private.office_message_staff_alert() from public,anon,authenticated;
create trigger office_message_staff_alert after insert on public.office_messages
 for each row execute function crm_private.office_message_staff_alert();

commit;
