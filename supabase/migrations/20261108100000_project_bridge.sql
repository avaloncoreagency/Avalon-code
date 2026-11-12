-- Avalon Project Bridge — Import & Publish (Misión 0400).
-- PREPARED ONLY. Not applied to production. Apply first to an isolated database, then to production only with the
-- owners' explicit approval. Reversible: see the DOWN section at the end of docs/project-bridge/PROJECT_BRIDGE.md.
--
-- What it adds (and why it does not duplicate existing structures):
--   * os_projects stays the single project record. New category 'apps' joins the existing modules.
--   * os_project_imports   — every upload attempt (UI or API), its validation result and its idempotency key.
--   * os_project_versions  — IMMUTABLE versions (import or restore). A restore is a NEW version, history is never rewritten.
--   * os_project_files     — the file manifest of a version (path, sha256, size, mime); content lives in Storage.
--   * os_project_deployments / os_project_publish_approvals — Vercel deployments; production needs a single-use owner approval.
--   * os_project_events    — append-only activity log.
--   * os_project_api_tokens — revocable, scoped, hashed tokens for tools (ChatGPT/Claude Code/Codex exports).
--   * Storage bucket `avalon-projects` (PRIVATE): incoming/<uid>/<import>.zip, inbox/<import>.zip (API), blobs/<sha256>.
-- Security model: owner-only (os_private.is_owner()), like every Avalon OS module. No privileged key is needed by the
-- application. The API path uses SECURITY DEFINER functions that only accept a valid token hash and can only create an
-- import row awaiting upload — processing always happens later under an OWNER session.

begin;

-- ── Category 'apps' ────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.os_projects drop constraint if exists os_projects_module_check;
alter table public.os_projects add constraint os_projects_module_check
  check (module in ('website', 'ecommerce', 'crm_creator', 'receptionist', 'marketing', 'apps'));

-- ── Imports ────────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.os_project_imports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.os_projects (id),
  category text not null check (category in ('website', 'ecommerce', 'crm_creator', 'apps')),
  project_name text check (project_name is null or char_length(btrim(project_name)) between 1 and 120),
  original_name text not null check (char_length(original_name) between 1 and 255),
  source_tool text not null check (source_tool in ('chatgpt', 'claude_code', 'codex', 'higgsfield', 'editor', 'manual', 'api', 'other')),
  source_kind text not null default 'upload' check (source_kind in ('upload', 'api')),
  api_token_id uuid,
  archive_path text check (archive_path is null or archive_path ~ '^(incoming/[0-9a-f-]{36}|inbox)/[0-9a-f-]{36}\.(zip|html)$'),
  archive_bytes bigint check (archive_bytes is null or archive_bytes between 1 and 26214400),
  archive_sha256 text check (archive_sha256 is null or archive_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  status text not null default 'received'
    check (status in ('awaiting_upload', 'received', 'validating', 'registered', 'duplicate', 'rejected', 'failed')),
  error_code text check (error_code is null or char_length(error_code) <= 120),
  problems jsonb not null default '[]'::jsonb check (jsonb_typeof(problems) = 'array' and pg_column_size(problems) <= 32768),
  version_id uuid,
  attempts integer not null default 0 check (attempts between 0 and 5),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, idempotency_key)
);
create index os_project_imports_recent on public.os_project_imports (created_by, created_at desc);
create index os_project_imports_project on public.os_project_imports (project_id, created_at desc);

-- ── Versions (immutable) ───────────────────────────────────────────────────────────────────────────────────────────
create table public.os_project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.os_projects (id),
  number integer not null check (number > 0),
  kind text not null check (kind in ('import', 'restore')),
  import_id uuid references public.os_project_imports (id),
  restored_from uuid references public.os_project_versions (id),
  source_tool text not null,
  framework text not null check (framework in ('static', 'nextjs', 'react', 'vite', 'vue', 'svelte', 'astro', 'node', 'unknown')),
  entry_path text check (entry_path is null or char_length(entry_path) <= 240),
  deployable text not null check (deployable in ('static', 'needs_build', 'no')),
  file_count integer not null check (file_count between 1 and 2000),
  total_bytes bigint not null check (total_bytes between 0 and 104857600),
  content_digest text not null check (content_digest ~ '^[0-9a-f]{64}$'),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object' and pg_column_size(summary) <= 32768),
  note text not null default '' check (char_length(note) <= 500),
  sealed boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (project_id, number),
  check ((kind = 'import') = (import_id is not null)),
  check ((kind = 'restore') = (restored_from is not null))
);
alter table public.os_project_imports add constraint os_project_imports_version_fk foreign key (version_id) references public.os_project_versions (id);

