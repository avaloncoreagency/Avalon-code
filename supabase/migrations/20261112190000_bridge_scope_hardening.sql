-- Security Recovery 2026-11-12: scope separation for the Project Bridge inbox.
-- Additive, forward-only. Does not alter tables, existing imports, token values,
-- RLS policies or publicly documented RPC signatures.
-- A token with import:read can poll, but NEVER transition an import's state.

create or replace function public.os_bridge_api_import_status(
  p_token_sha256 text,
  p_import uuid,
  p_mark_uploaded boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.os_project_api_tokens;
  i public.os_project_imports;
  v public.os_project_versions;
begin
  select * into t
    from public.os_project_api_tokens
    where token_sha256 = p_token_sha256;

  if t.id is null or t.revoked_at is not null or t.expires_at < now()
     or not ('import:read' = any (t.scopes) or 'import:create' = any (t.scopes)) then
    raise exception 'invalid_token' using errcode = '28000';
  end if;

  -- SECURITY FIX: a read-only scoped token must not cross into a write
  -- operation. Run this check before looking up the target import.
  if p_mark_uploaded and not ('import:create' = any (t.scopes)) then
    raise exception 'insufficient_scope' using errcode = '42501';
  end if;

  select * into i
    from public.os_project_imports
    where id = p_import and api_token_id = t.id;
  if i.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_mark_uploaded and i.status = 'awaiting_upload' then
    if not exists (
      select 1 from os_private.bridge_inbox_objects o
      where o.name = i.archive_path
    ) then
      raise exception 'archive_not_uploaded' using errcode = '22023';
    end if;
    update public.os_project_imports set status = 'received'
      where id = i.id returning * into i;
  end if;

  select * into v from public.os_project_versions where id = i.version_id;
  return jsonb_build_object(
    'import_id', i.id,
    'status', i.status,
    'error_code', i.error_code,
    'problems', i.problems,
    'version', case when v.id is null then null
      else jsonb_build_object('number', v.number, 'files', v.file_count)
    end
  );
end;
$$;

revoke all on function public.os_bridge_api_import_status(text, uuid, boolean) from public;
-- CREATE OR REPLACE preserves the existing explicit grants to anon and
-- authenticated; do not widen grants or bypass token validation.
