-- AVALON-CLAUDE-CAX-OMEGA-001: client & agent experience (REVIEW ONLY — not applied to production automatically).
-- Additive. Every record hangs off the canonical crm_clients.id (no second client base); invoices stay in crm_invoices
-- and products in os_projects. Owners only (crm_private.is_owner), deny by default. Agent access is NOT granted here:
-- it is added with the staff portal integration (assigned rows only), owned by Codex (#332/#333).
begin;

-- ── 1. Corporate settings (single row) ───────────────────────────────────────────────────────────────────────────
-- One source for support contacts and sender identity used by e-mails, PDFs and delivery messages.
-- A phone number is never invented: it stays NULL ("pending") until an owner records an approved business number.
create table public.avalon_company_settings (
  id smallint primary key default 1 check (id = 1),
  support_email text not null default 'avalonagencymh@gmail.com' check (support_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  support_phone text check (support_phone is null or support_phone ~ '^\+?[0-9 ().-]{7,24}$'),
  support_phone_approved boolean not null default false,
  invite_sender_email text not null default 'avalonacoreagency@gmail.com' check (invite_sender_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  -- 'unverified' until an owner records technical evidence (SMTP login + SPF/DKIM pass in real headers).
  invite_sender_status text not null default 'unverified' check (invite_sender_status in ('unverified', 'verified', 'failed')),
  invite_sender_evidence text not null default '' check (length(invite_sender_evidence) <= 1000),
  client_sender_email text not null default 'avalonagencymh@gmail.com' check (client_sender_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  reply_to_email text not null default 'avalonagencymh@gmail.com' check (reply_to_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  support_hours text not null default '' check (length(support_hours) <= 200),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  check (support_phone_approved = false or support_phone is not null),
  check (invite_sender_status <> 'verified' or length(btrim(invite_sender_evidence)) >= 10)
);
insert into public.avalon_company_settings (id) values (1) on conflict do nothing;

-- ── 2. Client onboarding & delivery ───────────────────────────────────────────────────────────────────────────────
create table public.crm_client_onboardings (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  client_id uuid not null references public.crm_clients (id),
  sale_id uuid references public.crm_sales (id),
  project_id uuid references public.os_projects (id),
  product_type text not null check (product_type in ('website', 'ecommerce', 'crm', 'marketing', 'ai_tools', 'other')),
  title text not null check (length(btrim(title)) between 2 and 160),
  stage text not null default 'preparation' check (stage in ('preparation', 'data_pending', 'documents_pending', 'approved',
    'welcome_sent', 'kickoff', 'build', 'review', 'qa', 'delivery_ready', 'delivered', 'support', 'closed')),
  commercial_owner_id uuid references auth.users (id),
  technical_owner_id uuid references auth.users (id),
  next_step text not null default '' check (length(next_step) <= 500),
  next_step_on date,
  next_step_confirmed boolean not null default false,
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 60),
  invoice_id uuid references public.crm_invoices (id),
  live_url text not null default '' check (live_url = '' or (length(live_url) <= 508 and live_url ~ '^https://[^\s]{3,}$')),
  qa_passed boolean not null default false,
  delivery_approved_by uuid references auth.users (id),
  delivered_at timestamptz,
  delivered_to text not null default '' check (length(delivered_to) <= 200),
  delivery_note text not null default '' check (length(delivery_note) <= 1000),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  -- "Delivered" is never a label without evidence: it needs the recorded delivery, which needs QA, approval and a URL.
  check (stage <> 'delivered' or delivered_at is not null),
  check (delivered_at is null or (qa_passed and delivery_approved_by is not null and live_url <> '' and length(btrim(delivered_to)) >= 2))
);
-- One onboarding per sale (a second click / refresh returns the same one).
create unique index crm_client_onboardings_sale on public.crm_client_onboardings (sale_id) where sale_id is not null;
create index crm_client_onboardings_client on public.crm_client_onboardings (client_id, updated_at desc);
create index crm_client_onboardings_stage on public.crm_client_onboardings (stage, updated_at desc);
create index crm_client_onboardings_project on public.crm_client_onboardings (project_id) where project_id is not null;
create index crm_client_onboardings_invoice on public.crm_client_onboardings (invoice_id) where invoice_id is not null;
create index crm_client_onboardings_created_by on public.crm_client_onboardings (created_by);
create index crm_client_onboardings_commercial on public.crm_client_onboardings (commercial_owner_id) where commercial_owner_id is not null;
create index crm_client_onboardings_technical on public.crm_client_onboardings (technical_owner_id) where technical_owner_id is not null;
create index crm_client_onboardings_approver on public.crm_client_onboardings (delivery_approved_by) where delivery_approved_by is not null;

-- Invariants that the UI alone must never be trusted with.
create function crm_private.onboarding_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare inv record; s record;
begin
  if new.sale_id is not null then
    select client_id into s from public.crm_sales where id = new.sale_id;
    if s.client_id is distinct from new.client_id then raise exception 'onboarding_sale_other_client' using errcode = '23514'; end if;
  end if;
  if new.invoice_id is not null then
    select client_id, status into inv from public.crm_invoices where id = new.invoice_id;
    -- RLS may hide the invoice from a non-finance owner: unknown is refused, never assumed.
    if inv.client_id is distinct from new.client_id then raise exception 'onboarding_invoice_other_client' using errcode = '23514'; end if;
    if inv.status <> 'issued' then raise exception 'onboarding_invoice_not_issued' using errcode = '23514'; end if;
  end if;
  if new.project_id is not null and exists (select 1 from public.os_projects p where p.id = new.project_id and p.client_id is distinct from new.client_id) then
    raise exception 'onboarding_project_other_client' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if old.client_id <> new.client_id then raise exception 'onboarding_client_locked' using errcode = '23514'; end if;
    if old.delivered_at is not null and new.delivered_at is distinct from old.delivered_at then raise exception 'onboarding_delivery_immutable' using errcode = '23514'; end if;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end $$;
revoke all on function crm_private.onboarding_guard() from public, anon, authenticated;
create trigger crm_client_onboardings_guard before insert or update on public.crm_client_onboardings
  for each row execute function crm_private.onboarding_guard();

create function crm_private.onboarding_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform crm_private.log('onboarding.started', 'crm', 'crm_client_onboardings', new.id, client_id => new.client_id, sale_id => new.sale_id,
      to_state => new.stage, detail => left(new.title, 200), source => 'app');
  elsif old.stage is distinct from new.stage then
    perform crm_private.log('onboarding.stage', 'crm', 'crm_client_onboardings', new.id, client_id => new.client_id, sale_id => new.sale_id,
      from_state => old.stage, to_state => new.stage, detail => left(new.title, 200), source => 'app');
  end if;
  return null;
end $$;
revoke all on function crm_private.onboarding_audit() from public, anon, authenticated;
create trigger crm_client_onboardings_audit after insert or update on public.crm_client_onboardings
  for each row execute function crm_private.onboarding_audit();

-- ── 3. Client documents (PDF manuals): immutable versioned snapshots ─────────────────────────────────────────────
-- The PDF is regenerated byte-for-byte from the frozen snapshot (sha256 verified); no public file is ever written.
create table public.crm_client_documents (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  client_id uuid not null references public.crm_clients (id),
  onboarding_id uuid references public.crm_client_onboardings (id),
  project_id uuid references public.os_projects (id),
  kind text not null check (kind in ('manual')),
  product_type text not null check (product_type in ('website', 'ecommerce', 'crm', 'marketing', 'ai_tools', 'other')),
  version integer not null check (version >= 1),
  title text not null check (length(btrim(title)) between 2 and 200),
  generator text not null check (generator ~ '^[a-z0-9._-]{3,60}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) <= 262144),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'issued' check (status in ('issued', 'superseded')),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (client_id, kind, product_type, project_id, version)
);
create index crm_client_documents_client on public.crm_client_documents (client_id, created_at desc);
create index crm_client_documents_onboarding on public.crm_client_documents (onboarding_id) where onboarding_id is not null;
create index crm_client_documents_project on public.crm_client_documents (project_id) where project_id is not null;
create index crm_client_documents_created_by on public.crm_client_documents (created_by);

create function crm_private.document_immutable() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'document_immutable' using errcode = '23514'; end if;
  -- Only issued → superseded is allowed; content, hash and identity never change.
  if new.status = old.status or not (old.status = 'issued' and new.status = 'superseded')
     or (to_jsonb(new) - 'status') <> (to_jsonb(old) - 'status') then
    raise exception 'document_immutable' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function crm_private.document_immutable() from public, anon, authenticated;
create trigger crm_client_documents_immutable before update or delete on public.crm_client_documents
  for each row execute function crm_private.document_immutable();

-- ── 4. Outbound e-mail outbox (approval, idempotency, provider evidence) ─────────────────────────────────────────
-- One row per intended message. The unique key makes double clicks and refreshes harmless. A row reaches 'sent' only
-- with the provider's message id; without a configured transport it stays 'blocked_no_transport' (never "sent").
create table public.crm_email_outbox (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  idempotency_key text not null unique check (idempotency_key ~ '^[A-Za-z0-9:._-]{8,160}$'),
  kind text not null check (kind in ('client_welcome', 'invoice_copy', 'document_delivery')),
  client_id uuid not null references public.crm_clients (id),
  onboarding_id uuid references public.crm_client_onboardings (id),
  to_email text not null check (to_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and length(to_email) <= 254),
  to_name text not null default '' check (length(to_name) <= 160),
  from_email text not null check (from_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  reply_to text not null check (reply_to ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  subject text not null check (length(btrim(subject)) between 3 and 200),
  body_html text not null check (length(body_html) between 20 and 200000),
  body_text text not null check (length(body_text) between 20 and 100000),
  lang text not null check (lang in ('es', 'en')),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 5),
  status text not null default 'prepared' check (status in ('prepared', 'approved', 'sent', 'failed', 'blocked_no_transport', 'cancelled')),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  sent_at timestamptz,
  provider text not null default '' check (length(provider) <= 40),
  provider_message_id text not null default '' check (length(provider_message_id) <= 300),
  error text not null default '' check (length(error) <= 500),
  attempts integer not null default 0 check (attempts between 0 and 5),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('approved', 'sent') or approved_by is not null),
  check (status <> 'sent' or (sent_at is not null and length(provider_message_id) > 0))
);
create index crm_email_outbox_client on public.crm_email_outbox (client_id, created_at desc);
create index crm_email_outbox_onboarding on public.crm_email_outbox (onboarding_id) where onboarding_id is not null;
create index crm_email_outbox_created_by on public.crm_email_outbox (created_by);
create index crm_email_outbox_approved_by on public.crm_email_outbox (approved_by) where approved_by is not null;

create function crm_private.outbox_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'outbox_immutable' using errcode = '23514'; end if;
  -- Content is frozen once prepared: what was approved is exactly what is sent.
  if (new.subject, new.body_html, new.body_text, new.to_email, new.from_email, new.reply_to, new.attachments, new.client_id)
     is distinct from (old.subject, old.body_html, old.body_text, old.to_email, old.from_email, old.reply_to, old.attachments, old.client_id) then
    raise exception 'outbox_content_frozen' using errcode = '23514';
  end if;
  if old.status in ('sent', 'cancelled') then raise exception 'outbox_final' using errcode = '23514'; end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function crm_private.outbox_guard() from public, anon, authenticated;
create trigger crm_email_outbox_guard before update or delete on public.crm_email_outbox
  for each row execute function crm_private.outbox_guard();

create function crm_private.outbox_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    perform crm_private.log('email.' || new.status, 'crm', 'crm_email_outbox', new.id, client_id => new.client_id,
      from_state => case when tg_op = 'UPDATE' then old.status end, to_state => new.status,
      detail => left(new.kind || ' · ' || new.subject, 200), result => case when new.status = 'failed' then 'error' else 'success' end, source => 'app');
  end if;
  return null;
end $$;
revoke all on function crm_private.outbox_audit() from public, anon, authenticated;
create trigger crm_email_outbox_audit after insert or update on public.crm_email_outbox
  for each row execute function crm_private.outbox_audit();

-- ── 5. Testimonial / endorsement consents (FTC-aware) ───────────────────────────────────────────────────────────
-- Separate from the services agreement. Nothing is preselected: a grant needs at least one scope and one channel, the
-- approved text when a testimonial is used, and evidence. Revocation stops future use; history is kept.
create table public.crm_testimonial_consents (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  client_id uuid not null references public.crm_clients (id),
  signer_name text not null check (length(btrim(signer_name)) between 2 and 160),
  signer_role text not null default '' check (length(signer_role) <= 120),
  signer_email text not null default '' check (signer_email = '' or signer_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  scopes text[] not null default '{}' check (scopes <@ array['name', 'logo', 'testimonial', 'case_study', 'screenshots', 'results', 'reference']::text[]),
  channels text[] not null default '{}' check (channels <@ array['website', 'social', 'proposals', 'ads', 'events']::text[]),
  approved_text text not null default '' check (length(approved_text) <= 4000),
  restrictions text not null default '' check (length(restrictions) <= 2000),
  material_connection text not null default '' check (length(material_connection) <= 500),
  results_substantiation text not null default '' check (length(results_substantiation) <= 2000),
  evidence text not null default '' check (length(evidence) <= 1000),
  status text not null default 'requested' check (status in ('requested', 'granted', 'declined', 'revoked')),
  granted_at timestamptz,
  expires_on date,
  revoked_at timestamptz,
  revoke_reason text not null default '' check (length(revoke_reason) <= 500),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'granted' or (cardinality(scopes) > 0 and cardinality(channels) > 0 and length(btrim(evidence)) >= 10 and granted_at is not null)),
  check (status <> 'granted' or not ('testimonial' = any(scopes)) or length(btrim(approved_text)) >= 10),
  -- Results claims need substantiation (no "typical results" from exceptional cases).
  check (status <> 'granted' or not ('results' = any(scopes)) or length(btrim(results_substantiation)) >= 10),
  check (status <> 'revoked' or (revoked_at is not null and length(btrim(revoke_reason)) >= 3))
);
create index crm_testimonial_consents_client on public.crm_testimonial_consents (client_id, created_at desc);
create index crm_testimonial_consents_created_by on public.crm_testimonial_consents (created_by);

create function crm_private.consent_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'consent_history_kept' using errcode = '23514'; end if;
  if old.status in ('declined', 'revoked') then raise exception 'consent_final' using errcode = '23514'; end if;
  -- Granted terms cannot be widened silently: a broader use needs a new consent record.
  if old.status = 'granted' and (new.status <> 'revoked' or new.scopes <> old.scopes or new.channels <> old.channels
     or new.approved_text <> old.approved_text or new.evidence <> old.evidence) then
    raise exception 'consent_granted_frozen' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function crm_private.consent_guard() from public, anon, authenticated;
create trigger crm_testimonial_consents_guard before update or delete on public.crm_testimonial_consents
  for each row execute function crm_private.consent_guard();

-- ── 6. RLS: owners only, deny by default ────────────────────────────────────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array['avalon_company_settings', 'crm_client_onboardings', 'crm_client_documents', 'crm_email_outbox', 'crm_testimonial_consents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated, public', t);
  end loop;
end $$;
grant select, update on public.avalon_company_settings to authenticated;
grant select, insert, update on public.crm_client_onboardings, public.crm_email_outbox, public.crm_testimonial_consents to authenticated;
grant select, insert, update on public.crm_client_documents to authenticated;
create policy settings_owner_read on public.avalon_company_settings for select to authenticated using ((select crm_private.is_owner()));
create policy settings_owner_write on public.avalon_company_settings for update to authenticated
  using ((select crm_private.is_owner())) with check ((select crm_private.is_owner()) and updated_by = (select auth.uid()));
create policy onboarding_owner_all on public.crm_client_onboardings for all to authenticated
  using ((select crm_private.is_owner())) with check ((select crm_private.is_owner()));
create policy documents_owner_all on public.crm_client_documents for all to authenticated
  using ((select crm_private.is_owner())) with check ((select crm_private.is_owner()) and created_by = (select auth.uid()));
create policy outbox_owner_all on public.crm_email_outbox for all to authenticated
  using ((select crm_private.is_owner())) with check ((select crm_private.is_owner()));
create policy consents_owner_all on public.crm_testimonial_consents for all to authenticated
  using ((select crm_private.is_owner())) with check ((select crm_private.is_owner()));

commit;