create table public.os_project_files (
  version_id uuid not null references public.os_project_versions (id),
  path text not null check (char_length(path) between 1 and 240 and path !~ '(^/|\\|(^|/)\.\.?(/|$)|//)'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size bigint not null check (size between 0 and 15728640),
  mime text not null check (char_length(mime) <= 100),
  primary key (version_id, path)
);
create index os_project_files_blob on public.os_project_files (sha256);

-- ── Deployments and approvals ──────────────────────────────────────────────────────────────────────────────────────
create table public.os_project_publish_approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.os_projects (id),
  version_id uuid not null references public.os_project_versions (id),
  approved_by uuid not null default auth.uid() references auth.users (id),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  used_at timestamptz
);

create table public.os_project_deployments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.os_projects (id),
  version_id uuid not null references public.os_project_versions (id),
  target text not null check (target in ('preview', 'production')),
  provider text not null default 'vercel' check (provider = 'vercel'),
  -- Client sites always live in their own Vercel project, never in the Avalon OS project.
  vercel_project text not null check (vercel_project ~ '^avalon-client-[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$'),
  deployment_id text check (deployment_id is null or deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'),
  url text check (url is null or url ~ '^https://[a-z0-9]([a-z0-9.-]{0,240})\.vercel\.app$'),
  state text not null default 'preparing' check (state in ('preparing', 'queued', 'building', 'ready', 'error', 'canceled', 'blocked')),
  error_code text check (error_code is null or char_length(error_code) <= 200),
  approval_id uuid references public.os_project_publish_approvals (id),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  checked_at timestamptz,
  unique (version_id, target, idempotency_key)
);
create index os_project_deployments_project on public.os_project_deployments (project_id, created_at desc);

-- ── Activity log (append-only) ─────────────────────────────────────────────────────────────────────────────────────
create table public.os_project_events (
  id bigint generated always as identity primary key,
  project_id uuid references public.os_projects (id),
  import_id uuid references public.os_project_imports (id),
  version_id uuid references public.os_project_versions (id),
  deployment_id uuid references public.os_project_deployments (id),
  actor uuid references auth.users (id),
  action text not null check (action in ('import_received', 'import_registered', 'import_duplicate', 'import_rejected', 'import_failed',
    'version_created', 'version_restored', 'client_assigned', 'deploy_requested', 'deploy_state', 'publish_approved', 'token_created', 'token_revoked')),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) <= 8192),
  created_at timestamptz not null default now()
);
create index os_project_events_project on public.os_project_events (project_id, id desc);

-- ── API tokens (hashed, scoped, revocable, expiring) ───────────────────────────────────────────────────────────────
create table public.os_project_api_tokens (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  prefix text not null check (prefix ~ '^avb_[A-Za-z0-9_-]{4}$'),
  scopes text[] not null check (scopes <@ array['import:create', 'import:read']::text[] and cardinality(scopes) between 1 and 2),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at <= created_at + interval '90 days'),
  revoked_at timestamptz,
  last_used_at timestamptz
);
alter table public.os_project_imports add constraint os_project_imports_token_fk foreign key (api_token_id) references public.os_project_api_tokens (id);

