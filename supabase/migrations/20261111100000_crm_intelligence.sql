-- Avalon CRM Intelligence: commercial diagnosis, explainable scoring, commercial terms and a contract gate on the
-- EXISTING CRM (crm_leads, 13 crm_stages, crm_activities, crm_attachments, crm_audit, crm_timeline). Additive only:
-- no table, column, stage or row is dropped.
--
-- Scope: crm_leads are Avalon's own B2B prospects ("Tipo A"). Consumer leads that Avalon generates for a client
-- ("Tipo B") never live here; crm_leads.audience is pinned to 'agency_b2b' so the two can never be mixed.
--
-- Questionnaires are versioned definitions in code (src/lib/crm/intel/*). The database stores the industry key and the
-- template version next to every answer set, so historical answers stay interpretable after a template changes and a
-- new industry needs no schema change.
--
-- Hard rule (server-side, cannot be bypassed from the UI or REST): a lead may only ENTER a 'won' stage when it has a
-- contract in status 'verified_signed'. Because crm_confirm_sale() moves the lead to won and
-- crm_convert_lead_to_client() requires a won lead, both paths to an active client inherit the rule.
begin;

-- 1. Lead registration fields (all optional except what already existed) -------------------------------------------
alter table public.crm_leads
  add column legal_name text not null default '' check (length(legal_name) <= 200),
  add column contact_title text not null default '' check (length(contact_title) <= 120),
  add column google_business_url text not null default '' check (google_business_url = '' or (length(google_business_url) <= 500 and google_business_url ~ '^https://[^[:space:]<>"]+$')),
  add column address text not null default '' check (length(address) <= 200),
  add column city text not null default '' check (length(city) <= 120),
  add column zip text not null default '' check (zip = '' or zip ~ '^[A-Za-z0-9 -]{3,10}$'),
  add column specialty text not null default '' check (length(specialty) <= 120),
  add column service_area text not null default '' check (length(service_area) <= 300),
  add column origin text not null default 'manual' check (origin in ('manual', 'radar', 'referral', 'website', 'campaign', 'other')),
  add column audience text not null default 'agency_b2b' check (audience = 'agency_b2b'),
  add column industry_key text check (industry_key is null or industry_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  add column next_action text not null default '' check (length(next_action) <= 300),
  add column last_interaction_at timestamptz,
  add column diagnosis_status text not null default 'not_started' check (diagnosis_status in ('not_started', 'in_progress', 'complete')),
  add column lead_score integer check (lead_score is null or lead_score between 0 and 100),
  add column lead_grade text check (lead_grade is null or lead_grade in ('A', 'B', 'C', 'D', 'insufficient')),
  add column contract_status text not null default 'not_started' check (contract_status in ('not_started', 'draft', 'internal_review',
    'sent_for_signature', 'signed_pending_verification', 'verified_signed', 'rejected', 'expired'));
create index crm_leads_industry on public.crm_leads (industry_key) where industry_key is not null and not archived;
create index crm_leads_phone_digits on public.crm_leads ((regexp_replace(phone, '\D', '', 'g'))) where phone <> '' and not archived;

-- 2. Assessments: one answer set per (lead, industry). Switching industry never deletes the previous answers. --------
create table public.crm_lead_assessments (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  lead_id uuid not null references public.crm_leads (id),
  industry_key text not null check (industry_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  template_version text not null check (template_version ~ '^[a-z0-9_.+-]{1,60}$'),
  -- {question_id: {"v": <value>, "s": "answered"|"unknown"|"na", "at": <iso>, "by": <uuid>}}
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 200000),
  status text not null default 'in_progress' check (status in ('in_progress', 'complete')),
  progress integer not null default 0 check (progress between 0 and 100),
  updated_by uuid references auth.users (id),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (lead_id, industry_key)
);
-- Append-only history of every saved change (who, when, which questions, previous and new values).
create table public.crm_lead_assessment_revisions (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  assessment_id uuid not null references public.crm_lead_assessments (id),
  lead_id uuid not null references public.crm_leads (id),
  version integer not null,
  changes jsonb not null check (jsonb_typeof(changes) = 'object'),
  conflicts text[] not null default '{}',
  changed_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index crm_lead_assessment_revisions_lead on public.crm_lead_assessment_revisions (lead_id, created_at desc);

-- Per-question merge with conflict detection: a question is written only if nobody changed it since the caller
-- loaded it (base "at" must match). Other people's answers are never overwritten; conflicts are reported back.
create function public.crm_assessment_save(p_lead uuid, p_industry text, p_template text, p_answers jsonb,
  p_status text default null, p_progress integer default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare a public.crm_lead_assessments; q text; incoming jsonb; stored jsonb; merged jsonb; changes jsonb := '{}'::jsonb;
  conflicts text[] := '{}'; now_iso text := to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'assessment_invalid' using errcode = '22023'; end if;
  if p_status is not null and p_status not in ('in_progress', 'complete') then raise exception 'assessment_invalid' using errcode = '22023'; end if;
  perform 1 from public.crm_leads l where l.id = p_lead and not l.archived;
  if not found then raise exception 'lead_not_found' using errcode = 'P0002'; end if;
  insert into public.crm_lead_assessments (lead_id, industry_key, template_version)
  values (p_lead, p_industry, p_template) on conflict (lead_id, industry_key) do nothing;
  select * into a from public.crm_lead_assessments where lead_id = p_lead and industry_key = p_industry for update;
  merged := a.answers;
  for q, incoming in select key, value from jsonb_each(p_answers) loop
    if q !~ '^[a-z][a-z0-9_]{1,60}$' or jsonb_typeof(incoming) <> 'object'
       or coalesce(incoming ->> 's', '') not in ('answered', 'unknown', 'na', 'clear') then
      raise exception 'assessment_invalid' using errcode = '22023';
    end if;
    stored := merged -> q;
    if stored is not null and (stored ->> 'at') is distinct from (incoming ->> 'base') then
      -- Someone else saved this question after the caller loaded it.
      if (stored -> 'v') is distinct from (incoming -> 'v') or (stored ->> 's') is distinct from (incoming ->> 's') then
        conflicts := conflicts || q;
      end if;
      continue;
    end if;
    if stored is null and incoming ->> 'base' is not null then conflicts := conflicts || q; continue; end if;
    if incoming ->> 's' = 'clear' then
      if stored is not null then changes := changes || jsonb_build_object(q, jsonb_build_object('from', stored, 'to', null)); merged := merged - q; end if;
      continue;
    end if;
    if stored is not null and (stored -> 'v') is not distinct from (incoming -> 'v') and (stored ->> 's') = (incoming ->> 's') then continue; end if;
    changes := changes || jsonb_build_object(q, jsonb_build_object('from', stored, 'to', jsonb_build_object('v', incoming -> 'v', 's', incoming ->> 's')));
    merged := merged || jsonb_build_object(q, jsonb_build_object('v', incoming -> 'v', 's', incoming ->> 's', 'at', now_iso, 'by', auth.uid()));
  end loop;
  if changes <> '{}'::jsonb or (p_status is not null and p_status <> a.status) or (p_progress is not null and p_progress <> a.progress) then
    update public.crm_lead_assessments set answers = merged, template_version = p_template,
      status = coalesce(p_status, status), progress = coalesce(greatest(0, least(100, p_progress)), progress), updated_by = auth.uid()
    where id = a.id returning * into a;
    if changes <> '{}'::jsonb then
      insert into public.crm_lead_assessment_revisions (assessment_id, lead_id, version, changes, conflicts, changed_by)
      values (a.id, p_lead, a.version, changes, conflicts, auth.uid());
    end if;
    update public.crm_leads set industry_key = p_industry,
      diagnosis_status = case when a.status = 'complete' then 'complete' else 'in_progress' end
    where id = p_lead and (industry_key is distinct from p_industry or diagnosis_status is distinct from case when a.status = 'complete' then 'complete' else 'in_progress' end);
  end if;
  return jsonb_build_object('assessment_id', a.id, 'version', a.version, 'answers', a.answers, 'conflicts', to_jsonb(conflicts),
    'changed', (select count(*) from jsonb_object_keys(changes)));
end $$;
revoke all on function public.crm_assessment_save(uuid, text, text, jsonb, text, integer) from public, anon;
grant execute on function public.crm_assessment_save(uuid, text, text, jsonb, text, integer) to authenticated;

-- 3. Scores: append-only evaluations (computed by the versioned rules in src/lib/crm/intel/scoring.ts) -----------------
create table public.crm_lead_scores (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  lead_id uuid not null references public.crm_leads (id),
  assessment_id uuid references public.crm_lead_assessments (id),
  rules_version text not null check (rules_version ~ '^[a-z0-9_.-]{1,40}$'),
  score integer check (score is null or score between 0 and 100),           -- null = insufficient data
  grade text not null check (grade in ('A', 'B', 'C', 'D', 'insufficient')),
  breakdown jsonb not null check (jsonb_typeof(breakdown) = 'array'),
  legal_status text not null default 'clear' check (legal_status in ('clear', 'review', 'restricted')),
  legal_flags text[] not null default '{}',
  manual_score integer check (manual_score is null or manual_score between 0 and 100),
  manual_reason text not null default '' check (length(manual_reason) <= 1000),
  check (manual_score is null or length(btrim(manual_reason)) >= 15),
  check ((grade = 'insufficient') = (score is null)),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create index crm_lead_scores_lead on public.crm_lead_scores (lead_id, created_at desc);

-- Definer only to append to crm_timeline through crm_private.log (not executable by clients); it touches the one lead
-- the RLS-checked score row belongs to.
create function crm_private.lead_score_apply() returns trigger language plpgsql security definer set search_path = '' as $$
declare eff integer := coalesce(new.manual_score, new.score);
begin
  update public.crm_leads set lead_score = eff,
    lead_grade = case when eff is null then 'insufficient' when eff >= 80 then 'A' when eff >= 60 then 'B' when eff >= 40 then 'C' else 'D' end
  where id = new.lead_id;
  perform crm_private.log('lead.scored', 'crm', 'crm_leads', new.lead_id, detail =>
    coalesce(eff::text, 'insufficient') || case when new.manual_score is not null then ' (ajuste manual)' else '' end || ' · ' || new.rules_version);
  return null;
end $$;
revoke all on function crm_private.lead_score_apply() from public, anon, authenticated;
create trigger crm_lead_scores_apply after insert on public.crm_lead_scores for each row execute function crm_private.lead_score_apply();

-- 4. Recommendations: rule-based, with evidence; a person accepts, dismisses or edits them -----------------------------
create table public.crm_lead_recommendations (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  lead_id uuid not null references public.crm_leads (id),
  rule_id text not null check (rule_id ~ '^[a-z][a-z0-9_]{1,60}$'),
  rules_version text not null check (rules_version ~ '^[a-z0-9_.-]{1,40}$'),
  service text not null check (length(service) between 1 and 80),
  problem text not null check (length(problem) between 1 and 500),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  missing text[] not null default '{}',
  next_action text not null default '' check (length(next_action) <= 300),
  status text not null default 'suggested' check (status in ('suggested', 'accepted', 'dismissed', 'edited')),
  note text not null default '' check (length(note) <= 1000),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (lead_id, rule_id)
);

-- 5. Commercial terms: proposed and agreed kept separately -------------------------------------------------------------
create table public.crm_commercial_terms (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  lead_id uuid not null references public.crm_leads (id),
  kind text not null check (kind in ('proposed', 'agreed')),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  services text[] not null default '{}' check (cardinality(services) <= 20),
  setup_price numeric(12, 2) check (setup_price is null or setup_price between 0 and 10000000),
  monthly_fee numeric(12, 2) check (monthly_fee is null or monthly_fee between 0 and 10000000),
  -- The client's own ad spend on the platform. Never Avalon revenue.
  client_ad_budget numeric(12, 2) check (client_ad_budget is null or client_ad_budget between 0 and 10000000),
  billing_model text check (billing_model is null or billing_model in ('monthly', 'commission', 'hybrid')),
  commission_pct numeric(5, 2) check (commission_pct is null or commission_pct between 0 and 100),
  commission_base text check (commission_base is null or commission_base in ('gross_revenue', 'gross_profit', 'other')),
  attribution_rules text not null default '' check (length(attribution_rules) <= 2000),
  start_date date,
  duration_months integer check (duration_months is null or duration_months between 1 and 120),
  reconciliation text check (reconciliation is null or reconciliation in ('weekly', 'biweekly', 'monthly', 'quarterly')),
  cancellation_terms text not null default '' check (length(cancellation_terms) <= 2000),
  signer_name text not null default '' check (length(signer_name) <= 160),
  signer_title text not null default '' check (length(signer_title) <= 120),
  special_conditions text not null default '' check (length(special_conditions) <= 2000),
  -- An agreed commission is a human decision: it needs the deciding owner recorded.
  commission_approved_by uuid references auth.users (id),
  check (kind = 'proposed' or commission_pct is null or commission_approved_by is not null),
  check (billing_model is distinct from 'monthly' or commission_pct is null),
  updated_by uuid references auth.users (id),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (lead_id, kind)
);

-- 6. Contracts: auditable states; verification requires evidence ------------------------------------------------------
create table public.crm_contracts (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  lead_id uuid not null references public.crm_leads (id),
  title text not null check (length(btrim(title)) between 1 and 200),
  status text not null default 'draft' check (status in ('draft', 'internal_review', 'sent_for_signature',
    'signed_pending_verification', 'verified_signed', 'rejected', 'expired')),
  terms_id uuid references public.crm_commercial_terms (id),
  accepted_at timestamptz,                         -- commercial acceptance (not a signature)
  sent_at timestamptz,
  signed_at timestamptz,
  signer_name text not null default '' check (length(signer_name) <= 160),
  attachment_id uuid references public.crm_attachments (id),   -- private document (bytea, never a public URL)
  external_reference text not null default '' check (length(external_reference) <= 300),
  verification_method text check (verification_method is null or verification_method in ('document_review', 'esign_certificate', 'in_person')),
  verification_note text not null default '' check (length(verification_note) <= 1000),
  verified_by uuid references auth.users (id),
  verified_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index crm_contracts_lead on public.crm_contracts (lead_id, created_at desc);
create table public.crm_contract_events (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  contract_id uuid not null references public.crm_contracts (id),
  lead_id uuid not null references public.crm_leads (id),
  from_status text, to_status text not null,
  note text not null default '',
  actor_id uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index crm_contract_events_contract on public.crm_contract_events (contract_id, created_at);

-- Transition map + evidence rules. Runs on every write, so a forged REST update cannot skip a step.
create function crm_private.contract_guard() returns trigger language plpgsql security invoker set search_path = '' as $$
declare allowed text[];
begin
  if TG_OP = 'INSERT' then
    if new.status not in ('draft', 'internal_review') then raise exception 'contract_transition_invalid' using errcode = '23514'; end if;
  elsif new.status is distinct from old.status then
    allowed := case old.status
      when 'draft' then array['internal_review', 'sent_for_signature', 'rejected']
      when 'internal_review' then array['draft', 'sent_for_signature', 'rejected']
      when 'sent_for_signature' then array['signed_pending_verification', 'rejected', 'expired']
      when 'signed_pending_verification' then array['verified_signed', 'rejected', 'sent_for_signature']
      when 'verified_signed' then array['expired']
      when 'rejected' then array['draft']
      when 'expired' then array['draft']
    end;
    if not (new.status = any(allowed)) then raise exception 'contract_transition_invalid' using errcode = '23514'; end if;
  end if;
  if new.lead_id is distinct from coalesce(old.lead_id, new.lead_id) then raise exception 'contract_lead_immutable' using errcode = '23514'; end if;
  if new.attachment_id is not null and not exists (select 1 from public.crm_attachments t where t.id = new.attachment_id and t.lead_id = new.lead_id) then
    raise exception 'contract_attachment_foreign' using errcode = '23514';
  end if;
  if new.status = 'sent_for_signature' and new.sent_at is null then new.sent_at := now(); end if;
  if new.status = 'signed_pending_verification' then
    if new.signed_at is null or length(btrim(new.signer_name)) = 0 then raise exception 'contract_signature_details_required' using errcode = '23514'; end if;
    if new.attachment_id is null and length(btrim(new.external_reference)) = 0 then raise exception 'contract_evidence_required' using errcode = '23514'; end if;
  end if;
  if new.status = 'verified_signed' and (TG_OP = 'INSERT' or old.status <> 'verified_signed') then
    -- A checkbox is not a signature: verification needs a method, a written note and the verifying owner.
    if new.verification_method is null or length(btrim(new.verification_note)) < 15 then
      raise exception 'contract_verification_evidence_required' using errcode = '23514';
    end if;
    if new.attachment_id is null and length(btrim(new.external_reference)) = 0 then raise exception 'contract_evidence_required' using errcode = '23514'; end if;
    new.verified_by := auth.uid(); new.verified_at := now();
  end if;
  if TG_OP = 'UPDATE' and old.status = 'verified_signed' and new.status = 'verified_signed' then
    -- Verified evidence is frozen.
    if (new.attachment_id, new.external_reference, new.signed_at, new.signer_name, new.verification_method, new.verification_note)
       is distinct from (old.attachment_id, old.external_reference, old.signed_at, old.signer_name, old.verification_method, old.verification_note) then
      raise exception 'contract_verified_immutable' using errcode = '23514';
    end if;
    new.verified_by := old.verified_by; new.verified_at := old.verified_at;
  end if;
  return new;
end $$;
revoke all on function crm_private.contract_guard() from public;
create trigger crm_contracts_guard before insert or update on public.crm_contracts for each row execute function crm_private.contract_guard();

-- Event log + cached contract status on the lead (security definer only to append to the append-only event table).
create function crm_private.contract_events() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' or new.status is distinct from old.status then
    insert into public.crm_contract_events (contract_id, lead_id, from_status, to_status, note, actor_id)
    values (new.id, new.lead_id, case when TG_OP = 'UPDATE' then old.status end, new.status,
            left(coalesce(nullif(new.verification_note, ''), ''), 500), auth.uid());
    update public.crm_leads set contract_status = new.status where id = new.lead_id;
    perform crm_private.log('contract.' || new.status, 'crm', 'crm_contracts', new.id,
      from_state => case when TG_OP = 'UPDATE' then old.status end, to_state => new.status, detail => left(new.title, 160));
  end if;
  return null;
end $$;
revoke all on function crm_private.contract_events() from public, anon, authenticated;
create trigger crm_contracts_events after insert or update on public.crm_contracts for each row execute function crm_private.contract_events();

-- 7. THE GATE: no lead enters a won stage without a verified signed contract ------------------------------------------
create function crm_private.won_requires_contract() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (select s.kind from public.crm_stages s where s.id = new.stage_id) = 'won'
     and (TG_OP = 'INSERT' or (select s.kind from public.crm_stages s where s.id = old.stage_id) is distinct from 'won')
     and not exists (select 1 from public.crm_contracts c where c.lead_id = new.id and c.status = 'verified_signed') then
    raise exception 'won_requires_verified_contract' using errcode = '23514',
      hint = 'Registra el contrato firmado y verifícalo antes de marcar el lead como ganado.';
  end if;
  return new;
end $$;
revoke all on function crm_private.won_requires_contract() from public;
create trigger crm_leads_won_gate before insert or update of stage_id on public.crm_leads
  for each row execute function crm_private.won_requires_contract();

-- 8. Interactions keep the lead's "last interaction" honest ----------------------------------------------------------
create function crm_private.lead_last_interaction() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.lead_id is not null and new.status = 'completed' and new.kind in ('note', 'call', 'email', 'whatsapp', 'meeting') then
    update public.crm_leads set last_interaction_at = greatest(coalesce(last_interaction_at, '-infinity'), new.created_at)
    where id = new.lead_id;
  end if;
  return null;
end $$;
revoke all on function crm_private.lead_last_interaction() from public;
create trigger crm_activities_last_interaction after insert on public.crm_activities
  for each row execute function crm_private.lead_last_interaction();

-- 9. RLS, grants, stamps and audit (same pattern as the rest of the CRM) ----------------------------------------------
do $$ declare t text; begin
  foreach t in array array['crm_lead_assessments', 'crm_lead_assessment_revisions', 'crm_lead_scores',
    'crm_lead_recommendations', 'crm_commercial_terms', 'crm_contracts', 'crm_contract_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy crm_read on public.%I for select to authenticated using ((select crm_private.is_owner()) and agency_key = ''avalon'')', t);
  end loop;
  -- Writable by owners (each write stamped, versioned and audited).
  foreach t in array array['crm_lead_assessments', 'crm_lead_recommendations', 'crm_commercial_terms', 'crm_contracts'] loop
    execute format('grant insert, update on public.%I to authenticated', t);
    execute format('create policy crm_insert on public.%I for insert to authenticated with check ((select crm_private.is_owner()) and agency_key = ''avalon'')', t);
    execute format('create policy crm_update on public.%I for update to authenticated using ((select crm_private.is_owner()) and agency_key = ''avalon'') with check ((select crm_private.is_owner()) and agency_key = ''avalon'')', t);
    execute format('create trigger crm_stamp before insert or update on public.%I for each row execute function crm_private.stamp()', t);
    execute format('create trigger crm_audit after insert or update on public.%I for each row execute function crm_private.audit()', t);
  end loop;
end $$;
-- Append-only: scores are inserted by owners (never updated); revisions/events only by the functions above.
grant insert on public.crm_lead_scores to authenticated;
create policy crm_insert on public.crm_lead_scores for insert to authenticated
  with check ((select crm_private.is_owner()) and agency_key = 'avalon' and created_by = (select auth.uid()));
grant insert on public.crm_lead_assessment_revisions to authenticated;
create policy crm_insert on public.crm_lead_assessment_revisions for insert to authenticated
  with check ((select crm_private.is_owner()) and agency_key = 'avalon' and changed_by = (select auth.uid()));

commit;
