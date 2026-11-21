-- Avalon OS · P0.1 Preserve every website inquiry (message, provenance, review). ADDITIVE ONLY.
-- REVIEW ONLY until an owner explicitly authorizes applying it to production (with a verified backup).
--
-- Defect fixed: crm_public_inquiries stored no message. When the same e-mail wrote again, the function reused the
-- existing prospect and the second message was lost (production had 4 receipts for 3 prospects on 2026-11-20).
-- Now every accepted submission is its own recoverable event:
--   * message (validated, <= 2000 chars) + sha256, source, services, language, consent_version (only when the form
--     sends a reviewed version: never fabricated), review_status, version (optimistic concurrency);
--   * an identical resubmission (same e-mail hash + same message hash within 24 h) is idempotent: no second row;
--   * different messages from the same sender are separate rows on the SAME prospect (no duplicate prospect);
--   * receipts written before this migration keep message NULL = "not recorded at the time" (no back-fill invented).
-- Owners review each receipt (pending / legitimate / possible_spam / duplicate / discarded). Every decision is
-- reversible (false positives recover) and is appended to crm_public_inquiry_reviews. Nothing is deleted, and a
-- review never creates a lead, client or sale.

begin;

alter table public.crm_public_inquiries
  add column message text,
  add column message_sha256 text,
  add column source text not null default 'website_form',
  add column consent_version text,
  add column review_status text not null default 'pending',
  add column review_note text not null default '',
  add column reviewed_by uuid references auth.users(id),
  add column reviewed_at timestamptz,
  add column version integer not null default 1;

