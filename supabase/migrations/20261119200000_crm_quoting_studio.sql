-- Avalon OS · Commercial Core 360 · Quoting Studio. ADDITIVE ONLY.
-- REVIEW ONLY until an owner explicitly approves applying it to production.
--
--  1. crm_quotes: one commercial quote per opportunity (crm_leads). The client is DERIVED from crm_clients.origin_lead_id,
--     never accepted from the caller, so a quote cannot be attached to another company.
--  2. crm_quote_versions: append-only revisions. Client-facing content and Avalon-internal notes are stored in separate
--     columns; totals are computed here from the content (exact numeric), never trusted from the browser.
--  3. crm_quote_events: every status change with actor and note. "Sent" records a manual send; no e-mail is delivered.
--     Acceptance needs written evidence and never creates a sale, contract signature, invoice or payment.
--  4. No INSERT/UPDATE/DELETE grants on these tables: writes go only through owner-checked RPCs below.
--  5. crm_client_agreement_drafts.quote_version_id: a contract draft may reference the exact accepted revision.
--     Enforced by a trigger (no RLS policy is changed).

begin;

create sequence if not exists crm_private.quote_number_seq;

create table public.crm_quotes (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  quote_number text not null unique check (quote_number ~ '^Q-[0-9]{4}-[0-9]{4,}$'),
  lead_id uuid not null references public.crm_leads (id),
  client_id uuid references public.crm_clients (id),
  title text not null check (length(btrim(title)) between 1 and 200),
  status text not null default 'draft' check (status in ('draft', 'internal_review', 'approved', 'sent', 'accepted', 'rejected', 'expired', 'superseded')),
  current_version integer not null default 1 check (current_version >= 1),
  valid_until date not null,
  request_key uuid not null unique,                       -- idempotency: a double tap cannot create two quotes
  sent_at timestamptz,
  accepted_at timestamptz,
  decided_by uuid references auth.users (id),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1                      -- optimistic concurrency for revisions/transitions
);
create index crm_quotes_lead on public.crm_quotes (lead_id, created_at desc);
create index crm_quotes_client on public.crm_quotes (client_id, created_at desc) where client_id is not null;
create index crm_quotes_status on public.crm_quotes (status, valid_until);
create index crm_quotes_decided_by on public.crm_quotes (decided_by) where decided_by is not null;
create index crm_quotes_created_by on public.crm_quotes (created_by);

create table public.crm_quote_versions (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  quote_id uuid not null references public.crm_quotes (id),
  version_no integer not null check (version_no >= 1),
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 131072),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  internal jsonb not null default '{}'::jsonb check (jsonb_typeof(internal) = 'object' and pg_column_size(internal) <= 32768),
  model text not null check (model in ('fixed', 'monthly', 'commission', 'hybrid')),
  currency text not null default 'USD' check (currency = 'USD'),
  one_time_total numeric(15, 2) not null check (one_time_total >= 0),
  monthly_total numeric(15, 2) not null check (monthly_total >= 0),
  commission_status text check (commission_status is null or commission_status in ('proposed', 'to_negotiate')),
  commission_pct numeric(5, 2) check (commission_pct is null or commission_pct > 0 and commission_pct <= 100),
  change_note text not null default '' check (length(change_note) <= 1000),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (quote_id, version_no),
  check ((commission_status = 'proposed') = (commission_pct is not null))
);
create index crm_quote_versions_created_by on public.crm_quote_versions (created_by);

