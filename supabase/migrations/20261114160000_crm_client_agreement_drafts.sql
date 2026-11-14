begin;
-- REVIEW ONLY. Do not apply to the production database without explicit owner approval.
-- Snapshot drafts are append-only; a PDF is never evidence of signature or acceptance.
create table if not exists public.crm_client_agreement_drafts (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  client_id uuid not null references public.crm_clients(id),
  template_version text not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'draft' check (status = 'draft'),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists crm_client_agreement_drafts_client_created
  on public.crm_client_agreement_drafts (client_id, created_at desc, id desc);
create unique index if not exists crm_client_agreement_drafts_dedupe
  on public.crm_client_agreement_drafts (client_id, snapshot_sha256);
alter table public.crm_client_agreement_drafts enable row level security;
revoke all on public.crm_client_agreement_drafts from anon;
revoke all on public.crm_client_agreement_drafts from authenticated;
revoke all on public.crm_client_agreement_drafts from public;
grant select, insert on public.crm_client_agreement_drafts to authenticated;
create policy owner_select_agreement_drafts on public.crm_client_agreement_drafts
  for select to authenticated using (agency_key = 'avalon' and (select crm_private.is_owner()));
create policy owner_insert_agreement_drafts on public.crm_client_agreement_drafts
  for insert to authenticated with check (
    agency_key = 'avalon' and (select crm_private.is_owner()) and created_by = (select auth.uid())
    and exists (select 1 from public.crm_clients c where c.id = client_id and c.agency_key = 'avalon')
  );
-- No UPDATE or DELETE grant or policy: drafts remain immutable. Reissue a new draft after corrections.
commit;
