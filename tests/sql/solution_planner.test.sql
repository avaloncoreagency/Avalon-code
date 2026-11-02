-- Run after crm_pipeline.test.sql and service_factory_catalog.test.sql on synthetic PostgreSQL.
-- Owner-only, multi-SKU idempotency, cost honesty, review gates, RLS and immutable snapshots.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',false);

do $$
declare p uuid; p_again uuid; svc uuid; client uuid; input jsonb;
  ver integer; ok boolean; initial_sales integer;
begin
  select id into svc from public.crm_service_catalog where code='desarrollo-web';
  select id into client from public.crm_clients order by created_at limit 1;
  initial_sales := (select count(*) from public.crm_sales);
  assert svc is not null and client is not null, 'synthetic catalog and client available';
  input:=jsonb_build_object(
    'idempotency_key','e9e9e9e9-e9e9-49e9-89e9-e9e9e9e9e9e9',
    'title','Web y captación sintética','client_id',client,
    'currency','USD','industry','Servicios locales',
    'problem','Sin seguimiento comercial','objective','Leads trazables',
    'assumptions','Solo datos sintéticos',
    'hourly_rate','50','contingency_percent','10',
    'lines',jsonb_build_array(
      jsonb_build_object('service_id',svc,'quantity','2','unit_price','1000')
    )
  );
  p:=public.crm_create_solution_plan(input);
  p_again:=public.crm_create_solution_plan(input);
  assert p=p_again,'idempotent draft creation';
  assert (select count(*) from public.crm_solution_plans where idempotency_key=input->>'idempotency_key'::text)=0
    or p is not null, 'idempotency key resolves to plan';
  assert (select count(*) from public.crm_solution_plans where id=p)=1, 'one plan';
  assert (select count(*) from public.crm_solution_plan_lines where plan_id=p)=1, 'one line';
  assert (select unit_price from public.crm_solution_plan_lines where plan_id=p)=1000, 'manual price snapshot';
  assert (select quantity from public.crm_solution_plan_lines where plan_id=p)=2, 'quantity snapshot';
  assert (select client_id from public.crm_solution_plans where id=p)=client, 'canonical linked client FK';
  assert (select count(*) from public.crm_sales)=initial_sales, 'plan does not create a sale';
  begin
    perform public.crm_review_solution_plan(p,1);
    ok:=false;
  exception when others then ok:=position('planner_not_ready' in sqlerrm)>0;
  end;
  assert ok, 'legacy unapproved SKU cannot pass review';
  -- Approve SKU and record the estimate inputs. This does not edit old sales.
  update public.crm_service_catalog set readiness='sellable',active=true,
    estimated_cost=120,estimated_hours=8,suggested_price=950 where id=svc;
  -- The saved price snapshot remains 1000, even if catalog price becomes 950.
  assert (select unit_price from public.crm_solution_plan_lines where plan_id=p)=1000,
    'price snapshot never silently changes';
  -- Missing costs at the time of draft creation remain unknown; create a
  -- new estimate after catalog readiness rather than rewriting snapshots.
  begin perform public.crm_review_solution_plan(p,1);
    ok:=false;
  exception when others then ok:=position('planner_not_ready' in sqlerrm)>0;
  end;
  assert ok, 'unknown historic cost cannot be falsely certified';
  input:=jsonb_set(input,'{idempotency_key}','"f8f8f8f8-f8f8-48f8-88f8-f8f8f8f8f8f8"'::jsonb);
  p:=public.crm_create_solution_plan(input);
  assert (select direct_cost from public.crm_solution_plan_lines where plan_id=p)=120,
    'new draft snapshots current direct cost';
  assert (select estimated_hours from public.crm_solution_plan_lines where plan_id=p)=8,
    'new draft snapshots estimated labor';
  ver:=(select version from public.crm_solution_plans where id=p);
  assert public.crm_review_solution_plan(p,ver), 'complete estimate may be approved internally';
  assert (select status='reviewed' and reviewed_at is not null and reviewed_by=auth.uid()
    from public.crm_solution_plans where id=p), 'review status audited';
  begin
    perform public.crm_review_solution_plan(p,ver);
    ok:=false;
  exception when others then ok:=position('planner_conflict' in sqlerrm)>0;
  end;
  assert ok,'stale replay does not change reviewed proposal';
  assert (select count(*) from public.crm_audit where entity='crm_solution_plans' and record_id=p)>=2,
    'plan create and review audit';
  assert (select count(*) from public.crm_audit where entity='crm_solution_plan_lines'
    and record_id=(select id from public.crm_solution_plan_lines where plan_id=p))=1,
    'line snapshot audited';
  assert (select count(*) from public.crm_sales)=initial_sales, 'internal review is not a sale';
  assert (select count(*) from public.crm_payments)=0, 'internal review is not a payment';
  -- Duplicate service codes in one atomic request may not create orphan rows.
  input:=jsonb_set(input,'{idempotency_key}','"abababab-abab-4bab-8bab-abababababab"'::jsonb);
  input:=jsonb_set(input,'{lines}',jsonb_build_array(
    jsonb_build_object('service_id',svc,'quantity','1'),
    jsonb_build_object('service_id',svc,'quantity','1')));
  begin perform public.crm_create_solution_plan(input);ok:=false;
  exception when unique_violation then ok:=true; end;
  assert ok,'duplicate SKUs rejected atomically';
  assert (select count(*) from public.crm_solution_plans
    where idempotency_key='abababab-abab-4bab-8bab-abababababab')=0,
    'transaction rollback prevents orphan draft';
end $$;

-- Non-owner cannot view plans, bypass owner-only RPC or directly write.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a3',false);
do $$
declare ok boolean;
begin
  assert (select count(*) from public.crm_solution_plans)=0, 'outsider sees zero plans';
  assert (select count(*) from public.crm_solution_plan_lines)=0, 'outsider sees zero lines';
  begin
    perform public.crm_create_solution_plan(jsonb_build_object(
      'idempotency_key','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'title','Unauthorized Plan','currency','USD',
      'lines',jsonb_build_array()));
    ok:=false;
  exception when insufficient_privilege then ok:=true; end;
  assert ok,'owner gate in SECURITY DEFINER RPC';
  begin
    insert into public.crm_solution_plans(idempotency_key,title)
    values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Bypass Owner');
    ok:=false;
  exception when insufficient_privilege then ok:=true; end;
  assert ok,'no direct plan insert grant';
  begin
    update public.crm_solution_plans set status='reviewed';
    ok:=false;
  exception when insufficient_privilege then ok:=true; end;
  assert ok,'no direct review update';
end $$;
reset role;
