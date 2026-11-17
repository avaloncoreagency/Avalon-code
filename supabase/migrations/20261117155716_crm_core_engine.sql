-- Avalon OS · Operation Core Engine (C1–C4). ADDITIVE ONLY. Applied to production on 2026-11-17 with explicit owner
-- approval (ledger version 20261117155716_crm_core_engine); this file was renamed to match the production ledger.
--
--  1. Catalog commercial terms: monthly price, direct cost, target margin, exclusions, duration, payment terms,
--     draft/approved offer with version, and an optional commission rule. Prices and percentages are never seeded:
--     only an owner can approve an offer, and editing an approved offer sends it back to draft as a new version.
--     Adds the business-automation service (no price). Which services are sellable is an owner decision made in the
--     catalog (active=false keeps history and blocks new sales); this migration does not deactivate anything.
--  2. Documented invoicing (crm_invoices): records invoices issued OUTSIDE Avalon. Nothing is sent or charged.
--  3. Payment reconciliation: payments stay append-only; they can be linked to an invoice, verified with evidence
--     or reversed with a reason. Reversed payments never count as collected. A bank reference cannot be recorded twice.
--  4. Commission ledger (crm_commissions): agreed → accrued → paid (or cancelled), tied to a written agreement
--     reference and the deciding owner. "Paid" records a payout made elsewhere; no transfer is executed.
--  5. crm_client_finance_ledger(): contracted, invoiced, collected, verified, expenses, commissions and profit,
--     per currency, never mixed. Existing summaries now exclude reversed payments.
--  6. Explicit deny-all policies on the two RLS tables the Security Advisor reported without policies.
--
-- Production ledger note: Branching cannot replay this repository onto production (29 of 41 historical files carry
-- different versions in the production ledger). It was applied manually with apply_migration in one transaction.

begin;

-- ── 1. Catalog ───────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.crm_service_catalog
  add column if not exists monthly_price numeric(15, 2) check (monthly_price is null or monthly_price between 0 and 1000000000000),
  add column if not exists direct_cost numeric(15, 2) check (direct_cost is null or direct_cost between 0 and 1000000000000),
  add column if not exists target_margin_pct numeric(5, 2) check (target_margin_pct is null or target_margin_pct between 0 and 100),
  add column if not exists exclusions text not null default '' check (length(exclusions) <= 4000),
  add column if not exists estimated_days integer check (estimated_days is null or estimated_days between 1 and 730),
  add column if not exists payment_terms text not null default '' check (length(payment_terms) <= 2000),
  add column if not exists offer_status text not null default 'draft' check (offer_status in ('draft', 'approved', 'retired')),
  add column if not exists offer_version integer not null default 1 check (offer_version >= 1),
  add column if not exists offer_approved_by uuid references auth.users (id),
  add column if not exists offer_approved_at timestamptz,
  add column if not exists commission_kind text not null default 'none' check (commission_kind in ('none', 'sale_pct', 'referral_pct', 'fixed')),
  add column if not exists commission_value numeric(15, 2) check (commission_value is null or commission_value > 0);

alter table public.crm_service_catalog
  add constraint crm_service_catalog_commission_shape check ((commission_kind = 'none') = (commission_value is null)),
  add constraint crm_service_catalog_commission_pct check (commission_kind not in ('sale_pct', 'referral_pct') or commission_value <= 100),
  add constraint crm_service_catalog_offer_approval check (offer_status <> 'approved' or (offer_approved_by is not null and offer_approved_at is not null));

