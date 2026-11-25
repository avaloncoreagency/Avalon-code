-- Seller pipeline: verified sellers create and work their OWN leads, proposals and sales; only that seller and the
-- two owners can see them. Sellers keep their own calendar; owners keep full control of every employee calendar.
--
-- Security model (additive, review-only until the owners approve production):
--   * The full CRM tables stay owner-only by RLS. Sellers never get table grants or policies on crm_leads/quotes/sales.
--   * Sellers act only through SECURITY DEFINER RPCs that check, inside the database, that the record belongs to
--     the caller: crm_leads.owner_id = auth.uid() (leads), the quote's lead (quotes) and crm_sales.seller_id (sales).
--   * Existing owner RPCs (quotes, close sale) accept a seller only for their own lead. Approving a quote's pricing,
--     verifying contracts, payments, refunds, commissions and settlements remain owner-only.
--   * CRM write guards (crm_private.stamp, crm_confirm_sale) recognise a seller only inside a transaction-scoped
--     context opened by these definer RPCs (crm_private.begin_seller_act). RLS still blocks any direct table write.
--   * Employees (operators) must have a verified TOTP factor and an AAL2 session for any staff data (was opt-in).
-- Owners are unaffected: their MFA policy and every owner-only path are unchanged.
begin;

-- ── 1. Mandatory MFA for employees ──────────────────────────────────────────────────────────────────────────────
create function crm_private.staff_mfa_satisfied() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and auth.jwt() ->> 'aal' = 'aal2'
    and exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified' and f.factor_type::text = 'totp')
$$;
revoke all on function crm_private.staff_mfa_satisfied() from public, anon, authenticated;
grant execute on function crm_private.staff_mfa_satisfied() to authenticated, service_role;

create or replace function crm_private.staff_active() returns boolean
language sql stable security invoker set search_path = '' as $$
 select (select crm_private.staff_mfa_satisfied()) and exists (
   select 1 from public.staff_portal_access a
   join public.agency_memberships m on m.user_id = a.user_id
   where a.user_id = (select auth.uid()) and m.role = 'operator' and a.active
 );
$$;

-- ── 2. Seller identity and ownership helpers (booleans about the caller only) ──────────────────────────────────
create function crm_private.is_seller() returns boolean
language sql stable security definer set search_path = '' as $$
  select crm_private.staff_active() and exists (
    select 1 from public.staff_portal_access a
    where a.user_id = auth.uid() and a.active and a.job_title in ('seller', 'account_executive'))
$$;

