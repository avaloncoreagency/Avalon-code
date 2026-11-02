-- Avalon internal Solution Planner: persisted, owner-only proposal estimates.
-- All rows are drafts/owner reviews; NO customer message, sale, payment or project is created.
-- Depends on crm_service_catalog v2, crm_clients and crm_private owner/audit functions.
-- Append-only migration. Preview/staging first; explicit production approval required.
begin;

create table public.crm_solution_plans (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key='avalon'),
  idempotency_key uuid not null unique,
  client_id uuid references public.crm_clients(id),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  industry text not null default '' check (char_length(industry)<=120),
  problem text not null default '' check (char_length(problem)<=2000),
  objective text not null default '' check (char_length(objective)<=2000),
  assumptions text not null default '' check (char_length(assumptions)<=3000),
  currency text not null default 'USD' check (currency='USD'),
  hourly_rate numeric(12,2) check (hourly_rate is null or hourly_rate between 0 and 100000),
  contingency_percent numeric(5,2) not null default 0
    check (contingency_percent between 0 and 40),
  status text not null default 'draft' check (status in ('draft','reviewed')),
  reviewed_by uuid references public.agency_memberships(user_id),
  reviewed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  check ((status='draft' and reviewed_at is null and reviewed_by is null)
    or (status='reviewed' and reviewed_at is not null and reviewed_by is not null))
);
create index crm_solution_plans_recent on public.crm_solution_plans(updated_at desc);
create index crm_solution_plans_client on public.crm_solution_plans(client_id,created_at desc);

-- Quote items use FK to the canonical SKU plus an immutable pricing/scope snapshot.
-- A service's later price/name change cannot silently rewrite an earlier estimate.
create table public.crm_solution_plan_lines (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key='avalon'),
  plan_id uuid not null references public.crm_solution_plans(id) on delete restrict,
  service_id uuid not null references public.crm_service_catalog(id) on delete restrict,
  position smallint not null check (position between 1 and 5),
  quantity smallint not null check (quantity between 1 and 10),
  code_snapshot text not null check (char_length(code_snapshot) between 2 and 50),
  name_snapshot text not null check (char_length(name_snapshot) between 1 and 120),
  billing_type text not null check (billing_type in ('one_time','monthly','annual')),
  readiness_snapshot text not null check (readiness_snapshot in
    ('draft','internal_ready','sellable','paused','retired')),
  scope_snapshot text not null default '' check (char_length(scope_snapshot)<=4000),
  unit_price numeric(15,2) check (unit_price is null or unit_price between 0 and 100000000),
  price_source text not null check (price_source in ('catalog','manual')),
  direct_cost numeric(15,2) check (direct_cost is null or direct_cost between 0 and 100000000),
  estimated_hours numeric(10,2) check (estimated_hours is null or estimated_hours between 0 and 10000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique(plan_id,position),
  unique(plan_id,service_id)
);
create index crm_solution_plan_lines_plan on public.crm_solution_plan_lines(plan_id,position);

-- No owner can write directly: all writes are atomic, validated RPC actions.
-- RLS protects REST reads even if the frontend route is accidentally exposed.
alter table public.crm_solution_plans enable row level security;
alter table public.crm_solution_plan_lines enable row level security;
revoke all on public.crm_solution_plans, public.crm_solution_plan_lines from public, anon, authenticated;
grant select on public.crm_solution_plans, public.crm_solution_plan_lines to authenticated;
create policy crm_solution_plan_owner_read on public.crm_solution_plans for select to authenticated
  using ((select crm_private.is_owner()) and agency_key='avalon');
create policy crm_solution_plan_lines_owner_read on public.crm_solution_plan_lines for select to authenticated
  using ((select crm_private.is_owner()) and agency_key='avalon');

create trigger crm_solution_plan_stamp before insert or update on public.crm_solution_plans
  for each row execute function crm_private.stamp();
create trigger crm_solution_plan_audit after insert or update on public.crm_solution_plans
  for each row execute function crm_private.audit();
create trigger crm_solution_line_stamp before insert or update on public.crm_solution_plan_lines
  for each row execute function crm_private.stamp();
create trigger crm_solution_line_audit after insert or update on public.crm_solution_plan_lines
  for each row execute function crm_private.audit();

