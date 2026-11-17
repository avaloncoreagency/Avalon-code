-- Avalon employee portal v1. REVIEW ONLY: never apply automatically to production.
-- Existing owner-only CRM RLS and office_messages policies remain unchanged.
-- The existing 'operator' membership is the employee role until an audited
-- invitation/enrollment flow is available. No memberships or new users are seeded.
begin;

create table public.staff_portal_access (
 user_id uuid primary key references public.agency_memberships(user_id) on delete cascade,
 active boolean not null default false,
 can_create_casefiles boolean not null default false,
 can_message boolean not null default false,
 granted_by uuid references public.agency_memberships(user_id),
 updated_at timestamptz not null default now()
);
alter table public.staff_portal_access enable row level security;
revoke all on public.staff_portal_access from public, anon, authenticated;
grant select, insert, update on public.staff_portal_access to authenticated;
create policy staff_access_read on public.staff_portal_access for select to authenticated
 using (user_id=(select auth.uid()) or (select crm_private.is_owner()));
create policy staff_access_add on public.staff_portal_access for insert to authenticated
 with check ((select crm_private.is_owner()));
create policy staff_access_modify on public.staff_portal_access for update to authenticated
 using ((select crm_private.is_owner())) with check ((select crm_private.is_owner()));

-- Invoker-only helper: caller's own visible access row plus trusted membership.
create function crm_private.staff_active() returns boolean
language sql stable security invoker set search_path = '' as $$
 select exists (
   select 1 from public.staff_portal_access a
   join public.agency_memberships m on m.user_id=a.user_id
   where a.user_id=(select auth.uid()) and m.role='operator' and a.active
 );
$$;
revoke all on function crm_private.staff_active() from public, anon;
grant execute on function crm_private.staff_active() to authenticated;

-- Minimal internal contact list for message addressing. No private CRM fields.
create table public.staff_contacts (
 user_id uuid primary key references public.agency_memberships(user_id) on delete cascade,
 display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
 is_listed boolean not null default false
);
alter table public.staff_contacts enable row level security;
revoke all on public.staff_contacts from public, anon, authenticated;
grant select, insert, update on public.staff_contacts to authenticated;
create policy staff_contacts_read on public.staff_contacts for select to authenticated
 using ((select crm_private.is_owner()) or (is_listed and (select crm_private.staff_active())));
create policy staff_contacts_add on public.staff_contacts for insert to authenticated
 with check ((select crm_private.is_owner()));
create policy staff_contacts_modify on public.staff_contacts for update to authenticated
 using ((select crm_private.is_owner())) with check ((select crm_private.is_owner()));
-- Owners already in the trusted membership roster may appear as recipients.
-- A fallback label is intentionally generic; owners can rename it later.
insert into public.staff_contacts(user_id,display_name,is_listed)
select m.user_id,coalesce(nullif(btrim(p.display_name),''),'Dirección Avalon'),true
from public.agency_memberships m
left join public.office_profiles p on p.user_id=m.user_id
where m.role='owner'
on conflict (user_id) do nothing;

-- A grant exposes ONLY the client name copied at assignment time, not the CRM row.
-- Owners can revoke instantly without changing crm_clients policies.
create table public.staff_client_grants (
 user_id uuid not null references public.agency_memberships(user_id) on delete cascade,
 client_id uuid not null references public.crm_clients(id) on delete cascade,
 client_name text not null check (char_length(btrim(client_name)) between 1 and 200),
 access_level text not null check (access_level in ('view','work')),
 active boolean not null default true,
 granted_by uuid references public.agency_memberships(user_id),
 updated_at timestamptz not null default now(),
 primary key (user_id, client_id)
);
create index staff_client_grants_client_idx on public.staff_client_grants(client_id);
alter table public.staff_client_grants enable row level security;
revoke all on public.staff_client_grants from public, anon, authenticated;
grant select, insert, update on public.staff_client_grants to authenticated;
create policy staff_client_grants_read on public.staff_client_grants for select to authenticated
 using ((select crm_private.is_owner()) or
   (user_id=(select auth.uid()) and active and (select crm_private.staff_active())));
create policy staff_client_grants_add on public.staff_client_grants for insert to authenticated
 with check ((select crm_private.is_owner()));
create policy staff_client_grants_modify on public.staff_client_grants for update to authenticated
 using ((select crm_private.is_owner())) with check ((select crm_private.is_owner()));

