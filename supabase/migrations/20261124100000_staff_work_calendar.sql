-- Staff work calendar, tasks and internal notes (additive; REVIEW ONLY — never applied automatically to production).
--
-- Visibility model, enforced by RLS (never by the UI):
--   owner_private   = crm_events (the owners' calendar). UNCHANGED: still owner-only; employees never read it.
--   staff_assigned  = staff_work_items created by an owner for one employee (origin 'staff_assigned').
--   staff_created   = staff_work_items an employee created for themself (origin 'staff_created', needs can_create_events).
--   explicit_shared = staff_work_item_shares: an owner shares one item with another specific employee.
-- An employee reads only items assigned to them or explicitly shared with them, and only while their account is active.
-- Linking a lead/client requires an ACTIVE grant of that lead/client to the assignee; it never opens crm_leads/crm_clients.
-- Notes: 'personal' = author only (no automatic supervision); 'work' = author, owners, and whoever can see the linked item.
begin;

alter table public.staff_portal_access add column can_create_events boolean not null default false;

create table public.staff_work_items (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  kind text not null check (kind in ('task', 'appointment', 'follow_up')),
  origin text not null check (origin in ('staff_assigned', 'staff_created')),
  assignee_id uuid not null references public.agency_memberships(user_id),
  created_by uuid not null default auth.uid() references public.agency_memberships(user_id),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  instructions text not null default '' check (char_length(instructions) <= 4000),
  starts_at timestamptz,
  ends_at timestamptz,
  due_at timestamptz,
  time_zone text not null default 'America/New_York' check (time_zone ~ '^[A-Za-z_]+(/[A-Za-z_+-]+){0,2}$' and char_length(time_zone) <= 60),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  lead_id uuid references public.crm_leads(id),
  client_id uuid references public.crm_clients(id),
  assignee_can_reschedule boolean not null default false,
  completion_note text not null default '' check (char_length(completion_note) <= 2000),
  completed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at),
  check (kind <> 'appointment' or starts_at is not null),
  check (starts_at is not null or due_at is not null),
  check (status <> 'done' or (completed_at is not null and char_length(btrim(completion_note)) >= 3))
);
create index staff_work_items_assignee on public.staff_work_items (assignee_id, coalesce(starts_at, due_at));
create index staff_work_items_created_by on public.staff_work_items (created_by);
create index staff_work_items_lead on public.staff_work_items (lead_id) where lead_id is not null;
create index staff_work_items_client on public.staff_work_items (client_id) where client_id is not null;

create table public.staff_work_item_shares (
  item_id uuid not null references public.staff_work_items(id) on delete cascade,
  user_id uuid not null references public.agency_memberships(user_id) on delete cascade,
  shared_by uuid not null default auth.uid() references public.agency_memberships(user_id),
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index staff_work_item_shares_user on public.staff_work_item_shares (user_id);

create table public.staff_notes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.agency_memberships(user_id),
  visibility text not null check (visibility in ('personal', 'work')),
  item_id uuid references public.staff_work_items(id),
  lead_id uuid references public.crm_leads(id),
  client_id uuid references public.crm_clients(id),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  check (visibility = 'work' or (item_id is null and lead_id is null and client_id is null))
);
create index staff_notes_author on public.staff_notes (author_id, created_at desc);
create index staff_notes_item on public.staff_notes (item_id) where item_id is not null;
create index staff_notes_lead on public.staff_notes (lead_id) where lead_id is not null;
create index staff_notes_client on public.staff_notes (client_id) where client_id is not null;

