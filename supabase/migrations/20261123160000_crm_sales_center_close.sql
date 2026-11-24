-- Avalon Sales Center — "Cerrar venta" from an accepted quote + variable (percentage / commission) agreements.
-- ADDITIVE, FORWARD-ONLY. REVIEW ONLY until an owner approves applying it to production.
--
-- One engine: Quotes is the only place where a commercial proposal is configured. Closing a sale never re-enters data:
--   crm_quote_close_sale(request) re-validates the EXACT accepted revision on the server, then, in ONE transaction:
--     1. calls the existing crm_confirm_sale (client, contacts, sale lines, work orders, projects, tasks, won gate with a
--        verified contract, audit) with lines derived 1:1 from the accepted revision — price, quantity, description;
--     2. stores an immutable copy of the accepted terms (crm_sale_terms) — the quote stays readable and versioned;
--     3. records the variable component (revenue share, sale commission or outcome commission) in
--        crm_sale_variable_terms, with its base, trigger, evidence method, settlement frequency and exclusions;
--     4. links the sale to the quote revision (crm_sales.quote_version_id is UNIQUE → one sale per accepted revision).
--   Idempotent: the idempotency key is derived from the revision id, so a double click or a retry returns the same sale.
-- Variable money is never invented: crm_sale_settlements records a period, the VERIFIED eligible base, exclusions and
-- evidence; amount_due = (base − excluded) × pct / 100 is computed by the database. Only VERIFIED settlements become
-- collectible (payment cap and receivables). Legacy sales and quotes are untouched.

begin;

-- ── Sale ↔ accepted quote revision ───────────────────────────────────────────────────────────────────────────────
alter table public.crm_sales
  add column if not exists quote_id uuid references public.crm_quotes (id),
  add column if not exists quote_version_id uuid unique references public.crm_quote_versions (id),
  add column if not exists commercial_model text check (commercial_model is null or commercial_model in ('fixed', 'monthly', 'commission', 'hybrid'));
create index if not exists crm_sales_quote on public.crm_sales (quote_id) where quote_id is not null;

-- ── Immutable copy of what the client accepted ───────────────────────────────────────────────────────────────────
create table public.crm_sale_terms (
  sale_id uuid primary key references public.crm_sales (id),
  quote_id uuid not null references public.crm_quotes (id),
  quote_version_id uuid not null unique references public.crm_quote_versions (id),
  quote_number text not null,
  version_no integer not null check (version_no >= 1),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  accepted_at timestamptz not null,
  accepted_note text not null default '' check (length(accepted_note) <= 1000),
  closed_by uuid not null references auth.users (id),
  closed_at timestamptz not null default now()
);
create index crm_sale_terms_quote on public.crm_sale_terms (quote_id);
create index crm_sale_terms_closed_by on public.crm_sale_terms (closed_by);

create function crm_private.sale_terms_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'sale_terms_immutable' using errcode = '23514', hint = 'Accepted terms change through a new quote revision / amendment, never in place.';
end $$;
create trigger crm_sale_terms_immutable before update or delete on public.crm_sale_terms
  for each row execute function crm_private.sale_terms_immutable();

