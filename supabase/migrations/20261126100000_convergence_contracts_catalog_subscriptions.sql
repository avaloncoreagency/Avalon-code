-- AVL-CLAUDE-CONVERGENCE-001 · Contract Studio terms engine, contract lifecycle (MSA/SOW, renewal, termination),
-- versioned commercial catalogue with configurable advance-payment rules, recurring-product subscriptions and the
-- commercial e-mail kinds of the canonical outbox. Review-only: additive, owner-only, nothing is activated.
--
-- Guardrails:
--  * Commissions are NOT touched (no column, rule, rate, accrual or historical row of crm_commissions / commission_*).
--  * No money is invented: a subscription period's amount is the sale line's own amount; invoices and payments stay in
--    the canonical Sales Center tables (crm_invoices / crm_payments) and are only LINKED here.
--  * Contract clauses (e.g. the proposed 3-business-day initial cancellation window or advance payments for tools with
--    monthly costs) are configurable policies that stay inactive until BOTH owners approve them and legal review is
--    recorded. They are seeded as drafts labelled as proposals; nothing is attached to any contract.
begin;

-- ── 1. Contract terms engine ───────────────────────────────────────────────────────────────────────────────────────
create table public.crm_contract_term_policies (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  key text not null check (key ~ '^[a-z][a-z0-9_]{2,60}$'),
  version integer not null default 1 check (version >= 1),
  title_es text not null check (length(btrim(title_es)) between 3 and 160),
  title_en text not null check (length(btrim(title_en)) between 3 and 160),
  body_es text not null check (length(btrim(body_es)) between 10 and 8000),
  body_en text not null check (length(btrim(body_en)) between 10 and 8000),
  params jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object' and pg_column_size(params) <= 8192),
  applies_to text not null default 'all' check (applies_to in ('all', 'one_time', 'recurring', 'services')),
  service_codes text[] not null default '{}' check (cardinality(service_codes) <= 50),
  status text not null default 'draft' check (status in ('draft', 'proposed', 'approved', 'retired')),
  legal_review text not null default 'required' check (legal_review in ('required', 'completed', 'not_required')),
  legal_review_note text not null default '' check (length(legal_review_note) <= 1000),
  legal_reviewed_by uuid references auth.users (id),
  legal_reviewed_at timestamptz,
  approved_at timestamptz,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key, version),
  check (applies_to <> 'services' or cardinality(service_codes) > 0),
  check (legal_review <> 'completed' or (legal_reviewed_by is not null and legal_reviewed_at is not null and length(btrim(legal_review_note)) >= 10)),
  check (status <> 'approved' or (approved_at is not null and legal_review in ('completed', 'not_required')))
);
-- At most one version in preparation and one in force per clause.
create unique index crm_contract_term_policies_one_open on public.crm_contract_term_policies (key) where status in ('draft', 'proposed');
create unique index crm_contract_term_policies_one_approved on public.crm_contract_term_policies (key) where status = 'approved';

create table public.crm_contract_term_policy_approvals (
  policy_id uuid not null references public.crm_contract_term_policies (id),
  approver_id uuid not null references auth.users (id),
  approved_at timestamptz not null default now(),
  primary key (policy_id, approver_id)
);

-- A clause attached to a contract is a frozen snapshot of an APPROVED policy (text + params + hash).
create table public.crm_contract_terms (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.crm_contracts (id),
  policy_id uuid not null references public.crm_contract_term_policies (id),
  policy_key text not null, policy_version integer not null,
  title_es text not null, title_en text not null, body_es text not null, body_en text not null,
  params jsonb not null, sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  attached_by uuid not null references auth.users (id),
  attached_at timestamptz not null default now(),
  unique (contract_id, policy_key)
);
create index crm_contract_terms_policy on public.crm_contract_terms (policy_id);

-- ── 2. Contract lifecycle: kind, MSA → SOW, effective dates, renewal and termination ─────────────────────────────────
alter table public.crm_contracts
  add column if not exists doc_kind text not null default 'agreement' check (doc_kind in ('agreement', 'msa', 'sow', 'amendment', 'renewal')),
  add column if not exists parent_contract_id uuid references public.crm_contracts (id),
  add column if not exists effective_on date,
  add column if not exists ends_on date,
  add column if not exists renewal_mode text not null default 'none' check (renewal_mode in ('none', 'manual', 'auto')),
  add column if not exists renewal_notice_days integer check (renewal_notice_days is null or renewal_notice_days between 0 and 365),
  add column if not exists terminated_on date,
  add column if not exists termination_reason text not null default '' check (length(termination_reason) <= 1000),
  add column if not exists terminated_by uuid references auth.users (id);
alter table public.crm_contracts drop constraint if exists crm_contracts_lifecycle_dates;
alter table public.crm_contracts add constraint crm_contracts_lifecycle_dates check (
  (ends_on is null or effective_on is null or ends_on >= effective_on)
  and (doc_kind in ('sow', 'amendment', 'renewal') or parent_contract_id is null)
  and (parent_contract_id is null or parent_contract_id <> id)
  and (terminated_on is null or (terminated_by is not null and length(btrim(termination_reason)) >= 5)));