-- Helpers (invoker: they only see what the caller's RLS lets them see).
create function crm_private.staff_item_visible(p_item uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.staff_work_items i where i.id = p_item)
$$;
revoke all on function crm_private.staff_item_visible(uuid) from public, anon;
grant execute on function crm_private.staff_item_visible(uuid) to authenticated;

-- Definer helper used ONLY inside policies to break RLS recursion items ↔ shares. Returns a boolean about the caller.
create function crm_private.staff_shared_with_me(p_item uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_work_item_shares s where s.item_id = p_item and s.user_id = (select auth.uid()))
$$;
revoke all on function crm_private.staff_shared_with_me(uuid) from public, anon;
grant execute on function crm_private.staff_shared_with_me(uuid) to authenticated;

-- Definer helper: is this user an employee (operator membership)? Returns only a boolean; memberships stay private.
create function crm_private.is_operator(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.agency_memberships m where m.user_id = p_user and m.role = 'operator')
$$;
revoke all on function crm_private.is_operator(uuid) from public, anon;
grant execute on function crm_private.is_operator(uuid) to authenticated;

alter table public.staff_work_items enable row level security;
alter table public.staff_work_item_shares enable row level security;
alter table public.staff_notes enable row level security;
revoke all on public.staff_work_items from anon;
revoke all on public.staff_work_items from public, authenticated;
revoke all on public.staff_work_item_shares from anon;
revoke all on public.staff_work_item_shares from public, authenticated;
revoke all on public.staff_notes from anon;
revoke all on public.staff_notes from public, authenticated;
grant select, insert on public.staff_work_items to authenticated;
grant update (title, instructions, starts_at, ends_at, due_at, time_zone, priority, status, assignee_id, lead_id, client_id,
  assignee_can_reschedule, completion_note, completed_at, version, updated_at) on public.staff_work_items to authenticated;
grant select, insert, delete on public.staff_work_item_shares to authenticated;
grant select, insert on public.staff_notes to authenticated;

create policy staff_items_read on public.staff_work_items for select to authenticated using (
  (select crm_private.is_owner())
  or ((select crm_private.staff_active()) and (assignee_id = (select auth.uid()) or crm_private.staff_shared_with_me(id))));
create policy staff_items_add on public.staff_work_items for insert to authenticated with check (
  ((select crm_private.is_owner()) and origin = 'staff_assigned' and created_by = (select auth.uid())
    and crm_private.is_operator(assignee_id))
  or ((select crm_private.staff_active()) and origin = 'staff_created' and assignee_id = (select auth.uid()) and created_by = (select auth.uid())
    and exists (select 1 from public.staff_portal_access a where a.user_id = (select auth.uid()) and a.active and a.can_create_events)));
create policy staff_items_modify on public.staff_work_items for update to authenticated
  using ((select crm_private.is_owner()) or ((select crm_private.staff_active()) and assignee_id = (select auth.uid())))
  with check ((select crm_private.is_owner()) or ((select crm_private.staff_active()) and assignee_id = (select auth.uid())));

create policy staff_shares_read on public.staff_work_item_shares for select to authenticated
  using ((select crm_private.is_owner()) or user_id = (select auth.uid()));
create policy staff_shares_add on public.staff_work_item_shares for insert to authenticated
  with check ((select crm_private.is_owner()) and shared_by = (select auth.uid())
    and crm_private.is_operator(staff_work_item_shares.user_id));
create policy staff_shares_remove on public.staff_work_item_shares for delete to authenticated using ((select crm_private.is_owner()));

create policy staff_notes_read on public.staff_notes for select to authenticated using (
  (author_id = (select auth.uid()) and ((select crm_private.is_owner()) or (select crm_private.staff_active())))
  or (visibility = 'work' and (select crm_private.is_owner()))
  or (visibility = 'work' and item_id is not null and (select crm_private.staff_active()) and crm_private.staff_item_visible(item_id)));
create policy staff_notes_add on public.staff_notes for insert to authenticated with check (
  author_id = (select auth.uid())
  and ((select crm_private.is_owner()) or (select crm_private.staff_active()))
  and (item_id is null or crm_private.staff_item_visible(item_id))
  and (lead_id is null or (select crm_private.is_owner()) or exists (select 1 from public.staff_lead_grants g
        where g.user_id = (select auth.uid()) and g.lead_id = staff_notes.lead_id and g.active))
  and (client_id is null or (select crm_private.is_owner()) or exists (select 1 from public.staff_client_grants g
        where g.user_id = (select auth.uid()) and g.client_id = staff_notes.client_id and g.active)));

-- Integrity: who may change what. Employees: only progress (status, completion note) on their items, rescheduling
-- only when they created the item or the owner allowed it; never the assignee, origin, links or the owner's wording.
-- Links (lead/client) must be actively granted to the assignee. Optimistic version bump on every change.
create function crm_private.staff_item_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare owner boolean := crm_private.is_owner();
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid(); new.version := 1; new.created_at := now(); new.updated_at := now();
    new.completed_at := case when new.status = 'done' then now() end;
  else
    if new.origin is distinct from old.origin or new.created_by is distinct from old.created_by
       or new.idempotency_key is distinct from old.idempotency_key or new.created_at is distinct from old.created_at then
      raise exception 'staff_item_immutable' using errcode = '42501';
    end if;
    if not owner then
      if new.assignee_id is distinct from old.assignee_id or new.lead_id is distinct from old.lead_id
         or new.client_id is distinct from old.client_id or new.assignee_can_reschedule is distinct from old.assignee_can_reschedule
         or new.priority is distinct from old.priority
         or (old.origin = 'staff_assigned' and (new.title is distinct from old.title or new.instructions is distinct from old.instructions)) then
        raise exception 'staff_item_forbidden_change' using errcode = '42501';
      end if;
      if (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.due_at is distinct from old.due_at
          or new.time_zone is distinct from old.time_zone)
         and not (old.origin = 'staff_created' or old.assignee_can_reschedule) then
        raise exception 'staff_item_reschedule_forbidden' using errcode = '42501';
      end if;
      if new.status = 'cancelled' and old.status <> 'cancelled' and old.origin <> 'staff_created' then
        raise exception 'staff_item_cancel_forbidden' using errcode = '42501';
      end if;
    end if;
    if new.status = 'done' and old.status <> 'done' then new.completed_at := now();
    elsif new.status <> 'done' then new.completed_at := null; end if;
    new.version := old.version + 1; new.updated_at := now();
  end if;
  if new.lead_id is not null and not exists (select 1 from public.staff_lead_grants g
       where g.user_id = new.assignee_id and g.lead_id = new.lead_id and g.active) then
    raise exception 'staff_item_lead_not_granted' using errcode = '42501';
  end if;
  if new.client_id is not null and not exists (select 1 from public.staff_client_grants g
       where g.user_id = new.assignee_id and g.client_id = new.client_id and g.active) then
    raise exception 'staff_item_client_not_granted' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function crm_private.staff_item_guard() from public, anon, authenticated;
create trigger staff_item_guard before insert or update on public.staff_work_items
  for each row execute function crm_private.staff_item_guard();

alter table public.staff_permission_events drop constraint staff_permission_events_action_check;
alter table public.staff_permission_events add constraint staff_permission_events_action_check check (action in
  ('access_granted', 'access_changed', 'access_revoked', 'client_granted', 'client_changed', 'client_revoked',
   'lead_granted', 'lead_changed', 'lead_revoked', 'invitation_sent', 'invitation_enrollment_pending',
   'work_assigned', 'work_reassigned', 'work_cancelled'));
create function crm_private.staff_item_audit() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not crm_private.is_owner() then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.staff_permission_events(user_id, action) values (new.assignee_id, 'work_assigned');
  elsif new.assignee_id is distinct from old.assignee_id then
    insert into public.staff_permission_events(user_id, action) values (new.assignee_id, 'work_reassigned');
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    insert into public.staff_permission_events(user_id, action) values (new.assignee_id, 'work_cancelled');
  end if;
  return new;
end $$;
revoke all on function crm_private.staff_item_audit() from public, anon, authenticated;
create trigger staff_item_audit after insert or update on public.staff_work_items
  for each row execute function crm_private.staff_item_audit();

commit;
