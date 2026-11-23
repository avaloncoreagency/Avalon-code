-- Avalon Sales Pro — typed payment schedule, refunds/chargebacks and receivables. ADDITIVE. REVIEW ONLY until approved.
--
-- Builds on: avalon_sales_core (crm_sales, crm_payments + payment_guard), crm_core_engine (recorded → verified →
-- reversed payments, invoices, commissions) and PR #323 (agreed payment terms kept in crm_sales.notes as an
-- illustrative plan). #323 states that a typed receivables schedule needs a reviewed migration: this is it.
--
-- What it adds, and the rules it enforces in the database (not only in the UI):
--   * crm_sale_installments: deposit / installment / balance / milestone / recurring rows with a due date and amount.
--     The live schedule of a sale always sums EXACTLY to the sale total. Rescheduling never edits or removes an
--     installment that already has money allocated; replaced rows are cancelled with a reason, never deleted.
--   * crm_payments.installment_id: a receipt can be allocated to one installment, never above its remaining amount.
--   * crm_payments.method: + ach, wire, zelle, check, paypal, payment_link, financing_external. These are MANUAL
--     receipt channels; no processor (Stripe or other) is connected and nothing here charges anyone.
--   * crm_payment_refunds: refunds and chargebacks against VERIFIED payments, idempotent, never above the payment.
--     Chargebacks stay `open` until resolved `won` (money returned) or `lost`. A refunded payment cannot be reversed.
--   * crm_sale_receivables (security_invoker view): per sale contracted / recorded / verified / refunded / balance /
--     overdue / next due, for lists, filters and KPIs.
-- Finite money: every new numeric column rejects NaN/±Infinity explicitly (see 20261123140000).

begin;

-- ── Manual receipt channels ───────────────────────────────────────────────────────────────────────────────────────
alter table public.crm_payments drop constraint if exists crm_payments_method_check;
alter table public.crm_payments add constraint crm_payments_method_check check (method in
  ('transfer', 'card', 'cash', 'other', 'ach', 'wire', 'zelle', 'check', 'paypal', 'payment_link', 'financing_external'));

-- ── Schedule ──────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.crm_sales add column if not exists schedule_version integer not null default 0 check (schedule_version >= 0);