create index if not exists crm_contracts_parent on public.crm_contracts (parent_contract_id) where parent_contract_id is not null;

-- ── 3. Commercial catalogue: availability, dependencies, configurable advance payment, annual discount, versions ────
alter table public.crm_service_catalog
  add column if not exists availability text not null default 'available' check (availability in ('available', 'limited', 'unavailable')),
  add column if not exists technical_dependencies text not null default '' check (length(technical_dependencies) <= 2000),
  add column if not exists estimated_usage text not null default '' check (length(estimated_usage) <= 1000),
  add column if not exists incurs_recurring_vendor_cost boolean not null default false,
  add column if not exists advance_policy text not null default 'none' check (advance_policy in ('none', 'setup_and_first_period', 'full_upfront')),
  add column if not exists annual_discount_pct numeric(5, 2) check (annual_discount_pct is null or annual_discount_pct between 0 and 50),
  add column if not exists max_discount_pct numeric(5, 2) check (max_discount_pct is null or max_discount_pct between 0 and 100);
-- An advance rule is only for services that generate recurring costs to Avalon (never applied indiscriminately).
alter table public.crm_service_catalog drop constraint if exists crm_service_catalog_advance_scope;
alter table public.crm_service_catalog add constraint crm_service_catalog_advance_scope
  check (advance_policy = 'none' or incurs_recurring_vendor_cost);
alter table public.crm_service_catalog drop constraint if exists crm_service_catalog_annual_scope;
alter table public.crm_service_catalog add constraint crm_service_catalog_annual_scope
  check (annual_discount_pct is null or billing_type in ('monthly', 'annual'));

-- Changing any of the new commercial fields reopens an approved offer, exactly like price or scope changes do.
-- (Fires after crm_service_catalog_offer_guard: triggers run in name order.)
create function crm_private.catalog_terms_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and old.offer_status = 'approved' and new.offer_status = 'approved'
     and (new.advance_policy, new.annual_discount_pct, new.max_discount_pct, new.incurs_recurring_vendor_cost, new.availability,
          new.technical_dependencies, new.estimated_usage)
     is distinct from (old.advance_policy, old.annual_discount_pct, old.max_discount_pct, old.incurs_recurring_vendor_cost, old.availability,
          old.technical_dependencies, old.estimated_usage) then
    new.offer_status := 'draft'; new.offer_version := old.offer_version + 1;
    new.offer_approved_by := null; new.offer_approved_at := null;
  end if;
  return new;
end $$;
revoke all on function crm_private.catalog_terms_guard() from public;
create trigger crm_service_catalog_terms_guard before update on public.crm_service_catalog
  for each row execute function crm_private.catalog_terms_guard();

-- Every approved commercial version is kept as an immutable snapshot (what was approved, by whom, when).
create table public.crm_service_catalog_versions (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.crm_service_catalog (id),
  offer_version integer not null,
  snapshot jsonb not null,
  approved_by uuid not null references auth.users (id),
  approved_at timestamptz not null,
  unique (service_id, offer_version)
);
create function crm_private.catalog_version_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.offer_status = 'approved' and (TG_OP = 'INSERT' or old.offer_status is distinct from 'approved' or old.offer_version <> new.offer_version) then
    insert into public.crm_service_catalog_versions (service_id, offer_version, snapshot, approved_by, approved_at)
    values (new.id, new.offer_version, jsonb_build_object(
      'code', new.code, 'name', new.name, 'name_en', new.name_en, 'billing_type', new.billing_type,
      'suggested_price', new.suggested_price, 'monthly_price', new.monthly_price, 'direct_cost', new.direct_cost,
      'target_margin_pct', new.target_margin_pct, 'deliverables', new.deliverables, 'exclusions', new.exclusions,
      'estimated_days', new.estimated_days, 'payment_terms', new.payment_terms, 'availability', new.availability,
      'technical_dependencies', new.technical_dependencies, 'estimated_usage', new.estimated_usage,
      'incurs_recurring_vendor_cost', new.incurs_recurring_vendor_cost, 'advance_policy', new.advance_policy,
      'annual_discount_pct', new.annual_discount_pct, 'max_discount_pct', new.max_discount_pct),
      new.offer_approved_by, new.offer_approved_at)
    on conflict (service_id, offer_version) do nothing;
  end if;
  return null;
end $$;
revoke all on function crm_private.catalog_version_snapshot() from public, anon, authenticated;
create trigger crm_service_catalog_version_snapshot after insert or update on public.crm_service_catalog
  for each row execute function crm_private.catalog_version_snapshot();

-- Unavailable services are not eligible for a new commercial operation, even if their offer was approved.
create or replace function crm_private.assert_approved_offer(service_code text) returns void
language plpgsql set search_path = '' as $offer$
begin
  perform 1 from public.crm_service_catalog c where c.code = service_code and c.active
    and c.availability <> 'unavailable' and c.offer_status = 'approved'
    and c.offer_approved_by is not null and c.offer_approved_at is not null for share;
  if not found then raise exception 'commercial_offer_not_approved' using errcode = '23514'; end if;