create function crm_private.catalog_offer_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    -- New services start as drafts; approval is a separate, attributable decision.
    new.offer_status := 'draft'; new.offer_version := 1; new.offer_approved_by := null; new.offer_approved_at := null;
    return new;
  end if;
  new.offer_version := old.offer_version;
  -- Any change to what is being sold or how it is priced reopens an approved offer as a new draft version.
  if old.offer_status = 'approved' and (new.suggested_price, new.monthly_price, new.direct_cost, new.target_margin_pct,
       new.billing_type, new.deliverables, new.exclusions, new.estimated_days, new.payment_terms, new.commission_kind, new.commission_value)
     is distinct from (old.suggested_price, old.monthly_price, old.direct_cost, old.target_margin_pct, old.billing_type,
       old.deliverables, old.exclusions, old.estimated_days, old.payment_terms, old.commission_kind, old.commission_value) then
    new.offer_status := 'draft'; new.offer_version := old.offer_version + 1;
    new.offer_approved_by := null; new.offer_approved_at := null;
    return new;
  end if;
  if new.offer_status = 'approved' and old.offer_status <> 'approved' then
    if auth.uid() is null or not crm_private.is_owner() then raise exception 'offer_approval_requires_owner' using errcode = '42501'; end if;
    if new.suggested_price is null and new.monthly_price is null then raise exception 'offer_requires_price' using errcode = '23514'; end if;
    new.offer_approved_by := auth.uid(); new.offer_approved_at := now();     -- never on someone else's behalf
  elsif new.offer_status <> 'approved' then
    new.offer_approved_by := null; new.offer_approved_at := null;
  else
    new.offer_approved_by := old.offer_approved_by; new.offer_approved_at := old.offer_approved_at;
  end if;
  return new;
end $$;
revoke all on function crm_private.catalog_offer_guard() from public;
create trigger crm_service_catalog_offer_guard before insert or update on public.crm_service_catalog
  for each row execute function crm_private.catalog_offer_guard();

alter table public.crm_departments drop constraint if exists crm_departments_id_check;
alter table public.crm_departments add constraint crm_departments_id_check
  check (id in ('website', 'ecommerce', 'crm_creator', 'receptionist', 'marketing', 'sales', 'automation'));
insert into public.crm_departments (id, label, label_en, os_module, position)
values ('automation', 'Automatizaciones', 'Automations', null, 6)
on conflict (id) do nothing;

-- System seed during a migration has no owner session: the per-row owner stamp/audit triggers are paused only for this
-- statement (the migration itself is the audit record) and re-enabled before commit.
alter table public.crm_service_catalog disable trigger crm_audit, disable trigger crm_stamp;
insert into public.crm_service_catalog (code, name, name_en, department_id, billing_type, deliverables, task_template)
values ('automatizacion', 'Automatizaciones empresariales', 'Business automations', 'automation', 'one_time',
  'Flujos entre las herramientas que el cliente ya usa. No incluye plataformas de pago nuevas ni ejecuciones autónomas.', '[]'::jsonb)
on conflict (code) do nothing;

alter table public.crm_service_catalog enable trigger crm_audit, enable trigger crm_stamp;