create table public.crm_sale_installments (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  sale_id uuid not null references public.crm_sales (id),
  seq integer not null check (seq between 1 and 500),
  kind text not null check (kind in ('deposit', 'installment', 'balance', 'milestone', 'recurring')),
  label text not null default '' check (length(label) <= 200),
  due_on date not null,
  amount numeric(15, 2) not null check (amount > 0 and amount not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  cancel_reason text not null default '' check (length(cancel_reason) <= 500),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  check (status = 'scheduled' or (cancelled_at is not null and cancelled_by is not null and length(btrim(cancel_reason)) >= 5))
);
create unique index crm_sale_installments_live_seq on public.crm_sale_installments (sale_id, seq);
create index crm_sale_installments_due on public.crm_sale_installments (due_on) where status = 'scheduled';
create index crm_sale_installments_created_by on public.crm_sale_installments (created_by);
create index crm_sale_installments_cancelled_by on public.crm_sale_installments (cancelled_by) where cancelled_by is not null;

alter table public.crm_payments add column if not exists installment_id uuid references public.crm_sale_installments (id);
create index if not exists crm_payments_installment on public.crm_payments (installment_id) where installment_id is not null;

-- ── Refunds and chargebacks ───────────────────────────────────────────────────────────────────────────────────────
create table public.crm_payment_refunds (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  idempotency_key uuid not null unique,
  payment_id uuid not null references public.crm_payments (id),
  sale_id uuid not null references public.crm_sales (id),
  kind text not null check (kind in ('refund', 'chargeback')),
  amount numeric(15, 2) not null check (amount > 0 and amount not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  occurred_on date not null,
  reason text not null check (length(btrim(reason)) between 5 and 500),
  reference text not null default '' check (length(reference) <= 120),
  resolution text check (resolution in ('open', 'won', 'lost')),
  resolution_note text not null default '' check (length(resolution_note) <= 500),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  -- Refunds have no resolution; chargebacks start open and record who resolved them and why.
  check ((kind = 'refund' and resolution is null) or (kind = 'chargeback' and resolution is not null)),
  check (resolution is distinct from 'won' and resolution is distinct from 'lost'
         or (resolved_at is not null and resolved_by is not null and length(btrim(resolution_note)) >= 5))
);
create index crm_payment_refunds_payment on public.crm_payment_refunds (payment_id);
create index crm_payment_refunds_sale on public.crm_payment_refunds (sale_id);
create index crm_payment_refunds_created_by on public.crm_payment_refunds (created_by);
create index crm_payment_refunds_resolved_by on public.crm_payment_refunds (resolved_by) where resolved_by is not null;

-- ── RLS: finance owners read; nobody writes directly (RPC only) ──────────────────────────────────────────────────
alter table public.crm_sale_installments enable row level security;
alter table public.crm_payment_refunds enable row level security;
revoke all on public.crm_sale_installments, public.crm_payment_refunds from anon, authenticated, public;
grant select on public.crm_sale_installments, public.crm_payment_refunds to authenticated;
create policy crm_sale_installments_finance_read on public.crm_sale_installments for select to authenticated
  using ((select crm_private.is_owner()) and (select crm_private.can_view_client_finances()));
create policy crm_payment_refunds_finance_read on public.crm_payment_refunds for select to authenticated
  using ((select crm_private.is_owner()) and (select crm_private.can_view_client_finances()));

-- Installment lookup for the payment guard, independent of the caller's finance-read RLS (same pattern as
-- crm_private.invoice_link). Owners only; returns nothing otherwise.
create function crm_private.installment_state(p_installment uuid)
returns table (sale_id uuid, status text, currency text, amount numeric, allocated numeric)
language sql stable security definer set search_path = '' as $$
  select i.sale_id, i.status, i.currency, i.amount,
    coalesce((select sum(p.amount) from public.crm_payments p where p.installment_id = i.id and p.status <> 'reversed'), 0)
  from public.crm_sale_installments i where i.id = p_installment and crm_private.is_owner()
$$;
revoke all on function crm_private.installment_state(uuid) from public, anon;
grant execute on function crm_private.installment_state(uuid) to authenticated;

-- Same guard as 20261117155716 plus the installment allocation rule. The sale row lock serialises receipts per sale.
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
  if paid + new.amount > s.total then raise exception 'payment_exceeds_total' using errcode = '23514'; end if;
  return new;
end $$;

-- Replace the live schedule of a confirmed sale. Installments that already hold money are kept as they are; every
-- other live installment is cancelled (with the reason) and the new items are appended. The live schedule must then
-- sum exactly to the sale total. Optimistic concurrency through crm_sales.schedule_version.
create function public.crm_sale_schedule_set(p_sale uuid, p_items jsonb, p_expected_version integer, p_reason text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare s public.crm_sales; item jsonb; n integer := 0; v_kind text; v_due date; v_amt numeric; v_label text;
  locked_sum numeric; new_sum numeric := 0; v_seq integer; had_live boolean; reason text := btrim(coalesce(p_reason, ''));
begin
  if auth.uid() is null or not crm_private.is_owner() or not crm_private.can_view_client_finances() then
    raise exception 'finance_forbidden' using errcode = '42501';
  end if;
  select * into s from public.crm_sales where id = p_sale for update;
  if not found then raise exception 'sale_not_found' using errcode = 'P0002'; end if;
  if s.status <> 'confirmed' then raise exception 'schedule_invalid_sale' using errcode = '23514'; end if;
  if p_expected_version is null or p_expected_version <> s.schedule_version then
    raise exception 'schedule_version_conflict' using errcode = '40001';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 60 then raise exception 'schedule_invalid' using errcode = '22023'; end if;
  select exists (select 1 from public.crm_sale_installments where sale_id = s.id and status = 'scheduled') into had_live;
  if had_live and length(reason) < 5 then raise exception 'schedule_reason_required' using errcode = '22023'; end if;

  -- Validate every new item before touching anything.
  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item) <> 'object' then raise exception 'schedule_invalid' using errcode = '22023'; end if;
    v_kind := item ->> 'kind';
    if v_kind not in ('deposit', 'installment', 'balance', 'milestone', 'recurring') then raise exception 'schedule_invalid' using errcode = '22023'; end if;
    begin v_due := (item ->> 'due_on')::date; exception when others then raise exception 'schedule_invalid_date' using errcode = '22023'; end;
    if v_due is null or v_due < s.sold_on or v_due > s.sold_on + 3660 then raise exception 'schedule_invalid_date' using errcode = '22023'; end if;
    v_amt := crm_private.amount(item ->> 'amount', null);
    if v_amt is null or v_amt <= 0 then raise exception 'schedule_invalid_amount' using errcode = '22023'; end if;
    if length(coalesce(item ->> 'label', '')) > 200 then raise exception 'schedule_invalid' using errcode = '22023'; end if;
    new_sum := new_sum + v_amt;
  end loop;

  select coalesce(sum(i.amount), 0) into locked_sum from public.crm_sale_installments i
    where i.sale_id = s.id and i.status = 'scheduled'
      and exists (select 1 from public.crm_payments p where p.installment_id = i.id and p.status <> 'reversed');
  if jsonb_array_length(p_items) > 0 or locked_sum > 0 then
    if locked_sum + new_sum <> s.total then raise exception 'schedule_total_mismatch' using errcode = '23514'; end if;
  end if;

  update public.crm_sale_installments i set status = 'cancelled', cancel_reason = left(reason, 500), cancelled_at = now(), cancelled_by = auth.uid()
    where i.sale_id = s.id and i.status = 'scheduled'
      and not exists (select 1 from public.crm_payments p where p.installment_id = i.id and p.status <> 'reversed');

  select coalesce(max(seq), 0) into v_seq from public.crm_sale_installments where sale_id = s.id;
  for item in select value from jsonb_array_elements(p_items) order by (value ->> 'due_on')::date, value ->> 'kind' loop
    v_seq := v_seq + 1; n := n + 1;
    v_label := btrim(coalesce(item ->> 'label', ''));
    insert into public.crm_sale_installments (sale_id, seq, kind, label, due_on, amount, currency)
      values (s.id, v_seq, item ->> 'kind', v_label, (item ->> 'due_on')::date, crm_private.amount(item ->> 'amount', null), s.currency);
  end loop;
  update public.crm_sales set schedule_version = schedule_version + 1, updated_at = now() where id = s.id;
  perform crm_private.log('sale.schedule_set', 'sales', 'crm_sales', s.id, client_id => s.client_id, sale_id => s.id,
    to_state => n::text || ' installments', detail => left(coalesce(nullif(reason, ''), 'Calendario inicial'), 200), source => 'app');
  return s.schedule_version + 1;
end $$;

-- Refund or chargeback against a VERIFIED payment (money that actually arrived). Idempotent by key.
create function public.crm_payment_refund(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pay public.crm_payments; s public.crm_sales; r public.crm_payment_refunds; v_key uuid; v_amt numeric; v_kind text;
  v_on date; v_reason text := btrim(coalesce(request ->> 'reason', '')); v_ref text := btrim(coalesce(request ->> 'reference', ''));
  already numeric;
begin
  if auth.uid() is null or not crm_private.is_owner() or not crm_private.can_view_client_finances() then
    raise exception 'finance_forbidden' using errcode = '42501';
  end if;
  begin v_key := (request ->> 'idempotency_key')::uuid; exception when others then raise exception 'refund_invalid' using errcode = '22023'; end;
  v_kind := request ->> 'kind';
  if v_key is null or v_kind not in ('refund', 'chargeback') or length(v_reason) < 5 or length(v_reason) > 500 or length(v_ref) > 120 then
    raise exception 'refund_invalid' using errcode = '22023';
  end if;
  v_amt := crm_private.amount(request ->> 'amount', null);
  if v_amt is null or v_amt <= 0 then raise exception 'refund_invalid_amount' using errcode = '22023'; end if;
  begin v_on := coalesce((request ->> 'occurred_on')::date, current_date); exception when others then raise exception 'refund_invalid' using errcode = '22023'; end;

  select * into r from public.crm_payment_refunds where idempotency_key = v_key;
  if found then
    if r.payment_id::text <> request ->> 'payment_id' or r.amount <> v_amt or r.kind <> v_kind then
      raise exception 'refund_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('refund_id', r.id, 'replayed', true);
  end if;

  select * into pay from public.crm_payments where id = (request ->> 'payment_id')::uuid for update;
  if not found then raise exception 'payment_not_found' using errcode = 'P0002'; end if;
  if pay.status <> 'verified' then raise exception 'refund_requires_verified_payment' using errcode = '23514'; end if;
  if v_on < pay.received_on then raise exception 'refund_invalid' using errcode = '22023'; end if;
  select coalesce(sum(amount), 0) into already from public.crm_payment_refunds
    where payment_id = pay.id and (kind = 'refund' or resolution in ('open', 'lost'));
  if already + v_amt > pay.amount then raise exception 'refund_exceeds_payment' using errcode = '23514'; end if;
  select * into s from public.crm_sales where id = pay.sale_id;
  insert into public.crm_payment_refunds (idempotency_key, payment_id, sale_id, kind, amount, currency, occurred_on, reason, reference, resolution)
    values (v_key, pay.id, pay.sale_id, v_kind, v_amt, pay.currency, v_on, v_reason, v_ref, case when v_kind = 'chargeback' then 'open' end)
    returning * into r;
  perform crm_private.log(case when v_kind = 'refund' then 'payment.refunded' else 'payment.chargeback' end, 'sales', 'crm_payments', pay.id,
    client_id => s.client_id, sale_id => s.id, to_state => v_kind, detail => pay.currency || ' ' || v_amt || ' · ' || left(v_reason, 150), source => 'app');
  return jsonb_build_object('refund_id', r.id, 'replayed', false);
end $$;

create function public.crm_chargeback_resolve(p_refund uuid, p_outcome text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.crm_payment_refunds; s public.crm_sales; note text := btrim(coalesce(p_note, ''));
begin
  if auth.uid() is null or not crm_private.is_owner() or not crm_private.can_view_client_finances() then
    raise exception 'finance_forbidden' using errcode = '42501';
  end if;
  if p_outcome not in ('won', 'lost') or length(note) < 5 or length(note) > 500 then raise exception 'chargeback_invalid' using errcode = '22023'; end if;
  select * into r from public.crm_payment_refunds where id = p_refund for update;
  if not found then raise exception 'chargeback_not_found' using errcode = 'P0002'; end if;
  if r.kind <> 'chargeback' or r.resolution <> 'open' then raise exception 'chargeback_not_open' using errcode = '23514'; end if;
  update public.crm_payment_refunds set resolution = p_outcome, resolution_note = note, resolved_at = now(), resolved_by = auth.uid() where id = r.id;
  select * into s from public.crm_sales where id = r.sale_id;
  perform crm_private.log('payment.chargeback_' || p_outcome, 'sales', 'crm_payments', r.payment_id, client_id => s.client_id, sale_id => s.id,
    from_state => 'open', to_state => p_outcome, detail => left(note, 200), source => 'app');
end $$;

-- Same function as 20261117155716, plus: a payment with refunds or chargebacks cannot be "reversed" as a capture
-- error (that would erase money that really moved). Correct it with the refund history instead.
create or replace function public.crm_payment_reverse(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare pay public.crm_payments; s public.crm_sales;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'reversal_reason_required' using errcode = '22023'; end if;
  select * into pay from public.crm_payments where id = p_payment for update;
  if not found then raise exception 'payment_not_found' using errcode = 'P0002'; end if;
  if pay.status = 'reversed' then return; end if;
  if exists (select 1 from public.crm_payment_refunds where payment_id = pay.id) then
    raise exception 'payment_has_refunds' using errcode = '23514';
  end if;
  update public.crm_payments set status = 'reversed', reversal_reason = left(btrim(p_reason), 500), reversed_by = auth.uid(),
    reversed_at = now(), updated_at = now(), version = version + 1 where id = pay.id;
  select * into s from public.crm_sales where id = pay.sale_id;
  perform crm_private.log('payment.reversed', 'sales', 'crm_payments', pay.id, client_id => s.client_id, sale_id => s.id,
    from_state => pay.status, to_state => 'reversed', detail => left(btrim(p_reason), 200), source => 'app');
end $$;

-- Per-sale receivables (RLS of the caller applies: security_invoker). Amounts in the sale currency.
--   recorded  = receipts not reversed;  verified = receipts verified;  refunded = refunds + chargebacks open/lost
--   net_collected = recorded − refunded;  balance = total − net_collected
--   overdue = live installments past due whose amount is not covered (explicit allocations first, then unallocated
--             receipts in due-date order).
create view public.crm_sale_receivables with (security_invoker = true) as
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
)
select s.id as sale_id, s.client_id, s.currency, s.total,
  coalesce(pay.recorded, 0) as recorded, coalesce(pay.verified, 0) as verified, coalesce(ref.refunded, 0) as refunded,
  coalesce(pay.recorded, 0) - coalesce(ref.refunded, 0) as net_collected,
  s.total - (coalesce(pay.recorded, 0) - coalesce(ref.refunded, 0)) as balance,
  coalesce((select sum(st.uncovered) from state st where st.sale_id = s.id and st.due_on < current_date), 0) as overdue,
  (select min(st.due_on) from state st where st.sale_id = s.id and st.uncovered > 0 and st.due_on >= current_date) as next_due,
  (select count(*) from ins where ins.sale_id = s.id)::integer as installments,
  coalesce(ref.open_chargebacks, 0)::integer as open_chargebacks
from public.crm_sales s
left join pay on pay.sale_id = s.id
left join ref on ref.sale_id = s.id;
revoke all on public.crm_sale_receivables from anon, public;
grant select on public.crm_sale_receivables to authenticated;

revoke all on function public.crm_sale_schedule_set(uuid, jsonb, integer, text), public.crm_payment_refund(jsonb),
  public.crm_chargeback_resolve(uuid, text, text) from public, anon;
grant execute on function public.crm_sale_schedule_set(uuid, jsonb, integer, text), public.crm_payment_refund(jsonb),
  public.crm_chargeback_resolve(uuid, text, text) to authenticated;

commit;