end $offer$;
revoke all on function crm_private.assert_approved_offer(text) from public, anon, authenticated;

-- ── 4. Recurring products: subscriptions, periods and history ──────────────────────────────────────────────────────
create table public.crm_subscriptions (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  client_id uuid not null references public.crm_clients (id),
  sale_id uuid not null references public.crm_sales (id),
  sale_line_id uuid not null unique references public.crm_sale_lines (id),
  service_id uuid not null references public.crm_service_catalog (id),
  period text not null check (period in ('monthly', 'annual')),
  amount numeric(15, 2) not null check (amount >= 0),          -- the sale line's own amount for one period
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending_activation'
    check (status in ('pending_activation', 'active', 'suspended', 'cancelled', 'expired')),
  renewal_mode text not null default 'manual' check (renewal_mode in ('manual', 'auto', 'none')),
  activated_on date,
  current_period_start date,
  current_period_end date,
  cancel_at_period_end boolean not null default false,
  ended_on date,
  end_reason text not null default '' check (length(end_reason) <= 1000),
  included_usage numeric(15, 2) check (included_usage is null or included_usage >= 0),
  usage_unit text not null default '' check (length(usage_unit) <= 40),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  check (status = 'pending_activation' or activated_on is not null),
  check (status not in ('active', 'suspended') or (current_period_start is not null and current_period_end >= current_period_start)),
  check (status not in ('cancelled', 'expired') or ended_on is not null)
);
create index crm_subscriptions_client on public.crm_subscriptions (client_id, status);
create index crm_subscriptions_sale on public.crm_subscriptions (sale_id);
create index crm_subscriptions_due on public.crm_subscriptions (current_period_end) where status = 'active';

create table public.crm_subscription_periods (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.crm_subscriptions (id),
  seq integer not null check (seq >= 1),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  amount numeric(15, 2) not null check (amount >= 0),
  currency text not null,
  invoice_id uuid references public.crm_invoices (id),
  usage numeric(15, 2) not null default 0 check (usage >= 0),
  created_at timestamptz not null default now(),
  unique (subscription_id, seq),
  unique (subscription_id, period_start)
);
create unique index crm_subscription_periods_invoice on public.crm_subscription_periods (invoice_id) where invoice_id is not null;

create table public.crm_subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.crm_subscriptions (id),
  event text not null check (event in ('opened', 'activated', 'renewed', 'suspended', 'reactivated', 'cancel_scheduled',
    'cancelled', 'expired', 'invoice_linked', 'usage_recorded')),
  from_status text, to_status text,
  note text not null default '' check (length(note) <= 1000),
  detail jsonb not null default '{}'::jsonb,
  actor_id uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index crm_subscription_events_sub on public.crm_subscription_events (subscription_id, created_at);

-- ── 5. RLS: owners read; every write goes through the RPCs below ──────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['crm_contract_term_policies', 'crm_contract_term_policy_approvals', 'crm_contract_terms',
    'crm_service_catalog_versions', 'crm_subscriptions', 'crm_subscription_periods', 'crm_subscription_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from public, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select crm_private.is_owner()))', t || '_owner_read', t);
  end loop;
end $$;

-- Same finite-money rule as every other numeric column (20261123140000): NaN and ±Infinity are refused.
do $$
declare r record;
begin
  for r in select * from (values ('crm_service_catalog', 'annual_discount_pct'), ('crm_service_catalog', 'max_discount_pct'),
      ('crm_subscriptions', 'amount'), ('crm_subscriptions', 'included_usage'), ('crm_subscription_periods', 'amount'),
      ('crm_subscription_periods', 'usage')) v(t, c) loop
    execute format('alter table public.%I add constraint %I check (%I not in (''NaN''::numeric, ''Infinity''::numeric, ''-Infinity''::numeric))',
      r.t, r.t || '_' || r.c || '_finite', r.c);
  end loop;
end $$;

-- ── 6. Terms engine RPCs ───────────────────────────────────────────────────────────────────────────────────────────
create function crm_private.owner_count() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.agency_memberships where role = 'owner'
$$;
revoke all on function crm_private.owner_count() from public, anon, authenticated;