-- Employee-created dossiers are completely separate from owner-only Client 360.
-- Even two workers assigned to the same client cannot see each other's cases.
create table public.staff_casefiles (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references public.agency_memberships(user_id),
 linked_client_id uuid references public.crm_clients(id) on delete set null,
 title text not null check (char_length(btrim(title)) between 1 and 200),
 contact_name text not null default '' check (char_length(contact_name) <= 160),
 notes text not null default '' check (char_length(notes) <= 12000),
 status text not null default 'open' check (status in ('open','in_progress','closed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index staff_casefiles_owner_idx on public.staff_casefiles(user_id,updated_at desc);
create index staff_casefiles_link_idx on public.staff_casefiles(linked_client_id);
alter table public.staff_casefiles enable row level security;
revoke all on public.staff_casefiles from public, anon, authenticated;
grant select, insert on public.staff_casefiles to authenticated;
grant update (title,contact_name,notes,status) on public.staff_casefiles to authenticated;
create policy staff_casefiles_read on public.staff_casefiles for select to authenticated
 using ((select crm_private.is_owner()) or
   (user_id=(select auth.uid()) and (select crm_private.staff_active()) and
    (linked_client_id is null or exists(
       select 1 from public.staff_client_grants g
       where g.user_id=(select auth.uid()) and g.client_id=linked_client_id and g.active
    ))));
create policy staff_casefiles_add on public.staff_casefiles for insert to authenticated
 with check ((select crm_private.is_owner()) or
   (user_id=(select auth.uid()) and (select crm_private.staff_active()) and
    exists(select 1 from public.staff_portal_access a where a.user_id=(select auth.uid()) and a.active and a.can_create_casefiles)
    and (linked_client_id is null or exists(
       select 1 from public.staff_client_grants g
       where g.user_id=(select auth.uid()) and g.client_id=linked_client_id
         and g.active and g.access_level='work'
    ))));
create policy staff_casefiles_modify on public.staff_casefiles for update to authenticated
 using ((select crm_private.is_owner()) or
   (user_id=(select auth.uid()) and (select crm_private.staff_active()) and
    (linked_client_id is null or exists(
       select 1 from public.staff_client_grants g
       where g.user_id=(select auth.uid()) and g.client_id=linked_client_id
         and g.active and g.access_level='work'
    ))))
 with check ((select crm_private.is_owner()) or
   (user_id=(select auth.uid()) and (select crm_private.staff_active()) and
    (linked_client_id is null or exists(
       select 1 from public.staff_client_grants g
       where g.user_id=(select auth.uid()) and g.client_id=linked_client_id
         and g.active and g.access_level='work'
    ))));

create function crm_private.staff_casefile_stamp() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then
   if not crm_private.is_owner() then
     if new.user_id is distinct from auth.uid() then
       raise exception 'casefile_self_only' using errcode='42501';
     end if;
     new.user_id := auth.uid();
   end if;
   new.created_at:=now();
 else
   if new.user_id is distinct from old.user_id or
      new.linked_client_id is distinct from old.linked_client_id or
      new.created_at is distinct from old.created_at then
       raise exception 'casefile_ownership_immutable' using errcode='42501';
   end if;
 end if;
 new.updated_at:=now();
 return new;
end $$;
revoke all on function crm_private.staff_casefile_stamp() from public, anon, authenticated;
create trigger staff_casefile_stamp before insert or update on public.staff_casefiles
 for each row execute function crm_private.staff_casefile_stamp();

-- No administrator backdoor into employee DMs: even owners see only messages
-- they personally sent or received.
create table public.staff_private_messages (
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null default auth.uid() references public.agency_memberships(user_id),
 recipient_id uuid not null references public.agency_memberships(user_id),
 body text not null check (char_length(btrim(body)) between 1 and 4000),
 created_at timestamptz not null default now(),
 read_at timestamptz,
 check (sender_id <> recipient_id)
);
create index staff_messages_inbox_idx on public.staff_private_messages(recipient_id,created_at desc);
create index staff_messages_sent_idx on public.staff_private_messages(sender_id,created_at desc);
alter table public.staff_private_messages enable row level security;
revoke all on public.staff_private_messages from public, anon, authenticated;
grant select, insert on public.staff_private_messages to authenticated;
grant update (read_at) on public.staff_private_messages to authenticated;
create policy staff_messages_read on public.staff_private_messages for select to authenticated
 using ((sender_id=(select auth.uid()) or recipient_id=(select auth.uid())) and
   ((select crm_private.is_owner()) or (select crm_private.staff_active())));
create policy staff_messages_send on public.staff_private_messages for insert to authenticated
 with check (sender_id=(select auth.uid()) and
   ((select crm_private.is_owner()) or
    ((select crm_private.staff_active()) and
     exists (select 1 from public.staff_portal_access a where a.user_id=(select auth.uid()) and a.can_message and a.active)))
   and exists (select 1 from public.staff_contacts c where c.user_id=recipient_id and c.is_listed));
create policy staff_messages_mark_read on public.staff_private_messages for update to authenticated
 using (recipient_id=(select auth.uid()) and
   ((select crm_private.is_owner()) or (select crm_private.staff_active())))
 with check (recipient_id=(select auth.uid()) and
   ((select crm_private.is_owner()) or (select crm_private.staff_active())));

create function crm_private.staff_message_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then
   new.sender_id:=auth.uid();
   new.created_at:=now();
   new.read_at:=null;
   if (select count(*) from public.staff_private_messages m
       where m.sender_id=new.sender_id and m.created_at>now()-interval '1 hour')>=100 then
      raise exception 'message_rate_limit' using errcode='54000';
   end if;
 else
   new.read_at:=coalesce(old.read_at,now());
 end if;
 return new;
end $$;
revoke all on function crm_private.staff_message_guard() from public, anon, authenticated;
create trigger staff_message_guard before insert or update on public.staff_private_messages
 for each row execute function crm_private.staff_message_guard();

-- Auditable permission changes (owner-only). Never expose to staff.
create table public.staff_permission_events (
 id bigint generated always as identity primary key,
 actor_id uuid not null default auth.uid() references public.agency_memberships(user_id),
 user_id uuid not null references public.agency_memberships(user_id),
 action text not null check (action in ('access_granted','access_changed','access_revoked','client_granted','client_changed','client_revoked')),
 client_id uuid,
 recorded_at timestamptz not null default now()
);
alter table public.staff_permission_events enable row level security;
revoke all on public.staff_permission_events from public, anon, authenticated;
grant select, insert on public.staff_permission_events to authenticated;
create policy staff_events_read on public.staff_permission_events for select to authenticated
 using ((select crm_private.is_owner()));
create policy staff_events_add on public.staff_permission_events for insert to authenticated
 with check ((select crm_private.is_owner()) and actor_id=(select auth.uid()));

-- Atomic audit, no application-side attempt to write a second transaction.
create function crm_private.staff_permissions_audit() returns trigger
language plpgsql security invoker set search_path='' as $$
declare state text;
begin
 if tg_table_name='staff_portal_access' then
   if tg_op='INSERT' then
     state:=case when new.active then 'access_granted' else 'access_revoked' end;
   elsif new.active then
     state:=case when not old.active then 'access_granted' else 'access_changed' end;
   else
     state:='access_revoked';
   end if;
   insert into public.staff_permission_events(user_id,action) values(new.user_id,state);
 else
   if tg_op='INSERT' then
     state:=case when new.active then 'client_granted' else 'client_revoked' end;
   elsif new.active then
     state:=case when not old.active then 'client_granted' else 'client_changed' end;
   else
     state:='client_revoked';
   end if;
   insert into public.staff_permission_events(user_id,client_id,action) values(new.user_id,new.client_id,state);
 end if;
 return new;
end $$;
revoke all on function crm_private.staff_permissions_audit() from public, anon, authenticated;
create trigger staff_access_audit after insert or update on public.staff_portal_access
 for each row execute function crm_private.staff_permissions_audit();
create trigger staff_client_grant_audit after insert or update on public.staff_client_grants
 for each row execute function crm_private.staff_permissions_audit();

-- A disabled account must disappear from recipient lists at the database layer,
-- even when a UI action fails after updating the principal's access.
create function crm_private.staff_contact_revoke() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if not new.active then
   update public.staff_contacts set is_listed=false where user_id=new.user_id;
 end if;
 return new;
end $$;
revoke all on function crm_private.staff_contact_revoke() from public,anon,authenticated;
create trigger staff_contact_revoke after insert or update of active on public.staff_portal_access
 for each row execute function crm_private.staff_contact_revoke();

commit;
