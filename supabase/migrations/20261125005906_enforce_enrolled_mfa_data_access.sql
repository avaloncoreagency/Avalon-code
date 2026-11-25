-- Review-only additive authorization correction. No account or business data changes.
-- Preserve opt-in MFA: a verified factor requires AAL2, unverified factors do not.
begin;

-- auth.mfa_factors must remain private. This no-argument broker returns only a
-- boolean for the verified request identity; never accepts another user's ID.
create function crm_private.enrolled_mfa_satisfied() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and (
   auth.jwt() ->> 'aal' = 'aal2'
   or not exists (
     select 1 from auth.mfa_factors f
     where f.user_id = auth.uid() and f.status = 'verified'
   )
 );
$$;
revoke all on function crm_private.enrolled_mfa_satisfied() from public, anon, authenticated;
grant execute on function crm_private.enrolled_mfa_satisfied() to authenticated, service_role;

-- Existing invoker helpers retain trusted memberships and their original grants.
create or replace function crm_private.is_owner() returns boolean
language sql stable security invoker set search_path = '' as $$
 select (select crm_private.enrolled_mfa_satisfied()) and exists (
   select 1 from public.agency_memberships
   where user_id = (select auth.uid()) and role = 'owner'
 );
$$;

create or replace function os_private.is_owner() returns boolean
language sql stable security invoker set search_path = '' as $$
 select crm_private.is_owner();
$$;

create or replace function crm_private.staff_active() returns boolean
language sql stable security invoker set search_path = '' as $$
 select (select crm_private.enrolled_mfa_satisfied()) and exists (
   select 1 from public.staff_portal_access a
   join public.agency_memberships m on m.user_id = a.user_id
   where a.user_id = (select auth.uid()) and m.role = 'operator' and a.active
 );
$$;

-- This existing definer RPC bypasses row policies; explicitly retain the same
-- live activity/membership/MFA check in addition to its caller's lead grant.
create or replace function public.staff_my_leads()
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
    and (select crm_private.staff_active())
  order by l.updated_at desc
  limit 200
$$;

commit;