create table public.crm_quote_events (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  quote_id uuid not null references public.crm_quotes (id),
  version_no integer not null,
  from_status text,
  to_status text not null,
  note text not null default '' check (length(note) <= 1000),
  actor_id uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index crm_quote_events_quote on public.crm_quote_events (quote_id, created_at);
create index crm_quote_events_actor on public.crm_quote_events (actor_id);

alter table public.crm_client_agreement_drafts add column if not exists quote_version_id uuid references public.crm_quote_versions (id);
create index if not exists crm_client_agreement_drafts_quote_version on public.crm_client_agreement_drafts (quote_version_id) where quote_version_id is not null;

alter table public.crm_quotes enable row level security;
alter table public.crm_quote_versions enable row level security;
alter table public.crm_quote_events enable row level security;
revoke all on public.crm_quotes from anon;
revoke all on public.crm_quote_versions from anon;
revoke all on public.crm_quote_events from anon;
revoke all on public.crm_quotes, public.crm_quote_versions, public.crm_quote_events from public, authenticated;
grant select on public.crm_quotes, public.crm_quote_versions, public.crm_quote_events to authenticated;
create policy owner_select_quotes on public.crm_quotes for select to authenticated
  using (agency_key = 'avalon' and (select crm_private.is_owner()));
create policy owner_select_quote_versions on public.crm_quote_versions for select to authenticated
  using (agency_key = 'avalon' and (select crm_private.is_owner()));
create policy owner_select_quote_events on public.crm_quote_events for select to authenticated
  using (agency_key = 'avalon' and (select crm_private.is_owner()));

-- ── Validation + exact totals (the database is the authority) ─────────────────────────────────────────────────
create function crm_private.quote_check(p_content jsonb, p_internal jsonb, p_sha text,
  out model text, out one_time numeric, out monthly numeric, out cm_status text, out cm_pct numeric, out title text, out valid_until date)
language plpgsql immutable set search_path = '' as $$
declare
  line jsonb; amount numeric; qty integer; n integer := 0; cm jsonb;
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object' or p_content->>'schemaVersion' <> '1'
     or p_content->>'currency' is distinct from 'USD' or coalesce(p_content->>'lang', '') not in ('es', 'en') then
    raise exception 'quote_invalid_content' using errcode = '22023';
  end if;
  if p_internal is null or jsonb_typeof(p_internal) <> 'object' then raise exception 'quote_invalid_internal' using errcode = '22023'; end if;
  if p_sha is null or p_sha !~ '^[0-9a-f]{64}$' then raise exception 'quote_invalid_digest' using errcode = '22023'; end if;
  model := p_content->>'model';
  if model is null or model not in ('fixed', 'monthly', 'commission', 'hybrid') then raise exception 'quote_invalid_model' using errcode = '22023'; end if;
  title := btrim(coalesce(p_content->>'title', ''));
  if length(title) not between 1 and 200 then raise exception 'quote_invalid_title' using errcode = '22023'; end if;
  begin
    valid_until := (p_content->>'validUntil')::date;
    if valid_until < (p_content->>'issueDate')::date then raise exception 'quote_invalid_dates' using errcode = '22023'; end if;
  exception when invalid_datetime_format or datetime_field_overflow or null_value_not_allowed then
    raise exception 'quote_invalid_dates' using errcode = '22023';
  end;
  if valid_until is null then raise exception 'quote_invalid_dates' using errcode = '22023'; end if;
  if jsonb_typeof(p_content->'lines') <> 'array' or jsonb_array_length(p_content->'lines') > 30 then
    raise exception 'quote_invalid_lines' using errcode = '22023';
  end if;
  one_time := 0; monthly := 0;
  for line in select value from jsonb_array_elements(p_content->'lines') loop
    n := n + 1;
    if coalesce(line->>'unitPrice', '') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' or coalesce(line->>'qty', '') !~ '^[0-9]{1,3}$'
       or coalesce(line->>'kind', '') not in ('one_time', 'monthly') or length(btrim(coalesce(line->>'name', ''))) not between 1 and 200 then
      raise exception 'quote_invalid_lines' using errcode = '22023';
    end if;
    qty := (line->>'qty')::integer;
    if qty < 1 then raise exception 'quote_invalid_lines' using errcode = '22023'; end if;
    amount := (line->>'unitPrice')::numeric * qty;
    if line->>'kind' = 'monthly' then monthly := monthly + amount; else one_time := one_time + amount; end if;
  end loop;
  cm := p_content->'commission';
  if cm is null or jsonb_typeof(cm) = 'null' then
    cm_status := null; cm_pct := null;
  else
    cm_status := cm->>'status';
    if cm_status = 'proposed' then
      if coalesce(cm->>'pct', '') !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$' or (cm->>'pct')::numeric <= 0 or (cm->>'pct')::numeric > 100 then
        raise exception 'quote_invalid_commission' using errcode = '22023';
      end if;
      cm_pct := (cm->>'pct')::numeric;
    elsif cm_status = 'to_negotiate' then
      if coalesce(cm->>'pct', '') <> '' then raise exception 'quote_invalid_commission' using errcode = '22023'; end if;
      cm_pct := null;
    else
      raise exception 'quote_invalid_commission' using errcode = '22023';
    end if;
    if length(btrim(coalesce(cm->>'trigger', ''))) = 0 or length(btrim(coalesce(cm->>'evidence', ''))) = 0 then
      raise exception 'quote_invalid_commission' using errcode = '22023';
    end if;
  end if;
  -- Same per-model shape as the application: what is charged can never be mixed up.
  if (model = 'fixed' and (one_time = 0 or monthly > 0 or cm_status is not null))
     or (model = 'monthly' and (monthly = 0 or cm_status is not null))
     or (model = 'commission' and cm_status is null)
     or (model = 'hybrid' and ((one_time > 0)::int + (monthly > 0)::int + (cm_status is not null)::int) < 2) then
    raise exception 'quote_invalid_model_shape' using errcode = '22023';
  end if;
end $$;
revoke all on function crm_private.quote_check(jsonb, jsonb, text) from public;

create function crm_private.quote_transition_allowed(p_from text, p_to text) returns boolean
language sql immutable set search_path = '' as $$
  select (p_from, p_to) in (
    ('draft', 'internal_review'), ('draft', 'superseded'),
    ('internal_review', 'approved'), ('internal_review', 'draft'), ('internal_review', 'superseded'),
    ('approved', 'sent'), ('approved', 'draft'), ('approved', 'superseded'),
    ('sent', 'accepted'), ('sent', 'rejected'), ('sent', 'expired'), ('sent', 'superseded'))
$$;
revoke all on function crm_private.quote_transition_allowed(text, text) from public;

-- ── RPCs (owner only) ───────────────────────────────────────────────────────────────────────────────────────────
create function public.crm_quote_create(p_lead uuid, p_request_key uuid, p_content jsonb, p_internal jsonb, p_sha256 text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); chk record; q public.crm_quotes; v_client uuid; v_number text;
begin
  if actor is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
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
end $$;

create function public.crm_quote_revise(p_quote uuid, p_expected_version integer, p_content jsonb, p_internal jsonb, p_sha256 text, p_note text default '')
returns integer language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); chk record; q public.crm_quotes; latest public.crm_quote_versions; next_no integer;
begin
  if actor is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into q from public.crm_quotes where id = p_quote for update;
  if not found then raise exception 'quote_missing' using errcode = '22023'; end if;
  if q.version <> p_expected_version then raise exception 'quote_version_conflict' using errcode = '40001'; end if;
  -- Sent, accepted or closed quotes are never edited in place: the client may already hold that PDF.
  if q.status not in ('draft', 'internal_review', 'approved') then raise exception 'quote_not_revisable' using errcode = '23514'; end if;
  if length(coalesce(p_note, '')) > 1000 then raise exception 'quote_invalid_note' using errcode = '22023'; end if;
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
end $$;

