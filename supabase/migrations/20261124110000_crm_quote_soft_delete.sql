-- QUOTES-MANAGEMENT-001: owner-only, confirmed, LOGICAL deletion of quotes (REVIEW ONLY — not applied to production
-- automatically). Nothing is physically deleted and nothing cascades: a deleted quote leaves the active lists but its
-- versions, events and audit trail remain. Deletion is refused when commercial records depend on the quote
-- (a sale, accepted terms, an agreement draft) or when it was accepted: those must be superseded, not erased.
-- Authorization: crm_private.is_owner() (agency_memberships role 'owner' — today exactly Miguel and Samuel; the role
-- can only be granted by an owner). Employees, operators and anonymous callers are refused (deny by default).
begin;

alter table public.crm_quotes
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users(id),
  add column delete_reason text not null default '' check (length(delete_reason) <= 500),
  add constraint crm_quotes_deleted_consistent check ((deleted_at is null) = (deleted_by is null));
create index crm_quotes_active on public.crm_quotes (updated_at desc) where deleted_at is null;

-- A deleted quote is frozen: no transition, no revision, no undelete through a plain update.
create function crm_private.quote_deleted_frozen() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.deleted_at is not null then raise exception 'quote_deleted' using errcode = '23514'; end if;
  if new.deleted_at is not null and current_setting('avalon.quote_delete', true) is distinct from 'on' then
    raise exception 'quote_delete_forbidden' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function crm_private.quote_deleted_frozen() from public, anon, authenticated;
create trigger crm_quote_deleted_frozen before update on public.crm_quotes for each row execute function crm_private.quote_deleted_frozen();

create function public.crm_quote_delete(p_quote uuid, p_expected_version integer, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q public.crm_quotes; reason text := btrim(coalesce(p_reason, ''));
begin
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
end $$;
revoke all on function public.crm_quote_delete(uuid, integer, text) from public, anon;
grant execute on function public.crm_quote_delete(uuid, integer, text) to authenticated;

commit;