-- Creates a draft policy, edits a draft, or opens a new draft version of an approved/retired policy.
create function public.crm_term_policy_save(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.crm_contract_term_policies; v_key text := request ->> 'key'; v_next integer;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if request is null or jsonb_typeof(request) <> 'object' or v_key is null then raise exception 'term_policy_invalid' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('avalon.term:' || v_key,0));
  select * into p from public.crm_contract_term_policies where key = v_key and status in ('draft', 'proposed') for update;
  if found then
    update public.crm_contract_term_policies set
      title_es = coalesce(request ->> 'title_es', title_es), title_en = coalesce(request ->> 'title_en', title_en),
      body_es = coalesce(request ->> 'body_es', body_es), body_en = coalesce(request ->> 'body_en', body_en),
      params = coalesce(request -> 'params', params), applies_to = coalesce(request ->> 'applies_to', applies_to),
      service_codes = case when request ? 'service_codes' then array(select jsonb_array_elements_text(request -> 'service_codes')) else service_codes end,
      status = 'draft', legal_review = 'required', legal_review_note = '', legal_reviewed_by = null,
      legal_reviewed_at = null, approved_at = null, updated_at = now()
    where id = p.id returning * into p;
    delete from public.crm_contract_term_policy_approvals where policy_id = p.id;   -- any edit restarts joint approval
  else
    select coalesce(max(version), 0) + 1 into v_next from public.crm_contract_term_policies where key = v_key;
    insert into public.crm_contract_term_policies (key, version, title_es, title_en, body_es, body_en, params, applies_to, service_codes)
    values (v_key, v_next, request ->> 'title_es', request ->> 'title_en', request ->> 'body_es', request ->> 'body_en',
      coalesce(request -> 'params', '{}'::jsonb), coalesce(request ->> 'applies_to', 'all'),
      coalesce((select array_agg(x) from jsonb_array_elements_text(request -> 'service_codes') x), '{}'))
    returning * into p;
  end if;
  perform crm_private.log('term_policy.saved', 'sales', 'crm_contract_term_policies', p.id, to_state => p.status, detail => p.key || ' v' || p.version, source => 'app');
  return jsonb_build_object('policy_id', p.id, 'version', p.version, 'status', p.status);
exception
  when check_violation or not_null_violation then raise exception 'term_policy_invalid' using errcode = '22023';
end $$;