-- ── Triggers ───────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function os_private.bridge_event(p_action text, p_project uuid, p_import uuid, p_version uuid, p_deployment uuid, p_detail jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.os_project_events (action, project_id, import_id, version_id, deployment_id, actor, detail)
  values (p_action, p_project, p_import, p_version, p_deployment, auth.uid(), coalesce(p_detail, '{}'::jsonb));
$$;
revoke all on function os_private.bridge_event(text, uuid, uuid, uuid, uuid, jsonb) from public;

-- Guards are SECURITY DEFINER so they can write the append-only log; trigger functions cannot be called directly.
-- Imports: per-owner rate limit + concurrency on insert; strict state machine and immutable identity on update.
create or replace function os_private.bridge_import_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  per_hour integer; running integer;
begin
  if tg_op = 'INSERT' then
    if new.source_kind = 'upload' then
      if new.status <> 'received' then raise exception 'An upload import starts as received' using errcode = '23514'; end if;
      if new.archive_path is null or split_part(new.archive_path, '/', 2) <> new.created_by::text or split_part(split_part(new.archive_path, '/', 3), '.', 1) <> new.id::text then
        raise exception 'Archive path must be incoming/<your user id>/<import id>' using errcode = '42501';
      end if;
    end if;
    select count(*) into per_hour from public.os_project_imports where created_by = new.created_by and created_at > now() - interval '1 hour';
    if per_hour >= 30 then raise exception 'Import rate limit reached (30 per hour)' using errcode = '54000'; end if;
    select count(*) into running from public.os_project_imports
      where created_by = new.created_by and status in ('received', 'validating') and updated_at > now() - interval '15 minutes';
    if running >= 2 then raise exception 'Too many imports in progress (max 2)' using errcode = '54000'; end if;
    perform os_private.bridge_event('import_received', new.project_id, null, null, null, jsonb_build_object('import', new.id, 'category', new.category, 'source', new.source_kind));
    return new;
  end if;
  if (new.id, new.created_by, new.created_at, new.idempotency_key, new.source_kind, new.api_token_id) is distinct from
     (old.id, old.created_by, old.created_at, old.idempotency_key, old.source_kind, old.api_token_id) then
    raise exception 'Import identity is immutable' using errcode = '42501';
  end if;
  if old.status in ('registered', 'duplicate', 'rejected') then raise exception 'Import % is final', old.status using errcode = '42501'; end if;
  if (old.archive_sha256 is not null and new.archive_sha256 is distinct from old.archive_sha256)
     or (old.archive_path is not null and new.archive_path is distinct from old.archive_path) then
    raise exception 'Archive of an import is immutable' using errcode = '42501';
  end if;
  if not ((old.status, new.status) in (('awaiting_upload', 'received'), ('received', 'validating'), ('validating', 'registered'),
      ('validating', 'duplicate'), ('validating', 'rejected'), ('validating', 'failed'), ('failed', 'validating'), ('received', 'failed'),
      ('received', 'rejected'), ('awaiting_upload', 'failed'))
      or new.status = old.status) then
    raise exception 'Invalid import transition % -> %', old.status, new.status using errcode = '23514';
  end if;
  if old.status = 'failed' and new.status = 'validating' then
    new.attempts := old.attempts + 1;
    if new.attempts > 5 then raise exception 'Retry limit reached' using errcode = '54000'; end if;
  end if;
  if new.status = 'registered' and new.version_id is null then raise exception 'A registered import needs its version' using errcode = '23514'; end if;
  new.updated_at := now();
  if new.status <> old.status and new.status in ('registered', 'duplicate', 'rejected', 'failed') then
    perform os_private.bridge_event('import_' || new.status, new.project_id, new.id, new.version_id, null,
      jsonb_build_object('error', new.error_code));
  end if;
  return new;
end;
$$;
create trigger os_project_imports_guard before insert or update on public.os_project_imports
  for each row execute function os_private.bridge_import_guard();

-- Versions: number assigned under a project lock; only `sealed false -> true` may change, after every file is present.
create or replace function os_private.bridge_version_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n integer; files integer; src public.os_project_versions;
begin
  if tg_op = 'DELETE' then raise exception 'Versions are permanent' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    perform 1 from public.os_projects where id = new.project_id for update;
    select coalesce(max(number), 0) + 1 into n from public.os_project_versions where project_id = new.project_id;
    new.number := n;
    new.sealed := false;
    new.created_at := now();
    if new.kind = 'restore' then
      select * into src from public.os_project_versions where id = new.restored_from;
      if src.id is null or src.project_id <> new.project_id or not src.sealed then
        raise exception 'Restore source must be a sealed version of the same project' using errcode = '23514';
      end if;
      new.framework := src.framework; new.entry_path := src.entry_path; new.deployable := src.deployable;
      new.file_count := src.file_count; new.total_bytes := src.total_bytes; new.content_digest := src.content_digest;
    end if;
    return new;
  end if;
  if not (old.sealed = false and new.sealed = true) or (to_jsonb(new) - 'sealed') is distinct from (to_jsonb(old) - 'sealed') then
    raise exception 'Versions are immutable' using errcode = '42501';
  end if;
  select count(*) into files from public.os_project_files where version_id = new.id;
  if files <> new.file_count then raise exception 'Version has % of % files', files, new.file_count using errcode = '23514'; end if;
  perform os_private.bridge_event(case when new.kind = 'restore' then 'version_restored' else 'version_created' end,
    new.project_id, new.import_id, new.id, null, jsonb_build_object('number', new.number, 'files', new.file_count, 'restored_from', new.restored_from));
  return new;
end;
$$;
create trigger os_project_versions_guard before insert or update or delete on public.os_project_versions
  for each row execute function os_private.bridge_version_guard();

-- Restoring copies the source manifest into the new version (same blobs, nothing re-uploaded) and seals it.
create or replace function public.os_project_restore_version(p_version uuid, p_note text default '')
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  src public.os_project_versions; v uuid;
begin
  if not os_private.is_owner() then raise exception 'Owner session required' using errcode = '42501'; end if;
  select * into src from public.os_project_versions where id = p_version;
  if src.id is null then raise exception 'Version not found' using errcode = 'P0002'; end if;
  insert into public.os_project_versions (project_id, number, kind, restored_from, source_tool, framework, entry_path, deployable,
    file_count, total_bytes, content_digest, summary, note)
  values (src.project_id, 1, 'restore', src.id, src.source_tool, src.framework, src.entry_path, src.deployable,
    src.file_count, src.total_bytes, src.content_digest, src.summary, left(coalesce(p_note, ''), 500))
  returning id into v;
  insert into public.os_project_files (version_id, path, sha256, size, mime)
    select v, path, sha256, size, mime from public.os_project_files where version_id = src.id;
  update public.os_project_versions set sealed = true where id = v;
  return v;
end;
$$;
revoke all on function public.os_project_restore_version(uuid, text) from public;
grant execute on function public.os_project_restore_version(uuid, text) to authenticated;

-- Files can only be added to an unsealed version created by the same owner.
create or replace function os_private.bridge_file_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then raise exception 'Version files are immutable' using errcode = '42501'; end if;
  if not exists (select 1 from public.os_project_versions v where v.id = new.version_id and not v.sealed and v.created_by = auth.uid()) then
    raise exception 'Files can only be added to your own unsealed version' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger os_project_files_guard before insert or update or delete on public.os_project_files
  for each row execute function os_private.bridge_file_guard();

-- Deployments: only sealed, statically deployable versions; production consumes a fresh owner approval; states move forward.
create or replace function os_private.bridge_deployment_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v public.os_project_versions; a public.os_project_publish_approvals;
begin
  if tg_op = 'DELETE' then raise exception 'Deployment history is permanent' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    select * into v from public.os_project_versions where id = new.version_id;
    if v.id is null or v.project_id <> new.project_id or not v.sealed then raise exception 'Deploy needs a sealed version of this project' using errcode = '23514'; end if;
    if v.deployable <> 'static' then raise exception 'Only static sites can be deployed until an isolated build environment exists' using errcode = '0A000'; end if;
    if new.state <> 'preparing' or new.deployment_id is not null or new.url is not null then raise exception 'A deployment starts as preparing' using errcode = '23514'; end if;
    if new.target = 'production' then
      select * into a from public.os_project_publish_approvals where id = new.approval_id for update;
      if a.id is null or a.version_id <> new.version_id or a.used_at is not null or a.expires_at < now() then
        raise exception 'Production needs a valid, unused owner approval for this exact version' using errcode = '42501';
      end if;
      update public.os_project_publish_approvals set used_at = now() where id = a.id;
    elsif new.approval_id is not null then
      raise exception 'Approvals are only for production' using errcode = '23514';
    end if;
    return new; -- logged by the AFTER trigger below, once the row exists
  end if;
  if (to_jsonb(new) - array['state', 'deployment_id', 'url', 'error_code', 'updated_at', 'checked_at']) is distinct from
     (to_jsonb(old) - array['state', 'deployment_id', 'url', 'error_code', 'updated_at', 'checked_at']) then
    raise exception 'Deployment identity is immutable' using errcode = '42501';
  end if;
  if old.deployment_id is not null and new.deployment_id is distinct from old.deployment_id then raise exception 'Deployment id is immutable' using errcode = '42501'; end if;
  if old.state in ('ready', 'error', 'canceled', 'blocked') and new.state <> old.state then raise exception 'Deployment % is final', old.state using errcode = '42501'; end if;
  if new.state = 'ready' and (new.deployment_id is null or new.url is null) then raise exception 'ready needs the provider deployment id and URL' using errcode = '23514'; end if;
  new.updated_at := now();
  if new.state <> old.state then
    perform os_private.bridge_event('deploy_state', new.project_id, null, new.version_id, new.id, jsonb_build_object('state', new.state, 'error', new.error_code));
  end if;
  return new;
end;
$$;
create trigger os_project_deployments_guard before insert or update or delete on public.os_project_deployments
  for each row execute function os_private.bridge_deployment_guard();
create or replace function os_private.bridge_deployment_logged() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform os_private.bridge_event('deploy_requested', new.project_id, null, new.version_id, new.id, jsonb_build_object('target', new.target, 'vercel_project', new.vercel_project));
  return null;
end;
$$;
create trigger os_project_deployments_logged after insert on public.os_project_deployments
  for each row execute function os_private.bridge_deployment_logged();

create or replace function os_private.bridge_approval_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.approved_by is distinct from auth.uid() then raise exception 'Approver must be the signed-in owner' using errcode = '42501'; end if;
    if not exists (select 1 from public.os_project_versions v where v.id = new.version_id and v.project_id = new.project_id and v.sealed) then
      raise exception 'Approval must name a sealed version of the project' using errcode = '23514';
    end if;
    new.created_at := now(); new.expires_at := now() + interval '24 hours'; new.used_at := null;
    perform os_private.bridge_event('publish_approved', new.project_id, null, new.version_id, null, '{}'::jsonb);
    return new;
  end if;
  if tg_op = 'DELETE' or (to_jsonb(new) - 'used_at') is distinct from (to_jsonb(old) - 'used_at') or old.used_at is not null then
    raise exception 'Approvals are immutable and single-use' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger os_project_publish_approvals_guard before insert or update or delete on public.os_project_publish_approvals
  for each row execute function os_private.bridge_approval_guard();

create or replace function os_private.bridge_token_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Tokens are revoked, not deleted' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    new.created_at := now(); new.revoked_at := null; new.last_used_at := null;
    if new.expires_at > now() + interval '90 days' or new.expires_at <= now() then raise exception 'Token expiry must be within 90 days' using errcode = '23514'; end if;
    perform os_private.bridge_event('token_created', null, null, null, null, jsonb_build_object('token', new.id, 'prefix', new.prefix, 'scopes', new.scopes));
    return new;
  end if;
  if (to_jsonb(new) - array['revoked_at', 'last_used_at']) is distinct from (to_jsonb(old) - array['revoked_at', 'last_used_at'])
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'Only revocation is allowed' using errcode = '42501';
  end if;
  if old.revoked_at is null and new.revoked_at is not null then
    new.revoked_at := now();
    perform os_private.bridge_event('token_revoked', null, null, null, null, jsonb_build_object('token', new.id, 'prefix', new.prefix));
  end if;
  return new;
end;
$$;
create trigger os_project_api_tokens_guard before insert or update or delete on public.os_project_api_tokens
  for each row execute function os_private.bridge_token_guard();

-- ── API (token) entry points: SECURITY DEFINER, minimal surface ────────────────────────────────────────────────────
-- The route hashes the bearer token (sha256) and passes only the hash. A token can only open an import that WAITS for
-- its archive in inbox/<import id>; it cannot read projects, create versions or deploy.
create or replace function public.os_bridge_api_open_import(p_token_sha256 text, p_category text, p_project_name text,
  p_original_name text, p_source_tool text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.os_project_api_tokens; existing public.os_project_imports; created uuid; per_hour integer;
begin
  select * into t from public.os_project_api_tokens where token_sha256 = p_token_sha256 for update;
  if t.id is null or t.revoked_at is not null or t.expires_at < now() or not ('import:create' = any (t.scopes)) then
    raise exception 'invalid_token' using errcode = '28000';
  end if;
  update public.os_project_api_tokens set last_used_at = now() where id = t.id;
  select * into existing from public.os_project_imports where created_by = t.created_by and idempotency_key = p_idempotency_key;
  if existing.id is not null then
    if existing.api_token_id is distinct from t.id then raise exception 'idempotency_key_in_use' using errcode = '23505'; end if;
    return jsonb_build_object('import_id', existing.id, 'status', existing.status, 'upload_path', 'inbox/' || existing.id || '.zip', 'replayed', true);
  end if;
  select count(*) into per_hour from public.os_project_imports where api_token_id = t.id and created_at > now() - interval '1 hour';
  if per_hour >= 20 then raise exception 'token_rate_limited' using errcode = '54000'; end if;
  created := gen_random_uuid();
  insert into public.os_project_imports (id, category, project_name, original_name, source_tool, source_kind, api_token_id,
    archive_path, idempotency_key, status, created_by)
  values (created, p_category, nullif(btrim(p_project_name), ''), p_original_name, coalesce(nullif(p_source_tool, ''), 'api'), 'api', t.id,
    'inbox/' || created || '.zip', p_idempotency_key, 'awaiting_upload', t.created_by);
  return jsonb_build_object('import_id', created, 'status', 'awaiting_upload', 'upload_path', 'inbox/' || created || '.zip', 'expires_in_seconds', 1800, 'replayed', false);
end;
$$;
revoke all on function public.os_bridge_api_open_import(text, text, text, text, text, text) from public;
grant execute on function public.os_bridge_api_open_import(text, text, text, text, text, text) to anon, authenticated;

-- The tool reports that the upload finished; the import then waits for an OWNER to process it in the library.
create or replace function public.os_bridge_api_import_status(p_token_sha256 text, p_import uuid, p_mark_uploaded boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.os_project_api_tokens; i public.os_project_imports; v public.os_project_versions;
begin
  select * into t from public.os_project_api_tokens where token_sha256 = p_token_sha256;
  if t.id is null or t.revoked_at is not null or t.expires_at < now() or not ('import:read' = any (t.scopes) or 'import:create' = any (t.scopes)) then
    raise exception 'invalid_token' using errcode = '28000';
  end if;
  select * into i from public.os_project_imports where id = p_import and api_token_id = t.id;
  if i.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_mark_uploaded and i.status = 'awaiting_upload' then
    if not exists (select 1 from os_private.bridge_inbox_objects o where o.name = i.archive_path) then
      raise exception 'archive_not_uploaded' using errcode = '22023';
    end if;
    update public.os_project_imports set status = 'received' where id = i.id returning * into i;
  end if;
  select * into v from public.os_project_versions where id = i.version_id;
  return jsonb_build_object('import_id', i.id, 'status', i.status, 'error_code', i.error_code, 'problems', i.problems,
    'version', case when v.id is null then null else jsonb_build_object('number', v.number, 'files', v.file_count) end);
end;
$$;
revoke all on function public.os_bridge_api_import_status(text, uuid, boolean) from public;

-- ── RLS ────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.os_project_imports enable row level security;
alter table public.os_project_versions enable row level security;
alter table public.os_project_files enable row level security;
alter table public.os_project_deployments enable row level security;
alter table public.os_project_publish_approvals enable row level security;
alter table public.os_project_events enable row level security;
alter table public.os_project_api_tokens enable row level security;

revoke all on public.os_project_imports, public.os_project_versions, public.os_project_files, public.os_project_deployments,
  public.os_project_publish_approvals, public.os_project_events, public.os_project_api_tokens from anon, authenticated;
grant select, insert, update (status, project_id, project_name, archive_bytes, archive_sha256, error_code, problems, version_id, attempts, category)
  on public.os_project_imports to authenticated;
grant select, insert, update (sealed) on public.os_project_versions to authenticated;
grant select, insert on public.os_project_files to authenticated;
grant select, insert, update (state, deployment_id, url, error_code, checked_at) on public.os_project_deployments to authenticated;
grant select, insert on public.os_project_publish_approvals to authenticated;
grant select on public.os_project_events to authenticated;
grant select (id, name, prefix, scopes, created_by, created_at, expires_at, revoked_at, last_used_at), insert, update (revoked_at)
  on public.os_project_api_tokens to authenticated;

create policy owners_read on public.os_project_imports for select to authenticated using (os_private.is_owner());
create policy owners_insert on public.os_project_imports for insert to authenticated
  with check (os_private.is_owner() and created_by = auth.uid() and source_kind = 'upload');
create policy owners_update on public.os_project_imports for update to authenticated using (os_private.is_owner()) with check (os_private.is_owner());
create policy owners_read on public.os_project_versions for select to authenticated using (os_private.is_owner());
create policy owners_insert on public.os_project_versions for insert to authenticated with check (os_private.is_owner() and created_by = auth.uid());
create policy owners_seal on public.os_project_versions for update to authenticated using (os_private.is_owner() and created_by = auth.uid()) with check (os_private.is_owner());
create policy owners_read on public.os_project_files for select to authenticated using (os_private.is_owner());
create policy owners_insert on public.os_project_files for insert to authenticated with check (os_private.is_owner());
create policy owners_read on public.os_project_deployments for select to authenticated using (os_private.is_owner());
create policy owners_insert on public.os_project_deployments for insert to authenticated with check (os_private.is_owner() and created_by = auth.uid());
create policy owners_update on public.os_project_deployments for update to authenticated using (os_private.is_owner()) with check (os_private.is_owner());
create policy owners_read on public.os_project_publish_approvals for select to authenticated using (os_private.is_owner());
create policy owners_insert on public.os_project_publish_approvals for insert to authenticated with check (os_private.is_owner() and approved_by = auth.uid());
create policy owners_read on public.os_project_events for select to authenticated using (os_private.is_owner());
create policy owners_read on public.os_project_api_tokens for select to authenticated using (os_private.is_owner());
create policy owners_insert on public.os_project_api_tokens for insert to authenticated with check (os_private.is_owner() and created_by = auth.uid());
create policy owners_revoke on public.os_project_api_tokens for update to authenticated using (os_private.is_owner()) with check (os_private.is_owner());

-- ── Storage (only where the storage schema exists, i.e. on Supabase; isolated CI databases may stub it) ───────────
do $storage$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not present: bucket and storage policies skipped';
    execute 'create or replace view os_private.bridge_inbox_objects as select null::text as name where false';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avalon-projects', 'avalon-projects', false, 26214400, null)
  on conflict (id) do update set public = false, file_size_limit = 26214400;

  execute 'create or replace view os_private.bridge_inbox_objects with (security_invoker = false) as
    select o.name from storage.objects o where o.bucket_id = ''avalon-projects'' and o.name like ''inbox/%''';

  -- Inbox uploads (API): only into the exact path of an import that is still awaiting its archive (30 minutes).
  execute $p$create or replace function os_private.bridge_inbox_open(p_name text) returns boolean
    language sql stable security definer set search_path = '' as $f$
      select exists (select 1 from public.os_project_imports i
        where i.archive_path = p_name and i.status = 'awaiting_upload' and i.source_kind = 'api'
          and i.created_at > now() - interval '30 minutes')
        and not exists (select 1 from storage.objects o where o.bucket_id = 'avalon-projects' and o.name = p_name)
    $f$$p$;
  execute 'revoke all on function os_private.bridge_inbox_open(text) from public';
  execute 'grant execute on function os_private.bridge_inbox_open(text) to anon, authenticated';
  execute 'grant usage on schema os_private to anon';

  execute 'drop policy if exists avalon_projects_owner_read on storage.objects';
  execute 'drop policy if exists avalon_projects_owner_write on storage.objects';
  execute 'drop policy if exists avalon_projects_owner_cleanup on storage.objects';
  execute 'drop policy if exists avalon_projects_api_inbox on storage.objects';
  execute $p$create policy avalon_projects_owner_read on storage.objects for select to authenticated
    using (bucket_id = 'avalon-projects' and os_private.is_owner())$p$;
  -- Owners write their own incoming archives and content-addressed blobs. Blobs are never updated.
  execute $p$create policy avalon_projects_owner_write on storage.objects for insert to authenticated
    with check (bucket_id = 'avalon-projects' and os_private.is_owner() and (
      name ~ '^blobs/[0-9a-f]{64}$'
      or (name ~ '^incoming/[0-9a-f-]{36}/[0-9a-f-]{36}\.(zip|html)$' and split_part(name, '/', 2) = auth.uid()::text)))$p$;
  -- Owners may remove THEIR incoming archives after processing (blobs and inbox stay; versions reference blobs).
  execute $p$create policy avalon_projects_owner_cleanup on storage.objects for delete to authenticated
    using (bucket_id = 'avalon-projects' and os_private.is_owner() and name ~ '^incoming/' and split_part(name, '/', 2) = auth.uid()::text)$p$;
  execute $p$create policy avalon_projects_api_inbox on storage.objects for insert to anon
    with check (bucket_id = 'avalon-projects' and name ~ '^inbox/[0-9a-f-]{36}\.(zip|html)$' and os_private.bridge_inbox_open(name))$p$;
end
$storage$;
revoke all on os_private.bridge_inbox_objects from public, anon, authenticated;
grant execute on function public.os_bridge_api_import_status(text, uuid, boolean) to anon, authenticated;

-- SHIN's catalog review: the two Project Bridge token RPCs are REVIEWED anon definers (they accept only a valid token hash,
-- can only open an inbox import awaiting upload or read that import's status; locked by tests/security.test.cjs). Same body otherwise.
create or replace function public.crm_agent_security_posture_internal() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare no_rls jsonb; anon_tables jsonb; anon_fns jsonb; findings jsonb := '[]';
begin
  select coalesce(jsonb_agg(c.relname order by c.relname), '[]') into no_rls from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  select coalesce(jsonb_agg(distinct g.table_name), '[]') into anon_tables from information_schema.role_table_grants g where g.table_schema = 'public' and g.grantee = 'anon';
  select coalesce(jsonb_agg(p.proname order by p.proname), '[]') into anon_fns from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and pg_catalog.has_function_privilege('anon', p.oid, 'execute') and p.proname not in ('crm_public_inquiry', 'crm_ai_public_control', 'os_bridge_api_open_import', 'os_bridge_api_import_status');
  if jsonb_array_length(no_rls) > 0 then findings := findings || jsonb_build_array(jsonb_build_object('severity', 'high', 'finding', 'Tablas públicas sin RLS: ' || no_rls::text)); end if;
  if jsonb_array_length(anon_tables) > 0 then findings := findings || jsonb_build_array(jsonb_build_object('severity', 'high', 'finding', 'Tablas con privilegios para anon: ' || anon_tables::text)); end if;
  if jsonb_array_length(anon_fns) > 0 then findings := findings || jsonb_build_array(jsonb_build_object('severity', 'high', 'finding', 'Funciones con privilegios de definidor ejecutables por anon: ' || anon_fns::text)); end if;
  return jsonb_build_object('findings', findings, 'scope', 'catalog_review_only',
    'owners', (select count(*) from public.agency_memberships where role = 'owner'),
    'non_owner_members', (select count(*) from public.agency_memberships where role <> 'owner'));
end $$;
revoke all on function public.crm_agent_security_posture_internal() from public, anon, authenticated;

commit;
