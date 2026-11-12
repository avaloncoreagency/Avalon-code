-- CRM TITAN · private documents (contract evidence). Additive: only NEW attachments are checked; existing rows untouched.
-- A contract is verified against an attachment, so the attachment itself must be trustworthy:
--   * who uploaded it is the session that inserted it (no attributing an upload to the other owner via the API);
--   * its sha256 is the real digest of its bytes (the integrity hash cannot be supplied arbitrarily);
--   * created_at is the server time.
-- Attachments stay immutable (no UPDATE/DELETE grants) and owner-only (existing RLS).
begin;

create function crm_private.attachment_integrity() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  new.updated_at := now();
  new.version := 1;
  if new.created_by is null then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if new.sha256 is distinct from encode(pg_catalog.sha256(new.content), 'hex') then
    raise exception 'attachment_hash_mismatch' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function crm_private.attachment_integrity() from public;
create trigger crm_attachments_integrity before insert on public.crm_attachments
  for each row execute function crm_private.attachment_integrity();

commit;