create function crm_private.seller_owns_lead(p_lead uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_lead is not null and crm_private.is_seller() and exists (
    select 1 from public.crm_leads l where l.id = p_lead and l.owner_id = auth.uid() and not l.archived)
$$;

create function crm_private.seller_owns_quote(p_quote uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_quote is not null and exists (
    select 1 from public.crm_quotes q where q.id = p_quote and q.deleted_at is null and crm_private.seller_owns_lead(q.lead_id))
$$;

-- Transaction-scoped seller context. Only definer RPCs below open it, after their own ownership checks; PostgREST
-- runs each RPC in its own transaction, so the context ends with the call. It is only an extra gate: RLS still
-- denies sellers every direct write to CRM tables.
create function crm_private.begin_seller_act() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm_private.is_seller() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  perform set_config('avalon.seller_act', auth.uid()::text, true);
end $$;

create function crm_private.seller_acting() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and current_setting('avalon.seller_act', true) = auth.uid()::text and crm_private.is_seller()
$$;

-- Delivery work created by a seller's sale is routed to an owner when the catalog has no default assignee.
create function crm_private.default_owner() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.user_id from public.agency_memberships m where m.role = 'owner' order by m.created_at, m.user_id limit 1
$$;

revoke all on function crm_private.is_seller(), crm_private.seller_owns_lead(uuid), crm_private.seller_owns_quote(uuid),
  crm_private.begin_seller_act(), crm_private.seller_acting(), crm_private.default_owner() from public, anon, authenticated;
grant execute on function crm_private.is_seller(), crm_private.seller_owns_lead(uuid), crm_private.seller_owns_quote(uuid),
  crm_private.seller_acting() to authenticated;
-- CRM write guards (stamp) also run for trusted server workers (Radar) under service_role.
grant execute on function crm_private.seller_acting() to service_role;

-- ── 3. CRM write guard and existing owner RPCs: accept a seller only for their own records ──────────────────────
CREATE OR REPLACE FUNCTION crm_private.stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if not (crm_private.is_owner() or crm_private.seller_acting()) then raise exception 'CRM forbidden' using errcode='42501'; end if;
 if TG_OP='INSERT' then new.created_by := auth.uid(); new.created_at := now(); new.version := 1;
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
end $function$;

CREATE OR REPLACE FUNCTION public.crm_quote_create(p_lead uuid, p_request_key uuid, p_content jsonb, p_internal jsonb, p_sha256 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid(); chk record; q public.crm_quotes; v_client uuid; v_number text;
begin
  if actor is null or not (crm_private.is_owner() or crm_private.seller_owns_lead(p_lead)) then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if p_request_key is null then raise exception 'quote_invalid_request' using errcode = '22023'; end if;
  select * into q from public.crm_quotes where request_key = p_request_key;
  if found then return jsonb_build_object('quote_id', q.id, 'quote_number', q.quote_number, 'version', q.current_version, 'existing', true); end if;
  if not exists (select 1 from public.crm_leads l where l.id = p_lead and not l.archived) then
    raise exception 'quote_lead_missing' using errcode = '22023';
  end if;
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
  if actor is null or not (crm_private.is_owner() or crm_private.seller_owns_quote(p_quote)) then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into q from public.crm_quotes where id = p_quote for update;
  if not found then raise exception 'quote_missing' using errcode = '22023'; end if;
  if q.version <> p_expected_version then raise exception 'quote_version_conflict' using errcode = '40001'; end if;
  -- Sent, accepted or closed quotes are never edited in place: the client may already hold that PDF.
  if q.status not in ('draft', 'internal_review', 'approved') then raise exception 'quote_not_revisable' using errcode = '23514'; end if;
  if length(coalesce(p_note, '')) > 1000 then raise exception 'quote_invalid_note' using errcode = '22023'; end if;
  -- Internal notes are private to the proposal's author and the owners: a seller who inherits the lead revises the
  -- client-facing content only and the previous internal notes are carried over untouched.
  if not crm_private.is_owner() and q.created_by is distinct from actor then
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
  if p_to = 'accepted' then
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
  -- Deleting a proposal is reserved to the owners (sellers revise or supersede, never delete).
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'quote_delete_forbidden' using errcode = '42501'; end if;
  select * into q from public.crm_quotes where id = p_quote for update;
  if not found then raise exception 'quote_missing' using errcode = 'P0002'; end if;
  if q.deleted_at is not null then return jsonb_build_object('quote_id', q.id, 'replayed', true); end if;
  if p_expected_version is null or p_expected_version <> q.version then raise exception 'quote_version_conflict' using errcode = '40001'; end if;
  if length(reason) > 500 then raise exception 'quote_delete_invalid' using errcode = '22023'; end if;
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
  if auth.uid() is null or not (crm_private.is_owner()
      or crm_private.seller_owns_quote(crm_private.uuid_or_null(request ->> 'quote_id'))
      -- The seller who closed it keeps an idempotent replay of their own sale after the lead is handed to someone else.
      or (crm_private.is_seller() and exists (select 1 from public.crm_sales s
            where s.quote_id = crm_private.uuid_or_null(request ->> 'quote_id') and s.seller_id = auth.uid()))) then
    raise exception 'crm_forbidden' using errcode = '42501';
  end if;
  if request is null or jsonb_typeof(request) <> 'object' then raise exception 'quote_close_invalid' using errcode = '22023'; end if;
  select * into q from public.crm_quotes where id = crm_private.uuid_or_null(request ->> 'quote_id') for update;
  if not found then raise exception 'quote_not_found' using errcode = 'P0002'; end if;
  select * into v from public.crm_quote_versions where quote_id = q.id and version_no = q.current_version;
  -- Fidelity: the person closing must be looking at the revision that was accepted.
  if coalesce((request ->> 'version_no')::integer, -1) <> q.current_version then raise exception 'quote_version_changed' using errcode = '40001'; end if;
  select * into existing from public.crm_sales where quote_version_id = v.id;
  if found then
    -- Replays are idempotent for the seller who closed it (and owners); a seller who later inherits the lead gets no
    -- view of a sale attributed to someone else.
    if not crm_private.is_owner() and existing.seller_id is distinct from auth.uid() then
      raise exception 'quote_closed_by_other_seller' using errcode = '42501';
    end if;
    return jsonb_build_object('sale_id', existing.id, 'sale_number', existing.sale_number, 'client_id', existing.client_id, 'replayed', true);
  end if;
  if q.status <> 'accepted' then raise exception 'quote_not_accepted' using errcode = '23514'; end if;
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
    -- The seller context only authorises confirming the sale of THIS accepted revision (never a direct confirmation).
    perform set_config('avalon.seller_close', v.id::text, true);
  end if;
  -- Same transaction: crm_confirm_sale enforces the won gate (verified contract), creates client/work orders/projects,
  -- and replays on the same key. The key is derived from the revision, so retries can never create a second sale.
  r := public.crm_confirm_sale(jsonb_build_object(
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

CREATE OR REPLACE FUNCTION public.crm_confirm_sale(request jsonb)
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
      -- A seller reaches this only from crm_quote_close_sale for the accepted revision it is closing, and only for a
      -- lead that is theirs: a direct confirmation by a seller is always refused.
      or (crm_private.seller_acting() and crm_private.seller_owns_lead(crm_private.uuid_or_null(request ->> 'lead_id'))
          and nullif(request ->> 'quote_version_id', '') is not null
          and current_setting('avalon.seller_close', true) = request ->> 'quote_version_id'
          -- Defense in depth: even a forged context only reaches the accepted, current revision of a quote on that lead.
          and exists (select 1 from public.crm_quote_versions qv join public.crm_quotes qq on qq.id = qv.quote_id
            where qv.id = crm_private.uuid_or_null(request ->> 'quote_version_id')
              and qq.lead_id = crm_private.uuid_or_null(request ->> 'lead_id') and qq.status = 'accepted'
              and qq.current_version = qv.version_no and qq.deleted_at is null))) then raise exception 'crm_forbidden' using errcode = '42501'; end if;
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

-- Audit trail: a seller's own actions (inside the seller context) are recorded with the seller as actor.
create or replace function crm_private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not (exists(select 1 from public.agency_memberships where user_id=auth.uid() and role='owner')
     or crm_private.seller_acting()) then raise exception 'CRM forbidden' using errcode='42501'; end if;
 insert into public.crm_audit(entity,record_id,actor_id,operation,before_data,after_data)
 values(TG_TABLE_NAME,new.id,auth.uid(),TG_OP,case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;

-- ── 4. Seller leads ─────────────────────────────────────────────────────────────────────────────────────────────
alter table public.crm_leads add column request_key uuid;
create unique index crm_leads_request_key on public.crm_leads (request_key) where request_key is not null;

create function crm_private.staff_text(v jsonb, k text, max_len integer) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := btrim(coalesce(v ->> k, ''));
begin
  if length(t) > max_len then raise exception 'staff_lead_invalid' using errcode = '22023', detail = k; end if;
  return t;
end $$;
revoke all on function crm_private.staff_text(jsonb, text, integer) from public, anon, authenticated;

-- A seller creates a lead that is theirs from the start (owner_id = seller) with a working grant for them only.
create function public.staff_lead_create(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); v_key uuid; l public.crm_leads; v_email text; v_value numeric; v_follow timestamptz;
begin
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

-- A seller updates the commercial fields of their own lead. Won comes only from closing a sale; lost needs a reason.
create function public.staff_lead_update(p_lead uuid, p_expected_version integer, request jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare l public.crm_leads; v_stage text; v_kind text; v_email text; v_value numeric; v_follow timestamptz;
begin
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

-- Owners hand a lead to exactly one seller (or take it back). Every other employee's lead grant is closed (by the
-- crm_leads_owner_grants trigger below), so the lead is visible only to that seller and the owners.
create function public.crm_lead_assign_seller(p_lead uuid, p_seller uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_to uuid;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.crm_leads l where l.id = p_lead and not l.archived) then
    raise exception 'staff_lead_missing' using errcode = '22023';
  end if;
  if p_seller is not null and not exists (
      select 1 from public.staff_portal_access a join public.agency_memberships m on m.user_id = a.user_id
      where a.user_id = p_seller and a.active and m.role = 'operator' and a.job_title in ('seller', 'account_executive')) then
    raise exception 'staff_seller_invalid' using errcode = '22023';
  end if;
  v_to := coalesce(p_seller, auth.uid());
  -- Sales, commissions and proposals keep their attribution (seller_id / beneficiary / author); only the lead moves.
  -- Seller grants follow the assignment through crm_leads_owner_grants.
  update public.crm_leads set owner_id = v_to where id = p_lead and owner_id is distinct from v_to;
  perform crm_private.log('lead.assigned_to_seller', 'crm', 'crm_leads', p_lead, to_state => case when p_seller is null then 'owner' else 'seller' end);
end $$;

-- ── 5. Seller read models (only the caller's own records; never another seller's) ──────────────────────────────
create function public.staff_seller_leads()
returns table (lead_id uuid, company text, contact text, contact_title text, email text, phone text, website text, city text,
  stage_id text, stage_label text, stage_kind text, value numeric, next_action text, follow_up_at timestamptz,
  contract_status text, version integer, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.id, l.company, l.contact, l.contact_title, l.email, l.phone, l.website, l.city, l.stage_id, s.label, s.kind,
    l.value, l.next_action, l.follow_up_at, l.contract_status, l.version, l.updated_at
  from public.crm_leads l join public.crm_stages s on s.id = l.stage_id
  where crm_private.is_seller() and l.owner_id = auth.uid() and not l.archived
  order by l.updated_at desc limit 500
$$;

create function public.staff_seller_stages()
returns table (id text, label text, kind text, "position" integer)
language sql stable security definer set search_path = '' as $$
  select s.id, s.label, s.kind, s.position from public.crm_stages s where crm_private.is_seller() order by s.position
$$;

create function public.staff_seller_catalog()
returns table (code text, name text, name_en text, deliverables text, billing_type text, suggested_price numeric,
  monthly_price numeric, offer_status text)
language sql stable security definer set search_path = '' as $$
  select c.code, c.name, c.name_en, c.deliverables, c.billing_type, c.suggested_price, c.monthly_price, c.offer_status
  from public.crm_service_catalog c where crm_private.is_seller() and c.active order by c.name
$$;

create function public.staff_seller_quotes()
returns table (quote_id uuid, quote_number text, lead_id uuid, company text, title text, status text, current_version integer,
  valid_until date, model text, one_time_total numeric, monthly_total numeric, version integer, sale_id uuid, sale_number text,
  updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select q.id, q.quote_number, q.lead_id, l.company, q.title, q.status, q.current_version, q.valid_until, v.model,
    v.one_time_total, v.monthly_total, q.version, s.id, s.sale_number, q.updated_at
  from public.crm_quotes q
  join public.crm_leads l on l.id = q.lead_id and l.owner_id = auth.uid()
  join public.crm_quote_versions v on v.quote_id = q.id and v.version_no = q.current_version
  left join public.crm_sales s on s.quote_id = q.id and s.seller_id = auth.uid()
  where crm_private.is_seller() and q.deleted_at is null
  order by q.updated_at desc limit 500
$$;

-- One quote with its client-facing content. Internal notes and event notes only for the proposal's author; the sale
-- only when it is attributed to the caller (a lead handed to another seller keeps its history with its author).
create function public.staff_seller_quote(p_quote uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('quote_id', q.id, 'quote_number', q.quote_number, 'lead_id', q.lead_id, 'company', l.company,
    'status', q.status, 'current_version', q.current_version, 'version', q.version, 'valid_until', q.valid_until,
    'content', v.content, 'content_sha256', v.content_sha256,
    -- Internal notes and the negotiation log belong to the proposal's author (and the owners), not to a later seller.
    'internal', case when q.created_by = auth.uid() then v.internal end, 'model', v.model,
    'one_time_total', v.one_time_total, 'monthly_total', v.monthly_total, 'contract_status', l.contract_status,
    'sale_id', (select s.id from public.crm_sales s where s.quote_id = q.id and s.seller_id = auth.uid() limit 1),
    -- Whether the proposal was already closed as a sale (by anyone), without revealing whose sale it is.
    'closed', exists (select 1 from public.crm_sales s where s.quote_id = q.id),
    'events', coalesce((select jsonb_agg(jsonb_build_object('to', e.to_status, 'from', e.from_status,
        'note', case when q.created_by = auth.uid() then e.note end,
        'at', e.created_at, 'version', e.version_no) order by e.created_at) from public.crm_quote_events e where e.quote_id = q.id), '[]'::jsonb))
  from public.crm_quotes q
  join public.crm_leads l on l.id = q.lead_id
  join public.crm_quote_versions v on v.quote_id = q.id and v.version_no = q.current_version
  where q.id = p_quote and crm_private.seller_owns_quote(q.id)
$$;

create function public.staff_seller_sales()
returns table (sale_id uuid, sale_number text, company text, sold_on date, status text, currency text, total numeric,
  recurring_monthly numeric, billing_mode text, contract_status text, quote_number text, paid_verified numeric)
language sql stable security definer set search_path = '' as $$
  select s.id, s.sale_number, coalesce(nullif(c.trade_name, ''), c.legal_name), s.sold_on, s.status, s.currency, s.total,
    s.recurring_monthly, s.billing_mode, s.contract_status, q.quote_number,
    (select coalesce(sum(p.amount), 0) from public.crm_payments p where p.sale_id = s.id and p.status = 'verified')
  from public.crm_sales s
  left join public.crm_clients c on c.id = s.client_id
  left join public.crm_quotes q on q.id = s.quote_id
  where crm_private.is_seller() and s.seller_id = auth.uid()
  order by s.sold_on desc, s.created_at desc limit 500
$$;

revoke all on function public.staff_lead_create(jsonb), public.staff_lead_update(uuid, integer, jsonb),
  public.crm_lead_assign_seller(uuid, uuid), public.staff_seller_leads(), public.staff_seller_stages(), public.staff_seller_catalog(),
  public.staff_seller_quotes(), public.staff_seller_quote(uuid), public.staff_seller_sales() from public, anon;
grant execute on function public.staff_lead_create(jsonb), public.staff_lead_update(uuid, integer, jsonb),
  public.crm_lead_assign_seller(uuid, uuid), public.staff_seller_leads(), public.staff_seller_stages(), public.staff_seller_catalog(),
  public.staff_seller_quotes(), public.staff_seller_quote(uuid), public.staff_seller_sales() to authenticated;

-- ── 6. Calendars ───────────────────────────────────────────────────────────────────────────────────────────────
-- Sellers always keep their own calendar (appointments, tasks, follow-ups); other employees still need the flag.
drop policy staff_items_add on public.staff_work_items;
create policy staff_items_add on public.staff_work_items for insert to authenticated with check (
  ((select crm_private.is_owner()) and origin = 'staff_assigned' and created_by = (select auth.uid())
    and crm_private.is_operator(assignee_id))
  or ((select crm_private.staff_active()) and origin = 'staff_created' and assignee_id = (select auth.uid()) and created_by = (select auth.uid())
    and exists (select 1 from public.staff_portal_access a where a.user_id = (select auth.uid()) and a.active
      and (a.can_create_events or a.job_title in ('seller', 'account_executive')))));

-- Owners control every employee calendar: besides creating, editing, reassigning and cancelling, they may delete.
grant delete on public.staff_work_items to authenticated;
create policy staff_items_remove on public.staff_work_items for delete to authenticated using ((select crm_private.is_owner()));

-- ── 7. One source of truth for a seller's leads: the exclusive assignment (crm_leads.owner_id) ─────────────────────
-- Legacy staff_lead_grants stay for non-seller staff (view/work collaboration). For sellers a grant is only the mirror of
-- the assignment: active iff the lead is theirs, always 'work'. It cannot be granted or revoked on its own.
create function crm_private.is_seller_user(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and exists (select 1 from public.staff_portal_access a
    where a.user_id = p_user and a.job_title in ('seller', 'account_executive'))
$$;
revoke all on function crm_private.is_seller_user(uuid) from public, anon, authenticated;

create function crm_private.staff_lead_grant_exclusive() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if not crm_private.is_seller_user(new.user_id) then return new; end if;
  select l.owner_id into v_owner from public.crm_leads l where l.id = new.lead_id;
  if new.active is distinct from (v_owner is not distinct from new.user_id) then
    raise exception 'staff_lead_use_assignment' using errcode = '23514';
  end if;
  if new.active then new.access_level := 'work'; end if;
  return new;
end $$;
revoke all on function crm_private.staff_lead_grant_exclusive() from public, anon, authenticated;
create trigger staff_lead_grant_exclusive before insert or update on public.staff_lead_grants
  for each row execute function crm_private.staff_lead_grant_exclusive();

create function crm_private.lead_owner_sync_grants() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is not distinct from old.owner_id then return null; end if;
  -- Handing a lead to (or taking it back from) a seller is exclusive: every other employee's grant is closed, so the
  -- lead is visible only to that seller and the owners (owners may share it again with non-seller staff afterwards).
  -- A move between owners only closes seller mirrors.
  update public.staff_lead_grants g set active = false, updated_at = now()
    where g.lead_id = new.id and g.active and g.user_id is distinct from new.owner_id
      and (crm_private.is_seller_user(new.owner_id) or crm_private.is_seller_user(old.owner_id) or crm_private.is_seller_user(g.user_id));
  if crm_private.is_seller_user(new.owner_id) then
    insert into public.staff_lead_grants (user_id, lead_id, access_level, active, granted_by)
      values (new.owner_id, new.id, 'work', true, auth.uid())
    on conflict (user_id, lead_id) do update set access_level = 'work', active = true, granted_by = excluded.granted_by, updated_at = now();
  end if;
  return null;
end $$;
revoke all on function crm_private.lead_owner_sync_grants() from public, anon, authenticated;
create trigger crm_leads_owner_grants after update of owner_id on public.crm_leads
  for each row execute function crm_private.lead_owner_sync_grants();

commit;
