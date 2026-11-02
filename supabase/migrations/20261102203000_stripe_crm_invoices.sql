-- Avalon CRM / Stripe Sandbox invoicing ledger.
-- Pending: apply to a SEPARATE Preview database first. Never auto-run in production.
begin;

create table public.crm_stripe_invoices (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  sale_id uuid not null references public.crm_sales (id),
  client_id uuid not null references public.crm_clients (id),
  stripe_invoice_id text unique check (stripe_invoice_id is null or stripe_invoice_id ~ '^in_[A-Za-z0-9]+$'),
  stripe_customer_id text check (stripe_customer_id is null or stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency = 'USD'),
  status text not null default 'creating'
    check (status in ('creating', 'draft', 'open', 'paid', 'void', 'uncollectible', 'review')),
  hosted_invoice_url text check (hosted_invoice_url is null or hosted_invoice_url ~ '^https://invoice[.]stripe[.]com/'),
  needs_review boolean not null default false,
  review_reason text not null default '' check (length(review_reason) <= 160),
  payment_id uuid unique references public.crm_payments (id),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Only one pending invoice per sale. Paid/void invoices can be followed by new invoices for a remaining balance.
create unique index crm_stripe_invoice_one_active_per_sale on public.crm_stripe_invoices(sale_id)
  where status in ('creating', 'draft', 'open', 'uncollectible', 'review');
create index crm_stripe_invoice_client on public.crm_stripe_invoices(client_id, created_at desc);

create table public.crm_stripe_events (
  stripe_event_id text primary key check (stripe_event_id ~ '^evt_[A-Za-z0-9]+$'),
  event_type text not null check (length(event_type) between 1 and 120),
  invoice_id uuid references public.crm_stripe_invoices (id),
  handled text not null check (handled in ('processed', 'ignored', 'review')),
  created_at timestamptz not null default now()
);

alter table public.crm_stripe_invoices enable row level security;
alter table public.crm_stripe_events enable row level security;
revoke all on public.crm_stripe_invoices from anon, authenticated;
revoke all on public.crm_stripe_events from anon, authenticated;
revoke all on public.crm_stripe_invoices, public.crm_stripe_events from public;
grant select on public.crm_stripe_invoices, public.crm_stripe_events to authenticated;
grant select, insert, update on public.crm_stripe_invoices, public.crm_stripe_events to service_role;
create policy crm_stripe_invoice_owner_read on public.crm_stripe_invoices
  for select to authenticated using ((select crm_private.is_owner()));
create policy crm_stripe_event_owner_read on public.crm_stripe_events
  for select to authenticated using ((select crm_private.is_owner()));

-- Return existing reserved invoice on retries; row-lock the sale to avoid double invoicing.
create function public.crm_stripe_reserve_invoice(p_sale_id uuid)
returns table (
  id uuid, sale_id uuid, client_id uuid, amount_minor bigint,
  currency text, status text, stripe_invoice_id text, stripe_customer_id text
)
language plpgsql security definer set search_path = '' as $$
declare v_sale public.crm_sales%rowtype;
        v_pending numeric(15, 2);
        v_invoice public.crm_stripe_invoices%rowtype;
begin
  if auth.uid() is null or not crm_private.is_owner() then
    raise exception 'crm_forbidden' using errcode = '42501';
  end if;
  select * into v_sale from public.crm_sales s where s.id = p_sale_id for update;
  if not found or v_sale.status <> 'confirmed' or v_sale.contract_status = 'cancelled'
     or v_sale.currency <> 'USD' then
    raise exception 'stripe_sale_not_eligible' using errcode = '22023';
  end if;
  select * into v_invoice from public.crm_stripe_invoices i
    where i.sale_id = p_sale_id and i.status in ('creating','draft','open','uncollectible','review')
    for update;
  if found then
    return query select i.id, i.sale_id, i.client_id, i.amount_minor,
      i.currency, i.status, i.stripe_invoice_id, i.stripe_customer_id
      from public.crm_stripe_invoices i where i.id = v_invoice.id;
    return;
  end if;
  select v_sale.total - coalesce(sum(p.amount), 0) into v_pending
    from public.crm_payments p where p.sale_id = p_sale_id;
  if v_pending <= 0 or v_pending > 99999999.99 then
    raise exception 'stripe_invalid_balance' using errcode = '22023';
  end if;
  insert into public.crm_stripe_invoices(sale_id, client_id, amount_minor, currency, created_by)
    values (v_sale.id, v_sale.client_id, (v_pending * 100)::bigint, v_sale.currency, auth.uid())
    returning * into v_invoice;
  return query select i.id, i.sale_id, i.client_id, i.amount_minor,
    i.currency, i.status, i.stripe_invoice_id, i.stripe_customer_id
    from public.crm_stripe_invoices i where i.id = v_invoice.id;
end $$;
revoke all on function public.crm_stripe_reserve_invoice(uuid) from public, anon;
grant execute on function public.crm_stripe_reserve_invoice(uuid) to authenticated;

-- Records external IDs only after Stripe confirms the draft and its line item exist.
create function public.crm_stripe_attach_invoice(p_id uuid, p_stripe_invoice_id text, p_stripe_customer_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_record public.crm_stripe_invoices%rowtype;
begin
  if auth.uid() is null or not crm_private.is_owner() then
    raise exception 'crm_forbidden' using errcode = '42501';
  end if;
  if p_stripe_invoice_id !~ '^in_[A-Za-z0-9]+$'
     or p_stripe_customer_id !~ '^cus_[A-Za-z0-9]+$' then
    raise exception 'stripe_bad_external_id' using errcode = '22023';
  end if;
  select * into v_record from public.crm_stripe_invoices where id = p_id for update;
  if not found or v_record.status not in ('creating','draft')
    or (v_record.stripe_invoice_id is not null and v_record.stripe_invoice_id <> p_stripe_invoice_id)
    or (v_record.stripe_customer_id is not null and v_record.stripe_customer_id <> p_stripe_customer_id) then
    raise exception 'stripe_invoice_not_attachable' using errcode = '22023';
  end if;
  update public.crm_stripe_invoices set stripe_invoice_id = p_stripe_invoice_id,
    stripe_customer_id = p_stripe_customer_id, status = 'draft', updated_at = now()
    where id = p_id;
end $$;
revoke all on function public.crm_stripe_attach_invoice(uuid,text,text) from public, anon;
grant execute on function public.crm_stripe_attach_invoice(uuid,text,text) to authenticated;

-- Owner-confirmed "send" updates local state. The signed webhook remains authoritative for payment.
create function public.crm_stripe_mark_sent(p_id uuid, p_url text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not crm_private.is_owner() then
    raise exception 'crm_forbidden' using errcode = '42501';
  end if;
  if p_url is not null and p_url !~ '^https://invoice[.]stripe[.]com/' then
    raise exception 'stripe_invalid_url' using errcode = '22023';
  end if;
  update public.crm_stripe_invoices
     set status = 'open', hosted_invoice_url = p_url, updated_at = now()
     where id = p_id and stripe_invoice_id is not null and status in ('draft','open');
  if not found then raise exception 'stripe_not_sendable' using errcode = '22023'; end if;
end $$;
revoke all on function public.crm_stripe_mark_sent(uuid,text) from public, anon;
grant execute on function public.crm_stripe_mark_sent(uuid,text) to authenticated;

-- CRM owner stamp with a narrowly scoped, verified Stripe service receipt exception.
create or replace function crm_private.stamp() returns trigger language plpgsql security invoker set search_path='' as $$
declare stripe_insert boolean := false;
begin
  -- Only a service-role webhook may insert a Stripe cash receipt without an owner JWT.
  if tg_table_name = 'crm_payments' and tg_op = 'INSERT' then
    stripe_insert := current_setting('request.jwt.claim.role', true) = 'service_role'
      and current_setting('avalon.stripe.webhook', true) = 'verified'
      and coalesce(new.reference, '') ~ '^stripe:in_[A-Za-z0-9]+$'
      and exists (
        select 1 from public.crm_stripe_invoices i
        where i.stripe_invoice_id = substring(new.reference from 8)
          and i.sale_id = new.sale_id
          and i.created_by = new.created_by
          and i.currency = new.currency
      );
  end if;
  if not crm_private.is_owner() and not stripe_insert then
    raise exception 'CRM forbidden' using errcode='42501';
  end if;
 if TG_OP='INSERT' then
   if not stripe_insert then new.created_by := auth.uid(); end if;
   new.created_at := now(); new.version := 1;
 else
   new.id := old.id; new.agency_key := old.agency_key; new.created_by := old.created_by; new.created_at := old.created_at; new.version := old.version+1;
 end if;
 new.updated_at := clock_timestamp();
 if TG_TABLE_NAME='crm_leads' then
 if (select kind from public.crm_stages where id=new.stage_id)='lost' and length(trim(new.loss_reason))=0 then
   raise exception 'Motivo de pérdida requerido' using errcode='23514';
 end if;
 end if;
 if TG_TABLE_NAME='crm_prospects' then
   if TG_OP='UPDATE' then
     if old.status='converted' then raise exception 'Converted prospect is immutable' using errcode='23514'; end if;
   end if;
   if new.status='converted' then
     if TG_OP='INSERT' then raise exception 'Approve before conversion' using errcode='23514'; end if;
     if old.status<>'approved' then raise exception 'Approve before conversion' using errcode='23514'; end if;
   end if;
 end if;
 return new;
end $$;
revoke all on function crm_private.stamp() from public;

-- The CRM audit trigger is also invoked by every crm_payments INSERT.
-- Preserve its owner-only security rule, with the SAME narrowly verified
-- service-role exception as crm_private.stamp. The recorded actor is the
-- original sale owner; Stripe's service key is never a member.
create or replace function crm_private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  stripe_insert boolean := false;
begin
  if tg_table_name = 'crm_payments' and tg_op = 'INSERT' then
    stripe_insert := current_setting('request.jwt.claim.role', true) = 'service_role'
      and current_setting('avalon.stripe.webhook', true) = 'verified'
      and coalesce(new.reference, '') ~ '^stripe:in_[A-Za-z0-9]+$'
      and exists (
        select 1 from public.crm_stripe_invoices i
        where i.stripe_invoice_id = substring(new.reference from 8)
          and i.sale_id = new.sale_id
          and i.created_by = new.created_by
          and i.currency = new.currency
      );
    if stripe_insert then actor := new.created_by; end if;
  end if;
  if not stripe_insert and (actor is null or not exists (
    select 1 from public.agency_memberships m where m.user_id = actor and m.role = 'owner'
  )) then
    raise exception 'CRM forbidden' using errcode = '42501';
  end if;
  insert into public.crm_audit (entity,record_id,actor_id,operation,before_data,after_data)
    values (tg_table_name,new.id,actor,tg_op,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end $$;
revoke all on function crm_private.audit() from public, anon, authenticated;

-- Lock the sale before checking payments and active Stripe invoices.
-- The owner cannot manually record a payment while a payable Stripe invoice
-- remains active; signed Stripe webhook receipts are the sole exception.
create or replace function crm_private.payment_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  s public.crm_sales%rowtype;
  paid numeric;
  verified_stripe boolean := false;
begin
  select * into s from public.crm_sales where id = new.sale_id for update;
  if not found or s.status <> 'confirmed' then
    raise exception 'payment_invalid_sale' using errcode = '23514';
  end if;
  if new.currency <> s.currency then
    raise exception 'payment_currency_mismatch' using errcode = '23514';
  end if;
  select coalesce(sum(amount), 0) into paid from public.crm_payments where sale_id = new.sale_id;
  if paid + new.amount > s.total then
    raise exception 'payment_exceeds_total' using errcode = '23514';
  end if;
  verified_stripe :=
    current_setting('request.jwt.claim.role', true) = 'service_role'
    and current_setting('avalon.stripe.webhook', true) = 'verified'
    and coalesce(new.reference, '') ~ '^stripe:in_[A-Za-z0-9]+$'
    and exists (
      select 1 from public.crm_stripe_invoices i
      where i.stripe_invoice_id = substring(new.reference from 8)
        and i.sale_id = new.sale_id
        and i.created_by = new.created_by
        and i.currency = new.currency
    );
  if not verified_stripe and exists (
    select 1 from public.crm_stripe_invoices i
    where i.sale_id = new.sale_id
      and i.status in ('creating','draft','open','review','uncollectible')
  ) then
    raise exception 'payment_stripe_invoice_active' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function crm_private.payment_guard() from public, anon, authenticated;

-- This function is called ONLY after a Stripe-Signature HMAC check by the Vercel webhook.
-- Service-role-only, atomic event dedupe + payment recording in the same DB transaction.
create function public.crm_stripe_process_event(p_event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_type text := p_event ->> 'type';
  v_event_id text := p_event ->> 'id';
  v_object jsonb := p_event #> '{data,object}';
  v_stripe_invoice_id text;
  v_record public.crm_stripe_invoices%rowtype;
  v_sale_id uuid;
  v_paid_minor bigint;
  v_current_paid numeric(15,2);
  v_sale_total numeric(15,2);
  v_payment_id uuid;
  v_date date;
  v_handled text := 'processed';
  v_note text := '';
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'stripe_webhook_forbidden' using errcode = '42501';
  end if;
  if coalesce(p_event ->> 'livemode', 'true') <> 'false'
     or v_event_id is null or v_event_id !~ '^evt_[A-Za-z0-9]+$'
     or v_type is null or jsonb_typeof(v_object) <> 'object' then
    raise exception 'stripe_invalid_event' using errcode = '22023';
  end if;
  if v_type not in (
    'invoice.paid','invoice.payment_succeeded','invoice.payment_failed','invoice.finalized','invoice.sent',
    'invoice.voided','invoice.deleted','invoice.marked_uncollectible','credit_note.created',
    'charge.refunded','charge.dispute.created'
  ) then
    return jsonb_build_object('status','ignored_type');
  end if;
  insert into public.crm_stripe_events(stripe_event_id,event_type,handled)
    values (v_event_id,v_type,'processed') on conflict do nothing;
  if not found then return jsonb_build_object('status','duplicate'); end if;
  v_stripe_invoice_id := case
    when left(v_type,8) = 'invoice.' then v_object ->> 'id'
    when v_type = 'credit_note.created' then
      case when jsonb_typeof(v_object -> 'invoice') = 'string'
      then v_object ->> 'invoice' else v_object #>> '{invoice,id}' end
    else
      case when jsonb_typeof(v_object -> 'invoice') = 'string'
      then v_object ->> 'invoice' else v_object #>> '{invoice,id}' end
  end;
  if v_stripe_invoice_id is null or v_stripe_invoice_id !~ '^in_[A-Za-z0-9]+$' then
    update public.crm_stripe_events set handled = 'review' where stripe_event_id = v_event_id;
    return jsonb_build_object('status','unlinked');
  end if;
  -- Reservation locks SALE then INVOICE; webhook must use the same order.
  select i.sale_id into v_sale_id from public.crm_stripe_invoices i
    where i.stripe_invoice_id = v_stripe_invoice_id;
  if found then
    perform 1 from public.crm_sales s where s.id = v_sale_id for update;
  end if;
  select * into v_record from public.crm_stripe_invoices i
    where i.stripe_invoice_id = v_stripe_invoice_id for update;
  if not found then
    -- Stripe can deliver the webhook while the API response is being linked
    -- to a freshly reserved CRM invoice. Never acknowledge that payment as
    -- unrelated: returning 503 from the route makes Stripe retry later.
    if left(v_type, 8) = 'invoice.'
      and exists (
        select 1 from public.crm_stripe_invoices i
        where i.id = crm_private.uuid_or_null(v_object #>> '{metadata,avalon_invoice_id}')
          and i.sale_id = crm_private.uuid_or_null(v_object #>> '{metadata,avalon_sale_id}')
          and i.client_id = crm_private.uuid_or_null(v_object #>> '{metadata,avalon_client_id}')
          and i.status = 'creating' and i.stripe_invoice_id is null
      ) then
      raise exception 'stripe_invoice_pending_link' using errcode = '40001';
    end if;
    update public.crm_stripe_events set handled = 'ignored' where stripe_event_id = v_event_id;
    return jsonb_build_object('status','unrelated');
  end if;
  update public.crm_stripe_events set invoice_id = v_record.id where stripe_event_id = v_event_id;
  if v_type = 'invoice.paid' then
    -- Stripe explicitly documents that invoice.paid also fires when staff
    -- mark an invoice as paid out of band. Never record this notification
    -- as money received. A genuine Stripe payment follows with its own
    -- invoice.payment_succeeded event, which can clear this review flag.
    if v_record.payment_id is not null then
      return jsonb_build_object('status','already_recorded');
    end if;
    update public.crm_stripe_invoices
      set status = 'review', needs_review = true,
        review_reason = 'payment_source_unverified', updated_at = now()
      where id = v_record.id;
    update public.crm_stripe_events set handled = 'review' where stripe_event_id = v_event_id;
    return jsonb_build_object('status','review','reason','payment_source_unverified');
  elsif v_type = 'invoice.payment_succeeded' then
    if v_record.payment_id is not null then
      return jsonb_build_object('status','already_recorded');
    end if;
    if coalesce(v_object ->> 'status','') <> 'paid'
       or coalesce(v_object ->> 'currency','') <> lower(v_record.currency)
       or coalesce(v_object ->> 'customer','') <> v_record.stripe_customer_id
       or coalesce(v_object ->> 'livemode','true') <> 'false'
       or coalesce(v_object ->> 'amount_paid','') !~ '^\d+$' then
      v_note := 'invoice_fields_mismatch';
    else
      v_paid_minor := (v_object ->> 'amount_paid')::bigint;
      if v_paid_minor <> v_record.amount_minor then v_note := 'amount_mismatch'; end if;
    end if;
    select s.total, coalesce(sum(p.amount),0) into v_sale_total, v_current_paid
      from public.crm_sales s left join public.crm_payments p on p.sale_id = s.id
      where s.id = v_record.sale_id group by s.total;
    if v_note = '' and (v_current_paid + v_paid_minor::numeric / 100) > v_sale_total then
      v_note := 'sale_overpayment';
    end if;
    if v_note = '' then
      v_date := (to_timestamp(coalesce(nullif(p_event ->> 'created','')::bigint, extract(epoch from now())::bigint)) at time zone 'UTC')::date;
      perform set_config('avalon.stripe.webhook', 'verified', true);
      insert into public.crm_payments(sale_id,amount,currency,received_on,method,reference,created_by)
        values (v_record.sale_id,v_paid_minor::numeric/100,v_record.currency,v_date,'other',
                'stripe:' || v_record.stripe_invoice_id,v_record.created_by)
        returning id into v_payment_id;
      update public.crm_stripe_invoices set status = 'paid', payment_id = v_payment_id,
        needs_review = false, review_reason = '', updated_at = now() where id = v_record.id;
    end if;
  elsif v_type = 'invoice.sent' then
    if v_record.status in ('creating','draft','open') then
      -- A completed send notification can repair a crash between Stripe
      -- emailing the test invoice and Avalon recording its hosted URL.
      update public.crm_stripe_invoices
        set status = 'open',
            hosted_invoice_url = case
              when (v_object ->> 'hosted_invoice_url') ~ '^https://invoice[.]stripe[.]com/'
                then v_object ->> 'hosted_invoice_url'
              else hosted_invoice_url end,
            updated_at = now()
        where id = v_record.id;
    end if;
  elsif v_type = 'invoice.finalized' then
    if v_record.status in ('creating','draft','open') then
      update public.crm_stripe_invoices set status = 'open', updated_at = now()
        where id = v_record.id;
    end if;
  elsif v_type = 'invoice.payment_failed' then
    if v_record.status in ('draft','open') then
      update public.crm_stripe_invoices set status = 'open',
        needs_review = true, review_reason = 'payment_failed', updated_at = now()
        where id = v_record.id;
    end if;
  elsif v_type in ('invoice.voided', 'invoice.deleted') then
    -- A Stripe draft can be deleted before it is ever sent. Treat this as
    -- void in Avalon (rather than erasing the audit trail), so owners may
    -- create another invoice for the remaining balance.
    if v_record.payment_id is not null then v_note := 'void_after_payment'; else
      update public.crm_stripe_invoices set status = 'void',
        hosted_invoice_url = null, updated_at = now()
        where id = v_record.id;
    end if;
  elsif v_type = 'invoice.marked_uncollectible' then
    update public.crm_stripe_invoices set status = 'uncollectible',
      needs_review = true, review_reason = 'uncollectible', updated_at = now()
      where id = v_record.id;
  elsif v_type in ('credit_note.created','charge.refunded','charge.dispute.created') then
    v_note := 'refund_or_dispute_review_required';
  end if;
  if v_note <> '' then
    update public.crm_stripe_invoices set status = 'review', needs_review = true,
      review_reason = v_note, updated_at = now() where id = v_record.id;
    update public.crm_stripe_events set handled = 'review' where stripe_event_id = v_event_id;
    return jsonb_build_object('status','review','reason',v_note);
  end if;
  return jsonb_build_object('status',v_handled,'invoice_id',v_record.id);
end $$;
revoke all on function public.crm_stripe_process_event(jsonb) from public, anon, authenticated;
grant execute on function public.crm_stripe_process_event(jsonb) to service_role;

commit;