-- ── 2. Documented invoices ───────────────────────────────────────────────────────────────────────────────────────
create table public.crm_invoices (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  sale_id uuid not null references public.crm_sales (id),
  client_id uuid not null references public.crm_clients (id),
  number text not null unique check (length(btrim(number)) between 1 and 60),
  issued_on date not null,
  due_on date check (due_on is null or due_on >= issued_on),
  amount numeric(15, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'issued' check (status in ('issued', 'void')),
  attachment_id uuid references public.crm_attachments (id),
  note text not null default '' check (length(note) <= 1000),
  void_reason text not null default '' check (length(void_reason) <= 500),
  voided_by uuid references auth.users (id),
  voided_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  check (status = 'issued' or (length(btrim(void_reason)) >= 5 and voided_by is not null and voided_at is not null))
);
create index crm_invoices_sale on public.crm_invoices (sale_id);
create index crm_invoices_client on public.crm_invoices (client_id);
alter table public.crm_invoices enable row level security;
revoke all on public.crm_invoices from anon, authenticated, public;
grant select on public.crm_invoices to authenticated;
create policy crm_invoices_owner_read on public.crm_invoices for select to authenticated
  using ((select crm_private.is_owner()) and (select crm_private.can_view_client_finances()));

create function public.crm_invoice_record(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.crm_sales; inv public.crm_invoices; v_amount numeric(15, 2); v_number text; issued numeric; att public.crm_attachments;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  v_number := btrim(coalesce(request ->> 'number', ''));
  begin v_amount := (request ->> 'amount')::numeric(15, 2);
  exception when others then raise exception 'invoice_invalid_amount' using errcode = '22023'; end;
  if v_amount is null or v_amount <= 0 then raise exception 'invoice_invalid_amount' using errcode = '22023'; end if;
  select * into s from public.crm_sales where id = (request ->> 'sale_id')::uuid for update;
  if not found or s.status <> 'confirmed' then raise exception 'invoice_invalid_sale' using errcode = '23514'; end if;
  if coalesce(request ->> 'currency', s.currency) <> s.currency then raise exception 'invoice_currency_mismatch' using errcode = '23514'; end if;
  -- Idempotent replay: the same document number for the same sale and amount returns the original record.
  select * into inv from public.crm_invoices where number = v_number;
  if found then
    if inv.sale_id = s.id and inv.amount = v_amount then return jsonb_build_object('invoice_id', inv.id, 'replayed', true); end if;
    raise exception 'invoice_number_taken' using errcode = '23505';
  end if;
  if (request ->> 'attachment_id') is not null then
    select * into att from public.crm_attachments where id = (request ->> 'attachment_id')::uuid;
    if not found or (att.client_id is distinct from s.client_id and (att.lead_id is null or att.lead_id is distinct from s.lead_id)) then
      raise exception 'invoice_document_other_client' using errcode = '42501';
    end if;
  end if;
  select coalesce(sum(amount), 0) into issued from public.crm_invoices where sale_id = s.id and status = 'issued';
  if issued + v_amount > s.total then raise exception 'invoice_exceeds_sale_total' using errcode = '23514'; end if;
  insert into public.crm_invoices (sale_id, client_id, number, issued_on, due_on, amount, currency, attachment_id, note)
  values (s.id, s.client_id, v_number, coalesce((request ->> 'issued_on')::date, current_date), (request ->> 'due_on')::date,
          v_amount, s.currency, att.id, left(coalesce(request ->> 'note', ''), 1000))
  returning * into inv;
  perform crm_private.log('invoice.recorded', 'sales', 'crm_invoices', inv.id, client_id => s.client_id, sale_id => s.id,
    detail => inv.number || ' · ' || inv.currency || ' ' || inv.amount, source => 'app');
  return jsonb_build_object('invoice_id', inv.id, 'replayed', false);
end $$;

create function public.crm_invoice_void(p_invoice uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.crm_invoices;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'void_reason_required' using errcode = '22023'; end if;
  select * into inv from public.crm_invoices where id = p_invoice for update;
  if not found then raise exception 'invoice_not_found' using errcode = 'P0002'; end if;
  if inv.status = 'void' then return; end if;
  if exists (select 1 from public.crm_payments where invoice_id = inv.id and status <> 'reversed') then
    raise exception 'invoice_has_payments' using errcode = '23514';
  end if;
  update public.crm_invoices set status = 'void', void_reason = left(btrim(p_reason), 500), voided_by = auth.uid(), voided_at = now()
  where id = inv.id;
  perform crm_private.log('invoice.voided', 'sales', 'crm_invoices', inv.id, client_id => inv.client_id, sale_id => inv.sale_id,
    from_state => 'issued', to_state => 'void', detail => left(btrim(p_reason), 200), source => 'app');
end $$;

-- ── 3. Payment reconciliation ────────────────────────────────────────────────────────────────────────────────────
alter table public.crm_payments
  add column if not exists invoice_id uuid references public.crm_invoices (id),
  add column if not exists status text not null default 'recorded' check (status in ('recorded', 'verified', 'reversed')),
  add column if not exists evidence text not null default '' check (length(evidence) <= 300),
  add column if not exists verified_by uuid references auth.users (id),
  add column if not exists verified_at timestamptz,
  add column if not exists reversal_reason text not null default '' check (length(reversal_reason) <= 500),
  add column if not exists reversed_by uuid references auth.users (id),
  add column if not exists reversed_at timestamptz;
alter table public.crm_payments
  add constraint crm_payments_verified_shape check (status <> 'verified' or (verified_by is not null and length(btrim(evidence)) >= 3)),
  add constraint crm_payments_reversed_shape check (status <> 'reversed' or (reversed_by is not null and length(btrim(reversal_reason)) >= 5));
-- The same bank/receipt reference cannot be recorded twice for a sale (double entry of one real payment).
create unique index if not exists crm_payments_sale_reference_unique on public.crm_payments (sale_id, lower(btrim(reference)))
  where btrim(reference) <> '' and status <> 'reversed';
create index if not exists crm_payments_invoice on public.crm_payments (invoice_id) where invoice_id is not null;

-- Invoice lookup for the payment guard independent of the caller's finance-view RLS (an owner may record a payment
-- without having finance read access; the link must still be validated).
create function crm_private.invoice_link(p_invoice uuid) returns table (sale_id uuid, status text)
language sql stable security definer set search_path = '' as $$
  select i.sale_id, i.status from public.crm_invoices i where i.id = p_invoice
$$;
revoke all on function crm_private.invoice_link(uuid) from public, anon;
grant execute on function crm_private.invoice_link(uuid) to authenticated;

create or replace function crm_private.payment_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare s public.crm_sales; paid numeric; inv_sale uuid; inv_status text;
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
  select coalesce(sum(amount), 0) into paid from public.crm_payments where sale_id = new.sale_id and status <> 'reversed';
  if paid + new.amount > s.total then raise exception 'payment_exceeds_total' using errcode = '23514'; end if;
  return new;
end $$;

create function public.crm_payment_verify(p_payment uuid, p_evidence text) returns void
language plpgsql security definer set search_path = '' as $$
declare pay public.crm_payments; s public.crm_sales;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_evidence, ''))) < 3 then raise exception 'payment_evidence_required' using errcode = '22023'; end if;
  select * into pay from public.crm_payments where id = p_payment for update;
  if not found then raise exception 'payment_not_found' using errcode = 'P0002'; end if;
  if pay.status = 'reversed' then raise exception 'payment_reversed' using errcode = '23514'; end if;
  if pay.status = 'verified' then return; end if;
  update public.crm_payments set status = 'verified', evidence = left(btrim(p_evidence), 300), verified_by = auth.uid(), verified_at = now(),
    updated_at = now(), version = version + 1 where id = pay.id;
  select * into s from public.crm_sales where id = pay.sale_id;
  perform crm_private.log('payment.verified', 'sales', 'crm_payments', pay.id, client_id => s.client_id, sale_id => s.id,
    from_state => 'recorded', to_state => 'verified', detail => pay.currency || ' ' || pay.amount, source => 'app');
