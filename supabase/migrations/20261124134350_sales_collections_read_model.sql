begin;

-- The existing finance view remains the source for balance and overdue amounts.
-- Returning the sales relation keeps its RLS, foreign-key embeds and other list filters.
create function public.crm_sales_with_receivables(p_payment text)
returns setof public.crm_sales
language sql stable security invoker
as $$
  select s.*
  from public.crm_sales s
  join public.crm_sale_receivables r on r.sale_id = s.id
  where (select crm_private.can_view_client_finances())
    and case p_payment
      when 'open' then r.balance > 0
      when 'overdue' then r.overdue > 0
      else false
    end
$$;

create function public.crm_overdue_collection_metrics()
returns table (currency text, overdue_amount numeric, sales bigint)
language sql stable security invoker
as $$
  select r.currency, sum(r.overdue), count(*)
  from public.crm_sale_receivables r
  where (select crm_private.can_view_client_finances()) and r.overdue > 0
  group by r.currency
  order by r.currency
$$;

revoke all on function public.crm_sales_with_receivables(text), public.crm_overdue_collection_metrics()
  from public, anon, authenticated;
grant execute on function public.crm_sales_with_receivables(text), public.crm_overdue_collection_metrics()
  to authenticated;

commit;