create function public.crm_create_solution_plan(request jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  p_id uuid; token uuid; client uuid; owner_ok boolean;
  items jsonb; line jsonb; svc public.crm_service_catalog;
  idx integer := 0; qty integer; selected_price numeric(15,2);
  override_text text; hourly numeric(12,2); contingency numeric(5,2);
  plan_title text; plan_industry text; plan_problem text;
  plan_objective text; plan_assumptions text;
begin
  owner_ok := crm_private.is_owner();
  if not owner_ok then raise exception 'planner_forbidden' using errcode='42501'; end if;
  if jsonb_typeof(request) <> 'object' then
    raise exception 'planner_invalid' using errcode='22023';
  end if;
  token := (request->>'idempotency_key')::uuid;
  if token is null then raise exception 'planner_invalid_key' using errcode='22023'; end if;
  select id into p_id from public.crm_solution_plans where idempotency_key=token;
  if p_id is not null then return p_id; end if;
  if request->>'currency' is distinct from 'USD' then
    raise exception 'planner_invalid_currency' using errcode='22023';
  end if;
  plan_title := btrim(coalesce(request->>'title',''));
  plan_industry := btrim(coalesce(request->>'industry',''));
  plan_problem := btrim(coalesce(request->>'problem',''));
  plan_objective := btrim(coalesce(request->>'objective',''));
  plan_assumptions := btrim(coalesce(request->>'assumptions',''));
  if char_length(plan_title) not between 3 and 160
    or char_length(plan_industry)>120 or char_length(plan_problem)>2000
    or char_length(plan_objective)>2000 or char_length(plan_assumptions)>3000 then
    raise exception 'planner_invalid_text' using errcode='22023';
  end if;
  if request->>'client_id' is not null and request->>'client_id' <> '' then
    client := (request->>'client_id')::uuid;
    if not exists(select 1 from public.crm_clients where id=client and status <> 'archived') then
      raise exception 'planner_client_missing' using errcode='22023';
    end if;
  end if;
  if coalesce(request->>'hourly_rate','') <> '' then
    hourly := (request->>'hourly_rate')::numeric;
  end if;
  contingency := coalesce((request->>'contingency_percent')::numeric,0);
  if (hourly is not null and (hourly<0 or hourly>100000))
    or contingency<0 or contingency>40 then
    raise exception 'planner_invalid_amount' using errcode='22023';
  end if;
  items := request->'lines';
  if jsonb_typeof(items) <> 'array' then
    raise exception 'planner_invalid_lines' using errcode='22023';
  end if;
  if jsonb_array_length(items) not between 1 and 5 then
    raise exception 'planner_invalid_lines' using errcode='22023';
  end if;
  insert into public.crm_solution_plans
    (idempotency_key,client_id,title,industry,problem,objective,assumptions,currency,
     hourly_rate,contingency_percent)
  values (token,client,plan_title,plan_industry,plan_problem,plan_objective,
    plan_assumptions,'USD',hourly,contingency)
  on conflict (idempotency_key) do nothing returning id into p_id;
  if p_id is null then
    select id into p_id from public.crm_solution_plans where idempotency_key=token;
    return p_id;
  end if;
  for line in select value from jsonb_array_elements(items) loop
    idx := idx+1;
    if jsonb_typeof(line) <> 'object' then
      raise exception 'planner_invalid_line' using errcode='22023';
    end if;
    select * into svc from public.crm_service_catalog where id=(line->>'service_id')::uuid;
    if not found then raise exception 'planner_service_missing' using errcode='22023'; end if;
    if coalesce(line->>'quantity','') !~ '^[1-9][0-9]?$' then
      raise exception 'planner_invalid_quantity' using errcode='22023';
    end if;
    qty := (line->>'quantity')::integer;
    if qty not between 1 and 10 then
      raise exception 'planner_invalid_quantity' using errcode='22023';
    end if;
    override_text := nullif(line->>'unit_price','');
    if override_text is not null then
      if override_text !~ '^(0|[1-9][0-9]{0,8})([.][0-9]{1,2})?$' then
        raise exception 'planner_invalid_price' using errcode='22023';
      end if;
      selected_price := override_text::numeric;
      if selected_price>100000000 then
        raise exception 'planner_invalid_price' using errcode='22023';
      end if;
    else
      selected_price := svc.suggested_price;
    end if;
    insert into public.crm_solution_plan_lines
      (plan_id,service_id,position,quantity,code_snapshot,name_snapshot,billing_type,
       readiness_snapshot,scope_snapshot,unit_price,price_source,direct_cost,estimated_hours)
    values
      (p_id,svc.id,idx,qty,svc.code,svc.name,svc.billing_type,
       svc.readiness,svc.deliverables,selected_price,
       case when override_text is null then 'catalog' else 'manual' end,
       svc.estimated_cost,svc.estimated_hours);
  end loop;
  return p_id;
end $$;

revoke all on function public.crm_create_solution_plan(jsonb) from public,anon;
grant execute on function public.crm_create_solution_plan(jsonb) to authenticated;

-- Owner review is an internal quality gate, NEVER a sale or a customer send.
-- All SKU costs/hours/prices must be known, plus labor rate and current SKU approval.
create function public.crm_review_solution_plan(plan_id uuid, expected_version integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare p public.crm_solution_plans; n integer;
begin
  if not crm_private.is_owner() then raise exception 'planner_forbidden' using errcode='42501'; end if;
  select * into p from public.crm_solution_plans where id=plan_id for update;
  if not found then raise exception 'planner_not_found' using errcode='22023'; end if;
  if p.status <> 'draft' or p.version <> expected_version then
    raise exception 'planner_conflict' using errcode='22023';
  end if;
  select count(*) into n from public.crm_solution_plan_lines l
    join public.crm_service_catalog s on s.id=l.service_id
    where l.plan_id=$1 and (
      not s.active or s.readiness <> 'sellable'
      or l.unit_price is null or l.unit_price<=0
      or l.direct_cost is null or l.estimated_hours is null
      or p.hourly_rate is null);
  if n>0 then raise exception 'planner_not_ready' using errcode='22023'; end if;
  if not exists(select 1 from public.crm_solution_plan_lines l where l.plan_id=$1) then
    raise exception 'planner_empty' using errcode='22023';
  end if;
  update public.crm_solution_plans
    set status='reviewed',reviewed_by=auth.uid(),reviewed_at=now()
    where id=plan_id;
  return true;
end $$;

revoke all on function public.crm_review_solution_plan(uuid,integer) from public,anon;
grant execute on function public.crm_review_solution_plan(uuid,integer) to authenticated;

comment on table public.crm_solution_plans is
  'Private draft solutions and internally reviewed estimates; not proposals sent, sales, contracts or invoices.';
comment on table public.crm_solution_plan_lines is
  'Price and scope snapshots at estimate creation; canonical SKU retained by FK. Do not infer actual margin.';
commit;