end $$;

create function public.crm_payment_reverse(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare pay public.crm_payments; s public.crm_sales;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'reversal_reason_required' using errcode = '22023'; end if;
  select * into pay from public.crm_payments where id = p_payment for update;
  if not found then raise exception 'payment_not_found' using errcode = 'P0002'; end if;
  if pay.status = 'reversed' then return; end if;
  update public.crm_payments set status = 'reversed', reversal_reason = left(btrim(p_reason), 500), reversed_by = auth.uid(),
    reversed_at = now(), updated_at = now(), version = version + 1 where id = pay.id;
  select * into s from public.crm_sales where id = pay.sale_id;
  perform crm_private.log('payment.reversed', 'sales', 'crm_payments', pay.id, client_id => s.client_id, sale_id => s.id,
    from_state => pay.status, to_state => 'reversed', detail => left(btrim(p_reason), 200), source => 'app');
end $$;

-- Existing views of money now ignore reversed payments (same signatures, same security model).
create or replace function public.crm_sales_metrics() returns table (currency text, sales integer, contracted numeric,
  collected numeric, recurring_monthly numeric, upfront_agreed numeric)
language sql stable security invoker set search_path = '' as $$
  select s.currency, count(*)::integer, sum(s.total), coalesce(sum(p.paid), 0), sum(s.recurring_monthly), sum(s.upfront_amount)
  from public.crm_sales s
  left join (select sale_id, sum(amount) paid from public.crm_payments where status <> 'reversed' group by sale_id) p on p.sale_id = s.id
  where s.status = 'confirmed'
  group by s.currency order by s.currency
$$;

-- ── 4. Commissions ───────────────────────────────────────────────────────────────────────────────────────────────
create table public.crm_commissions (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  sale_id uuid not null references public.crm_sales (id),
  client_id uuid not null references public.crm_clients (id),
  kind text not null check (kind in ('sale', 'referral')),
  beneficiary_id uuid references public.agency_memberships (user_id),
  beneficiary_name text not null default '' check (length(beneficiary_name) <= 160),
  basis text not null check (length(btrim(basis)) between 10 and 2000),   -- reference to the written agreement
  rate_pct numeric(5, 2) check (rate_pct is null or (rate_pct > 0 and rate_pct <= 100)),
  fixed_amount numeric(15, 2) check (fixed_amount is null or fixed_amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount numeric(15, 2) not null check (amount > 0),
  status text not null default 'agreed' check (status in ('agreed', 'accrued', 'paid', 'cancelled')),
  agreed_by uuid not null references auth.users (id),
  agreed_at timestamptz not null default now(),
  accrued_by uuid references auth.users (id), accrued_at timestamptz,
  paid_by uuid references auth.users (id), paid_at timestamptz,
  paid_reference text not null default '' check (length(paid_reference) <= 120),
  cancelled_by uuid references auth.users (id), cancelled_at timestamptz,
  cancel_reason text not null default '' check (length(cancel_reason) <= 500),
  created_at timestamptz not null default now(),
  check ((beneficiary_id is not null) <> (length(btrim(beneficiary_name)) > 0)),
  check ((rate_pct is null) <> (fixed_amount is null)),
  check (status not in ('accrued', 'paid') or accrued_by is not null),
  check (status <> 'paid' or (paid_by is not null and length(btrim(paid_reference)) > 0)),
  check (status <> 'cancelled' or (cancelled_by is not null and length(btrim(cancel_reason)) >= 5))
);
create unique index crm_commissions_one_open on public.crm_commissions
  (sale_id, kind, coalesce(beneficiary_id::text, lower(btrim(beneficiary_name)))) where status <> 'cancelled';
create index crm_commissions_client on public.crm_commissions (client_id);
alter table public.crm_commissions enable row level security;
revoke all on public.crm_commissions from anon, authenticated, public;
grant select on public.crm_commissions to authenticated;
create policy crm_commissions_owner_read on public.crm_commissions for select to authenticated
  using ((select crm_private.is_owner()) and (select crm_private.can_view_client_finances()));

create function public.crm_commission_agree(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.crm_sales; c public.crm_commissions; v_rate numeric(5, 2); v_fixed numeric(15, 2); v_amount numeric(15, 2);
  v_ben uuid; v_name text;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into s from public.crm_sales where id = (request ->> 'sale_id')::uuid for update;
  if not found or s.status <> 'confirmed' then raise exception 'commission_invalid_sale' using errcode = '23514'; end if;
  begin
    v_rate := (request ->> 'rate_pct')::numeric(5, 2);
    v_fixed := (request ->> 'fixed_amount')::numeric(15, 2);
  exception when others then raise exception 'commission_invalid_value' using errcode = '22023'; end;
  if (v_rate is null) = (v_fixed is null) then raise exception 'commission_rate_or_fixed' using errcode = '22023'; end if;
  v_ben := nullif(request ->> 'beneficiary_id', '')::uuid;
  v_name := btrim(coalesce(request ->> 'beneficiary_name', ''));
  if v_ben is not null and not exists (select 1 from public.agency_memberships m where m.user_id = v_ben) then
    raise exception 'commission_unknown_beneficiary' using errcode = '23503';
  end if;
  -- Base for a percentage: net sale value (subtotal minus discount), excluding taxes collected for third parties.
  v_amount := coalesce(v_fixed, round((s.subtotal - s.discount_total) * v_rate / 100, 2));
  if v_amount <= 0 then raise exception 'commission_zero' using errcode = '23514'; end if;
  insert into public.crm_commissions (sale_id, client_id, kind, beneficiary_id, beneficiary_name, basis, rate_pct, fixed_amount,
    currency, amount, agreed_by)
  values (s.id, s.client_id, request ->> 'kind', v_ben, case when v_ben is null then v_name else '' end,
    btrim(coalesce(request ->> 'basis', '')), v_rate, v_fixed, s.currency, v_amount, auth.uid())
  returning * into c;
  perform crm_private.log('commission.agreed', 'sales', 'crm_commissions', c.id, client_id => s.client_id, sale_id => s.id,
    to_state => 'agreed', detail => c.kind || ' · ' || c.currency || ' ' || c.amount, source => 'app');
  return jsonb_build_object('commission_id', c.id, 'amount', c.amount::text, 'currency', c.currency);
end $$;

create function public.crm_commission_transition(p_commission uuid, p_to text, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare c public.crm_commissions; verified numeric;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into c from public.crm_commissions where id = p_commission for update;
  if not found then raise exception 'commission_not_found' using errcode = 'P0002'; end if;
  if c.status = p_to then return; end if;
  if p_to = 'accrued' then
    if c.status <> 'agreed' then raise exception 'commission_invalid_transition' using errcode = '23514'; end if;
    -- Earned only once real money for that sale has been verified; a contract alone does not accrue a commission.
    select coalesce(sum(amount), 0) into verified from public.crm_payments where sale_id = c.sale_id and status = 'verified';
    if verified <= 0 then raise exception 'commission_requires_verified_payment' using errcode = '23514'; end if;
    update public.crm_commissions set status = 'accrued', accrued_by = auth.uid(), accrued_at = now() where id = c.id;
  elsif p_to = 'paid' then
    if c.status <> 'accrued' then raise exception 'commission_invalid_transition' using errcode = '23514'; end if;
    if length(btrim(coalesce(p_note, ''))) = 0 then raise exception 'commission_payout_reference_required' using errcode = '22023'; end if;
    update public.crm_commissions set status = 'paid', paid_by = auth.uid(), paid_at = now(), paid_reference = left(btrim(p_note), 120)
    where id = c.id;
  elsif p_to = 'cancelled' then
    if c.status = 'paid' then raise exception 'commission_invalid_transition' using errcode = '23514'; end if;
    if length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'cancel_reason_required' using errcode = '22023'; end if;
    update public.crm_commissions set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = left(btrim(p_note), 500)
    where id = c.id;
  else
    raise exception 'commission_invalid_transition' using errcode = '22023';
  end if;
  perform crm_private.log('commission.' || p_to, 'sales', 'crm_commissions', c.id, client_id => c.client_id, sale_id => c.sale_id,
    from_state => c.status, to_state => p_to, detail => c.currency || ' ' || c.amount, source => 'app');
end $$;

-- ── 5. Finance ledger per client ─────────────────────────────────────────────────────────────────────────────────
create function public.crm_client_finance_ledger(p_client uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare cur jsonb;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if not crm_private.can_view_client_finances() then raise exception 'finance_forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.crm_clients c where c.id = p_client) then raise exception 'client_not_found' using errcode = 'P0002'; end if;
  with s as (select currency, sum(total) contracted, sum(recurring_monthly) recurring from public.crm_sales
             where client_id = p_client and status = 'confirmed' group by currency),
  i as (select currency, sum(amount) invoiced from public.crm_invoices where client_id = p_client and status = 'issued' group by currency),
  p as (select pay.currency, sum(pay.amount) filter (where pay.status <> 'reversed') collected,
               sum(pay.amount) filter (where pay.status = 'verified') verified
        from public.crm_payments pay join public.crm_sales x on x.id = pay.sale_id
        where x.client_id = p_client and x.status = 'confirmed' group by pay.currency),
  e as (select currency, sum(amount) expenses from public.crm_client_costs where client_id = p_client group by currency),
  k as (select currency, sum(amount) filter (where status in ('agreed', 'accrued', 'paid')) agreed,
               sum(amount) filter (where status in ('accrued', 'paid')) accrued,
               sum(amount) filter (where status = 'paid') paid
        from public.crm_commissions where client_id = p_client group by currency),
  keys as (select currency from s union select currency from i union select currency from p union select currency from e union select currency from k)
  select coalesce(jsonb_agg(jsonb_build_object(
      'currency', keys.currency,
      'contracted', coalesce(s.contracted, 0)::text,
      'recurring_monthly', coalesce(s.recurring, 0)::text,
      'invoiced', coalesce(i.invoiced, 0)::text,
      'collected', coalesce(p.collected, 0)::text,
      'collected_verified', coalesce(p.verified, 0)::text,
      'expenses', coalesce(e.expenses, 0)::text,
      'commissions_agreed', coalesce(k.agreed, 0)::text,
      'commissions_accrued', coalesce(k.accrued, 0)::text,
      'commissions_paid', coalesce(k.paid, 0)::text,
      -- Cash profit: money actually collected minus real expenses minus commissions actually paid.
      'profit', (coalesce(p.collected, 0) - coalesce(e.expenses, 0) - coalesce(k.paid, 0))::text,
      'outstanding', (coalesce(s.contracted, 0) - coalesce(p.collected, 0))::text) order by keys.currency), '[]'::jsonb)
  into cur
  from keys left join s using (currency) left join i using (currency) left join p using (currency) left join e using (currency) left join k using (currency);
  return jsonb_build_object('client_id', p_client, 'source', 'sql_aggregate', 'complete', true, 'currencies', cur, 'as_of', now());
end $$;

-- Keep the existing Client 360° summary consistent: reversed payments are not money collected.
create or replace function public.crm_client_finance_summary(p_client uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare cur jsonb; n_confirmed int; n_cancelled int; n_costs int;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if not crm_private.can_view_client_finances() then raise exception 'finance_forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.crm_clients c where c.id = p_client) then
    raise exception 'client_not_found' using errcode = 'P0002';
  end if;
  select count(*) filter (where s.status = 'confirmed'), count(*) filter (where s.status = 'cancelled')
    into n_confirmed, n_cancelled from public.crm_sales s where s.client_id = p_client;
  select count(*) into n_costs from public.crm_client_costs c where c.client_id = p_client;
  with s as (
    select x.currency, count(*) as n, sum(x.total) as contracted, sum(x.recurring_monthly) as recurring,
           count(*) filter (where x.contract_status = 'cancelled') as cancelled_contracts
    from public.crm_sales x where x.client_id = p_client and x.status = 'confirmed' group by x.currency),
  p as (
    select pay.currency, sum(pay.amount) as collected
    from public.crm_payments pay join public.crm_sales x on x.id = pay.sale_id
    where x.client_id = p_client and x.status = 'confirmed' and pay.status <> 'reversed' group by pay.currency),
  c as (
    select k.currency, count(*) as n, sum(k.amount) as expenses
    from public.crm_client_costs k where k.client_id = p_client group by k.currency),
  cur_keys as (select s.currency from s union select p.currency from p union select c.currency from c)
  select coalesce(jsonb_agg(jsonb_build_object(
      'currency', k.currency,
      'sales', coalesce(s.n, 0),
      'costs', coalesce(c.n, 0),
      'contracted', coalesce(s.contracted, 0)::text,
      'collected', coalesce(p.collected, 0)::text,
      'recurring_monthly', coalesce(s.recurring, 0)::text,
      'expenses', coalesce(c.expenses, 0)::text,
      'profit', (coalesce(p.collected, 0) - coalesce(c.expenses, 0))::text,
      'cancelled_contracts', coalesce(s.cancelled_contracts, 0)) order by k.currency), '[]'::jsonb)
    into cur
  from cur_keys k left join s on s.currency = k.currency left join p on p.currency = k.currency left join c on c.currency = k.currency;
  return jsonb_build_object('client_id', p_client, 'complete', true, 'source', 'sql_aggregate',
    'sales_confirmed', n_confirmed, 'sales_cancelled', n_cancelled, 'costs', n_costs, 'currencies', cur, 'as_of', now());
end $$;

revoke all on function public.crm_invoice_record(jsonb), public.crm_invoice_void(uuid, text), public.crm_payment_verify(uuid, text),
  public.crm_payment_reverse(uuid, text), public.crm_commission_agree(jsonb), public.crm_commission_transition(uuid, text, text),
  public.crm_client_finance_ledger(uuid) from public, anon;
grant execute on function public.crm_invoice_record(jsonb), public.crm_invoice_void(uuid, text), public.crm_payment_verify(uuid, text),
  public.crm_payment_reverse(uuid, text), public.crm_commission_agree(jsonb), public.crm_commission_transition(uuid, text, text),
  public.crm_client_finance_ledger(uuid) to authenticated;

-- ── 5b. A project belongs to one client: once linked it cannot be moved to a different client ─────────────────────
create function crm_private.project_client_lock() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.client_id is not null and new.client_id is distinct from old.client_id then
    raise exception 'project_client_locked' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function crm_private.project_client_lock() from public;
create trigger os_projects_client_lock before update of client_id on public.os_projects
  for each row execute function crm_private.project_client_lock();

-- ── 6. Explicit deny-all on internal tables (Security Advisor 0008: RLS enabled, no policy) ──────────────────────
-- Both were already unreachable (all privileges revoked from anon/authenticated); the restrictive policy documents it.
create policy finance_access_no_api on crm_private.finance_access as restrictive for all to anon, authenticated using (false) with check (false);
create policy crm_radar_worker_config_no_api on public.crm_radar_worker_config as restrictive for all to anon, authenticated using (false) with check (false);

commit;
