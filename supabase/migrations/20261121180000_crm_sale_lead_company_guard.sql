-- Avalon OS · V5 Phase 4. A sale may only close an opportunity of ITS OWN company. ADDITIVE ONLY.
-- REVIEW ONLY until an owner explicitly authorizes applying it to production.
--
-- Defect: crm_confirm_sale accepted {client_id: A, lead_id: <opportunity of company B>} and then moved B's
-- opportunity to Won and stored the sale under A. The server action now rejects this (sales/actions.ts), but the
-- RPC is callable directly, so the database enforces the same rule:
--   * a lead that is the origin opportunity of another client (crm_clients.origin_lead_id) cannot be sold to a
--     different client;
--   * a lead already sold to one client cannot be attached to a sale of another client.
-- Unlinked leads are still allowed (explicit owner choice), and existing rows are not rewritten or validated
-- retroactively: the trigger only checks new inserts and changes of lead_id/client_id.

begin;

create function crm_private.sale_lead_company_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.lead_id is null then return new; end if;
  if exists (select 1 from public.crm_clients c where c.origin_lead_id = new.lead_id and c.id <> new.client_id)
     or exists (select 1 from public.crm_sales s where s.lead_id = new.lead_id and s.client_id <> new.client_id and s.id <> new.id) then
    raise exception 'sale_lead_other_client' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function crm_private.sale_lead_company_guard() from public, anon, authenticated;

create trigger crm_sale_lead_company_guard before insert or update of lead_id, client_id on public.crm_sales
  for each row execute function crm_private.sale_lead_company_guard();

commit;
