-- Avalon OS · V5 Phase 5. Commission receivable lifecycle (money owed TO Avalon). ADDITIVE ONLY.
-- REVIEW ONLY until an owner explicitly authorizes applying it to production.
--
-- crm_attributed_conversions (20261119150000) already separates commissions owed TO Avalon from crm_commissions
-- (payouts BY Avalon) and computes commission_due = round((gross_collected - excluded_amount) * rate_pct / 100, 2)
-- only for approved, verified-signed revenue-share terms. It had four states (reported/verified/paid/void).
-- This adds the evidence-backed steps owners asked for, each with its own reference, actor and time:
--
--   reported ─► client_paid_verified ─► attribution_verified ─► eligible ─► invoiced ─► paid
--      └──────────────┴──────────────────────┴───────────────────┴───────────┴─► disputed ─► (back to the step
--                                                                                   it came from, or void)
--   any step before paid ─► void (reason ≥ 5 chars).  `paid` is final: corrections are a new, separate record.
--
-- Rules kept: a reported customer sale is NOT Avalon revenue; a calculated commission is NOT collected; only `paid`
-- counts as cash received by Avalon. Legacy rows in `verified` keep working (treated as eligible) and the legacy
-- crm_attribution_transition RPC is unchanged. Every transition is appended to crm_attribution_events and bumps
-- `version` (optimistic concurrency: a stale screen cannot overwrite a newer decision).

begin;

alter table public.crm_attributed_conversions
  add column client_payment_ref text not null default '' check (length(client_payment_ref) <= 250),
  add column client_payment_verified_at timestamptz,
  add column client_payment_verified_by uuid references auth.users(id),
  add column attribution_ref text not null default '' check (length(attribution_ref) <= 250),
  add column attribution_verified_at timestamptz,
  add column attribution_verified_by uuid references auth.users(id),
  add column eligible_at timestamptz,
  add column invoice_ref text not null default '' check (length(invoice_ref) <= 250),
  add column invoiced_at timestamptz,
  add column invoiced_by uuid references auth.users(id),
  add column dispute_reason text not null default '' check (length(dispute_reason) <= 500),
  add column disputed_at timestamptz,
  add column disputed_from text,
  add column period_start date,
  add column period_end date,
  add column version integer not null default 1 check (version >= 1);

alter table public.crm_attributed_conversions drop constraint crm_attributed_conversions_status_check;
alter table public.crm_attributed_conversions
  add constraint crm_attributed_conversions_status_check check (status in
    ('reported','client_paid_verified','attribution_verified','eligible','verified','invoiced','paid','disputed','void')),
  add constraint crm_attribution_period check (period_end is null or period_start is null or period_end >= period_start),
  add constraint crm_attribution_client_paid_evidence check (status not in ('client_paid_verified','attribution_verified','eligible','invoiced')
    or (client_payment_verified_at is not null and length(btrim(client_payment_ref)) >= 3)),
  add constraint crm_attribution_attribution_evidence check (status not in ('attribution_verified','eligible','invoiced')
    or (attribution_verified_at is not null and length(btrim(attribution_ref)) >= 3)),
  add constraint crm_attribution_invoice_evidence check (status <> 'invoiced' or (invoiced_at is not null and length(btrim(invoice_ref)) >= 3)),
  add constraint crm_attribution_dispute_evidence check (status <> 'disputed'
    or (disputed_at is not null and length(btrim(dispute_reason)) >= 5 and disputed_from is not null));