alter table public.crm_public_inquiries
  add constraint crm_public_inquiries_message_len check (message is null or length(message) between 1 and 2000),
  add constraint crm_public_inquiries_message_hash check (message_sha256 is null or message_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint crm_public_inquiries_source check (source in ('website_form')),
  add constraint crm_public_inquiries_consent check (consent_version is null or consent_version ~ '^[a-z0-9][a-z0-9._-]{0,39}$'),
  add constraint crm_public_inquiries_review_status check (review_status in ('pending', 'legitimate', 'possible_spam', 'duplicate', 'discarded')),
  add constraint crm_public_inquiries_review_note check (length(review_note) <= 500),
  add constraint crm_public_inquiries_version check (version >= 1);

comment on column public.crm_public_inquiries.message is
  'Message as submitted. NULL only for receipts stored before message history existed (20261120): not recorded, never back-filled.';
comment on column public.crm_public_inquiries.consent_version is
  'Privacy notice version the form declared at submission. NULL = not recorded; never assume retroactive consent.';

create index crm_public_inquiries_dedupe on public.crm_public_inquiries (email_hash, message_sha256, created_at desc);
create index crm_public_inquiries_review on public.crm_public_inquiries (review_status, created_at desc);

-- Append-only owner decision history.
create table public.crm_public_inquiry_reviews (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  inquiry_id uuid not null references public.crm_public_inquiries(id),
  from_status text not null,
  to_status text not null,
  note text not null default '' check (length(note) <= 500),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index crm_public_inquiry_reviews_inquiry on public.crm_public_inquiry_reviews (inquiry_id, created_at desc);
create index crm_public_inquiry_reviews_actor on public.crm_public_inquiry_reviews (actor_id);
alter table public.crm_public_inquiry_reviews enable row level security;
revoke all on public.crm_public_inquiry_reviews from anon, authenticated;
grant select on public.crm_public_inquiry_reviews to authenticated;
create policy crm_read on public.crm_public_inquiry_reviews for select to authenticated
  using ((select crm_private.is_owner()) and agency_key = 'avalon');

-- Owners may change ONLY the review fields (column grant), with optimistic version checks done by the caller.
grant update (review_status, review_note) on public.crm_public_inquiries to authenticated;
create policy crm_review on public.crm_public_inquiries for update to authenticated
  using ((select crm_private.is_owner()) and agency_key = 'avalon')
  with check ((select crm_private.is_owner()) and agency_key = 'avalon');

create function crm_private.public_inquiry_review_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'CRM forbidden' using errcode = '42501'; end if;
  if new.review_status is not distinct from old.review_status and new.review_note is not distinct from old.review_note then
    return new;
  end if;
  new.review_note := btrim(coalesce(new.review_note, ''));
  new.reviewed_by := auth.uid();
  new.reviewed_at := now();
  new.version := old.version + 1;
  return new;
end $$;
revoke all on function crm_private.public_inquiry_review_guard() from public;
create trigger crm_public_inquiry_review_guard before update on public.crm_public_inquiries
  for each row execute function crm_private.public_inquiry_review_guard();

-- Narrow definer: only appends the decision that the invoker trigger above already authorized.
create function crm_private.public_inquiry_review_log() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.version = old.version then return new; end if;
  insert into public.crm_public_inquiry_reviews (inquiry_id, from_status, to_status, note, actor_id)
  values (new.id, old.review_status, new.review_status, new.review_note, new.reviewed_by);
  return new;
end $$;
revoke all on function crm_private.public_inquiry_review_log() from public, anon, authenticated;
create trigger crm_public_inquiry_review_log after update on public.crm_public_inquiries
  for each row execute function crm_private.public_inquiry_review_log();

-- Public intake: identical to 20261120130354 (services guard) plus message history, idempotent replay and consent.
create or replace function public.crm_public_inquiry(request jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_company text := btrim(coalesce(request ->> 'company', ''));
  v_contact text := btrim(coalesce(request ->> 'name', ''));
  v_email text := lower(btrim(coalesce(request ->> 'email', '')));
  v_phone text := btrim(coalesce(request ->> 'phone', ''));
  v_message text := btrim(coalesce(request ->> 'message', ''));
  v_lang text := case when request ->> 'language' = 'en' then 'en' else 'es' end;
  v_consent text := nullif(btrim(coalesce(request ->> 'consent_version', '')), '');
  v_services text[];
  v_hash text;
  v_msg_hash text;
  v_owner uuid;
  v_pid uuid;
  v_prev_sub text;
begin
  if jsonb_typeof(request) <> 'object' or pg_column_size(request) > 8192 then return 'invalid'; end if;
  -- Honeypot: bots fill hidden fields. Answer "ok" so they learn nothing (intentionally NOT stored).
  if coalesce(request ->> 'website_url', '') <> '' then return 'ok'; end if;
  if length(v_company) not between 2 and 200 or length(v_contact) not between 2 and 160 or length(v_message) not between 10 and 2000
     or length(v_phone) > 40 or length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return 'invalid';
  end if;
  if v_consent is not null and v_consent !~ '^[a-z0-9][a-z0-9._-]{0,39}$' then return 'invalid'; end if;
  -- Validate before expanding JSON: null/scalar/object raises 22023 in jsonb_array_elements_text.
  if request ? 'services' then
    if jsonb_typeof(request -> 'services') <> 'array' then return 'invalid'; end if;
    if exists (select 1 from jsonb_array_elements(request -> 'services') item where jsonb_typeof(item) <> 'string') then
      return 'invalid';
    end if;
  end if;
  select coalesce(array_agg(distinct s), '{}') into v_services from jsonb_array_elements_text(coalesce(request -> 'services', '[]'::jsonb)) s
    where s in ('website', 'ecommerce', 'crm', 'receptionist', 'marketing', 'automation');
  v_hash := encode(sha256(convert_to(v_email, 'UTF8')), 'hex');
  v_msg_hash := encode(sha256(convert_to(v_message, 'UTF8')), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(7251802);
  -- Same sender, same message, within 24 h (double click, retry, concurrent double submit): already stored.
  if exists (select 1 from public.crm_public_inquiries i where i.email_hash = v_hash and i.message_sha256 = v_msg_hash
             and i.created_at > now() - interval '24 hours') then
    return 'ok';
  end if;
  if (select count(*) from public.crm_public_inquiries i where i.email_hash = v_hash and i.created_at > now() - interval '24 hours') >= 3
     or (select count(*) from public.crm_public_inquiries i where i.created_at > now() - interval '1 hour') >= 30 then
    return 'throttled';
  end if;
  select m.user_id into v_owner from public.agency_memberships m where m.role = 'owner' order by m.created_at, m.user_id limit 1;
  if v_owner is null then return 'unavailable'; end if;
  -- Same e-mail already known: record this message on the existing prospect, never a duplicate business.
  select p.id into v_pid from public.crm_prospects p where lower(btrim(p.email)) = v_email limit 1;
  if v_pid is null then
    v_prev_sub := current_setting('request.jwt.claim.sub', true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    insert into public.crm_prospects (company, contact, email, phone, source, owner_id, industry, location, opportunity, acquired_at, status, source_kind)
    values (left(v_company, 200), left(v_contact, 160), v_email, left(v_phone, 40), 'Web · solicitud de cotización', v_owner, '', '',
      left('Solicitud web (' || v_lang || ')' || case when cardinality(v_services) > 0 then ' · servicios: ' || array_to_string(v_services, ', ') else '' end || E'\n' || v_message, 1000),
      now(), 'pending', 'web_form')
    returning id into v_pid;
    perform set_config('request.jwt.claim.sub', coalesce(v_prev_sub, ''), true);
  end if;
  insert into public.crm_public_inquiries (prospect_id, email_hash, services, language, message, message_sha256, consent_version)
  values (v_pid, v_hash, v_services, v_lang, v_message, v_msg_hash, v_consent);
  return 'ok';
end $$;

commit;
