-- REVIEW ONLY until isolated database + RLS/browser tests pass. No production execution from this PR.
-- Revenue owed TO Avalon, distinct from crm_commissions (payouts BY Avalon).
create table public.crm_attributed_conversions (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  client_id uuid not null references public.crm_clients(id),
  terms_id uuid not null references public.crm_commercial_terms(id),
  contract_id uuid not null references public.crm_contracts(id),
  source text not null check (length(btrim(source)) between 3 and 120),
  external_ref text not null check (length(btrim(external_ref)) between 3 and 160),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  gross_collected numeric(15,2) not null check (gross_collected > 0),
  excluded_amount numeric(15,2) not null default 0 check (excluded_amount >= 0 and excluded_amount < gross_collected),
  rate_pct numeric(5,2) not null check (rate_pct > 0 and rate_pct <= 100),
  commission_due numeric(15,2) generated always as
    (round((gross_collected - excluded_amount) * rate_pct / 100, 2)) stored,
  status text not null default 'reported' check (status in ('reported','verified','paid','void')),
  verification_ref text not null default '' check (length(verification_ref) <= 250),
  settlement_ref text not null default '' check (length(settlement_ref) <= 250),
  void_reason text not null default '' check (length(void_reason) <= 500),
  created_by uuid not null references auth.users(id),
  verified_by uuid references auth.users(id),
  paid_by uuid references auth.users(id),
  voided_by uuid references auth.users(id),
  verified_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (client_id,external_ref),
  check (status <> 'verified' or (verified_at is not null and length(btrim(verification_ref)) >= 3)),
  check (status <> 'paid' or (verified_at is not null and paid_at is not null and length(btrim(settlement_ref)) >= 3)),
  check (status <> 'void' or (voided_at is not null and length(btrim(void_reason)) >= 5))
);
create index crm_attributed_conversions_client_created on public.crm_attributed_conversions (client_id, created_at desc);
alter table public.crm_attributed_conversions enable row level security;
revoke all on public.crm_attributed_conversions from anon, authenticated, public;
grant select on public.crm_attributed_conversions to authenticated;
create policy crm_attribution_finance_read on public.crm_attributed_conversions for select to authenticated
  using ((select crm_private.is_owner()) and (select crm_private.can_view_client_finances()));

create function public.crm_attribution_record(request jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cl public.crm_clients; term public.crm_commercial_terms; signed public.crm_contracts;
  amt numeric(15,2); excluded numeric(15,2); v_id uuid; v_ref text; v_source text;
begin
  if auth.uid() is null or not crm_private.is_owner() or not crm_private.can_view_client_finances() then
    raise exception 'finance_forbidden' using errcode='42501';
  end if;
  select * into cl from public.crm_clients where id=(request->>'client_id')::uuid;
  if not found or cl.origin_lead_id is null then raise exception 'client_lead_required' using errcode='23514'; end if;
  select * into term from public.crm_commercial_terms
    where lead_id=cl.origin_lead_id and kind='agreed' for share;
  if not found or term.billing_model not in ('commission','hybrid') or term.commission_pct is null
    or term.commission_pct <= 0 or term.commission_approved_by is null
    or term.commission_base <> 'gross_revenue' then
    raise exception 'approved_revenue_commission_required' using errcode='23514';
  end if;
  select * into signed from public.crm_contracts
    where lead_id=cl.origin_lead_id and terms_id=term.id and status='verified_signed'
    order by verified_at desc limit 1;
  if not found or signed.verified_at is null or term.updated_at > signed.verified_at then
    raise exception 'signed_current_terms_required' using errcode='23514';
  end if;
  begin
    amt := (request->>'gross_collected')::numeric(15,2);
    excluded := coalesce((request->>'excluded_amount')::numeric(15,2),0);
  exception when others then raise exception 'amount_invalid' using errcode='22023'; end;
  v_ref := btrim(coalesce(request->>'external_ref',''));
  v_source := btrim(coalesce(request->>'source',''));
  if amt is null or amt <= 0 or excluded < 0 or excluded >= amt or
      length(v_ref) not between 3 and 160 or length(v_source) not between 3 and 120 then
    raise exception 'conversion_invalid' using errcode='22023';
  end if;
  insert into public.crm_attributed_conversions (
    client_id,terms_id,contract_id,source,external_ref,currency,gross_collected,
    excluded_amount,rate_pct,created_by
  ) values (
    cl.id,term.id,signed.id,v_source,v_ref,term.currency,amt,excluded,term.commission_pct,auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

create function public.crm_attribution_transition(p_conversion uuid,p_to text,p_evidence text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.crm_attributed_conversions; note text := btrim(coalesce(p_evidence,''));
begin
  if auth.uid() is null or not crm_private.is_owner() or not crm_private.can_view_client_finances() then
    raise exception 'finance_forbidden' using errcode='42501';
  end if;
  select * into c from public.crm_attributed_conversions where id=p_conversion for update;
  if not found then raise exception 'conversion_not_found' using errcode='P0002'; end if;
  if length(note) < 3 or length(note) > 250 then
    raise exception 'evidence_required' using errcode='22023';
  end if;
  if p_to='verified' and c.status='reported' then
    update public.crm_attributed_conversions set status='verified',verified_at=now(),
      verification_ref=note,verified_by=auth.uid() where id=c.id;
  elsif p_to='paid' and c.status='verified' then
    update public.crm_attributed_conversions set status='paid',paid_at=now(),
      settlement_ref=note,paid_by=auth.uid() where id=c.id;
  elsif p_to='void' and c.status in ('reported','verified') and length(note)>=5 then
    update public.crm_attributed_conversions set status='void',voided_at=now(),
      void_reason=note,voided_by=auth.uid() where id=c.id;
  else
    raise exception 'invalid_conversion_transition' using errcode='23514';
  end if;
end $$;

create function public.crm_attribution_summary(p_client uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not crm_private.is_owner() or not crm_private.can_view_client_finances() then
    raise exception 'finance_forbidden' using errcode='42501';
  end if;
  -- Group by recorded currency; never mix USD/EUR or silently use the client's latest currency.
  select jsonb_build_object('currencies',coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb))
  into result from (
    select currency,
      count(*)::integer as count,
      count(*) filter (where status='reported')::integer as reported_count,
      coalesce(sum(commission_due) filter (where status in ('verified','paid')),0)::text as eligible,
      coalesce(sum(commission_due) filter (where status='paid'),0)::text as paid,
      coalesce(sum(commission_due) filter (where status='verified'),0)::text as pending
    from public.crm_attributed_conversions
    where client_id=p_client group by currency
  ) t;
  return result;
end $$;

revoke all on function public.crm_attribution_record(jsonb),
  public.crm_attribution_transition(uuid,text,text),
  public.crm_attribution_summary(uuid) from public,anon;
grant execute on function public.crm_attribution_record(jsonb),
  public.crm_attribution_transition(uuid,text,text),
  public.crm_attribution_summary(uuid) to authenticated;