-- ── Variable agreement attached to the sale (from the accepted revision) ─────────────────────────────────────────
create table public.crm_sale_variable_terms (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  sale_id uuid not null unique references public.crm_sales (id),
  client_id uuid not null references public.crm_clients (id),
  kind text not null check (kind in ('revenue_share', 'sale_commission', 'outcome_commission')),
  pct numeric(5, 2) not null check (pct > 0 and pct <= 100 and pct not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  base text not null check (base in ('gross_revenue', 'gross_profit', 'other')),
  base_note text not null default '' check (length(base_note) <= 2000),
  trigger_event text not null check (length(btrim(trigger_event)) between 1 and 2000),
  evidence_method text not null check (length(btrim(evidence_method)) between 1 and 2000),
  settlement text not null check (settlement in ('weekly', 'biweekly', 'monthly', 'quarterly')),
  attribution_window_days integer check (attribution_window_days is null or attribution_window_days between 1 and 730),
  exclusions text not null default '' check (length(exclusions) <= 2000),
  refunds text not null default '' check (length(refunds) <= 2000),
  expiry text not null default '' check (length(expiry) <= 2000),
  effective_on date not null,
  duration_months integer check (duration_months is null or duration_months between 1 and 120),
  created_at timestamptz not null default now()
);
create index crm_sale_variable_terms_client on public.crm_sale_variable_terms (client_id);

-- ── Settlements: verified base × agreed pct → amount due ─────────────────────────────────────────────────────────
create table public.crm_sale_settlements (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  idempotency_key uuid not null unique,
  variable_terms_id uuid not null references public.crm_sale_variable_terms (id),
  sale_id uuid not null references public.crm_sales (id),
  period_start date not null,
  period_end date not null,
  eligible_base numeric(15, 2) not null check (eligible_base > 0 and eligible_base not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  excluded_amount numeric(15, 2) not null default 0 check (excluded_amount >= 0 and excluded_amount not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  pct numeric(5, 2) not null check (pct > 0 and pct <= 100 and pct not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  amount_due numeric(15, 2) generated always as (round((eligible_base - excluded_amount) * pct / 100, 2)) stored
    check (amount_due not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  evidence text not null check (length(btrim(evidence)) between 5 and 500),
  status text not null default 'recorded' check (status in ('recorded', 'verified', 'void')),
  verification_evidence text not null default '' check (length(verification_evidence) <= 500),
  verified_by uuid references auth.users (id),
  verified_at timestamptz,
  void_reason text not null default '' check (length(void_reason) <= 500),
  voided_by uuid references auth.users (id),
  voided_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  check (excluded_amount < eligible_base),
  check (status <> 'verified' or (verified_by is not null and verified_at is not null and length(btrim(verification_evidence)) >= 3)),
  check (status <> 'void' or (voided_by is not null and voided_at is not null and length(btrim(void_reason)) >= 5))
);
-- One live settlement per agreement and period (no double billing of the same period).
create unique index crm_sale_settlements_live_period on public.crm_sale_settlements (variable_terms_id, period_start, period_end) where status <> 'void';
create index crm_sale_settlements_sale on public.crm_sale_settlements (sale_id);
create index crm_sale_settlements_created_by on public.crm_sale_settlements (created_by);
create index crm_sale_settlements_verified_by on public.crm_sale_settlements (verified_by) where verified_by is not null;
create index crm_sale_settlements_voided_by on public.crm_sale_settlements (voided_by) where voided_by is not null;

-- ── RLS: owners read terms; finance owners read money; nobody writes directly ────────────────────────────────────
alter table public.crm_sale_terms enable row level security;
alter table public.crm_sale_variable_terms enable row level security;
alter table public.crm_sale_settlements enable row level security;
revoke all on public.crm_sale_terms, public.crm_sale_variable_terms, public.crm_sale_settlements from anon, authenticated, public;
grant select on public.crm_sale_terms, public.crm_sale_variable_terms, public.crm_sale_settlements to authenticated;
create policy crm_sale_terms_owner_read on public.crm_sale_terms for select to authenticated using ((select crm_private.is_owner()));
create policy crm_sale_variable_terms_owner_read on public.crm_sale_variable_terms for select to authenticated using ((select crm_private.is_owner()));
create policy crm_sale_settlements_finance_read on public.crm_sale_settlements for select to authenticated
  using ((select crm_private.is_owner()) and (select crm_private.can_view_client_finances()));

-- Verified variable money due on a sale, readable by the payment guard regardless of the caller's finance RLS.
create function crm_private.sale_settled_due(p_sale uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount_due), 0) from public.crm_sale_settlements
  where sale_id = p_sale and status = 'verified' and crm_private.is_owner()
$$;
revoke all on function crm_private.sale_settled_due(uuid) from public, anon;
grant execute on function crm_private.sale_settled_due(uuid) to authenticated;

-- Same guard as 20261123150000; the collectible ceiling now adds VERIFIED variable settlements to the fixed total.
create or replace function crm_private.payment_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare s public.crm_sales; paid numeric; inv_sale uuid; inv_status text; ins record;
begin
  select * into s from public.crm_sales where id = new.sale_id for update;
  if not found or s.status <> 'confirmed' then raise exception 'payment_invalid_sale' using errcode = '23514'; end if;
  if new.currency <> s.currency then raise exception 'payment_currency_mismatch' using errcode = '23514'; end if;
  -- A new payment always starts as recorded; verification and reversal are separate attributable steps.
  new.status := 'recorded'; new.verified_by := null; new.verified_at := null;
  new.reversed_by := null; new.reversed_at := null; new.reversal_reason := '';
  if new.invoice_id is not null then
    select l.sale_id, l.status into inv_sale, inv_status from crm_private.invoice_link(new.invoice_id) l;
    if inv_sale is null or inv_sale <> new.sale_id or inv_status <> 'issued' then raise exception 'payment_invalid_invoice' using errcode = '23514'; end if;
  end if;
  if new.installment_id is not null then
    select * into ins from crm_private.installment_state(new.installment_id);
    if ins.sale_id is null or ins.sale_id <> new.sale_id or ins.status <> 'scheduled' or ins.currency <> new.currency then
      raise exception 'payment_invalid_installment' using errcode = '23514';
    end if;
    if ins.allocated + new.amount > ins.amount then raise exception 'payment_exceeds_installment' using errcode = '23514'; end if;
  end if;
  select coalesce(sum(amount), 0) into paid from public.crm_payments where sale_id = new.sale_id and status <> 'reversed';
  if paid + new.amount > s.total + crm_private.sale_settled_due(s.id) then raise exception 'payment_exceeds_total' using errcode = '23514'; end if;
  return new;
end $$;

-- ── "Cerrar venta" ──────────────────────────────────────────────────────────────────────────────────────────────
create function public.crm_quote_close_sale(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q public.crm_quotes; v public.crm_quote_versions; c jsonb; cm jsonb; line jsonb; svc public.crm_service_catalog;
  lines jsonb := '[]'::jsonb; n integer := 0; has_one boolean := false; has_monthly boolean := false;
  existing public.crm_sales; r jsonb; sale_id uuid; v_client uuid; seller uuid; v_note text := ''; v_kind text; v_effective date;
  v_duration integer; v_window integer; v_billing text;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if request is null or jsonb_typeof(request) <> 'object' then raise exception 'quote_close_invalid' using errcode = '22023'; end if;
  select * into q from public.crm_quotes where id = crm_private.uuid_or_null(request ->> 'quote_id') for update;
  if not found then raise exception 'quote_not_found' using errcode = 'P0002'; end if;
  select * into v from public.crm_quote_versions where quote_id = q.id and version_no = q.current_version;
  -- Fidelity: the person closing must be looking at the revision that was accepted.
  if coalesce((request ->> 'version_no')::integer, -1) <> q.current_version then raise exception 'quote_version_changed' using errcode = '40001'; end if;
  select * into existing from public.crm_sales where quote_version_id = v.id;
  if found then
    return jsonb_build_object('sale_id', existing.id, 'sale_number', existing.sale_number, 'client_id', existing.client_id, 'replayed', true);
  end if;
  if q.status <> 'accepted' then raise exception 'quote_not_accepted' using errcode = '23514'; end if;
  c := v.content;
  cm := c -> 'commission';
  if jsonb_typeof(cm) = 'object' and cm ->> 'status' <> 'proposed' then raise exception 'quote_commission_to_negotiate' using errcode = '23514'; end if;
  -- Essential variable terms are never inferred (start date, duration, exclusions, refunds, verification, trigger,
  -- agreement type): an older or incomplete revision must be revised, sent and accepted again before closing.
  if jsonb_typeof(cm) = 'object' and (
       coalesce(cm ->> 'kind', '') = '' or coalesce(cm ->> 'effectiveDate', '') = '' or coalesce(cm ->> 'durationMonths', '') = ''
    or length(btrim(coalesce(cm ->> 'exclusions', ''))) < 3 or length(btrim(coalesce(cm ->> 'refunds', ''))) < 3
    or length(btrim(coalesce(cm ->> 'evidence', ''))) < 3 or length(btrim(coalesce(cm ->> 'trigger', ''))) < 3) then
    raise exception 'quote_variable_terms_incomplete' using errcode = '23514';
  end if;

  -- Lines 1:1 from the accepted revision. Every line must be an active catalog service of the same billing type
  -- (a custom concept has no operational template; it needs a catalog entry before it can be delivered).
  for line in select value from jsonb_array_elements(coalesce(c -> 'lines', '[]'::jsonb)) loop
    n := n + 1;
    select * into svc from public.crm_service_catalog where code = line ->> 'code' and active;
    if not found then raise exception 'quote_line_not_in_catalog' using errcode = '23514', detail = coalesce(line ->> 'name', ''); end if;
    if svc.billing_type <> (line ->> 'kind') then raise exception 'quote_line_kind_mismatch' using errcode = '23514', detail = svc.code; end if;
    if line ->> 'kind' = 'monthly' then has_monthly := true; else has_one := true; end if;
    lines := lines || jsonb_build_array(jsonb_build_object('service_code', svc.code, 'quantity', line ->> 'qty', 'unit_price', line ->> 'unitPrice',
      'description', left(btrim(coalesce(line ->> 'description', '')) , 1000)));
  end loop;
  if n = 0 then raise exception 'quote_needs_service_line' using errcode = '23514'; end if;
  v_billing := case when has_one and has_monthly then 'mixed' when has_monthly then 'monthly' else 'one_time' end;

  select e.note into v_note from public.crm_quote_events e where e.quote_id = q.id and e.to_status = 'accepted' order by e.created_at desc limit 1;
  seller := coalesce(crm_private.uuid_or_null(request ->> 'seller_id'), auth.uid());
  -- Same transaction: crm_confirm_sale enforces the won gate (verified contract), creates client/work orders/projects,
  -- and replays on the same key. The key is derived from the revision, so retries can never create a second sale.
  r := public.crm_confirm_sale(jsonb_build_object(
    'idempotency_key', md5('avalon-quote-close:' || v.id::text)::uuid,
    'lead_id', q.lead_id, 'client_id', q.client_id,
    'new_client', jsonb_build_object('legal_name', coalesce(nullif(btrim(c -> 'client' ->> 'company'), ''), q.title)),
    'seller_id', seller, 'sold_on', coalesce(nullif(request ->> 'sold_on', ''), current_date::text),
    'billing_mode', v_billing, 'lines', lines,
    'notes', left('Cerrada desde la cotización ' || q.quote_number || ' v' || v.version_no || ' aceptada.', 4000)));
  sale_id := (r ->> 'sale_id')::uuid;
  update public.crm_sales set quote_id = q.id, quote_version_id = v.id, commercial_model = v.model, updated_at = now() where id = sale_id
    returning client_id into v_client;
  insert into public.crm_sale_terms (sale_id, quote_id, quote_version_id, quote_number, version_no, content, content_sha256, accepted_at, accepted_note, closed_by)
    values (sale_id, q.id, v.id, q.quote_number, v.version_no, c, v.content_sha256, coalesce(q.accepted_at, now()), left(coalesce(v_note, ''), 1000), auth.uid());
  if jsonb_typeof(cm) = 'object' then
    v_kind := coalesce(nullif(cm ->> 'kind', ''), 'revenue_share');
    if v_kind not in ('revenue_share', 'sale_commission', 'outcome_commission') then raise exception 'quote_close_invalid' using errcode = '22023'; end if;
    begin v_effective := coalesce(nullif(cm ->> 'effectiveDate', '')::date, coalesce(nullif(request ->> 'sold_on', '')::date, current_date));
    exception when others then raise exception 'quote_close_invalid' using errcode = '22023'; end;
    v_duration := nullif(cm ->> 'durationMonths', '')::integer;
    v_window := nullif(cm ->> 'attributionWindowDays', '')::integer;
    insert into public.crm_sale_variable_terms (sale_id, client_id, kind, pct, base, base_note, trigger_event, evidence_method, settlement,
      attribution_window_days, exclusions, refunds, expiry, effective_on, duration_months)
    values (sale_id, v_client, v_kind, (cm ->> 'pct')::numeric, cm ->> 'base', coalesce(cm ->> 'baseNote', ''), cm ->> 'trigger', cm ->> 'evidence',
      cm ->> 'settlement', v_window, coalesce(cm ->> 'exclusions', ''), coalesce(cm ->> 'refunds', ''), coalesce(cm ->> 'expiry', ''), v_effective, v_duration);
  end if;
  perform crm_private.log('sale.closed_from_quote', 'sales', 'crm_sales', sale_id, client_id => v_client, sale_id => sale_id,
    to_state => v.model, detail => q.quote_number || ' v' || v.version_no, source => 'app');
  return r || jsonb_build_object('quote_version_id', v.id, 'commercial_model', v.model, 'variable', jsonb_typeof(cm) = 'object');
exception when invalid_text_representation then raise exception 'quote_close_invalid' using errcode = '22023';
end $$;

-- ── Settlements ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Avalon standard for every future variable proposal: approving, sending or accepting a quote whose current
-- revision has a proposed percentage/commission requires all essential terms (same rule as closing). Drafts can
-- still be saved incomplete; only moving them forward is blocked.
create function crm_private.quote_variable_terms_gate() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare cm jsonb;
begin
  if new.status is not distinct from old.status or new.status not in ('approved', 'sent', 'accepted') then return new; end if;
  select v.content -> 'commission' into cm from public.crm_quote_versions v where v.quote_id = new.id and v.version_no = new.current_version;
  if jsonb_typeof(cm) = 'object' and cm ->> 'status' = 'proposed' and (
       coalesce(cm ->> 'kind', '') = '' or coalesce(cm ->> 'effectiveDate', '') = '' or coalesce(cm ->> 'durationMonths', '') = ''
    or length(btrim(coalesce(cm ->> 'exclusions', ''))) < 3 or length(btrim(coalesce(cm ->> 'refunds', ''))) < 3
    or length(btrim(coalesce(cm ->> 'evidence', ''))) < 3 or length(btrim(coalesce(cm ->> 'trigger', ''))) < 3) then
    raise exception 'quote_variable_terms_incomplete' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function crm_private.quote_variable_terms_gate() from public, anon, authenticated;
create trigger crm_quote_variable_terms_gate before update of status on public.crm_quotes
  for each row execute function crm_private.quote_variable_terms_gate();

create function public.crm_sale_settlement_record(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare vt public.crm_sale_variable_terms; s public.crm_sales; st public.crm_sale_settlements; v_key uuid; v_base numeric; v_excl numeric;
  v_from date; v_to date; v_evidence text := btrim(coalesce(request ->> 'evidence', ''));
begin
  if auth.uid() is null or not crm_private.is_owner() or not crm_private.can_view_client_finances() then
    raise exception 'finance_forbidden' using errcode = '42501';
  end if;
  v_key := crm_private.uuid_or_null(request ->> 'idempotency_key');
  if v_key is null then raise exception 'settlement_invalid' using errcode = '22023'; end if;
  select * into st from public.crm_sale_settlements where idempotency_key = v_key;
  if found then return jsonb_build_object('settlement_id', st.id, 'amount_due', st.amount_due, 'replayed', true); end if;
  select * into vt from public.crm_sale_variable_terms where sale_id = crm_private.uuid_or_null(request ->> 'sale_id');
  if not found then raise exception 'settlement_no_variable_terms' using errcode = '23514'; end if;
  select * into s from public.crm_sales where id = vt.sale_id for update;
  if s.status <> 'confirmed' then raise exception 'settlement_invalid_sale' using errcode = '23514'; end if;
  v_base := crm_private.amount(request ->> 'eligible_base', null);
  v_excl := crm_private.amount(request ->> 'excluded_amount', 0);
  begin v_from := (request ->> 'period_start')::date; v_to := (request ->> 'period_end')::date;
  exception when others then raise exception 'settlement_invalid_period' using errcode = '22023'; end;
  if v_from is null or v_to is null or v_to < v_from or v_from < vt.effective_on or v_to > current_date + 31 then
    raise exception 'settlement_invalid_period' using errcode = '22023';
  end if;
  if v_base is null or v_base <= 0 or v_excl >= v_base then raise exception 'settlement_invalid_amount' using errcode = '22023'; end if;
  if length(v_evidence) < 5 or length(v_evidence) > 500 then raise exception 'settlement_evidence_required' using errcode = '22023'; end if;
  if exists (select 1 from public.crm_sale_settlements where variable_terms_id = vt.id and status <> 'void'
             and daterange(period_start, period_end, '[]') && daterange(v_from, v_to, '[]')) then
    raise exception 'settlement_period_overlap' using errcode = '23505';
  end if;
  insert into public.crm_sale_settlements (idempotency_key, variable_terms_id, sale_id, period_start, period_end, eligible_base, excluded_amount, pct, evidence)
    values (v_key, vt.id, s.id, v_from, v_to, v_base, v_excl, vt.pct, v_evidence) returning * into st;
  perform crm_private.log('settlement.recorded', 'sales', 'crm_sales', s.id, client_id => s.client_id, sale_id => s.id,
    to_state => 'recorded', detail => v_from || '…' || v_to || ' · ' || s.currency || ' ' || st.amount_due, source => 'app');
  return jsonb_build_object('settlement_id', st.id, 'amount_due', st.amount_due, 'replayed', false);
end $$;

create function public.crm_sale_settlement_transition(p_settlement uuid, p_to text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare st public.crm_sale_settlements; s public.crm_sales; note text := btrim(coalesce(p_note, '')); paid numeric;
begin
  if auth.uid() is null or not crm_private.is_owner() or not crm_private.can_view_client_finances() then
    raise exception 'finance_forbidden' using errcode = '42501';
  end if;
  select * into st from public.crm_sale_settlements where id = p_settlement for update;
  if not found then raise exception 'settlement_not_found' using errcode = 'P0002'; end if;
  select * into s from public.crm_sales where id = st.sale_id for update;
  if p_to = 'verified' and st.status = 'recorded' then
    if length(note) < 3 then raise exception 'settlement_evidence_required' using errcode = '22023'; end if;
    update public.crm_sale_settlements set status = 'verified', verification_evidence = left(note, 500), verified_by = auth.uid(), verified_at = now() where id = st.id;
  elsif p_to = 'void' and st.status in ('recorded', 'verified') then
    if length(note) < 5 then raise exception 'settlement_reason_required' using errcode = '22023'; end if;
    if st.status = 'verified' then
      -- Never leave receipts above what is now collectible.
      select coalesce(sum(amount), 0) into paid from public.crm_payments where sale_id = s.id and status <> 'reversed';
      if paid > s.total + crm_private.sale_settled_due(s.id) - st.amount_due then raise exception 'settlement_has_payments' using errcode = '23514'; end if;
    end if;
    update public.crm_sale_settlements set status = 'void', void_reason = left(note, 500), voided_by = auth.uid(), voided_at = now() where id = st.id;
  else
    raise exception 'settlement_invalid_transition' using errcode = '23514';
  end if;
  perform crm_private.log('settlement.' || p_to, 'sales', 'crm_sales', s.id, client_id => s.client_id, sale_id => s.id,
    from_state => st.status, to_state => p_to, detail => s.currency || ' ' || st.amount_due || ' · ' || left(note, 150), source => 'app');
end $$;

-- Receivables now include verified variable money (columns appended; existing columns keep their meaning except
-- balance, which is now total + variable_due − net_collected).
create or replace view public.crm_sale_receivables with (security_invoker = true) as
with pay as (
  select sale_id,
    sum(amount) filter (where status <> 'reversed') recorded,
    sum(amount) filter (where status = 'verified') verified
  from public.crm_payments group by sale_id
), ref as (
  select sale_id, sum(amount) filter (where kind = 'refund' or resolution in ('open', 'lost')) refunded,
    count(*) filter (where resolution = 'open') open_chargebacks
  from public.crm_payment_refunds group by sale_id
), ins as (
  select i.sale_id, i.id, i.due_on, i.amount,
    coalesce((select sum(p.amount) from public.crm_payments p where p.installment_id = i.id and p.status <> 'reversed'), 0) explicit
  from public.crm_sale_installments i where i.status = 'scheduled'
), pool as (
  select s.id sale_id, coalesce((select sum(p.amount) from public.crm_payments p where p.sale_id = s.id and p.status <> 'reversed' and p.installment_id is null), 0) unallocated
  from public.crm_sales s
), cover as (
  select ins.*, greatest(ins.amount - ins.explicit, 0) gap,
    sum(greatest(ins.amount - ins.explicit, 0)) over (partition by ins.sale_id order by ins.due_on, ins.id) running_gap
  from ins
), state as (
  select c.sale_id, c.due_on, c.gap,
    least(c.gap, greatest(c.running_gap - coalesce(pool.unallocated, 0), 0)) uncovered
  from cover c left join pool on pool.sale_id = c.sale_id
), var as (
  select sale_id, sum(amount_due) filter (where status = 'verified') variable_due,
    sum(amount_due) filter (where status = 'recorded') variable_pending
  from public.crm_sale_settlements group by sale_id
)
select s.id as sale_id, s.client_id, s.currency, s.total,
  coalesce(pay.recorded, 0) as recorded, coalesce(pay.verified, 0) as verified, coalesce(ref.refunded, 0) as refunded,
  coalesce(pay.recorded, 0) - coalesce(ref.refunded, 0) as net_collected,
  s.total + coalesce(var.variable_due, 0) - (coalesce(pay.recorded, 0) - coalesce(ref.refunded, 0)) as balance,
  coalesce((select sum(st.uncovered) from state st where st.sale_id = s.id and st.due_on < current_date), 0) as overdue,
  (select min(st.due_on) from state st where st.sale_id = s.id and st.uncovered > 0 and st.due_on >= current_date) as next_due,
  (select count(*) from ins where ins.sale_id = s.id)::integer as installments,
  coalesce(ref.open_chargebacks, 0)::integer as open_chargebacks,
  coalesce(var.variable_due, 0) as variable_due,
  coalesce(var.variable_pending, 0) as variable_pending,
  s.commercial_model
from public.crm_sales s
left join pay on pay.sale_id = s.id
left join ref on ref.sale_id = s.id
left join var on var.sale_id = s.id;
revoke all on public.crm_sale_receivables from anon, public;
grant select on public.crm_sale_receivables to authenticated;

revoke all on function public.crm_quote_close_sale(jsonb), public.crm_sale_settlement_record(jsonb),
  public.crm_sale_settlement_transition(uuid, text, text) from public, anon;
grant execute on function public.crm_quote_close_sale(jsonb), public.crm_sale_settlement_record(jsonb),
  public.crm_sale_settlement_transition(uuid, text, text) to authenticated;

commit;
