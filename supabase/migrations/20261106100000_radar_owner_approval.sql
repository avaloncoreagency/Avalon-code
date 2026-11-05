-- Radar P0 (Operación 0352): automatic conversion requires a PRIOR, VERIFIABLE approval by an owner (Miguel or Samuel).
-- Before: crm_radar_worker_convert_verified() accepted `pending` prospects and approved them itself (update ... status='approved')
-- after setting jwt.claim.sub to an owner — so the "approval" was fabricated by the worker. Now:
--   1. crm_prospect_approvals records WHO approved WHAT and WHEN (append-only evidence; written only by the guard/RPC below).
--   2. A guard trigger refuses any transition to status='approved' unless (a) the session is an authenticated OWNER
--      (current_user = 'authenticated' — a service_role session that merely sets jwt.claim.sub is NOT an owner session), or
--      (b) an active approval by a current owner already exists (the RPC creates it first).
--   3. The worker function only converts prospects that are already `approved` WITH an active owner approval; pending,
--      rejected, do_not_contact, legacy-approved-without-evidence and revoked approvals are refused with a logged reason.
--   4. Every decision stores the approval id and the approving owner. Leads are created under the approving owner.
-- PREPARED — not applied to any remote database. Idempotent conversions and duplicate-lead protection are unchanged.
-- Rollback: restore the function body from 20261104140000, drop the two triggers, the RPC, the approval table and the new
-- crm_radar_decisions columns.
begin;

create table public.crm_prospect_approvals (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.crm_prospects (id) on delete cascade,
  approved_by uuid not null references auth.users (id),
  approved_at timestamptz not null default now(),
  source text not null check (source in ('owner_session', 'owner_rpc')),
  note text not null default '' check (length(note) <= 300),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id)
);
create unique index crm_prospect_approvals_one_active on public.crm_prospect_approvals (prospect_id) where revoked_at is null;
create index crm_prospect_approvals_prospect on public.crm_prospect_approvals (prospect_id, approved_at desc);

alter table public.crm_prospect_approvals enable row level security;
revoke all on public.crm_prospect_approvals from anon, authenticated, public;
grant select on public.crm_prospect_approvals to authenticated, service_role;
create policy prospect_approvals_owner_read on public.crm_prospect_approvals for select to authenticated using ((select crm_private.is_owner()));

alter table public.crm_radar_decisions
  add column approval_id uuid references public.crm_prospect_approvals (id),
  add column approved_by uuid references auth.users (id);