create function public.crm_quote_transition(p_quote uuid, p_expected_version integer, p_to text, p_note text default '')
returns text language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); q public.crm_quotes; cur public.crm_quote_versions; note text := btrim(coalesce(p_note, ''));
begin
  if actor is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  select * into q from public.crm_quotes where id = p_quote for update;
  if not found then raise exception 'quote_missing' using errcode = '22023'; end if;
  if q.version <> p_expected_version then raise exception 'quote_version_conflict' using errcode = '40001'; end if;
  if not crm_private.quote_transition_allowed(q.status, p_to) then raise exception 'quote_invalid_transition' using errcode = '23514'; end if;
  if length(note) > 1000 then raise exception 'quote_invalid_note' using errcode = '22023'; end if;
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
end $$;

-- Pipeline summary for the dashboard: counts only, no amounts mixed across currencies (USD only today).
create function public.crm_quote_summary() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'draft', count(*) filter (where q.status in ('draft', 'internal_review', 'approved')),
    'sent', count(*) filter (where q.status = 'sent' and q.valid_until >= (now() at time zone 'America/New_York')::date),
    'overdue', count(*) filter (where q.status = 'sent' and q.valid_until < (now() at time zone 'America/New_York')::date),
    'accepted_without_contract', count(*) filter (where q.status = 'accepted' and not exists (
      select 1 from public.crm_client_agreement_drafts d join public.crm_quote_versions v on v.id = d.quote_version_id where v.quote_id = q.id)))
  from public.crm_quotes q
$$;

revoke all on function public.crm_quote_create(uuid, uuid, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.crm_quote_revise(uuid, integer, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.crm_quote_transition(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.crm_quote_summary() from public, anon, authenticated;
grant execute on function public.crm_quote_create(uuid, uuid, jsonb, jsonb, text) to authenticated;
grant execute on function public.crm_quote_revise(uuid, integer, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.crm_quote_transition(uuid, integer, text, text) to authenticated;
grant execute on function public.crm_quote_summary() to authenticated;

-- ── Contract draft ← exact accepted revision ───────────────────────────────────────────────────────────────────

create function crm_private.agreement_quote_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.quote_version_id is null then return new; end if;
  -- Only the CURRENT revision of an ACCEPTED quote for the SAME company (its client, or the client registered later from
  -- the same opportunity) can seed a contract draft.
  if not exists (
    select 1 from public.crm_quote_versions v join public.crm_quotes q on q.id = v.quote_id
    where v.id = new.quote_version_id and q.status = 'accepted' and v.version_no = q.current_version
      and exists (select 1 from public.crm_clients c where c.id = new.client_id and (c.id = q.client_id or c.origin_lead_id = q.lead_id))) then
    raise exception 'agreement_quote_not_accepted' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function crm_private.agreement_quote_guard() from public;
create trigger crm_client_agreement_drafts_quote_guard before insert on public.crm_client_agreement_drafts
  for each row execute function crm_private.agreement_quote_guard();

commit;
