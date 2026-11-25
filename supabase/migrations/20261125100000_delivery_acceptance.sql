-- AVL-ALPHA-FINAL-001 · OPS-001 / OPS-004 (REVIEW ONLY — apply only with an explicit owner GO for this file).
-- Additive on ALPHA's own table (crm_client_onboardings). No RLS/grant change.
--  OPS-001: a live https URL is required evidence only for products that live at one (website, e-commerce, CRM);
--           marketing / paused AI tools / other services are delivered without inventing a URL.
--  OPS-004: client acceptance is recorded separately from the owner's handover, with its own evidence, once, after
--           the delivery; an onboarding cannot be closed without it.
-- Rollback: drop trigger crm_client_onboardings_acceptance + function; drop the 3 acceptance columns and the two new
-- checks; re-add the previous check (delivered_at is null or (qa_passed and delivery_approved_by is not null and
-- live_url <> '' and length(btrim(delivered_to)) >= 2)) — only valid if no non-URL product was delivered meanwhile.
begin;
alter table public.crm_client_onboardings drop constraint if exists crm_client_onboardings_check1;
alter table public.crm_client_onboardings drop constraint if exists crm_client_onboardings_delivery_evidence;
alter table public.crm_client_onboardings add constraint crm_client_onboardings_delivery_evidence check (
  delivered_at is null or (qa_passed and delivery_approved_by is not null and length(btrim(delivered_to)) >= 2
    and (product_type not in ('website', 'ecommerce', 'crm') or live_url <> '')));

alter table public.crm_client_onboardings
  add column if not exists client_accepted_at timestamptz,
  add column if not exists client_acceptance_evidence text not null default '' check (length(client_acceptance_evidence) <= 1000),
  add column if not exists client_acceptance_recorded_by uuid references auth.users (id);
alter table public.crm_client_onboardings drop constraint if exists crm_client_onboardings_acceptance_evidence;
alter table public.crm_client_onboardings add constraint crm_client_onboardings_acceptance_evidence check (
  client_accepted_at is null or (delivered_at is not null and client_acceptance_recorded_by is not null
    and length(btrim(client_acceptance_evidence)) >= 10));
alter table public.crm_client_onboardings drop constraint if exists crm_client_onboardings_closed_needs_acceptance;
alter table public.crm_client_onboardings add constraint crm_client_onboardings_closed_needs_acceptance check (
  stage <> 'closed' or client_accepted_at is not null);
create index if not exists crm_client_onboardings_acceptance_by on public.crm_client_onboardings (client_acceptance_recorded_by)
  where client_acceptance_recorded_by is not null;

create or replace function crm_private.onboarding_acceptance_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.client_accepted_at is not null
     and (new.client_accepted_at, new.client_acceptance_evidence, new.client_acceptance_recorded_by)
         is distinct from (old.client_accepted_at, old.client_acceptance_evidence, old.client_acceptance_recorded_by) then
    raise exception 'onboarding_acceptance_immutable' using errcode = '23514';
  end if;
  if new.client_accepted_at is not null and (tg_op = 'INSERT' or old.client_accepted_at is null)
     and new.client_acceptance_recorded_by is distinct from auth.uid() then
    raise exception 'onboarding_acceptance_actor' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function crm_private.onboarding_acceptance_guard() from public, anon, authenticated;
drop trigger if exists crm_client_onboardings_acceptance on public.crm_client_onboardings;
create trigger crm_client_onboardings_acceptance before insert or update on public.crm_client_onboardings
  for each row execute function crm_private.onboarding_acceptance_guard();
commit;
