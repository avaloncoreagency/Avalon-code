-- Canonical project → client link (Mission 0349, Phase 3.1). PREPARED ONLY — not applied to any remote database.
-- Problem: projects created by hand store only settings.operations.client_lead_id (a LEAD id); os_projects.client_id stayed null,
-- so the same company appeared as several unlinked records. Strategy (additive, no data loss, historical reference kept):
--   1. A project whose client_id is null and whose operations.client_lead_id points to a lead that has a client
--      (crm_clients.origin_lead_id) gets client_id filled. Never overwritten when already set; settings are never modified.
--   2. When a client is created from a lead, projects that already referenced that lead are linked (idempotent).
--   3. One-time backfill of existing rows.
-- Rollback: drop the two triggers/functions (client_id values already written are valid links and can stay or be nulled
-- with: update public.os_projects set client_id = null where client_id is not null and <not created by a sale>).
begin;

create function crm_private.project_resolve_client() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_lead text; v_client uuid;
begin
  if new.client_id is null and jsonb_typeof(new.settings -> 'operations') = 'object' then
    v_lead := new.settings -> 'operations' ->> 'client_lead_id';
    if v_lead ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select c.id into v_client from public.crm_clients c where c.origin_lead_id = v_lead::uuid;
      if v_client is not null then new.client_id := v_client; end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function crm_private.project_resolve_client() from public;
create trigger os_projects_resolve_client before insert or update of settings, client_id on public.os_projects
  for each row execute function crm_private.project_resolve_client();

-- System-triggered by a client insert; touches only rows that reference that client's own origin lead.
create function crm_private.client_link_projects() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.origin_lead_id is not null then
    update public.os_projects p set client_id = new.id
     where p.client_id is null and jsonb_typeof(p.settings -> 'operations') = 'object'
       and p.settings -> 'operations' ->> 'client_lead_id' = new.origin_lead_id::text;
  end if;
  return null;
end $$;
revoke all on function crm_private.client_link_projects() from public, anon, authenticated;
create trigger crm_clients_link_projects after insert on public.crm_clients for each row execute function crm_private.client_link_projects();

-- One-time backfill (idempotent).
update public.os_projects p set client_id = c.id
  from public.crm_clients c
 where p.client_id is null and jsonb_typeof(p.settings -> 'operations') = 'object'
   and c.origin_lead_id::text = p.settings -> 'operations' ->> 'client_lead_id';

commit;
