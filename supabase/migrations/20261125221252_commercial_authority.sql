alter table public.crm_contracts add column verified_quote_revision uuid references public.crm_quote_versions(id);
create unique index crm_contract_verified_revision on public.crm_contracts(verified_quote_revision) where verified_quote_revision is not null;

-- Explicit owner grants. Existing employees start with no commercial grants.
alter table public.staff_portal_access add column commercial_permissions text[] not null default '{}',
  add constraint staff_commercial_permissions_valid check (commercial_permissions <@ array['lead_create', 'lead_edit', 'quote_create', 'quote_edit', 'quote_review', 'quote_send', 'quote_accept', 'quote_delete_request', 'sale_close', 'sales_history', 'commission_history']::text[]);

create function crm_private.seller_can(capability text) returns boolean
language sql stable security definer set search_path = '' as $$
  select crm_private.is_seller() and exists (
    select 1 from public.staff_portal_access a where a.user_id = auth.uid()
    and capability = any(a.commercial_permissions))
$$;
revoke all on function crm_private.seller_can(text) from public, anon, authenticated;

create table crm_private.quote_commercial_approvals (
  revision_id uuid primary key references public.crm_quote_versions(id),
  digest text not null, offers jsonb not null, approved_by uuid not null, approved_at timestamptz not null default now()
);
revoke all on crm_private.quote_commercial_approvals from public,anon,authenticated;
create table crm_private.quote_acceptances (
  revision_id uuid primary key references public.crm_quote_versions(id), accepted_at timestamptz not null default now(),
  client_signatory text not null, evidence text not null, recorded_by uuid not null, seller_id uuid not null
);
revoke all on crm_private.quote_acceptances from public,anon,authenticated;

create function crm_private.assert_approved_offer(service_code text) returns void
language plpgsql set search_path = '' as $$
begin
  perform 1 from public.crm_service_catalog c where c.code = service_code and c.active
    and c.offer_status = 'approved' and c.offer_approved_by is not null and c.offer_approved_at is not null for share;
  if not found then raise exception 'commercial_offer_not_approved' using errcode = '23514'; end if;
end $$;
revoke all on function crm_private.assert_approved_offer(text) from public, anon, authenticated;

create function crm_private.check_quote_offers(p_revision uuid) returns void
language plpgsql set search_path='' as $$
declare snapshot crm_private.quote_commercial_approvals; item record;
begin
 select * into snapshot from crm_private.quote_commercial_approvals where revision_id=p_revision;
 -- Older owner approvals lack a snapshot. The existing transition and sale guards still require current eligibility.
 if not found then
   if not crm_private.is_owner() then raise exception 'quote_owner_approval_required' using errcode='42501'; end if;
   return;
 end if;
 for item in select * from jsonb_each(snapshot.offers) order by key loop
   perform 1 from public.crm_service_catalog c where c.code=item.key and c.active and c.offer_status='approved'
     and jsonb_build_array(c.offer_version,c.offer_approved_at)=item.value for share;
   if not found then raise exception 'commercial_offer_changed' using errcode='23514'; end if;
 end loop;
end $$;
revoke all on function crm_private.check_quote_offers(uuid) from public,anon,authenticated;
create or replace function public.staff_lead_create(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); v_key uuid; l public.crm_leads; v_email text; v_value numeric; v_follow timestamptz;
begin
  if not crm_private.is_owner() and not crm_private.seller_can('lead_create') then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if actor is null or not crm_private.is_seller() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if request is null or jsonb_typeof(request) <> 'object' then raise exception 'staff_lead_invalid' using errcode = '22023'; end if;
  v_key := crm_private.uuid_or_null(request ->> 'request_key');
  if v_key is null then raise exception 'staff_lead_invalid' using errcode = '22023', detail = 'request_key'; end if;
  select * into l from public.crm_leads where request_key = v_key;
  if found then
    if l.owner_id <> actor then raise exception 'crm_forbidden' using errcode = '42501'; end if;
    return jsonb_build_object('lead_id', l.id, 'existing', true);
  end if;
  v_email := nullif(lower(crm_private.staff_text(request, 'email', 254)), '');
  begin
    v_value := coalesce(nullif(btrim(request ->> 'value'), '')::numeric, 0);
    v_follow := nullif(btrim(request ->> 'follow_up_at'), '')::timestamptz;
  exception when others then raise exception 'staff_lead_invalid' using errcode = '22023', detail = 'value';
  end;
  if v_value < 0 or v_value > 1000000000 then raise exception 'staff_lead_invalid' using errcode = '22023', detail = 'value'; end if;
  perform crm_private.begin_seller_act();
  insert into public.crm_leads (company, contact, contact_title, email, phone, website, industry, city, source, origin, owner_id,
      value, next_action, follow_up_at, request_key)
    values (crm_private.staff_text(request, 'company', 200), crm_private.staff_text(request, 'contact', 160),
      crm_private.staff_text(request, 'contact_title', 120), v_email, crm_private.staff_text(request, 'phone', 40),
      crm_private.staff_text(request, 'website', 300), crm_private.staff_text(request, 'industry', 120),
      crm_private.staff_text(request, 'city', 120),
      coalesce(nullif(crm_private.staff_text(request, 'source', 200), ''), 'Vendedor'), 'manual', actor,
      v_value, crm_private.staff_text(request, 'next_action', 300), v_follow, v_key)
    returning * into l;
  insert into public.staff_lead_grants (user_id, lead_id, access_level, active, granted_by)
    values (actor, l.id, 'work', true, actor);
  perform crm_private.log('lead.created_by_seller', 'crm', 'crm_leads', l.id, to_state => l.stage_id, detail => left(l.company, 160), source => 'app');
  return jsonb_build_object('lead_id', l.id, 'existing', false);
exception
  when check_violation then raise exception 'staff_lead_invalid' using errcode = '22023';
  when not_null_violation then raise exception 'staff_lead_invalid' using errcode = '22023';
end $$;

