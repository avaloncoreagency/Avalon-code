-- AVALON / REVIEW-ONLY: promote with "supabase migration new crm_client_opportunity_registration"
-- after isolated PostgreSQL, RLS and Preview tests. Do not run on production from this PR.
-- Compatible with existing crm_clients.origin_lead_id (one canonical origin opportunity).
-- Every RPC is owner-only; no sale, payment, automatic outreach or external call is created.
begin;

create or replace function public.crm_register_client_with_opportunity(p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  name text;
  trade text;
  v_company text;
  source_name text;
  c_id uuid;
  l_id uuid;
begin
  if actor is null or not crm_private.is_owner() then
    raise exception 'crm_forbidden' using errcode='42501';
  end if;
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception 'crm_invalid_client' using errcode='22023';
  end if;
  name := btrim(coalesce(p_request->>'legal_name',''));
  trade := btrim(coalesce(p_request->>'trade_name',''));
  v_company := coalesce(nullif(trade,''),name);
  source_name := coalesce(nullif(btrim(coalesce(p_request->>'source','')),''),'Registro manual');
  if length(name) not between 1 and 200 or length(trade)>200 or length(source_name)>200 then
    raise exception 'crm_invalid_client' using errcode='22023';
  end if;
  -- A duplicate company or an already existing opportunity needs human review.
  -- Names are a deduplication warning, NEVER a foreign-key identity.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('crm_company:' || lower(name),0));
  if exists (select 1 from public.crm_clients c where c.status <> 'archived'
    and crm_private.norm(c.legal_name)=crm_private.norm(name)) then
    raise exception 'sale_client_exists' using errcode='23505';
  end if;
  if exists (select 1 from public.crm_leads l where not l.archived
    and (crm_private.norm(l.company)=crm_private.norm(name)
      or (length(trade)>0 and crm_private.norm(l.company)=crm_private.norm(trade)))) then
    raise exception 'crm_existing_lead_review' using errcode='23505';
  end if;
  -- Atomic: a later validation failure rolls back BOTH records.
  insert into public.crm_leads(company,contact,source,owner_id,stage_id)
    values(v_company,'',source_name,actor,'new') returning id into l_id;
  insert into public.crm_clients
    (legal_name,trade_name,website,industry,country,location,source,notes,owner_id,origin_lead_id)
  values(name,trade,
    btrim(coalesce(p_request->>'website','')),
    btrim(coalesce(p_request->>'industry','')),
    btrim(coalesce(p_request->>'country','')),
    btrim(coalesce(p_request->>'location','')),
    source_name,btrim(coalesce(p_request->>'notes','')),actor,l_id)
    returning id into c_id;
  perform crm_private.log('client.created', 'crm', 'crm_clients', c_id,
    client_id=>c_id, to_state=>'active', detail=>'Alta manual con oportunidad');
  return jsonb_build_object('client_id',c_id,'lead_id',l_id);
end $$;

revoke all on function public.crm_register_client_with_opportunity(jsonb) from public,anon,authenticated;
grant execute on function public.crm_register_client_with_opportunity(jsonb) to authenticated;

create or replace function public.crm_ensure_client_opportunity(p_client_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  c public.crm_clients;
  company text;
  lead_id uuid;
begin
  if actor is null or not crm_private.is_owner() then
    raise exception 'crm_forbidden' using errcode='42501';
  end if;
  select * into c from public.crm_clients where id=p_client_id and status<>'archived' for update;
  if not found then raise exception 'crm_client_missing' using errcode='22023'; end if;
  if c.origin_lead_id is not null then return c.origin_lead_id; end if;
  -- Historical sales cannot silently acquire a synthetic "won" history.
  if exists (select 1 from public.crm_sales s where s.client_id=c.id and s.status='confirmed') then
    raise exception 'crm_historic_sale_requires_review' using errcode='23514';
  end if;
  v_company := coalesce(nullif(btrim(c.trade_name),''),btrim(c.legal_name));
  if exists (select 1 from public.crm_leads l where not l.archived
    and (crm_private.norm(l.company)=crm_private.norm(v_company)
      or crm_private.norm(l.company)=crm_private.norm(c.legal_name))) then
    raise exception 'crm_existing_lead_review' using errcode='23505';
  end if;
  insert into public.crm_leads(company,contact,source,owner_id,stage_id)
    values(v_company,'',coalesce(nullif(btrim(c.source),''),'Registro en Clients 360'),c.owner_id,'new')
    returning id into lead_id;
  update public.crm_clients set origin_lead_id=lead_id where id=c.id and origin_lead_id is null;
  perform crm_private.log('client.opportunity_linked','crm','crm_clients',c.id,
    client_id=>c.id,detail=>'Nueva oportunidad en etapa Nuevo');
  return lead_id;
end $$;

revoke all on function public.crm_ensure_client_opportunity(uuid) from public,anon,authenticated;
grant execute on function public.crm_ensure_client_opportunity(uuid) to authenticated;


-- Read-only capability probe: the UI hides unavailable write controls until rollout.
create or replace function public.crm_client_opportunity_capability()
returns boolean language sql stable security invoker set search_path='' as $$
  select coalesce(crm_private.is_owner(),false)
$$;
revoke all on function public.crm_client_opportunity_capability() from public,anon,authenticated;
grant execute on function public.crm_client_opportunity_capability() to authenticated;

commit;
