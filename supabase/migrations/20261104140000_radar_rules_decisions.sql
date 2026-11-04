-- Radar: versioned, owner-configurable promotion rules and an auditable decision log (Mission 0349, Phase 2).
-- PREPARED ONLY — not applied to any remote database. Behaviour with the seeded v1 rules is IDENTICAL to the previous hard-coded
-- crm_radar_worker_convert_verified (stars>=4, high confidence, >=2 strong evidenced services); the change adds: thresholds read from
-- the active rule set, and a recorded reason for every promoted / pending / blocked outcome.
-- Rollback: restore the previous function body from 20261103205000, then drop crm_radar_decisions, crm_radar_rule_sets, crm_radar_rules_publish.
begin;

create table public.crm_radar_rule_sets (
  version integer primary key check (version > 0),
  active boolean not null default false,
  min_stars smallint not null check (min_stars between 3 and 5),
  min_confidence text not null check (min_confidence in ('medium', 'high')),
  min_strong_services smallint not null check (min_strong_services between 1 and 6),
  min_note_length smallint not null check (min_note_length between 12 and 200),
  note text not null default '' check (length(note) <= 300),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create unique index crm_radar_rule_sets_one_active on public.crm_radar_rule_sets ((true)) where active;
insert into public.crm_radar_rule_sets (version, active, min_stars, min_confidence, min_strong_services, min_note_length, note)
values (1, true, 4, 'high', 2, 12, 'Reglas iniciales (equivalentes a la promoción automática previa)');

create table public.crm_radar_decisions (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  prospect_id uuid not null references public.crm_prospects (id) on delete cascade,
  rule_version integer not null references public.crm_radar_rule_sets (version),
  outcome text not null check (outcome in ('promoted', 'pending', 'blocked')),
  reasons text[] not null default '{}' check (cardinality(reasons) <= 10),
  lead_id uuid references public.crm_leads (id),
  decided_at timestamptz not null default now()
);
create index crm_radar_decisions_prospect on public.crm_radar_decisions (prospect_id, decided_at desc);

alter table public.crm_radar_rule_sets enable row level security;
alter table public.crm_radar_decisions enable row level security;
revoke all on public.crm_radar_rule_sets from anon, authenticated, public;
revoke all on public.crm_radar_decisions from anon, authenticated, public;
grant select on public.crm_radar_rule_sets to authenticated;
grant select on public.crm_radar_decisions to authenticated;
grant select on public.crm_radar_rule_sets to service_role;
grant select, insert on public.crm_radar_decisions to service_role;
create policy radar_rules_owner_read on public.crm_radar_rule_sets for select to authenticated using ((select crm_private.is_owner()));
create policy radar_decisions_owner_read on public.crm_radar_decisions for select to authenticated using ((select crm_private.is_owner()));

-- Owners publish a NEW version (never edit history). Bounds keep rules conservative: stars >= 3, evidence required.
create function public.crm_radar_rules_publish(p_min_stars integer, p_min_confidence text, p_min_strong integer, p_min_note integer, p_note text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  if not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if p_min_stars not between 3 and 5 or p_min_confidence not in ('medium', 'high') or p_min_strong not between 1 and 6 or p_min_note not between 12 and 200 then
    raise exception 'radar_rules_invalid' using errcode = '22023';
  end if;
  select coalesce(max(version), 0) + 1 into v from public.crm_radar_rule_sets;
  update public.crm_radar_rule_sets set active = false where active;
  insert into public.crm_radar_rule_sets (version, active, min_stars, min_confidence, min_strong_services, min_note_length, note, created_by)
  values (v, true, p_min_stars, p_min_confidence, p_min_strong, p_min_note, left(coalesce(p_note, ''), 300), (select auth.uid()));
  return v;
end $$;
revoke all on function public.crm_radar_rules_publish(integer, text, integer, integer, text) from public, anon;
grant execute on function public.crm_radar_rules_publish(integer, text, integer, integer, text) to authenticated;

-- Same contract as before (service_role only; returns lead id or null; idempotent) + rule set + decision log.
create or replace function public.crm_radar_worker_convert_verified(prospect_id uuid)
returns uuid
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  p public.crm_prospects;
  r public.crm_radar_rule_sets;
  result uuid;
  strong_services integer := 0;
  actor uuid;
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
    perform crm_private.radar_log_decision(p.id, r.version, 'blocked', why, null);
    return null;
  end if;

  if p.status not in ('pending', 'approved') then return null; end if;
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
    perform crm_private.radar_log_decision(p.id, r.version, 'pending', why, null);
    return null;
  end if;

  select user_id into actor from public.agency_memberships where user_id = p.owner_id and role = 'owner' limit 1;
  if actor is null then
    select user_id into actor from public.agency_memberships where role = 'owner' order by created_at limit 1;
  end if;
  if actor is null then return null; end if;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  begin
    if p.status = 'pending' then update public.crm_prospects set status = 'approved' where id = p.id; end if;
    insert into public.crm_leads (company, contact, email, phone, source, owner_id, created_by, stage_id, prospect_id, website, industry, location, priority)
    values (p.company, p.contact, p.email, p.phone, 'Radar automático: ' || left(p.source, 160), actor, actor, 'new', p.id, left(p.website, 300), p.industry, p.location, 'high')
    returning id into result;
  exception when unique_violation then
    perform crm_private.radar_log_decision(p.id, r.version, 'blocked', array['duplicate_lead'], null);
    return null;
  end;
  update public.crm_prospects set status = 'converted', lead_id = result, research_status = 'qualified' where id = p.id;
  perform crm_private.radar_log_decision(p.id, r.version, 'promoted', array['meets_active_rules'], result);
  return result;
end
$function$;

-- Logs only when the latest decision for this prospect differs (repeated worker runs do not spam the log).
create function crm_private.radar_log_decision(p_prospect uuid, p_version integer, p_outcome text, p_reasons text[], p_lead uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.crm_radar_decisions d where d.prospect_id = p_prospect and d.rule_version = p_version
    and d.outcome = p_outcome and d.reasons = p_reasons and d.decided_at = (select max(x.decided_at) from public.crm_radar_decisions x where x.prospect_id = p_prospect)) then
    return;
  end if;
  insert into public.crm_radar_decisions (prospect_id, rule_version, outcome, reasons, lead_id) values (p_prospect, p_version, p_outcome, p_reasons, p_lead);
end $$;
revoke all on function crm_private.radar_log_decision(uuid, integer, text, text[], uuid) from public, anon, authenticated;
grant execute on function crm_private.radar_log_decision(uuid, integer, text, text[], uuid) to service_role;
revoke all on function public.crm_radar_worker_convert_verified(uuid) from public, anon, authenticated;
grant execute on function public.crm_radar_worker_convert_verified(uuid) to service_role;

commit;