create function public.crm_term_policy_propose(p_policy uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  update public.crm_contract_term_policies set status = 'proposed', updated_at = now() where id = p_policy and status = 'draft';
  if not found then raise exception 'term_policy_not_draft' using errcode = '23514'; end if;
end $$;

-- Legal review is recorded by an owner WITH the reviewer's reference; it is never assumed.
create function public.crm_term_policy_record_legal_review(p_policy uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'term_policy_legal_note_required' using errcode = '22023'; end if;
  update public.crm_contract_term_policies set legal_review = 'completed', legal_review_note = left(btrim(p_note), 1000),
    legal_reviewed_by = auth.uid(), legal_reviewed_at = now(), updated_at = now()
  where id = p_policy and status in ('draft', 'proposed');
  if not found then raise exception 'term_policy_not_editable' using errcode = '23514'; end if;
end $$;

-- Joint approval: every owner approves the same proposed version; it activates only with legal review completed.
create function public.crm_term_policy_approve(p_policy uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.crm_contract_term_policies; n integer; need integer := greatest(2, crm_private.owner_count());
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into p from public.crm_contract_term_policies where id = p_policy for update;
  if not found then raise exception 'term_policy_missing' using errcode = 'P0002'; end if;
  if p.status <> 'proposed' then raise exception 'term_policy_not_proposed' using errcode = '23514'; end if;
  insert into public.crm_contract_term_policy_approvals (policy_id, approver_id) values (p.id, auth.uid()) on conflict do nothing;
  select count(*) into n from public.crm_contract_term_policy_approvals a
    join public.agency_memberships m on m.user_id = a.approver_id and m.role = 'owner' where a.policy_id = p.id;
  if n >= need and p.legal_review in ('completed', 'not_required') then
    update public.crm_contract_term_policies set status = 'retired', updated_at = now() where key = p.key and status = 'approved';
    update public.crm_contract_term_policies set status = 'approved', approved_at = now(), updated_at = now() where id = p.id;
    perform crm_private.log('term_policy.approved', 'sales', 'crm_contract_term_policies', p.id, to_state => 'approved', detail => p.key || ' v' || p.version, source => 'app');
    return jsonb_build_object('status', 'approved', 'approvals', n, 'required', need);
  end if;
  return jsonb_build_object('status', 'proposed', 'approvals', n, 'required', need,
    'legal_review', p.legal_review);
end $$;

create function public.crm_term_policy_retire(p_policy uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'term_policy_reason_required' using errcode = '22023'; end if;
  update public.crm_contract_term_policies set status = 'retired', updated_at = now() where id = p_policy and status <> 'retired';
  if not found then raise exception 'term_policy_missing' using errcode = 'P0002'; end if;
  perform crm_private.log('term_policy.retired', 'sales', 'crm_contract_term_policies', p_policy, to_state => 'retired', detail => left(p_reason, 300), source => 'app');
end $$;

-- Only approved policies can be attached, and only while the contract is still being prepared.
create function public.crm_contract_attach_term(p_contract uuid, p_policy uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.crm_contracts; p public.crm_contract_term_policies; v_id uuid;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into c from public.crm_contracts where id = p_contract for update;
  if not found then raise exception 'contract_missing' using errcode = 'P0002'; end if;
  if c.status not in ('draft', 'internal_review') then raise exception 'contract_terms_frozen' using errcode = '23514'; end if;
  select * into p from public.crm_contract_term_policies where id = p_policy for share;
  if not found or p.status <> 'approved' then raise exception 'term_policy_not_approved' using errcode = '23514'; end if;
  insert into public.crm_contract_terms (contract_id, policy_id, policy_key, policy_version, title_es, title_en, body_es, body_en, params, sha256, attached_by)
  values (c.id, p.id, p.key, p.version, p.title_es, p.title_en, p.body_es, p.body_en, p.params,
    encode(sha256(convert_to(p.key || '|' || p.version || '|' || p.body_es || '|' || p.body_en || '|' || p.params::text, 'UTF8')), 'hex'),
    auth.uid())
  on conflict (contract_id, policy_key) do nothing returning id into v_id;
  if v_id is null then raise exception 'contract_term_already_attached' using errcode = '23505'; end if;
  insert into public.crm_contract_events (contract_id, lead_id, from_status, to_status, note, actor_id)
  values (c.id, c.lead_id, c.status, c.status, left('term attached: ' || p.key || ' v' || p.version, 300), auth.uid());
  return v_id;
end $$;

create function public.crm_contract_detach_term(p_contract uuid, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.crm_contracts;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into c from public.crm_contracts where id = p_contract for update;
  if not found then raise exception 'contract_missing' using errcode = 'P0002'; end if;
  if c.status not in ('draft', 'internal_review') then raise exception 'contract_terms_frozen' using errcode = '23514'; end if;
  delete from public.crm_contract_terms where contract_id = c.id and policy_key = p_key;
  if not found then raise exception 'contract_term_missing' using errcode = 'P0002'; end if;
  insert into public.crm_contract_events (contract_id, lead_id, from_status, to_status, note, actor_id)
  values (c.id, c.lead_id, c.status, c.status, left('term detached: ' || p_key, 300), auth.uid());
end $$;

-- Lifecycle metadata: kind, parent MSA, dates and renewal. Frozen once the contract is verified (amend instead).
create function public.crm_contract_set_lifecycle(p_contract uuid, request jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.crm_contracts; v_kind text; v_parent uuid; parent public.crm_contracts;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into c from public.crm_contracts where id = p_contract for update;
  if not found then raise exception 'contract_missing' using errcode = 'P0002'; end if;
  if c.status in ('verified_signed', 'rejected', 'expired') then raise exception 'contract_lifecycle_frozen' using errcode = '23514'; end if;
  v_kind := coalesce(request ->> 'doc_kind', c.doc_kind);
  v_parent := case when request ? 'parent_contract_id' then nullif(request ->> 'parent_contract_id', '')::uuid else c.parent_contract_id end;
  if v_parent is not null then
    select * into parent from public.crm_contracts where id = v_parent;
    -- A SOW/amendment/renewal hangs from a verified MSA or agreement of the SAME lead.
    if not found or parent.lead_id <> c.lead_id or parent.doc_kind not in ('msa', 'agreement') or parent.status <> 'verified_signed' then
      raise exception 'contract_parent_invalid' using errcode = '23514';
    end if;
  end if;
  begin
    update public.crm_contracts set doc_kind = v_kind, parent_contract_id = v_parent,
      effective_on = case when request ? 'effective_on' then nullif(request ->> 'effective_on', '')::date else effective_on end,
      ends_on = case when request ? 'ends_on' then nullif(request ->> 'ends_on', '')::date else ends_on end,
      renewal_mode = coalesce(request ->> 'renewal_mode', renewal_mode),
      renewal_notice_days = case when request ? 'renewal_notice_days' then nullif(request ->> 'renewal_notice_days', '')::integer else renewal_notice_days end
    where id = c.id;
  exception
    when check_violation or invalid_datetime_format or invalid_text_representation then raise exception 'contract_lifecycle_invalid' using errcode = '22023';
  end;
end $$;

-- Termination of a verified contract: recorded with reason and date; never deletes the signed record.
create function public.crm_contract_terminate(p_contract uuid, p_on date, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.crm_contracts;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 or p_on is null then raise exception 'contract_termination_invalid' using errcode = '22023'; end if;
  select * into c from public.crm_contracts where id = p_contract for update;
  if not found then raise exception 'contract_missing' using errcode = 'P0002'; end if;
  if c.status <> 'verified_signed' then raise exception 'contract_not_verified' using errcode = '23514'; end if;
  if c.terminated_on is not null then return; end if;   -- idempotent
  if c.effective_on is not null and p_on < c.effective_on then raise exception 'contract_termination_invalid' using errcode = '22023'; end if;
  update public.crm_contracts set terminated_on = p_on, termination_reason = left(btrim(p_reason), 1000), terminated_by = auth.uid() where id = c.id;
  insert into public.crm_contract_events (contract_id, lead_id, from_status, to_status, note, actor_id)
  values (c.id, c.lead_id, c.status, c.status, left('terminated on ' || p_on || ': ' || btrim(p_reason), 1000), auth.uid());
end $$;

-- ── 7. Subscription RPCs (owner-only; idempotent; history in crm_subscription_events) ─────────────────────────────
create function crm_private.sub_event(p_sub uuid, p_event text, p_from text, p_to text, p_note text, p_detail jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.crm_subscription_events (subscription_id, event, from_status, to_status, note, detail, actor_id)
  values (p_sub, p_event, p_from, p_to, left(coalesce(p_note, ''), 1000), coalesce(p_detail, '{}'::jsonb), auth.uid());
$$;
revoke all on function crm_private.sub_event(uuid, text, text, text, text, jsonb) from public, anon, authenticated;

create function crm_private.period_end(p_start date, p_period text) returns date
language sql immutable set search_path = '' as $$
  select (p_start + case when p_period = 'annual' then interval '1 year' else interval '1 month' end - interval '1 day')::date
$$;

-- Opens the subscription of a recurring line of a confirmed sale. Amount and currency come from the sale itself.
create function public.crm_subscription_open(p_sale_line uuid, request jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.crm_sale_lines; s public.crm_sales; sub public.crm_subscriptions;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into l from public.crm_sale_lines where id = p_sale_line for update;
  if not found then raise exception 'subscription_line_missing' using errcode = 'P0002'; end if;
  select * into sub from public.crm_subscriptions where sale_line_id = p_sale_line;
  if found then return jsonb_build_object('subscription_id', sub.id, 'existing', true); end if;
  if l.billing_type not in ('monthly', 'annual') then raise exception 'subscription_line_not_recurring' using errcode = '23514'; end if;
  select * into s from public.crm_sales where id = l.sale_id;
  if s.status <> 'confirmed' or s.client_id is null then raise exception 'subscription_sale_not_confirmed' using errcode = '23514'; end if;
  begin
    insert into public.crm_subscriptions (client_id, sale_id, sale_line_id, service_id, period, amount, currency, renewal_mode, included_usage, usage_unit)
    values (s.client_id, s.id, l.id, l.service_id, l.billing_type, l.line_total, s.currency,
      coalesce(nullif(request ->> 'renewal_mode', ''), 'manual'),
      nullif(request ->> 'included_usage', '')::numeric, coalesce(request ->> 'usage_unit', ''))
    returning * into sub;
  exception
    when check_violation or invalid_text_representation then raise exception 'subscription_invalid' using errcode = '22023';
  end;
  perform crm_private.sub_event(sub.id, 'opened', null, sub.status, '', jsonb_build_object('sale_line_id', l.id));
  perform crm_private.log('subscription.opened', 'sales', 'crm_subscriptions', sub.id, client_id => s.client_id, sale_id => s.id, to_state => sub.status, source => 'app');
  return jsonb_build_object('subscription_id', sub.id, 'existing', false);
end $$;

create function public.crm_subscription_activate(p_sub uuid, p_start date) returns void
language plpgsql security definer set search_path = '' as $$
declare sub public.crm_subscriptions; v_end date;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into sub from public.crm_subscriptions where id = p_sub for update;
  if not found then raise exception 'subscription_missing' using errcode = 'P0002'; end if;
  if sub.status = 'active' and sub.activated_on = p_start then return; end if;   -- idempotent replay
  if sub.status <> 'pending_activation' or p_start is null then raise exception 'subscription_invalid_transition' using errcode = '23514'; end if;
  v_end := crm_private.period_end(p_start, sub.period);
  update public.crm_subscriptions set status = 'active', activated_on = p_start, current_period_start = p_start, current_period_end = v_end,
    updated_at = now(), version = version + 1 where id = sub.id;
  insert into public.crm_subscription_periods (subscription_id, seq, period_start, period_end, amount, currency)
  values (sub.id, 1, p_start, v_end, sub.amount, sub.currency);
  perform crm_private.sub_event(sub.id, 'activated', sub.status, 'active', '', jsonb_build_object('period_start', p_start, 'period_end', v_end));
end $$;

-- Renews exactly once per period (the caller states which period end it is renewing from).
create function public.crm_subscription_renew(p_sub uuid, p_expected_period_end date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sub public.crm_subscriptions; v_start date; v_end date; n integer;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into sub from public.crm_subscriptions where id = p_sub for update;
  if not found then raise exception 'subscription_missing' using errcode = 'P0002'; end if;
  if sub.status = 'active' and sub.current_period_start = p_expected_period_end + 1 then
    return jsonb_build_object('status', sub.status, 'period_start', sub.current_period_start, 'replayed', true);
  end if;
  if sub.status <> 'active' or sub.current_period_end is distinct from p_expected_period_end then
    raise exception 'subscription_invalid_transition' using errcode = '23514';
  end if;
  if sub.cancel_at_period_end or sub.renewal_mode = 'none' then
    update public.crm_subscriptions set status = case when sub.cancel_at_period_end then 'cancelled' else 'expired' end,
      ended_on = sub.current_period_end, updated_at = now(), version = version + 1 where id = sub.id;
    perform crm_private.sub_event(sub.id, case when sub.cancel_at_period_end then 'cancelled' else 'expired' end, 'active',
      case when sub.cancel_at_period_end then 'cancelled' else 'expired' end, 'end of period', '{}'::jsonb);
    return jsonb_build_object('status', case when sub.cancel_at_period_end then 'cancelled' else 'expired' end, 'replayed', false);
  end if;
  v_start := sub.current_period_end + 1; v_end := crm_private.period_end(v_start, sub.period);
  select coalesce(max(seq), 0) + 1 into n from public.crm_subscription_periods where subscription_id = sub.id;
  insert into public.crm_subscription_periods (subscription_id, seq, period_start, period_end, amount, currency)
  values (sub.id, n, v_start, v_end, sub.amount, sub.currency);
  update public.crm_subscriptions set current_period_start = v_start, current_period_end = v_end, updated_at = now(), version = version + 1 where id = sub.id;
  perform crm_private.sub_event(sub.id, 'renewed', 'active', 'active', '', jsonb_build_object('seq', n, 'period_start', v_start, 'period_end', v_end));
  return jsonb_build_object('status', 'active', 'period_start', v_start, 'period_end', v_end, 'replayed', false);
end $$;

create function public.crm_subscription_suspend(p_sub uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare sub public.crm_subscriptions;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'subscription_reason_required' using errcode = '22023'; end if;
  select * into sub from public.crm_subscriptions where id = p_sub for update;
  if not found then raise exception 'subscription_missing' using errcode = 'P0002'; end if;
  if sub.status = 'suspended' then return; end if;
  if sub.status <> 'active' then raise exception 'subscription_invalid_transition' using errcode = '23514'; end if;
  update public.crm_subscriptions set status = 'suspended', updated_at = now(), version = version + 1 where id = sub.id;
  perform crm_private.sub_event(sub.id, 'suspended', 'active', 'suspended', p_reason);
end $$;

create function public.crm_subscription_reactivate(p_sub uuid, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare sub public.crm_subscriptions;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into sub from public.crm_subscriptions where id = p_sub for update;
  if not found then raise exception 'subscription_missing' using errcode = 'P0002'; end if;
  if sub.status = 'active' then return; end if;
  if sub.status <> 'suspended' then raise exception 'subscription_invalid_transition' using errcode = '23514'; end if;
  update public.crm_subscriptions set status = 'active', updated_at = now(), version = version + 1 where id = sub.id;
  perform crm_private.sub_event(sub.id, 'reactivated', 'suspended', 'active', p_note);
end $$;

-- p_mode = 'end_of_period' (keeps service until the paid period ends) or 'immediate'.
create function public.crm_subscription_cancel(p_sub uuid, p_mode text, p_reason text, p_on date default null) returns void
language plpgsql security definer set search_path = '' as $$
declare sub public.crm_subscriptions; v_on date;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 or p_mode not in ('end_of_period', 'immediate') then raise exception 'subscription_reason_required' using errcode = '22023'; end if;
  select * into sub from public.crm_subscriptions where id = p_sub for update;
  if not found then raise exception 'subscription_missing' using errcode = 'P0002'; end if;
  if sub.status in ('cancelled', 'expired') then return; end if;
  if p_mode = 'end_of_period' then
    if sub.status not in ('active', 'suspended') then raise exception 'subscription_invalid_transition' using errcode = '23514'; end if;
    if sub.cancel_at_period_end then return; end if;
    update public.crm_subscriptions set cancel_at_period_end = true, end_reason = left(btrim(p_reason), 1000), updated_at = now(), version = version + 1 where id = sub.id;
    perform crm_private.sub_event(sub.id, 'cancel_scheduled', sub.status, sub.status, p_reason, jsonb_build_object('ends_on', sub.current_period_end));
  else
    v_on := coalesce(p_on, current_date);
    update public.crm_subscriptions set status = 'cancelled', ended_on = v_on, end_reason = left(btrim(p_reason), 1000),
      activated_on = coalesce(activated_on, v_on), updated_at = now(), version = version + 1 where id = sub.id;
    perform crm_private.sub_event(sub.id, 'cancelled', sub.status, 'cancelled', p_reason, jsonb_build_object('ended_on', v_on));
  end if;
  perform crm_private.log('subscription.cancel', 'sales', 'crm_subscriptions', sub.id, client_id => sub.client_id, sale_id => sub.sale_id,
    from_state => sub.status, to_state => p_mode, detail => left(p_reason, 300), source => 'app');
end $$;

-- Links an ISSUED canonical invoice of the same sale to a period (no amounts are created here).
create function public.crm_subscription_link_invoice(p_period uuid, p_invoice uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare per public.crm_subscription_periods; sub public.crm_subscriptions; inv public.crm_invoices;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into per from public.crm_subscription_periods where id = p_period for update;
  if not found then raise exception 'subscription_period_missing' using errcode = 'P0002'; end if;
  if per.invoice_id = p_invoice then return; end if;
  if per.invoice_id is not null then raise exception 'subscription_period_invoiced' using errcode = '23514'; end if;
  select * into sub from public.crm_subscriptions where id = per.subscription_id;
  select * into inv from public.crm_invoices where id = p_invoice;
  if not found or inv.sale_id <> sub.sale_id or inv.status <> 'issued' then raise exception 'subscription_invoice_invalid' using errcode = '23514'; end if;
  update public.crm_subscription_periods set invoice_id = inv.id where id = per.id;
  perform crm_private.sub_event(sub.id, 'invoice_linked', sub.status, sub.status, '', jsonb_build_object('period_id', per.id, 'invoice_id', inv.id));
exception
  when unique_violation then raise exception 'subscription_invoice_invalid' using errcode = '23514';
end $$;

-- Usage of the current period (minutes, messages, …). Overage is reported, never billed automatically.
create function public.crm_subscription_record_usage(p_sub uuid, p_units numeric, p_note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sub public.crm_subscriptions; per public.crm_subscription_periods;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if p_units is null or p_units <= 0 or p_units > 1000000000 then raise exception 'subscription_usage_invalid' using errcode = '22023'; end if;
  select * into sub from public.crm_subscriptions where id = p_sub for update;
  if not found or sub.status not in ('active', 'suspended') then raise exception 'subscription_invalid_transition' using errcode = '23514'; end if;
  update public.crm_subscription_periods set usage = usage + p_units
  where subscription_id = sub.id and period_start = sub.current_period_start returning * into per;
  perform crm_private.sub_event(sub.id, 'usage_recorded', sub.status, sub.status, p_note, jsonb_build_object('units', p_units, 'period_id', per.id));
  return jsonb_build_object('usage', per.usage, 'included', sub.included_usage,
    'overage', case when sub.included_usage is null then null else greatest(per.usage - sub.included_usage, 0) end);
end $$;

-- Advance-payment requirement of a sale, derived from the APPROVED catalogue rules (informative; enforcement of
-- the clause in a contract requires an approved term policy).
create function public.crm_sale_advance_requirement(p_sale uuid) returns table (sale_line_id uuid, service_code text,
  advance_policy text, required_amount numeric)
language sql stable security definer set search_path = '' as $$
  select l.id, c.code, c.advance_policy,
    case c.advance_policy when 'full_upfront' then l.line_total when 'setup_and_first_period' then l.line_total else 0 end
  from public.crm_sale_lines l join public.crm_service_catalog c on c.id = l.service_id
  where crm_private.is_owner() and l.sale_id = p_sale and c.offer_status = 'approved' and c.advance_policy <> 'none'
$$;

do $$
declare f text;
begin
  foreach f in array array['crm_term_policy_save(jsonb)', 'crm_term_policy_propose(uuid)', 'crm_term_policy_record_legal_review(uuid, text)',
    'crm_term_policy_approve(uuid)', 'crm_term_policy_retire(uuid, text)', 'crm_contract_attach_term(uuid, uuid)', 'crm_contract_detach_term(uuid, text)',
    'crm_contract_set_lifecycle(uuid, jsonb)', 'crm_contract_terminate(uuid, date, text)', 'crm_subscription_open(uuid, jsonb)',
    'crm_subscription_activate(uuid, date)', 'crm_subscription_renew(uuid, date)', 'crm_subscription_suspend(uuid, text)',
    'crm_subscription_reactivate(uuid, text)', 'crm_subscription_cancel(uuid, text, text, date)', 'crm_subscription_link_invoice(uuid, uuid)',
    'crm_subscription_record_usage(uuid, numeric, text)', 'crm_sale_advance_requirement(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ── 8. Commercial e-mail kinds in the canonical outbox ─────────────────────────────────────────────────────────────
alter table public.crm_email_outbox drop constraint if exists crm_email_outbox_kind_check;
alter table public.crm_email_outbox add constraint crm_email_outbox_kind_check check (kind in ('client_welcome', 'invoice_copy',
  'document_delivery', 'onboarding_confirmation', 'information_request', 'materials_request', 'kickoff_confirmation', 'progress_update',
  'review_request', 'approval_request', 'delivery_notice', 'receipt_confirmation', 'support_info', 'maintenance_notice', 'renewal_review',
  'quote_sent', 'contract_confirmation', 'payment_confirmation', 'subscription_renewal_notice', 'cancellation_confirmation'));

-- ── 9. Proposed clauses discussed by the owners: seeded as DRAFT proposals, inactive, attached to nothing ─────────
insert into public.crm_contract_term_policies (key, title_es, title_en, body_es, body_en, params, applies_to, created_by)
values
  ('initial_cancellation_window', 'PROPUESTA · Ventana inicial de cancelación', 'PROPOSAL · Initial cancellation window',
   'PROPUESTA PENDIENTE DE APROBACIÓN CONJUNTA Y REVISIÓN JURÍDICA. El cliente podrá cancelar dentro de los {business_days} días hábiles siguientes a la firma, en los términos que apruebe la dirección.',
   'PROPOSAL PENDING JOINT APPROVAL AND LEGAL REVIEW. The client may cancel within {business_days} business days after signature, on the terms the owners approve.',
   '{"business_days": 3}'::jsonb, 'all', null),
  ('recurring_tool_advance', 'PROPUESTA · Anticipo para herramientas con costo mensual', 'PROPOSAL · Advance for tools with monthly costs',
   'PROPUESTA PENDIENTE DE APROBACIÓN CONJUNTA Y REVISIÓN JURÍDICA. Para servicios que generan costos recurrentes a Avalon, la activación requiere el pago previo de la instalación y del primer período.',
   'PROPOSAL PENDING JOINT APPROVAL AND LEGAL REVIEW. For services that create recurring costs for Avalon, activation requires prior payment of setup and the first period.',
   '{"requires_setup": true, "requires_first_period": true}'::jsonb, 'recurring', null)
on conflict do nothing;

commit;