-- Append-only decision history (who, when, from → to, evidence). Readable by finance owners; written only by RPC.
create table public.crm_attribution_events (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  conversion_id uuid not null references public.crm_attributed_conversions(id),
  from_status text not null,
  to_status text not null,
  evidence text not null check (length(evidence) between 3 and 500),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index crm_attribution_events_conversion on public.crm_attribution_events (conversion_id, created_at desc);
create index crm_attribution_events_actor on public.crm_attribution_events (actor_id);
alter table public.crm_attribution_events enable row level security;
revoke all on public.crm_attribution_events from anon, authenticated, public;
grant select on public.crm_attribution_events to authenticated;
create policy crm_attribution_events_finance_read on public.crm_attribution_events for select to authenticated
  using ((select crm_private.is_owner()) and (select crm_private.can_view_client_finances()));

create function public.crm_attribution_advance(p_conversion uuid, p_to text, p_evidence text, p_expected_version integer)
returns integer
language plpgsql security definer set search_path = '' as $$
declare c public.crm_attributed_conversions; note text := btrim(coalesce(p_evidence, '')); v_from text;
begin
  if auth.uid() is null or not crm_private.is_owner() or not crm_private.can_view_client_finances() then
    raise exception 'finance_forbidden' using errcode = '42501';
  end if;
  select * into c from public.crm_attributed_conversions where id = p_conversion for update;
  if not found then raise exception 'conversion_not_found' using errcode = 'P0002'; end if;
  if p_expected_version is null or p_expected_version <> c.version then
    raise exception 'conversion_version_conflict' using errcode = '40001';
  end if;
  if length(note) < 3 or length(note) > 250 or (p_to in ('void', 'disputed') and length(note) < 5) then
    raise exception 'evidence_required' using errcode = '22023';
  end if;
  v_from := c.status;
  if p_to = 'client_paid_verified' and c.status = 'reported' then
    update public.crm_attributed_conversions set status = p_to, client_payment_ref = note,
      client_payment_verified_at = now(), client_payment_verified_by = auth.uid(), version = version + 1 where id = c.id;
  elsif p_to = 'attribution_verified' and c.status = 'client_paid_verified' then
    update public.crm_attributed_conversions set status = p_to, attribution_ref = note,
      attribution_verified_at = now(), attribution_verified_by = auth.uid(), version = version + 1 where id = c.id;
  elsif p_to = 'eligible' and c.status = 'attribution_verified' then
    -- verified_at / verification_ref keep the legacy `paid` constraint and legacy readers consistent.
    update public.crm_attributed_conversions set status = p_to, eligible_at = now(), verified_at = now(),
      verification_ref = left(c.attribution_ref, 250), verified_by = auth.uid(), version = version + 1 where id = c.id;
  elsif p_to = 'invoiced' and c.status in ('eligible', 'verified') then
    update public.crm_attributed_conversions set status = p_to, invoice_ref = note, invoiced_at = now(),
      invoiced_by = auth.uid(), version = version + 1 where id = c.id;
  elsif p_to = 'paid' and c.status in ('invoiced', 'eligible', 'verified') then
    update public.crm_attributed_conversions set status = p_to, settlement_ref = note, paid_at = now(),
      paid_by = auth.uid(), version = version + 1 where id = c.id;
  elsif p_to = 'disputed' and c.status in ('reported', 'client_paid_verified', 'attribution_verified', 'eligible', 'verified', 'invoiced') then
    update public.crm_attributed_conversions set status = p_to, dispute_reason = note, disputed_at = now(),
      disputed_from = c.status, version = version + 1 where id = c.id;
  elsif c.status = 'disputed' and p_to = c.disputed_from then
    -- Resolution returns to exactly the step it was disputed from; the dispute stays in the event history.
    update public.crm_attributed_conversions set status = p_to, disputed_from = null, version = version + 1 where id = c.id;
  elsif p_to = 'void' and c.status not in ('paid', 'void') then
    update public.crm_attributed_conversions set status = 'void', void_reason = note, voided_at = now(),
      voided_by = auth.uid(), version = version + 1 where id = c.id;
  else
    raise exception 'invalid_conversion_transition' using errcode = '23514';
  end if;
  insert into public.crm_attribution_events (conversion_id, from_status, to_status, evidence, actor_id)
    values (c.id, v_from, p_to, note, auth.uid());
  return c.version + 1;
end $$;

-- Period covered by a reported result (e.g. the month of the customer's job). Only while still `reported`.
create function public.crm_attribution_set_period(p_conversion uuid, p_start date, p_end date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not crm_private.is_owner() or not crm_private.can_view_client_finances() then
    raise exception 'finance_forbidden' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'conversion_invalid' using errcode = '22023'; end if;
  update public.crm_attributed_conversions set period_start = p_start, period_end = p_end, version = version + 1
    where id = p_conversion and status = 'reported';
  if not found then raise exception 'invalid_conversion_transition' using errcode = '23514'; end if;
end $$;

-- Summary by currency. `eligible` = owed to Avalon after verification (eligible/invoiced/paid + legacy verified);
-- `pending` = eligible but not yet collected; `paid` = collected by Avalon. Unverified and disputed amounts are
-- reported separately and never added to eligible or paid. Customer sales (gross_collected) are never Avalon revenue.
create or replace function public.crm_attribution_summary(p_client uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not crm_private.is_owner() or not crm_private.can_view_client_finances() then
    raise exception 'finance_forbidden' using errcode = '42501';
  end if;
  select jsonb_build_object('currencies', coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb))
  into result from (
    select currency,
      count(*)::integer as count,
      count(*) filter (where status in ('reported', 'client_paid_verified', 'attribution_verified'))::integer as reported_count,
      count(*) filter (where status = 'disputed')::integer as disputed_count,
      coalesce(sum(commission_due) filter (where status in ('reported', 'client_paid_verified', 'attribution_verified')), 0)::text as unverified,
      coalesce(sum(commission_due) filter (where status in ('eligible', 'verified', 'invoiced', 'paid')), 0)::text as eligible,
      coalesce(sum(commission_due) filter (where status = 'invoiced'), 0)::text as invoiced,
      coalesce(sum(commission_due) filter (where status = 'paid'), 0)::text as paid,
      coalesce(sum(commission_due) filter (where status in ('eligible', 'verified', 'invoiced')), 0)::text as pending,
      coalesce(sum(commission_due) filter (where status = 'disputed'), 0)::text as disputed
    from public.crm_attributed_conversions
    where client_id = p_client group by currency
  ) t;
  return result;
end $$;

revoke all on function public.crm_attribution_advance(uuid, text, text, integer),
  public.crm_attribution_set_period(uuid, date, date) from public, anon;
grant execute on function public.crm_attribution_advance(uuid, text, text, integer),
  public.crm_attribution_set_period(uuid, date, date) to authenticated;

commit;