create or replace function public.staff_lead_update(p_lead uuid, p_expected_version integer, request jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare l public.crm_leads; v_stage text; v_kind text; v_email text; v_value numeric; v_follow timestamptz;
begin
  if not crm_private.is_owner() and not crm_private.seller_can('lead_edit') then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if auth.uid() is null or not crm_private.seller_owns_lead(p_lead) then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if request is null or jsonb_typeof(request) <> 'object' then raise exception 'staff_lead_invalid' using errcode = '22023'; end if;
  select * into l from public.crm_leads where id = p_lead for update;
  if l.version <> p_expected_version then raise exception 'staff_lead_version_conflict' using errcode = '40001'; end if;
  v_stage := coalesce(nullif(btrim(request ->> 'stage_id'), ''), l.stage_id);
  select s.kind into v_kind from public.crm_stages s where s.id = v_stage;
  if v_kind is null then raise exception 'staff_lead_invalid' using errcode = '22023', detail = 'stage_id'; end if;
  if v_kind = 'won' and v_stage is distinct from l.stage_id then raise exception 'staff_lead_won_by_sale' using errcode = 'P0001'; end if;
  if v_kind = 'lost' and length(btrim(case when request ? 'loss_reason' then coalesce(request ->> 'loss_reason', '') else l.loss_reason end)) = 0 then
    raise exception 'staff_lead_loss_reason_required' using errcode = 'P0001';
  end if;
  v_email := case when request ? 'email' then nullif(lower(crm_private.staff_text(request, 'email', 254)), '') else l.email end;
  begin
    v_value := case when request ? 'value' then coalesce(nullif(btrim(request ->> 'value'), '')::numeric, 0) else l.value end;
    v_follow := case when request ? 'follow_up_at' then nullif(btrim(request ->> 'follow_up_at'), '')::timestamptz else l.follow_up_at end;
  exception when others then raise exception 'staff_lead_invalid' using errcode = '22023', detail = 'value';
  end;
  if v_value < 0 or v_value > 1000000000 then raise exception 'staff_lead_invalid' using errcode = '22023', detail = 'value'; end if;
  perform crm_private.begin_seller_act();
  update public.crm_leads set
      stage_id = v_stage,
      contact = case when request ? 'contact' then crm_private.staff_text(request, 'contact', 160) else contact end,
      contact_title = case when request ? 'contact_title' then crm_private.staff_text(request, 'contact_title', 120) else contact_title end,
      email = v_email,
      phone = case when request ? 'phone' then crm_private.staff_text(request, 'phone', 40) else phone end,
      website = case when request ? 'website' then crm_private.staff_text(request, 'website', 300) else website end,
      city = case when request ? 'city' then crm_private.staff_text(request, 'city', 120) else city end,
      value = v_value, follow_up_at = v_follow,
      next_action = case when request ? 'next_action' then crm_private.staff_text(request, 'next_action', 300) else next_action end,
      loss_reason = case when request ? 'loss_reason' then crm_private.staff_text(request, 'loss_reason', 1000) else loss_reason end,
      last_interaction_at = now()
    where id = l.id
    returning * into l;
  return l.version;
exception
  when check_violation then raise exception 'staff_lead_invalid' using errcode = '22023';
end $$;

CREATE OR REPLACE FUNCTION public.crm_quote_create(p_lead uuid, p_request_key uuid, p_content jsonb, p_internal jsonb, p_sha256 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid(); chk record; q public.crm_quotes; v_client uuid; v_number text;
begin
  if not crm_private.is_owner() and not crm_private.seller_can('quote_create') then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if actor is null or not (crm_private.is_owner() or crm_private.seller_owns_lead(p_lead)) then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if p_request_key is null then raise exception 'quote_invalid_request' using errcode = '22023'; end if;
  select * into q from public.crm_quotes where request_key = p_request_key;
  if found and q.lead_id is distinct from p_lead then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if found then return jsonb_build_object('quote_id', q.id, 'quote_number', q.quote_number, 'version', q.current_version, 'existing', true); end if;
  if not exists (select 1 from public.crm_leads l where l.id = p_lead and not l.archived) then
    raise exception 'quote_lead_missing' using errcode = '22023';
  end if;
  if not crm_private.is_owner() then p_internal := '{}'::jsonb; end if;
  select * into chk from crm_private.quote_check(p_content, p_internal, p_sha256);
  select c.id into v_client from public.crm_clients c where c.origin_lead_id = p_lead and c.status <> 'archived' limit 1;
  v_number := 'Q-' || to_char(now() at time zone 'America/New_York', 'YYYY') || '-' || lpad(nextval('crm_private.quote_number_seq')::text, 4, '0');
  insert into public.crm_quotes (quote_number, lead_id, client_id, title, valid_until, request_key, created_by)
    values (v_number, p_lead, v_client, chk.title, chk.valid_until, p_request_key, actor) returning * into q;
  insert into public.crm_quote_versions (quote_id, version_no, content, content_sha256, internal, model, one_time_total, monthly_total,
      commission_status, commission_pct, created_by)
    values (q.id, 1, p_content, p_sha256, p_internal, chk.model, chk.one_time, chk.monthly, chk.cm_status, chk.cm_pct, actor);
  insert into public.crm_quote_events (quote_id, version_no, from_status, to_status, note, actor_id)
    values (q.id, 1, null, 'draft', 'Created', actor);
  perform crm_private.log('quote.created', 'crm', 'crm_quotes', q.id, client_id => v_client, to_state => 'draft', detail => v_number || ' v1');
  return jsonb_build_object('quote_id', q.id, 'quote_number', q.quote_number, 'version', 1, 'existing', false);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_quote_revise(p_quote uuid, p_expected_version integer, p_content jsonb, p_internal jsonb, p_sha256 text, p_note text DEFAULT ''::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid(); chk record; q public.crm_quotes; latest public.crm_quote_versions; next_no integer;
begin
  if not crm_private.is_owner() and not crm_private.seller_can('quote_edit') then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if actor is null or not (crm_private.is_owner() or crm_private.seller_owns_quote(p_quote)) then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into q from public.crm_quotes where id = p_quote for update;
  if not found then raise exception 'quote_missing' using errcode = '22023'; end if;
  if q.version <> p_expected_version then raise exception 'quote_version_conflict' using errcode = '40001'; end if;
  -- Sent, accepted or closed quotes are never edited in place: the client may already hold that PDF.
  if q.status not in ('draft', 'internal_review', 'approved') then raise exception 'quote_not_revisable' using errcode = '23514'; end if;
  if length(coalesce(p_note, '')) > 1000 then raise exception 'quote_invalid_note' using errcode = '22023'; end if;
  if not crm_private.is_owner() then
    select v.internal into p_internal from public.crm_quote_versions v where v.quote_id = q.id and v.version_no = q.current_version;
  end if;
  select * into chk from crm_private.quote_check(p_content, p_internal, p_sha256);
  select * into latest from public.crm_quote_versions where quote_id = q.id and version_no = q.current_version;
  if latest.content_sha256 = p_sha256 and latest.internal = p_internal then return q.current_version; end if;   -- retry/no-op
  next_no := q.current_version + 1;
  insert into public.crm_quote_versions (quote_id, version_no, content, content_sha256, internal, model, one_time_total, monthly_total,
      commission_status, commission_pct, change_note, created_by)
    values (q.id, next_no, p_content, p_sha256, p_internal, chk.model, chk.one_time, chk.monthly, chk.cm_status, chk.cm_pct, btrim(coalesce(p_note, '')), actor);
  -- A new revision always goes back to draft: approval applies to exact content.
  update public.crm_quotes set current_version = next_no, title = chk.title, valid_until = chk.valid_until, status = 'draft',
      version = version + 1, updated_at = now()
    where id = q.id;
  insert into public.crm_quote_events (quote_id, version_no, from_status, to_status, note, actor_id)
    values (q.id, next_no, q.status, 'draft', coalesce(nullif(btrim(p_note), ''), 'Revision v' || next_no), actor);
  perform crm_private.log('quote.revised', 'crm', 'crm_quotes', q.id, client_id => q.client_id, from_state => q.status, to_state => 'draft',
    detail => q.quote_number || ' v' || next_no);
  return next_no;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_quote_close_sale(request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.crm_quotes; v public.crm_quote_versions; c jsonb; cm jsonb; line jsonb; svc public.crm_service_catalog;
  lines jsonb := '[]'::jsonb; n integer := 0; has_one boolean := false; has_monthly boolean := false;
  existing public.crm_sales; r jsonb; sale_id uuid; v_client uuid; seller uuid; v_note text := ''; v_kind text; v_effective date;
  v_duration integer; v_window integer; v_billing text;
begin
  if not crm_private.is_owner() and not crm_private.seller_can('sale_close') then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if auth.uid() is null or not (crm_private.is_owner()
      or crm_private.seller_owns_quote(crm_private.uuid_or_null(request ->> 'quote_id'))
      or (crm_private.seller_can('sale_close') and exists (select 1 from public.crm_sales owned_sale
        where owned_sale.quote_id = crm_private.uuid_or_null(request ->> 'quote_id') and owned_sale.seller_id = auth.uid()))) then
    raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if request is null or jsonb_typeof(request) <> 'object' then raise exception 'quote_close_invalid' using errcode = '22023'; end if;
  select * into q from public.crm_quotes where id = crm_private.uuid_or_null(request ->> 'quote_id') for update;
  if not found then raise exception 'quote_not_found' using errcode = 'P0002'; end if;
  select * into v from public.crm_quote_versions where quote_id = q.id and version_no = q.current_version;
  -- Fidelity: the person closing must be looking at the revision that was accepted.
  if coalesce((request ->> 'version_no')::integer, -1) <> q.current_version then raise exception 'quote_version_changed' using errcode = '40001'; end if;
  select * into existing from public.crm_sales where quote_version_id = v.id;
  if found then
    if not crm_private.is_owner() and existing.seller_id is distinct from auth.uid() then
      raise exception 'quote_closed_by_other_seller' using errcode = '42501'; end if;
    return jsonb_build_object('sale_id', existing.id, 'sale_number', existing.sale_number, 'client_id', existing.client_id, 'replayed', true);
  end if;
  if not crm_private.is_owner() then
    perform 1 from public.crm_leads l where l.id=q.lead_id and l.owner_id=auth.uid() and not l.archived for share;
    if not found or not crm_private.seller_can('sale_close') then raise exception 'crm_forbidden' using errcode='42501'; end if;
  end if;
  if q.status <> 'accepted' then raise exception 'quote_not_accepted' using errcode = '23514'; end if;
  if not crm_private.is_owner() then
    perform 1 from public.crm_contracts c where c.lead_id=q.lead_id and c.verified_quote_revision=v.id
      and c.status='verified_signed' and c.verified_by is not null for share;
    if not found then raise exception 'won_requires_verified_contract' using errcode='23514'; end if;
  end if;
  perform crm_private.check_quote_offers(v.id);
  c := v.content;
  cm := c -> 'commission';
  if jsonb_typeof(cm) = 'object' and cm ->> 'status' <> 'proposed' then raise exception 'quote_commission_to_negotiate' using errcode = '23514'; end if;
  -- Essential variable terms are never inferred (start date, duration, exclusions, refunds, verification, trigger,
  -- agreement type): an older or incomplete revision must be revised, sent and accepted again before closing.
  if jsonb_typeof(cm) = 'object' and (
       coalesce(cm ->> 'kind', '') = '' or coalesce(cm ->> 'effectiveDate', '') = '' or coalesce(cm ->> 'durationMonths', '') = ''
    or length(btrim(coalesce(cm ->> 'exclusions', ''))) < 3 or length(btrim(coalesce(cm ->> 'refunds', ''))) < 3
    or length(btrim(coalesce(cm ->> 'evidence', ''))) < 3 or length(btrim(coalesce(cm ->> 'trigger', ''))) < 3) then
    raise exception 'quote_variable_terms_incomplete' using errcode = '23514';
  end if;

  -- Lines 1:1 from the accepted revision. Every line must be an active catalog service of the same billing type
  -- (a custom concept has no operational template; it needs a catalog entry before it can be delivered).
  for line in select value from jsonb_array_elements(coalesce(c -> 'lines', '[]'::jsonb)) loop
    n := n + 1;
    select * into svc from public.crm_service_catalog where code = line ->> 'code' and active;
    if not found then raise exception 'quote_line_not_in_catalog' using errcode = '23514', detail = coalesce(line ->> 'name', ''); end if;
    if svc.billing_type <> (line ->> 'kind') then raise exception 'quote_line_kind_mismatch' using errcode = '23514', detail = svc.code; end if;
    if line ->> 'kind' = 'monthly' then has_monthly := true; else has_one := true; end if;
    lines := lines || jsonb_build_array(jsonb_build_object('service_code', svc.code, 'quantity', line ->> 'qty', 'unit_price', line ->> 'unitPrice',
      'description', left(btrim(coalesce(line ->> 'description', '')) , 1000)));
  end loop;
  if n = 0 then raise exception 'quote_needs_service_line' using errcode = '23514'; end if;
  v_billing := case when has_one and has_monthly then 'mixed' when has_monthly then 'monthly' else 'one_time' end;

  select e.note into v_note from public.crm_quote_events e where e.quote_id = q.id and e.to_status = 'accepted' order by e.created_at desc limit 1;
  seller := coalesce(crm_private.uuid_or_null(request ->> 'seller_id'), auth.uid());
  -- A seller always closes as themself, inside a transaction-scoped seller context that the CRM guards recognise.
  if not crm_private.is_owner() then
    seller := auth.uid(); perform crm_private.begin_seller_act();
    perform set_config('avalon.seller_close', v.id::text, true);
  end if;
  -- Same transaction: crm_confirm_sale enforces the won gate (verified contract), creates client/work orders/projects,
  -- and replays on the same key. The key is derived from the revision, so retries can never create a second sale.
  r := crm_private.confirm_sale_internal(jsonb_build_object(
    'idempotency_key', md5('avalon-quote-close:' || v.id::text)::uuid,
    'lead_id', q.lead_id, 'client_id', q.client_id, 'quote_version_id', v.id,
    'new_client', jsonb_build_object('legal_name', coalesce(nullif(btrim(c -> 'client' ->> 'company'), ''), q.title)),
    'seller_id', seller, 'sold_on', coalesce(nullif(request ->> 'sold_on', ''), current_date::text),
    'billing_mode', v_billing, 'lines', lines,
    'notes', left('Cerrada desde la cotización ' || q.quote_number || ' v' || v.version_no || ' aceptada.', 4000)));
  sale_id := (r ->> 'sale_id')::uuid;
  update public.crm_sales set quote_id = q.id, quote_version_id = v.id, commercial_model = v.model, updated_at = now() where id = sale_id
    returning client_id into v_client;
  insert into public.crm_sale_terms (sale_id, quote_id, quote_version_id, quote_number, version_no, content, content_sha256, accepted_at, accepted_note, closed_by)
    values (sale_id, q.id, v.id, q.quote_number, v.version_no, c, v.content_sha256, coalesce(q.accepted_at, now()), left(coalesce(v_note, ''), 1000), auth.uid());
  if jsonb_typeof(cm) = 'object' then
    v_kind := coalesce(nullif(cm ->> 'kind', ''), 'revenue_share');
    if v_kind not in ('revenue_share', 'sale_commission', 'outcome_commission') then raise exception 'quote_close_invalid' using errcode = '22023'; end if;
    begin v_effective := coalesce(nullif(cm ->> 'effectiveDate', '')::date, coalesce(nullif(request ->> 'sold_on', '')::date, current_date));
    exception when others then raise exception 'quote_close_invalid' using errcode = '22023'; end;
    v_duration := nullif(cm ->> 'durationMonths', '')::integer;
    v_window := nullif(cm ->> 'attributionWindowDays', '')::integer;
    insert into public.crm_sale_variable_terms (sale_id, client_id, kind, pct, base, base_note, trigger_event, evidence_method, settlement,
      attribution_window_days, exclusions, refunds, expiry, effective_on, duration_months)
    values (sale_id, v_client, v_kind, (cm ->> 'pct')::numeric, cm ->> 'base', coalesce(cm ->> 'baseNote', ''), cm ->> 'trigger', cm ->> 'evidence',
      cm ->> 'settlement', v_window, coalesce(cm ->> 'exclusions', ''), coalesce(cm ->> 'refunds', ''), coalesce(cm ->> 'expiry', ''), v_effective, v_duration);
  end if;
  perform crm_private.log('sale.closed_from_quote', 'sales', 'crm_sales', sale_id, client_id => v_client, sale_id => sale_id,
    to_state => v.model, detail => q.quote_number || ' v' || v.version_no, source => 'app');
  return r || jsonb_build_object('quote_version_id', v.id, 'commercial_model', v.model, 'variable', jsonb_typeof(cm) = 'object');
exception when invalid_text_representation then raise exception 'quote_close_invalid' using errcode = '22023';
end $function$;

CREATE FUNCTION crm_private.confirm_sale_internal(request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  key uuid;
  existing public.crm_sales;
  sale public.crm_sales;
  client public.crm_clients;
  lead public.crm_leads;
  svc public.crm_service_catalog;
  dept public.crm_departments;
  nc jsonb := coalesce(request -> 'new_client', 'null'::jsonb);
  lines jsonb := request -> 'lines';
  line jsonb; contact jsonb; tpl jsonb;
  pos integer; idx integer;
  qty numeric; price numeric; ldisc numeric; ltotal numeric;
  subtotal numeric := 0; recurring numeric := 0; sale_discount numeric; rate numeric; tax numeric; total numeric; upfront numeric;
  seller uuid; assignee uuid; v_lead_id uuid; v_client_id uuid; dup uuid;
  sold date; start_day date; max_offset integer; t_offset integer; t_priority text;
  v_line_id uuid; v_wo_id uuid; v_project_id uuid; v_task_id uuid; line_tasks integer;
  corr uuid := gen_random_uuid();
  client_created boolean := false;
  n_contacts integer := 0; n_orders integer := 0; n_projects integer := 0; n_tasks integer := 0; n_notices integer := 0;
  v_currency text; v_billing text; projects_on boolean := crm_private.rule_on('sale_projects');
  owner_row record;
begin
  if actor is null or not (crm_private.is_owner()
      -- This private function is executable only by trusted definer RPCs, never by authenticated callers.
      or (crm_private.seller_acting() and crm_private.seller_can('sale_close')
          and crm_private.seller_owns_lead(crm_private.uuid_or_null(request ->> 'lead_id'))
          and nullif(request ->> 'quote_version_id','') is not null
          and current_setting('avalon.seller_close',true) = request ->> 'quote_version_id'
          and exists (select 1 from public.crm_quote_versions qv join public.crm_quotes qq on qq.id=qv.quote_id
            join public.crm_contracts co on co.verified_quote_revision=qv.id and co.lead_id=qq.lead_id
            where qv.id=crm_private.uuid_or_null(request ->> 'quote_version_id') and qq.lead_id=crm_private.uuid_or_null(request ->> 'lead_id')
              and qq.status='accepted' and qq.current_version=qv.version_no and qq.deleted_at is null
              and co.status='verified_signed' and co.verified_by is not null))) then
    raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if request is null or jsonb_typeof(request) <> 'object' then raise exception 'sale_invalid' using errcode = '22023'; end if;
  key := crm_private.uuid_or_null(request ->> 'idempotency_key');
  if key is null then raise exception 'sale_invalid_key' using errcode = '22023'; end if;

  -- Serialize concurrent submissions of the same key, then replay if already done.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('crm_sale:' || key::text, 0));
  select * into existing from public.crm_sales s where s.idempotency_key = key;
  if found then
    return jsonb_build_object('sale_id', existing.id, 'sale_number', existing.sale_number, 'client_id', existing.client_id,
      'replayed', true,
      'work_orders', (select count(*) from public.crm_work_orders w where w.sale_id = existing.id),
      'projects', (select count(*) from public.crm_work_orders w where w.sale_id = existing.id and w.project_id is not null),
      'tasks', (select count(*) from public.crm_tasks t where t.sale_id = existing.id));
  end if;

  perform set_config('avalon.correlation_id', corr::text, true);
  perform set_config('avalon.source', 'rpc', true);

  if jsonb_typeof(lines) is distinct from 'array' or jsonb_array_length(lines) not between 1 and 20 then
    raise exception 'sale_invalid_lines' using errcode = '22023';
  end if;
  seller := coalesce(crm_private.uuid_or_null(request ->> 'seller_id'), actor);
  -- A seller closing through crm_quote_close_sale is always recorded as the seller of their own sale; owners keep
  -- the original rule (an owner is the seller).
  if crm_private.seller_acting() and not crm_private.is_owner() then seller := actor; end if;
  if not exists (select 1 from public.agency_memberships m where m.user_id = seller
      and (m.role = 'owner' or (m.user_id = actor and crm_private.seller_acting()))) then
    raise exception 'sale_invalid_member' using errcode = '22023';
  end if;
  v_currency := upper(coalesce(nullif(btrim(request ->> 'currency'), ''), 'USD'));
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'sale_invalid_currency' using errcode = '22023'; end if;
  v_billing := coalesce(nullif(request ->> 'billing_mode', ''), 'mixed');
  if v_billing not in ('one_time', 'installments', 'monthly', 'mixed') then raise exception 'sale_invalid' using errcode = '22023'; end if;
  sold := crm_private.day(request ->> 'sold_on', current_date);

  -- Pass 1: validate every line and compute totals server-side.
  for line in select value from jsonb_array_elements(lines) loop
    if jsonb_typeof(line) <> 'object' then raise exception 'sale_invalid_lines' using errcode = '22023'; end if;
    perform crm_private.assert_approved_offer(line ->> 'service_code');
    select * into svc from public.crm_service_catalog c where c.code = line ->> 'service_code' and c.active;
    if not found then raise exception 'sale_invalid_service' using errcode = '22023'; end if;
    qty := crm_private.amount(line ->> 'quantity', 1);
    price := crm_private.amount(line ->> 'unit_price', svc.suggested_price);
    ldisc := crm_private.amount(line ->> 'discount', 0);
    if price is null then raise exception 'sale_missing_price' using errcode = '22023'; end if;
    if qty <= 0 or qty > 10000 then raise exception 'sale_invalid_amount' using errcode = '22023'; end if;
    ltotal := round(qty * price - ldisc, 2);
    if ltotal < 0 then raise exception 'sale_invalid_discount' using errcode = '22023'; end if;
    assignee := crm_private.uuid_or_null(line ->> 'assignee_id');
    if assignee is not null and not exists (select 1 from public.agency_memberships m where m.user_id = assignee and m.role = 'owner') then
      raise exception 'sale_invalid_member' using errcode = '22023';
    end if;
    perform crm_private.day(line ->> 'start_on', null);
    subtotal := subtotal + ltotal;
    if svc.billing_type = 'monthly' then recurring := recurring + ltotal; end if;
  end loop;
  sale_discount := crm_private.amount(request ->> 'discount', 0);
  rate := crm_private.amount(request ->> 'tax_rate', 0);
  if sale_discount > subtotal then raise exception 'sale_invalid_discount' using errcode = '22023'; end if;
  if rate > 100 then raise exception 'sale_invalid_amount' using errcode = '22023'; end if;
  tax := round((subtotal - sale_discount) * rate / 100, 2);
  total := subtotal - sale_discount + tax;
  upfront := crm_private.amount(request ->> 'upfront_amount', 0);
  if upfront > total then raise exception 'sale_invalid_upfront' using errcode = '22023'; end if;

  -- Origin opportunity (optional).
  v_lead_id := crm_private.uuid_or_null(request ->> 'lead_id');
  if request ->> 'lead_id' is not null and request ->> 'lead_id' <> '' and v_lead_id is null then
    raise exception 'sale_lead_missing' using errcode = '22023';
  end if;
  if v_lead_id is not null then
    select * into lead from public.crm_leads l where l.id = v_lead_id and not l.archived for update;
    if not found then raise exception 'sale_lead_missing' using errcode = '22023'; end if;
  end if;

  -- Client: existing id, the client already created from this lead, or a new one.
  v_client_id := crm_private.uuid_or_null(request ->> 'client_id');
  if v_client_id is not null then
    select * into client from public.crm_clients c where c.id = v_client_id and c.status <> 'archived' for update;
    if not found then raise exception 'sale_client_missing' using errcode = '22023'; end if;
  elsif v_lead_id is not null and exists (select 1 from public.crm_clients c where c.origin_lead_id = v_lead_id) then
    select * into client from public.crm_clients c where c.origin_lead_id = v_lead_id for update;
  else
    if jsonb_typeof(nc) <> 'object' or length(btrim(coalesce(nc ->> 'legal_name', ''))) = 0 then
      raise exception 'sale_client_required' using errcode = '22023';
    end if;
    select c.id into dup from public.crm_clients c
      where c.status <> 'archived' and crm_private.norm(c.legal_name) = crm_private.norm(nc ->> 'legal_name') limit 1;
    if dup is null and jsonb_typeof(request -> 'contacts') = 'array' then
      select ct.client_id into dup from public.crm_contacts ct
        join jsonb_array_elements(request -> 'contacts') e on lower(btrim(ct.email)) = lower(btrim(e ->> 'email'))
        where ct.email is not null limit 1;
    end if;
    if dup is not null then
      raise exception 'sale_client_exists' using errcode = '23505', detail = dup::text;
    end if;
    insert into public.crm_clients (legal_name, trade_name, website, industry, country, location, source, notes, owner_id, origin_lead_id)
    values (btrim(nc ->> 'legal_name'), btrim(coalesce(nc ->> 'trade_name', '')), btrim(coalesce(nc ->> 'website', '')),
      btrim(coalesce(nc ->> 'industry', '')), btrim(coalesce(nc ->> 'country', '')), btrim(coalesce(nc ->> 'location', '')),
      coalesce(nullif(btrim(nc ->> 'source'), ''), lead.source, 'Venta directa'), coalesce(nc ->> 'notes', ''),
      coalesce(crm_private.uuid_or_null(nc ->> 'owner_id'), seller), v_lead_id)
    returning * into client;
    client_created := true;
    perform crm_private.log('client.created', 'sales', 'crm_clients', client.id, client_id => client.id, to_state => client.status, detail => client.client_code);
  end if;
  if not client_created then
    perform crm_private.log('client.linked', 'sales', 'crm_clients', client.id, client_id => client.id, detail => client.client_code);
  end if;

  -- Contacts: add new ones, never duplicate an e-mail inside the client.
  if jsonb_typeof(request -> 'contacts') = 'array' then
    if jsonb_array_length(request -> 'contacts') > 10 then raise exception 'sale_invalid' using errcode = '22023'; end if;
    for contact in select value from jsonb_array_elements(request -> 'contacts') loop
      continue when jsonb_typeof(contact) <> 'object' or length(btrim(coalesce(contact ->> 'full_name', ''))) = 0;
      continue when nullif(btrim(contact ->> 'email'), '') is not null and exists (select 1 from public.crm_contacts ct
        where ct.client_id = client.id and lower(btrim(ct.email)) = lower(btrim(contact ->> 'email')));
      insert into public.crm_contacts (client_id, full_name, email, phone, role, is_primary)
      values (client.id, btrim(contact ->> 'full_name'), nullif(lower(btrim(contact ->> 'email')), ''),
        btrim(coalesce(contact ->> 'phone', '')), btrim(coalesce(contact ->> 'role', '')),
        not exists (select 1 from public.crm_contacts ct where ct.client_id = client.id and ct.is_primary));
      n_contacts := n_contacts + 1;
    end loop;
  end if;
  if client_created and n_contacts = 0 and v_lead_id is not null and length(btrim(lead.contact)) > 0 then
    insert into public.crm_contacts (client_id, full_name, email, phone, is_primary)
    values (client.id, lead.contact, lead.email, lead.phone, true);
    n_contacts := 1;
  end if;
  if n_contacts > 0 then
    perform crm_private.log('contact.added', 'sales', 'crm_clients', client.id, client_id => client.id, detail => n_contacts || ' contacto(s)');
  end if;

  insert into public.crm_sales (sale_number, idempotency_key, correlation_id, client_id, lead_id, sold_on, currency, subtotal,
    discount_total, tax_rate, tax_total, total, recurring_monthly, billing_mode, upfront_amount, seller_id, contract_status, notes)
  values ('AV-' || to_char(sold, 'YYYY') || '-' || lpad(nextval('crm_private.sale_number_seq')::text, 5, '0'), key, corr,
    client.id, v_lead_id, sold, v_currency, subtotal, sale_discount, rate, tax, total, recurring, v_billing, upfront, seller,
    case when request ->> 'contract_status' = 'signed' then 'signed' else 'pending_signature' end, left(coalesce(request ->> 'notes', ''), 4000))
  returning * into sale;
  perform crm_private.log('sale.confirmed', 'sales', 'crm_sales', sale.id, client_id => client.id, sale_id => sale.id,
    to_state => 'confirmed', detail => sale.sale_number || ' · ' || sale.currency || ' ' || sale.total);

  if v_lead_id is not null and not exists (select 1 from public.crm_stages st where st.id = lead.stage_id and st.kind = 'won') then
    update public.crm_leads set stage_id = (select st.id from public.crm_stages st where st.kind = 'won' order by st.position limit 1)
      where id = v_lead_id;
    perform crm_private.log('lead.won', 'crm', 'crm_leads', v_lead_id, client_id => client.id, sale_id => sale.id,
      from_state => lead.stage_id, to_state => 'won');
  end if;

  -- Pass 2: lines → work orders → departmental projects → template tasks.
  pos := 0;
  for line in select value from jsonb_array_elements(lines) loop
    pos := pos + 1;
    select * into svc from public.crm_service_catalog c where c.code = line ->> 'service_code';
    select * into dept from public.crm_departments d where d.id = svc.department_id;
    qty := crm_private.amount(line ->> 'quantity', 1);
    price := crm_private.amount(line ->> 'unit_price', svc.suggested_price);
    ldisc := crm_private.amount(line ->> 'discount', 0);
    -- Delivery work never falls on a seller by default: without a catalog default it goes to an owner.
    assignee := coalesce(crm_private.uuid_or_null(line ->> 'assignee_id'), svc.default_assignee_id,
      case when crm_private.seller_acting() and not crm_private.is_owner() then crm_private.default_owner() else seller end);
    start_day := crm_private.day(line ->> 'start_on', sold);
    insert into public.crm_sale_lines (sale_id, position, service_id, department_id, description, quantity, unit_price, discount,
      line_total, billing_type, start_on, assignee_id)
    values (sale.id, pos, svc.id, dept.id, left(btrim(coalesce(line ->> 'description', '')), 2000), qty, price, ldisc,
      round(qty * price - ldisc, 2), svc.billing_type, start_day, assignee)
    returning id into v_line_id;

    select coalesce(max(case when e ? 'offset_days' then (e ->> 'offset_days')::integer else 0 end), 0) into max_offset
      from jsonb_array_elements(svc.task_template) e;
    insert into public.crm_work_orders (sale_id, sale_line_id, client_id, department_id, assignee_id, recurrence, due_on)
    values (sale.id, v_line_id, client.id, dept.id, assignee,
      case svc.billing_type when 'monthly' then 'monthly' when 'annual' then 'annual' else 'none' end, start_day + max_offset)
    returning id into v_wo_id;
    n_orders := n_orders + 1;
    perform crm_private.log('service.assigned', 'sales', 'crm_work_orders', v_wo_id, client_id => client.id, sale_id => sale.id,
      to_state => dept.id, detail => svc.name || ' → ' || dept.label);

    v_project_id := null;
    if projects_on and dept.os_module is not null then
      insert into public.os_projects (module, name, description, status, client_id, settings)
      values (dept.os_module, left(client.legal_name || ' — ' || svc.name, 120),
        left(coalesce(nullif(btrim(line ->> 'description'), ''), svc.deliverables), 2000), 'active', client.id,
        case when client.origin_lead_id is not null
          then jsonb_build_object('operations', jsonb_build_object('client_lead_id', client.origin_lead_id::text)) else '{}'::jsonb end)
      returning id into v_project_id;
      update public.crm_work_orders set project_id = v_project_id where id = v_wo_id;
      n_projects := n_projects + 1;
      perform crm_private.log('project.created', dept.os_module, 'os_projects', v_project_id, client_id => client.id,
        sale_id => sale.id, project_id => v_project_id, to_state => 'active', detail => svc.name);
    end if;

    line_tasks := 0;
    if projects_on then
      for tpl, idx in select e, i from jsonb_array_elements(svc.task_template) with ordinality as x(e, i) loop
        t_offset := case when tpl ? 'offset_days' then (tpl ->> 'offset_days')::integer else 0 end;
        t_priority := coalesce(tpl ->> 'priority', 'normal');
        insert into public.crm_tasks (title, assignee_id, client_id, project_id, sale_id, work_order_id, department_id,
          priority, due_at, source, template_key)
        values (btrim(tpl ->> 'title'), assignee, client.id, v_project_id, sale.id, v_wo_id, dept.id, t_priority,
          ((start_day + t_offset)::timestamp + interval '17 hours') at time zone 'UTC', 'template', 'tpl-' || idx)
        returning id into v_task_id;
        n_tasks := n_tasks + 1; line_tasks := line_tasks + 1;
      end loop;
      if line_tasks > 0 then
        perform crm_private.log('tasks.generated', coalesce(dept.os_module, 'sales'), 'crm_work_orders', v_wo_id,
          client_id => client.id, sale_id => sale.id, project_id => v_project_id,
          detail => line_tasks || ' tarea(s) de plantilla');
      end if;
    end if;

    n_notices := n_notices + crm_private.notify(assignee, 'normal', 'delivery', 'Nuevo trabajo: ' || svc.name,
      client.legal_name || ' · ' || sale.sale_number, case when v_project_id is null then '/admin/workspace/crm/sales/' || sale.id
        else '/admin/workspace/products/' || v_project_id end, 'work-order:' || v_wo_id || ':' || assignee,
      client.id, sale.id, null);
  end loop;

  for owner_row in select m.user_id from public.agency_memberships m where m.role = 'owner' loop
    n_notices := n_notices + crm_private.notify(owner_row.user_id, 'normal', 'sales', 'Venta confirmada ' || sale.sale_number,
      client.legal_name || ' · ' || n_orders || ' servicio(s) · ' || sale.currency || ' ' || sale.total,
      '/admin/workspace/crm/sales/' || sale.id, 'sale:' || sale.id || ':' || owner_row.user_id, client.id, sale.id, null);
  end loop;
  perform crm_private.log('notification.sent', 'sales', 'crm_sales', sale.id, client_id => client.id, sale_id => sale.id,
    detail => n_notices || ' aviso(s)');

  return jsonb_build_object('sale_id', sale.id, 'sale_number', sale.sale_number, 'client_id', client.id, 'replayed', false,
    'client_created', client_created, 'contacts', n_contacts, 'work_orders', n_orders, 'projects', n_projects, 'tasks', n_tasks);
end $function$;

revoke all on function crm_private.confirm_sale_internal(jsonb) from public, anon, authenticated, service_role;

-- Preserve the canonical public API, but never accept a seller-supplied session context as authority.
CREATE OR REPLACE FUNCTION public.crm_confirm_sale(request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not crm_private.is_owner() then
    raise exception 'crm_forbidden' using errcode='42501';
  end if;
  return crm_private.confirm_sale_internal(request);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_quote_transition(p_quote uuid, p_expected_version integer, p_to text, p_note text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid(); q public.crm_quotes; cur public.crm_quote_versions; note text := btrim(coalesce(p_note, ''));
begin
  if actor is null or not (crm_private.is_owner() or crm_private.seller_owns_quote(p_quote)) then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into q from public.crm_quotes where id = p_quote for update;
  if not found then raise exception 'quote_missing' using errcode = '22023'; end if;
  if q.version <> p_expected_version then raise exception 'quote_version_conflict' using errcode = '40001'; end if;
  if not crm_private.quote_transition_allowed(q.status, p_to) then raise exception 'quote_invalid_transition' using errcode = '23514'; end if;
  if length(note) > 1000 then raise exception 'quote_invalid_note' using errcode = '22023'; end if;
  -- Pricing approval stays with the owners: a seller submits for review, an owner approves the exact revision.
  if p_to = 'approved' and not crm_private.is_owner() then raise exception 'quote_owner_approval_required' using errcode = '42501'; end if;
  -- How it was sent / who accepted and with what evidence must be written down by a person.
  if p_to in ('sent', 'accepted', 'rejected', 'superseded') and length(note) < 8 then
    raise exception 'quote_note_required' using errcode = '23514';
  end if;
  select * into cur from public.crm_quote_versions where quote_id = q.id and version_no = q.current_version;
  if not crm_private.is_owner() and not crm_private.seller_can(case p_to
      when 'draft' then 'quote_edit' when 'internal_review' then 'quote_review' when 'sent' then 'quote_send' when 'accepted' then 'quote_accept' else 'denied' end)
    then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if p_to in ('approved','sent','accepted') then
    -- Preserve owner-created custom quote-only concepts. They still cannot become a sale without a catalog mapping.
    -- A seller cannot approve/send/accept a custom concept; every seller line needs an approved offer.
    perform crm_private.assert_approved_offer(line ->> 'code') from jsonb_array_elements(cur.content -> 'lines') line
      where line ->> 'code' is not null or not crm_private.is_owner();
  end if;
  if p_to='approved' then
    insert into crm_private.quote_commercial_approvals(revision_id,digest,offers,approved_by)
    select cur.id,cur.content_sha256, coalesce(jsonb_object_agg(c.code,jsonb_build_array(c.offer_version,c.offer_approved_at)),'{}'::jsonb),actor
    from public.crm_service_catalog c where c.code in (select l->>'code' from jsonb_array_elements(cur.content->'lines') l)
    on conflict(revision_id) do update set offers=excluded.offers,approved_by=excluded.approved_by,approved_at=now();
  elsif p_to in ('sent','accepted') then
    perform crm_private.check_quote_offers(cur.id);
  end if;
  if p_to = 'accepted' then
    if not crm_private.is_owner() then
      declare acceptance jsonb := note::jsonb;
      begin
        if length(btrim(coalesce(acceptance->>'signatory',''))) not between 2 and 160
          or length(btrim(coalesce(acceptance->>'evidence',''))) not between 8 and 700 then raise exception 'quote_note_required'; end if;
        insert into crm_private.quote_acceptances(revision_id,client_signatory,evidence,recorded_by,seller_id)
        values(cur.id,btrim(acceptance->>'signatory'),btrim(acceptance->>'evidence'),actor,actor);
      end;
    end if;
    if cur.commission_status = 'to_negotiate' then raise exception 'quote_commission_to_negotiate' using errcode = '23514'; end if;
    if q.valid_until < (now() at time zone 'America/New_York')::date then raise exception 'quote_expired' using errcode = '23514'; end if;
  end if;
  update public.crm_quotes set status = p_to, version = version + 1, updated_at = now(),
      sent_at = case when p_to = 'sent' then now() else sent_at end,
      accepted_at = case when p_to = 'accepted' then now() else accepted_at end,
      decided_by = case when p_to in ('accepted', 'rejected') then actor else decided_by end
    where id = q.id;
  insert into public.crm_quote_events (quote_id, version_no, from_status, to_status, note, actor_id)
    values (q.id, q.current_version, q.status, p_to, note, actor);
  perform crm_private.log('quote.' || p_to, 'crm', 'crm_quotes', q.id, client_id => q.client_id, from_state => q.status, to_state => p_to,
    detail => q.quote_number || ' v' || q.current_version);
  return p_to;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_quote_delete(p_quote uuid, p_expected_version integer, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.crm_quotes; reason text := btrim(coalesce(p_reason, ''));
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'quote_delete_forbidden' using errcode = '42501'; end if;
  select * into q from public.crm_quotes where id = p_quote for update;
  if not found then raise exception 'quote_missing' using errcode = 'P0002'; end if;
  if q.deleted_at is not null then return jsonb_build_object('quote_id', q.id, 'replayed', true); end if;
  if p_expected_version is null or p_expected_version <> q.version then raise exception 'quote_version_conflict' using errcode = '40001'; end if;
  if length(reason) not between 1 and 500 then raise exception 'quote_delete_invalid' using errcode = '22023'; end if;
  if q.status = 'accepted' then raise exception 'quote_delete_accepted' using errcode = '23514'; end if;
  if exists (select 1 from public.crm_sales s where s.quote_id = q.id)
     or exists (select 1 from public.crm_sale_terms t where t.quote_id = q.id)
     or exists (select 1 from public.crm_client_agreement_drafts d join public.crm_quote_versions v on v.id = d.quote_version_id where v.quote_id = q.id) then
    raise exception 'quote_delete_has_dependents' using errcode = '23514';
  end if;
  perform set_config('avalon.quote_delete', 'on', true);
  update public.crm_quotes set deleted_at = now(), deleted_by = auth.uid(), delete_reason = reason, updated_at = now() where id = q.id;
  perform set_config('avalon.quote_delete', 'off', true);
  perform crm_private.log('quote.deleted', 'sales', 'crm_quotes', q.id, client_id => q.client_id, from_state => q.status, to_state => 'deleted',
    detail => left(q.quote_number || coalesce(nullif(' · ' || reason, ' · '), ''), 300), source => 'app');
  return jsonb_build_object('quote_id', q.id, 'replayed', false);
end $function$;

create or replace function public.staff_seller_quote(p_quote uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('quote_id', q.id, 'quote_number', q.quote_number, 'lead_id', q.lead_id, 'company', l.company,
    'status', q.status, 'current_version', q.current_version, 'version', q.version, 'valid_until', q.valid_until,
    'content', v.content, 'content_sha256', v.content_sha256, 'model', v.model,
    'one_time_total', v.one_time_total, 'monthly_total', v.monthly_total, 'contract_status', l.contract_status,
    'contract_verified_for_revision', exists (select 1 from public.crm_contracts co where co.lead_id=q.lead_id and co.verified_quote_revision=v.id and co.status='verified_signed' and co.verified_by is not null),
    'sale_id', (select s.id from public.crm_sales s where s.quote_id = q.id and s.seller_id=auth.uid() and crm_private.seller_can('sales_history') limit 1),
    'closed', exists (select 1 from public.crm_sales s where s.quote_id=q.id),
    'events', coalesce((select jsonb_agg(jsonb_build_object('to', e.to_status, 'from', e.from_status, 'note', case when q.created_by=auth.uid() and e.actor_id=auth.uid() then e.note end,
        'at', e.created_at, 'version', e.version_no) order by e.created_at) from public.crm_quote_events e where e.quote_id = q.id), '[]'::jsonb))
  from public.crm_quotes q
  join public.crm_leads l on l.id = q.lead_id
  join public.crm_quote_versions v on v.quote_id = q.id and v.version_no = q.current_version
  where q.id = p_quote and crm_private.seller_owns_quote(q.id)
$$;

create or replace function public.staff_seller_sales()
returns table (sale_id uuid, sale_number text, company text, sold_on date, status text, currency text, total numeric,
  recurring_monthly numeric, billing_mode text, contract_status text, quote_number text, paid_verified numeric)
language sql stable security definer set search_path = '' as $$
  select s.id, s.sale_number, coalesce(nullif(c.trade_name, ''), c.legal_name), s.sold_on, s.status, s.currency, s.total,
    s.recurring_monthly, s.billing_mode, s.contract_status, q.quote_number,
    (select coalesce(sum(p.amount), 0) from public.crm_payments p where p.sale_id = s.id and p.status = 'verified')
  from public.crm_sales s
  left join public.crm_clients c on c.id = s.client_id
  left join public.crm_quotes q on q.id = s.quote_id
  where crm_private.seller_can('sales_history') and s.seller_id = auth.uid()
  order by s.sold_on desc, s.created_at desc limit 500
$$;

create table public.crm_quote_deletion_requests (
 id uuid primary key default gen_random_uuid(), quote_id uuid not null references public.crm_quotes(id),
 lead_id uuid not null references public.crm_leads(id), requested_by uuid not null references auth.users(id),
 revision integer not null, expected_version integer not null, currency text not null,
 one_time_total numeric not null, monthly_total numeric not null,
 reason text not null check(length(btrim(reason)) between 1 and 500),
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 requested_at timestamptz not null default now(), decided_at timestamptz, decided_by uuid references auth.users(id)
);
create unique index crm_quote_one_deletion_pending on public.crm_quote_deletion_requests(quote_id) where status='pending';
alter table public.crm_quote_deletion_requests enable row level security;
revoke all on public.crm_quote_deletion_requests from public, anon, authenticated;
grant select on public.crm_quote_deletion_requests to authenticated;
create policy quote_deletion_read on public.crm_quote_deletion_requests for select to authenticated
using (crm_private.is_owner() or (requested_by=auth.uid() and crm_private.seller_owns_quote(quote_id)));

create function public.staff_request_quote_deletion(p_quote uuid,p_version integer,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare q public.crm_quotes; v public.crm_quote_versions; result uuid;
begin
 if not crm_private.seller_can('quote_delete_request') then raise exception 'crm_forbidden' using errcode='42501'; end if;
 select * into q from public.crm_quotes where id=p_quote for update;
 if not crm_private.seller_owns_quote(p_quote) then raise exception 'crm_forbidden' using errcode='42501'; end if;
 if q.version is distinct from p_version then raise exception 'quote_version_conflict' using errcode='40001'; end if;
 if q.status='accepted' then raise exception 'quote_delete_accepted' using errcode='23514'; end if;
 select * into strict v from public.crm_quote_versions where quote_id=q.id and version_no=q.current_version;
 insert into public.crm_quote_deletion_requests(quote_id,lead_id,requested_by,revision,expected_version,currency,one_time_total,monthly_total,reason)
 values(q.id,q.lead_id,auth.uid(),q.current_version,q.version,v.content->>'currency',v.one_time_total,v.monthly_total,btrim(p_reason)) returning id into result;
 return result;
end $$;

create function public.crm_decide_quote_deletion(p_request uuid,p_decision text,p_confirm boolean) returns void
language plpgsql security definer set search_path='' as $$
declare r public.crm_quote_deletion_requests;
begin
 if auth.uid() is null or not (crm_private.is_owner() or crm_private.is_seller()) then raise exception 'crm_forbidden' using errcode='42501'; end if;
 select * into r from public.crm_quote_deletion_requests where id=p_request for update;
 if not found or not (crm_private.is_owner() or (p_decision='cancelled' and r.requested_by=auth.uid() and crm_private.seller_owns_quote(r.quote_id))) then
   raise exception 'crm_forbidden' using errcode='42501'; end if;
 if p_decision is null or p_decision not in ('approved','rejected','cancelled') or (p_decision='cancelled' and r.requested_by<>auth.uid()) then raise exception 'invalid_decision'; end if;
 if r.status=p_decision then return; end if;
 if r.status<>'pending' then raise exception 'request_already_decided'; end if;
 if p_decision='approved' then
   if p_confirm is not true then raise exception 'confirmation_required'; end if;
   perform public.crm_quote_delete(r.quote_id,r.expected_version,r.reason);
 end if;
 update public.crm_quote_deletion_requests set status=p_decision,decided_at=now(),decided_by=auth.uid() where id=p_request;
end $$;
revoke all on function public.staff_request_quote_deletion(uuid,integer,text), public.crm_decide_quote_deletion(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.staff_request_quote_deletion(uuid,integer,text), public.crm_decide_quote_deletion(uuid,text,boolean) to authenticated;

drop policy staff_items_add on public.staff_work_items;
create policy staff_items_add on public.staff_work_items for insert to authenticated with check (
  ((select crm_private.is_owner()) and origin = 'staff_assigned' and created_by = (select auth.uid())
    and crm_private.is_operator(assignee_id))
  or ((select crm_private.staff_active()) and origin = 'staff_created' and assignee_id = (select auth.uid()) and created_by = (select auth.uid())
    and exists (select 1 from public.staff_portal_access a where a.user_id = (select auth.uid()) and a.active
      and a.can_create_events)));


create function public.crm_link_verified_quote_contract(p_quote uuid,p_revision uuid,p_contract uuid) returns void
language plpgsql security definer set search_path='' as $$
declare q public.crm_quotes;
begin
 if not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode='42501'; end if;
 select * into q from public.crm_quotes where id=p_quote and deleted_at is null for update;
 if q.status is distinct from 'accepted' or not exists(select 1 from public.crm_quote_versions v
   where v.id=p_revision and v.quote_id=q.id and v.version_no=q.current_version) then raise exception 'quote_version_conflict'; end if;
 update public.crm_contracts set verified_quote_revision=p_revision where id=p_contract and lead_id=q.lead_id
   and status='verified_signed' and verified_by is not null and (verified_quote_revision is null or verified_quote_revision=p_revision);
 if not found then raise exception 'won_requires_verified_contract'; end if;
 perform crm_private.log('contract.quote_linked','crm','crm_contracts',p_contract,detail=>q.quote_number || ' v' || q.current_version);
end $$;
revoke all on function public.crm_link_verified_quote_contract(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_link_verified_quote_contract(uuid,uuid,uuid) to authenticated;

create or replace function crm_private.staff_own_commercial_history()
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
  where crm_private.seller_can('sales_history') and s.status in ('confirmed', 'cancelled')
  union all
  select 'commission'::text, c.id, visible_sale.sale_number, (c.agreed_at at time zone 'UTC')::date,
    c.status, c.amount::text, c.currency, null::boolean
  from caller u join public.crm_commissions c on c.beneficiary_id = u.id
  left join public.crm_sales visible_sale on visible_sale.id = c.sale_id and visible_sale.seller_id = u.id
  where crm_private.seller_can('commission_history')
$$;

revoke all on function crm_private.staff_own_commercial_history() from public, anon, authenticated;
grant execute on function crm_private.staff_own_commercial_history() to authenticated;

