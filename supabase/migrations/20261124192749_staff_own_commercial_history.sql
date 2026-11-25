begin;

create index crm_commissions_beneficiary_history_idx
  on public.crm_commissions (beneficiary_id, agreed_at desc, id)
  where beneficiary_id is not null;

-- Broker a narrow projection. The full CRM sales and finance tables retain their owner-only policies.
create function crm_private.staff_own_commercial_history()
returns table (
  record_kind text, record_id uuid, sale_number text, recorded_on date,
  status text, amount text, currency text, has_commission_agreement boolean
)
language sql stable security definer set search_path = '' as $$
  with caller as materialized (
    select auth.uid() as id
    where auth.uid() is not null
      and crm_private.staff_active()
      and (
        auth.jwt() ->> 'aal' = 'aal2'
        or not exists (
          select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'
        )
      )
  )
  select 'sale'::text, s.id, s.sale_number, s.sold_on, s.status, null::text, null::text,
    exists (select 1 from public.crm_commissions a
      where a.sale_id = s.id and a.beneficiary_id = u.id and a.kind = 'sale' and a.status <> 'cancelled')
  from caller u join public.crm_sales s on s.seller_id = u.id
  where s.status in ('confirmed', 'cancelled')
  union all
  select 'commission'::text, c.id, visible_sale.sale_number, (c.agreed_at at time zone 'UTC')::date,
    c.status, c.amount::text, c.currency, null::boolean
  from caller u join public.crm_commissions c on c.beneficiary_id = u.id
  left join public.crm_sales visible_sale on visible_sale.id = c.sale_id and visible_sale.seller_id = u.id
$$;

revoke all on function crm_private.staff_own_commercial_history() from public, anon, authenticated;
grant execute on function crm_private.staff_own_commercial_history() to authenticated;

create function public.staff_own_commercial_history(p_page integer default 0)
returns table (
  record_kind text, record_id uuid, sale_number text, recorded_on date,
  status text, amount text, currency text, has_commission_agreement boolean
)
language sql stable security invoker set search_path = '' as $$
  select h.* from crm_private.staff_own_commercial_history() h
  order by h.recorded_on desc, h.record_id, h.record_kind
  offset least(99999, greatest(0, p_page)) * 25 limit 26
$$;

revoke all on function public.staff_own_commercial_history(integer) from public, anon, authenticated;
grant execute on function public.staff_own_commercial_history(integer) to authenticated;

commit;
