-- Staff portal v1.1 (additive; REVIEW ONLY — never applied automatically to production).
-- 1. Job title (cargo) is separate from the technical role: authorization stays in agency_memberships +
--    staff_portal_access capabilities + per-resource grants. A job title never grants anything by itself.
-- 2. Seller base: owners grant individual leads to an employee. Employees read a REDACTED, live projection
--    through staff_my_leads(); crm_leads RLS (owner-only) is unchanged. No pipeline, values or finance.
-- 3. Invitation events in the owner-only audit log (written by the staff-invite Edge Function).
begin;

alter table public.staff_portal_access
  add column job_title text not null default 'operator' check (job_title in
    ('seller', 'account_executive', 'operator', 'support', 'designer', 'developer', 'marketing', 'external'));

alter table public.staff_permission_events drop constraint staff_permission_events_action_check;
alter table public.staff_permission_events add constraint staff_permission_events_action_check check (action in
  ('access_granted', 'access_changed', 'access_revoked', 'client_granted', 'client_changed', 'client_revoked',
   'lead_granted', 'lead_changed', 'lead_revoked', 'invitation_sent', 'invitation_enrollment_pending'));
alter table public.staff_permission_events add column lead_id uuid;

create table public.staff_lead_grants (
  user_id uuid not null references public.agency_memberships(user_id) on delete cascade,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  access_level text not null check (access_level in ('view', 'work')),
  active boolean not null default true,
  granted_by uuid references public.agency_memberships(user_id),
  updated_at timestamptz not null default now(),
  primary key (user_id, lead_id)
);
create index staff_lead_grants_lead_idx on public.staff_lead_grants(lead_id);
alter table public.staff_lead_grants enable row level security;
revoke all on public.staff_lead_grants from anon;
revoke all on public.staff_lead_grants from public, authenticated;
grant select, insert, update on public.staff_lead_grants to authenticated;
create policy staff_lead_grants_read on public.staff_lead_grants for select to authenticated
  using ((select crm_private.is_owner()) or (user_id = (select auth.uid()) and active and (select crm_private.staff_active())));
create policy staff_lead_grants_add on public.staff_lead_grants for insert to authenticated
  with check ((select crm_private.is_owner()));
create policy staff_lead_grants_modify on public.staff_lead_grants for update to authenticated
  using ((select crm_private.is_owner())) with check ((select crm_private.is_owner()));

create function crm_private.staff_lead_grant_audit() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.staff_permission_events(user_id, lead_id, action) values (new.user_id, new.lead_id,
    case when not new.active then 'lead_revoked'
         when tg_op = 'INSERT' or not old.active then 'lead_granted' else 'lead_changed' end);
  return new;
end $$;
revoke all on function crm_private.staff_lead_grant_audit() from public, anon, authenticated;
create trigger staff_lead_grant_audit after insert or update on public.staff_lead_grants
  for each row execute function crm_private.staff_lead_grant_audit();

-- Live, redacted projection of the caller's OWN active lead grants. Contact channels only with 'work' access.
-- Never returns value, owner, source, notes, diagnostics, quotes or anything financial.
create function public.staff_my_leads()
returns table (lead_id uuid, company text, contact text, email text, phone text, stage text, access_level text,
  next_activity_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.id, l.company, l.contact,
    case when g.access_level = 'work' then l.email end,
    case when g.access_level = 'work' then l.phone end,
    coalesce(s.label, l.stage_id), g.access_level,
    (select min(a.due_at) from public.crm_activities a where a.lead_id = l.id and a.status = 'pending' and a.due_at is not null),
    l.updated_at
  from public.staff_lead_grants g
  join public.crm_leads l on l.id = g.lead_id and not l.archived
  left join public.crm_stages s on s.id = l.stage_id
  join public.staff_portal_access p on p.user_id = g.user_id and p.active
  join public.agency_memberships m on m.user_id = g.user_id and m.role = 'operator'
  where g.user_id = (select auth.uid()) and g.active
  order by l.updated_at desc
  limit 200
$$;
revoke all on function public.staff_my_leads() from public, anon;
grant execute on function public.staff_my_leads() to authenticated;

commit;