-- Internal writer (definer): the ONLY way a row enters crm_prospect_approvals. Verifies the approver is a current owner.
create function crm_private.record_prospect_approval(p_prospect uuid, p_approver uuid, p_source text, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not exists (select 1 from public.agency_memberships m where m.user_id = p_approver and m.role = 'owner') then
    raise exception 'owner_approval_required' using errcode = '42501';
  end if;
  insert into public.crm_prospect_approvals (prospect_id, approved_by, source, note)
  values (p_prospect, p_approver, p_source, left(coalesce(p_note, ''), 300))
  on conflict (prospect_id) where revoked_at is null do nothing
  returning id into v;
  if v is null then select a.id into v from public.crm_prospect_approvals a where a.prospect_id = p_prospect and a.revoked_at is null; end if;
  return v;
end $$;
revoke all on function crm_private.record_prospect_approval(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function crm_private.record_prospect_approval(uuid, uuid, text, text) to authenticated, service_role;

-- Guard (invoker): who may move a prospect to `approved`.
create function crm_private.prospect_approval_guard() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    -- An owner's own session: allowed; the approval is recorded by the AFTER trigger with auth.uid().
    if current_user = 'authenticated' and (select crm_private.is_owner()) then
      return new;
    end if;
    -- Anything else (service_role worker, definer helpers, a forged jwt.claim.sub) needs an approval that ALREADY exists.
    if not exists (select 1 from public.crm_prospect_approvals a join public.agency_memberships m on m.user_id = a.approved_by and m.role = 'owner'
                   where a.prospect_id = new.id and a.revoked_at is null) then
      raise exception 'owner_approval_required' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger crm_prospects_approval_guard before insert or update of status on public.crm_prospects
  for each row execute function crm_private.prospect_approval_guard();

-- Evidence (invoker; writes go through definer helpers): record the owner approval / revoke it when the prospect leaves `approved`.
create function crm_private.revoke_prospect_approval(p_prospect uuid) returns void language sql security definer set search_path = '' as $$
  update public.crm_prospect_approvals set revoked_at = now(), revoked_by = (select auth.uid()) where prospect_id = p_prospect and revoked_at is null;
$$;
revoke all on function crm_private.revoke_prospect_approval(uuid) from public, anon, authenticated;
grant execute on function crm_private.revoke_prospect_approval(uuid) to authenticated, service_role;
create function crm_private.prospect_approval_evidence() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    if current_user = 'authenticated' then perform crm_private.record_prospect_approval(new.id, (select auth.uid()), 'owner_session', ''); end if;
  elsif tg_op = 'UPDATE' and old.status = 'approved' and new.status is distinct from 'approved' and new.status <> 'converted' then
    perform crm_private.revoke_prospect_approval(new.id);
  end if;
  return null;
end $$;
create trigger crm_prospects_approval_evidence after insert or update of status on public.crm_prospects
  for each row execute function crm_private.prospect_approval_evidence();

-- Programmatic owner approval with an evidence note (the owner UI keeps working through the guard above).
create function public.crm_prospect_approve(p_prospect uuid, p_note text) returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.crm_prospects; v uuid;
begin
  if not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into p from public.crm_prospects where id = p_prospect for update;
  if not found then raise exception 'prospect_not_found' using errcode = '22023'; end if;
  if p.status in ('rejected', 'converted') or p.do_not_contact then raise exception 'prospect_not_approvable' using errcode = '23514'; end if;
  v := crm_private.record_prospect_approval(p.id, (select auth.uid()), 'owner_rpc', p_note);
  if p.status <> 'approved' then update public.crm_prospects set status = 'approved' where id = p.id; end if;
  return v;
end $$;
revoke all on function public.crm_prospect_approve(uuid, text) from public, anon;
grant execute on function public.crm_prospect_approve(uuid, text) to authenticated;

-- Decision log with approval evidence (overload; the previous 5-argument version stays for older callers).
create function crm_private.radar_log_decision(p_prospect uuid, p_version integer, p_outcome text, p_reasons text[], p_lead uuid, p_approval uuid, p_approver uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.crm_radar_decisions d where d.prospect_id = p_prospect and d.rule_version = p_version
    and d.outcome = p_outcome and d.reasons = p_reasons and d.approval_id is not distinct from p_approval
    and d.decided_at = (select max(x.decided_at) from public.crm_radar_decisions x where x.prospect_id = p_prospect)) then
    return;
  end if;
  insert into public.crm_radar_decisions (prospect_id, rule_version, outcome, reasons, lead_id, approval_id, approved_by)
  values (p_prospect, p_version, p_outcome, p_reasons, p_lead, p_approval, p_approver);
end $$;
revoke all on function crm_private.radar_log_decision(uuid, integer, text, text[], uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function crm_private.radar_log_decision(uuid, integer, text, text[], uuid, uuid, uuid) to service_role;

-- Same contract as before (service_role only; returns lead id or null; idempotent). It NEVER approves anything.
create or replace function public.crm_radar_worker_convert_verified(prospect_id uuid)
returns uuid
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  p public.crm_prospects;
  r public.crm_radar_rule_sets;
  ap public.crm_prospect_approvals;
  result uuid;
  strong_services integer := 0;
  why text[] := '{}';
  rank constant text[] := array['none', 'low', 'medium', 'high'];
begin
  if current_user <> 'service_role' then
    raise exception 'service_role only' using errcode = '42501';
  end if;
  select * into r from public.crm_radar_rule_sets where active;
  select * into p from public.crm_prospects where id = prospect_id for update;
  if not found then return null; end if;
  if p.status = 'converted' then return p.lead_id; end if;

  if p.source_ref is null then why := array_append(why, 'no_source'::text); end if;
  if p.do_not_contact then why := array_append(why, 'do_not_contact'::text); end if;
  if p.status = 'rejected' then why := array_append(why, 'rejected_by_human'::text); end if;
  if cardinality(why) > 0 then
    perform crm_private.radar_log_decision(p.id, r.version, 'blocked', why, null, null, null);
    return null;
  end if;

  -- P0: no human approval, no automatic conversion.
  if p.status <> 'approved' then
    perform crm_private.radar_log_decision(p.id, r.version, 'pending', array['owner_approval_required'], null, null, null);
    return null;
  end if;
  select a.* into ap from public.crm_prospect_approvals a
    join public.agency_memberships m on m.user_id = a.approved_by and m.role = 'owner'
   where a.prospect_id = p.id and a.revoked_at is null;
  if not found then
    perform crm_private.radar_log_decision(p.id, r.version, 'blocked', array['approval_not_verifiable'], null, null, null);
    return null;
  end if;

  if p.stars_override is not null then why := array_append(why, 'manual_rating_requires_human'::text); end if;
  if p.stars is null or p.stars < r.min_stars then why := array_append(why, 'stars_below_threshold'::text); end if;
  if array_position(rank, p.confidence) is null or array_position(rank, p.confidence) < array_position(rank, r.min_confidence) then
    why := array_append(why, 'confidence_below_threshold'::text);
  end if;
  select count(distinct n.service)::integer into strong_services
  from public.crm_prospect_needs n
  where n.prospect_id = p.id
    and n.state in ('verified_missing', 'opportunity_to_improve')
    and n.confidence in ('high') and n.method <> ''
    and n.evidence_url like 'https://%'
    and length(btrim(n.note)) >= r.min_note_length;
  if strong_services < r.min_strong_services then why := array_append(why, 'insufficient_evidenced_services'::text); end if;
  if cardinality(why) > 0 then
    perform crm_private.radar_log_decision(p.id, r.version, 'pending', why, null, ap.id, ap.approved_by);
    return null;
  end if;

  -- The lead belongs to the owner who approved the prospect (not to "the first owner").
  perform set_config('request.jwt.claim.sub', ap.approved_by::text, true);
  begin
    insert into public.crm_leads (company, contact, email, phone, source, owner_id, created_by, stage_id, prospect_id, website, industry, location, priority)
    values (p.company, p.contact, p.email, p.phone, 'Radar (aprobado por owner): ' || left(p.source, 150), ap.approved_by, ap.approved_by, 'new', p.id, left(p.website, 300), p.industry, p.location, 'high')
    returning id into result;
  exception when unique_violation then
    perform crm_private.radar_log_decision(p.id, r.version, 'blocked', array['duplicate_lead'], null, ap.id, ap.approved_by);
    return null;
  end;
  update public.crm_prospects set status = 'converted', lead_id = result, research_status = 'qualified' where id = p.id;
  perform crm_private.radar_log_decision(p.id, r.version, 'promoted', array['meets_active_rules', 'owner_approved'], result, ap.id, ap.approved_by);
  return result;
end
$function$;
revoke all on function public.crm_radar_worker_convert_verified(uuid) from public, anon, authenticated;
grant execute on function public.crm_radar_worker_convert_verified(uuid) to service_role;

commit;
