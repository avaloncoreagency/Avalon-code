-- AVL-CLAUDE-ASCENSION-001 · C1 Contract Studio (REVIEW ONLY — apply only with an explicit owner GO for this file).
-- Additive. Links a signature record (crm_contracts, the existing evidence flow) to the EXACT immutable agreement
-- snapshot (crm_client_agreement_drafts) that was sent and signed, by id + sha256. No existing row changes; old
-- contracts stay unlinked. No RLS or grant change: crm_contracts keeps its current owner-only policies.
-- Rollback: drop trigger crm_contracts_agreement_link, function crm_private.contract_agreement_guard(),
-- the index and the two columns (only if no business decision relies on them).
begin;
alter table public.crm_contracts
  add column if not exists agreement_draft_id uuid references public.crm_client_agreement_drafts (id),
  add column if not exists agreement_sha256 text check (agreement_sha256 is null or agreement_sha256 ~ '^[0-9a-f]{64}$');
alter table public.crm_contracts drop constraint if exists crm_contracts_agreement_pair;
alter table public.crm_contracts add constraint crm_contracts_agreement_pair
  check ((agreement_draft_id is null) = (agreement_sha256 is null));
create index if not exists crm_contracts_agreement_draft on public.crm_contracts (agreement_draft_id) where agreement_draft_id is not null;

create or replace function crm_private.contract_agreement_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare d record;
begin
  if tg_op = 'UPDATE' and old.agreement_draft_id is not null
     and (new.agreement_draft_id, new.agreement_sha256) is distinct from (old.agreement_draft_id, old.agreement_sha256) then
    -- The signed text never changes: re-linking needs a new contract record.
    raise exception 'contract_agreement_immutable' using errcode = '23514';
  end if;
  if new.agreement_draft_id is not null and (tg_op = 'INSERT' or old.agreement_draft_id is null) then
    if tg_op = 'UPDATE' and old.status not in ('draft', 'internal_review', 'sent_for_signature') then
      raise exception 'contract_agreement_too_late' using errcode = '23514';
    end if;
    select a.snapshot_sha256, a.client_id into d from public.crm_client_agreement_drafts a where a.id = new.agreement_draft_id;
    if d.snapshot_sha256 is distinct from new.agreement_sha256 then raise exception 'contract_agreement_hash_mismatch' using errcode = '23514'; end if;
    -- The agreement must belong to the client converted from this contract's lead (canonical crm_clients.id).
    if not exists (select 1 from public.crm_clients c where c.id = d.client_id and c.origin_lead_id = new.lead_id) then
      raise exception 'contract_agreement_other_client' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function crm_private.contract_agreement_guard() from public, anon, authenticated;
drop trigger if exists crm_contracts_agreement_link on public.crm_contracts;
create trigger crm_contracts_agreement_link before insert or update on public.crm_contracts
  for each row execute function crm_private.contract_agreement_guard();
commit;
