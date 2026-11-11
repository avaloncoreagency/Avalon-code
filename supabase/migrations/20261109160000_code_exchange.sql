-- Avalon Code Exchange: a Git remote WITHOUT GitHub, for Codex, Claude Code and Avalon's agents.
--
-- Agents never get database or owner credentials. They hold a scoped bridge token (created by an owner in the library,
-- 90 days max, revocable instantly). Every operation goes through a SECURITY DEFINER RPC that checks that token:
--   code:deliver    upload a package blob and submit it as a delivery; read the status of ITS OWN deliveries
--   code:pull       download the bundles of the verified mainline (to start or continue work)
--   code:integrate  list/download deliveries, record verification, approve NON-sensitive ones, publish mainline
-- Owners (Supabase session) read everything and are the only ones who can approve SENSITIVE deliveries.
-- Bytes live in os_private (not exposed by the API), content-addressed by SHA-256 and verified by the database.
-- The mainline is append-only and linear: each publish names the current head as its parent, and must report green tests.
-- The token can arrive as an argument (sha256 of the token) or as the header X-Avalon-Bridge-Token, so a network proxy
-- can inject it and the agent's sandbox never holds the secret.

-- ── Token scopes ──────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.os_project_api_tokens drop constraint if exists os_project_api_tokens_scopes_check;
alter table public.os_project_api_tokens add constraint os_project_api_tokens_scopes_check check (
  scopes <@ array['import:create', 'import:read', 'code:deliver', 'code:pull', 'code:integrate']::text[]
  and cardinality(scopes) between 1 and 5);

-- ── Storage (private schema, reachable only through the RPCs below) ───────────────────────────────────────────────
create table os_private.acx_blobs (
  sha256 text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
  size bigint not null check (size between 1 and 67108864),
  chunks integer not null check (chunks between 1 and 64),
  complete boolean not null default false,
  uploaded_by uuid not null references public.os_project_api_tokens (id),
  created_at timestamptz not null default now(),
  check (chunks = ceil(size / 1048576.0)::integer)
);
create table os_private.acx_chunks (
  sha256 text not null references os_private.acx_blobs (sha256) on delete cascade,
  idx integer not null check (idx between 0 and 63),
  data bytea not null check (octet_length(data) between 1 and 1048576),
  primary key (sha256, idx)
);
revoke all on os_private.acx_blobs, os_private.acx_chunks from public, anon, authenticated;

create table public.os_code_deliveries (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references public.os_project_api_tokens (id),
  delivery_key text not null check (delivery_key ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  author text not null check (author in ('codex', 'claude_code', 'higgsfield', 'ren', 'shin', 'haru', 'sora', 'kenji', 'miguel', 'samuel')),
  module text not null check (module ~ '^[a-z0-9][a-z0-9_-]{1,40}$'),
  base_commit text not null check (base_commit ~ '^[0-9a-f]{40}$'),
  delivery_commit text not null check (delivery_commit ~ '^[0-9a-f]{40}$'),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object' and pg_column_size(manifest) <= 262144),
  package_sha256 text not null references os_private.acx_blobs (sha256),
  package_bytes bigint not null,
  status text not null default 'submitted'
    check (status in ('submitted', 'verifying', 'ready_for_review', 'approved', 'rejected', 'integrated', 'failed')),
  report jsonb not null default '{}'::jsonb check (jsonb_typeof(report) = 'object' and pg_column_size(report) <= 262144),
  approved_by text,
  review_note text check (char_length(review_note) <= 2000),
  integrated_commit text check (integrated_commit ~ '^[0-9a-f]{40}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token_id, delivery_key)
);
create index os_code_deliveries_status on public.os_code_deliveries (status, created_at desc);

create table public.os_code_mainline (
  seq bigint generated always as identity primary key,
  commit text not null unique check (commit ~ '^[0-9a-f]{40}$'),
  parent_commit text check (parent_commit ~ '^[0-9a-f]{40}$'),
  bundle_sha256 text not null references os_private.acx_blobs (sha256),
  full_sha256 text references os_private.acx_blobs (sha256),
  tests jsonb not null check (jsonb_typeof(tests) = 'object'),
  deliveries uuid[] not null default '{}',
  preview_url text check (preview_url ~ '^https://[a-z0-9-]+\.vercel\.app$'),
  published_by uuid not null references public.os_project_api_tokens (id),
  created_at timestamptz not null default now(),
  check (parent_commit is not null or (full_sha256 is not null and full_sha256 = bundle_sha256))
);

create table public.os_code_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  action text not null,
  token_id uuid references public.os_project_api_tokens (id),
  user_id uuid,
  delivery_id uuid references public.os_code_deliveries (id),
  mainline_seq bigint references public.os_code_mainline (seq),
  detail jsonb not null default '{}'::jsonb
);

-- Append-only: mainline rows only ever gain a preview URL once; events never change.
create or replace function os_private.acx_immutable() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name = 'os_code_mainline' and tg_op = 'UPDATE'
     and (to_jsonb(new) - 'preview_url') = (to_jsonb(old) - 'preview_url') and old.preview_url is null then
    return new;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;
create trigger os_code_mainline_immutable before update or delete on public.os_code_mainline
  for each row execute function os_private.acx_immutable();
create trigger os_code_events_immutable before update or delete on public.os_code_events
  for each row execute function os_private.acx_immutable();
create trigger os_code_deliveries_no_delete before delete on public.os_code_deliveries
  for each row execute function os_private.acx_immutable();

alter table public.os_code_deliveries enable row level security;
alter table public.os_code_mainline enable row level security;
alter table public.os_code_events enable row level security;
revoke all on public.os_code_deliveries, public.os_code_mainline, public.os_code_events from anon, authenticated;
grant select on public.os_code_deliveries, public.os_code_mainline, public.os_code_events to authenticated;
create policy owners_read on public.os_code_deliveries for select to authenticated using ((select os_private.is_owner()));
create policy owners_read on public.os_code_mainline for select to authenticated using ((select os_private.is_owner()));
create policy owners_read on public.os_code_events for select to authenticated using ((select os_private.is_owner()));

-- ── Helpers ───────────────────────────────────────────────────────────────────────────────────────────────────────
-- Resolve the caller's token (argument hash, or the X-Avalon-Bridge-Token header hashed here) and require a scope.
create or replace function os_private.acx_token(p_token_sha256 text, p_scopes text[])
returns public.os_project_api_tokens language plpgsql security definer set search_path = '' as $$
declare
  h text := p_token_sha256; raw text; t public.os_project_api_tokens;
begin
  if h is null then
    begin
      raw := nullif(current_setting('request.headers', true), '')::json ->> 'x-avalon-bridge-token';
    exception when others then raw := null;
    end;
    if raw ~ '^avb_[A-Za-z0-9_-]{20,200}$' then h := encode(pg_catalog.sha256(convert_to(raw, 'UTF8')), 'hex'); end if;
  end if;
  if h is not null then select * into t from public.os_project_api_tokens where token_sha256 = h; end if;
  if t.id is null or t.revoked_at is not null or t.expires_at < now() or not (t.scopes && p_scopes) then
    raise exception 'invalid_token' using errcode = '28000';
  end if;
  if t.last_used_at is null or t.last_used_at < now() - interval '1 minute' then
    update public.os_project_api_tokens set last_used_at = now() where id = t.id;
  end if;
  return t;
end;
$$;

create or replace function os_private.acx_event(p_action text, p_token uuid, p_delivery uuid, p_seq bigint, p_detail jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.os_code_events (action, token_id, user_id, delivery_id, mainline_seq, detail)
  values (p_action, p_token, auth.uid(), p_delivery, p_seq, coalesce(p_detail, '{}'::jsonb));
$$;

-- ── Blobs ─────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Upload one 1 MiB chunk (base64). The blob is marked complete only when every chunk is present AND the SHA-256 of the
-- concatenation equals the declared hash; otherwise it is discarded. Re-uploading a complete blob is a no-op.
create or replace function public.os_code_put_chunk(p_sha256 text, p_size bigint, p_index integer, p_data text,
  p_token_sha256 text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.os_project_api_tokens; b os_private.acx_blobs; d bytea; expected integer; n integer; got text; used bigint;
  total integer := ceil(p_size / 1048576.0)::integer;
begin
  t := os_private.acx_token(p_token_sha256, array['code:deliver', 'code:integrate']);
  if p_sha256 !~ '^[0-9a-f]{64}$' or p_size is null or p_size < 1 or p_size > 67108864 or p_index < 0 or p_index >= total then
    raise exception 'invalid_chunk' using errcode = '22023';
  end if;
  select * into b from os_private.acx_blobs where sha256 = p_sha256 for update;
  if b.sha256 is not null and b.complete then return jsonb_build_object('complete', true, 'deduplicated', true); end if;
  if b.sha256 is not null and (b.size <> p_size or b.uploaded_by <> t.id) then raise exception 'blob_conflict' using errcode = '23505'; end if;
  if b.sha256 is null then
    select coalesce(sum(size), 0) into used from os_private.acx_blobs where uploaded_by = t.id and created_at > now() - interval '1 day';
    if used + p_size > 268435456 then raise exception 'quota_exceeded' using errcode = '54000'; end if;
    insert into os_private.acx_blobs (sha256, size, chunks, uploaded_by) values (p_sha256, p_size, total, t.id);
  end if;
  begin d := decode(p_data, 'base64'); exception when others then raise exception 'invalid_chunk' using errcode = '22023'; end;
  expected := case when p_index < total - 1 then 1048576 else (p_size - 1048576::bigint * (total - 1))::integer end;
  if octet_length(d) <> expected then raise exception 'invalid_chunk' using errcode = '22023'; end if;
  insert into os_private.acx_chunks (sha256, idx, data) values (p_sha256, p_index, d) on conflict do nothing;
  if exists (select 1 from os_private.acx_chunks where sha256 = p_sha256 and idx = p_index and data <> d) then
    raise exception 'blob_conflict' using errcode = '23505';
  end if;
  select count(*) into n from os_private.acx_chunks where sha256 = p_sha256;
  if n < total then return jsonb_build_object('complete', false, 'received', n, 'chunks', total); end if;
  select encode(pg_catalog.sha256(string_agg(data, ''::bytea order by idx)), 'hex') into got from os_private.acx_chunks where sha256 = p_sha256;
  if got <> p_sha256 then
    delete from os_private.acx_blobs where sha256 = p_sha256;
    perform os_private.acx_event('blob_rejected', t.id, null, null, jsonb_build_object('sha256', p_sha256, 'reason', 'hash_mismatch'));
    return jsonb_build_object('complete', false, 'error', 'hash_mismatch');
  end if;
  update os_private.acx_blobs set complete = true where sha256 = p_sha256;
  return jsonb_build_object('complete', true, 'chunks', total);
end;
$$;

-- Download one chunk. Integrators read any complete blob; pull tokens only blobs of the published mainline.
create or replace function public.os_code_get_chunk(p_sha256 text, p_index integer, p_token_sha256 text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.os_project_api_tokens; b os_private.acx_blobs; d bytea;
begin
  t := os_private.acx_token(p_token_sha256, array['code:pull', 'code:integrate']);
  select * into b from os_private.acx_blobs where sha256 = p_sha256 and complete;
  if b.sha256 is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not ('code:integrate' = any (t.scopes)) and not exists (
    select 1 from public.os_code_mainline m where m.bundle_sha256 = p_sha256 or m.full_sha256 = p_sha256) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select data into d from os_private.acx_chunks where sha256 = p_sha256 and idx = p_index;
  if d is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object('size', b.size, 'chunks', b.chunks, 'index', p_index, 'data', encode(d, 'base64'));
end;
$$;

-- ── Deliveries ────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.os_code_submit(p_manifest jsonb, p_package_sha256 text, p_token_sha256 text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.os_project_api_tokens; b os_private.acx_blobs; existing public.os_code_deliveries; created uuid; per_hour integer;
begin
  t := os_private.acx_token(p_token_sha256, array['code:deliver']);
  if jsonb_typeof(p_manifest) <> 'object' or pg_column_size(p_manifest) > 262144
     or coalesce(p_manifest ->> 'id', '') !~ '^[a-z0-9][a-z0-9._-]{2,63}$'
     or coalesce(p_manifest ->> 'base_commit', '') !~ '^[0-9a-f]{40}$'
     or coalesce(p_manifest ->> 'delivery_commit', '') !~ '^[0-9a-f]{40}$'
     or coalesce(p_manifest ->> 'module', '') !~ '^[a-z0-9][a-z0-9_-]{1,40}$'
     or coalesce(p_manifest ->> 'author', '') not in ('codex', 'claude_code', 'higgsfield', 'ren', 'shin', 'haru', 'sora', 'kenji', 'miguel', 'samuel') then
    raise exception 'invalid_manifest' using errcode = '22023';
  end if;
  select * into b from os_private.acx_blobs where sha256 = p_package_sha256 and complete and uploaded_by = t.id;
  if b.sha256 is null then raise exception 'package_not_uploaded' using errcode = '22023'; end if;
  select * into existing from public.os_code_deliveries where token_id = t.id and delivery_key = p_manifest ->> 'id';
  if existing.id is not null then
    if existing.package_sha256 <> p_package_sha256 then raise exception 'delivery_id_in_use' using errcode = '23505'; end if;
    return jsonb_build_object('delivery_id', existing.id, 'status', existing.status, 'replayed', true);
  end if;
  select count(*) into per_hour from public.os_code_deliveries where token_id = t.id and created_at > now() - interval '1 hour';
  if per_hour >= 30 then raise exception 'token_rate_limited' using errcode = '54000'; end if;
  insert into public.os_code_deliveries (token_id, delivery_key, author, module, base_commit, delivery_commit, manifest, package_sha256, package_bytes)
  values (t.id, p_manifest ->> 'id', p_manifest ->> 'author', p_manifest ->> 'module', p_manifest ->> 'base_commit',
          p_manifest ->> 'delivery_commit', p_manifest, p_package_sha256, b.size)
  returning id into created;
  perform os_private.acx_event('delivery_submitted', t.id, created, null, jsonb_build_object('key', p_manifest ->> 'id', 'author', p_manifest ->> 'author'));
  return jsonb_build_object('delivery_id', created, 'status', 'submitted', 'replayed', false);
end;
$$;

-- An agent reads the state and verification report of ITS OWN deliveries only.
create or replace function public.os_code_my_deliveries(p_token_sha256 text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.os_project_api_tokens;
begin
  t := os_private.acx_token(p_token_sha256, array['code:deliver']);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'key', delivery_key, 'status', status, 'report', report,
    'review_note', review_note, 'integrated_commit', integrated_commit, 'created_at', created_at) order by created_at desc)
    from (select * from public.os_code_deliveries where token_id = t.id order by created_at desc limit 50) d), '[]'::jsonb);
end;
$$;

create or replace function public.os_code_inbox(p_status text default null, p_token_sha256 text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.os_project_api_tokens;
begin
  t := os_private.acx_token(p_token_sha256, array['code:integrate']);
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'key', d.delivery_key, 'author', d.author, 'module', d.module,
    'base_commit', d.base_commit, 'delivery_commit', d.delivery_commit, 'package_sha256', d.package_sha256, 'package_bytes', d.package_bytes,
    'status', d.status, 'report', d.report, 'approved_by', d.approved_by, 'manifest', d.manifest, 'token', tk.name, 'created_at', d.created_at)
    order by d.created_at)
    from public.os_code_deliveries d join public.os_project_api_tokens tk on tk.id = d.token_id
    where p_status is null or d.status = p_status), '[]'::jsonb);
end;
$$;

-- Integrator state machine. It may approve ONLY deliveries whose recorded verification lists no sensitive paths;
-- sensitive ones (migrations, auth, workflows, package manifests, scripts…) wait for an owner (os_code_review).
create or replace function public.os_code_set_status(p_delivery uuid, p_status text, p_report jsonb default '{}'::jsonb,
  p_token_sha256 text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.os_project_api_tokens; d public.os_code_deliveries; merged jsonb;
begin
  t := os_private.acx_token(p_token_sha256, array['code:integrate']);
  select * into d from public.os_code_deliveries where id = p_delivery for update;
  if d.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if jsonb_typeof(coalesce(p_report, '{}'::jsonb)) <> 'object' then raise exception 'invalid_report' using errcode = '22023'; end if;
  merged := d.report || coalesce(p_report, '{}'::jsonb);
  if not ((d.status, p_status) in (('submitted', 'verifying'), ('submitted', 'rejected'), ('verifying', 'ready_for_review'),
      ('verifying', 'rejected'), ('ready_for_review', 'approved'), ('ready_for_review', 'rejected'), ('approved', 'failed'),
      ('failed', 'verifying'))) then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  if p_status = 'ready_for_review' and coalesce(jsonb_typeof(merged -> 'sensitive_paths'), '') <> 'array' then
    raise exception 'report_needs_sensitive_paths' using errcode = '22023';
  end if;
  -- Fail closed: a missing or malformed list counts as sensitive.
  if p_status = 'approved' and (coalesce(jsonb_typeof(merged -> 'sensitive_paths'), '') <> 'array'
      or jsonb_array_length(merged -> 'sensitive_paths') > 0) then
    raise exception 'owner_approval_required' using errcode = '42501';
  end if;
  update public.os_code_deliveries set status = p_status, report = merged, updated_at = now(),
    approved_by = case when p_status = 'approved' then 'integrator:' || t.prefix else approved_by end
  where id = d.id;
  perform os_private.acx_event('delivery_' || p_status, t.id, d.id, null, jsonb_build_object('from', d.status));
  return jsonb_build_object('delivery_id', d.id, 'status', p_status);
end;
$$;

-- Owner decision from the Avalon UI (Supabase session; RLS-equivalent check inside).
create or replace function public.os_code_review(p_delivery uuid, p_decision text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.os_code_deliveries;
begin
  if auth.uid() is null or not os_private.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_decision not in ('approved', 'rejected') or char_length(coalesce(p_note, '')) > 2000 then raise exception 'invalid' using errcode = '22023'; end if;
  select * into d from public.os_code_deliveries where id = p_delivery for update;
  if d.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (d.status = 'ready_for_review' or (d.status = 'approved' and p_decision = 'rejected')) then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  update public.os_code_deliveries set status = p_decision, review_note = nullif(p_note, ''), updated_at = now(),
    approved_by = case when p_decision = 'approved' then 'owner:' || auth.uid() else approved_by end
  where id = d.id;
  perform os_private.acx_event('owner_' || p_decision, null, d.id, null, jsonb_build_object('note', left(coalesce(p_note, ''), 200)));
  return jsonb_build_object('delivery_id', d.id, 'status', p_decision);
end;
$$;

-- ── Mainline ──────────────────────────────────────────────────────────────────────────────────────────────────────
-- Publish a verified commit. Linear history (parent = current head), complete blobs, green tests, and every listed
-- delivery must have been approved; they become 'integrated'. The first entry must be a full bundle.
create or replace function public.os_code_publish(p_commit text, p_parent text, p_bundle_sha256 text, p_full_sha256 text,
  p_tests jsonb, p_deliveries uuid[] default '{}', p_token_sha256 text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.os_project_api_tokens; head public.os_code_mainline; created bigint; n integer;
begin
  t := os_private.acx_token(p_token_sha256, array['code:integrate']);
  perform pg_advisory_xact_lock(hashtext('os_code_mainline'));
  select * into head from public.os_code_mainline order by seq desc limit 1;
  if head.seq is null and (p_parent is not null or p_full_sha256 is null or p_full_sha256 <> p_bundle_sha256) then
    raise exception 'first_entry_must_be_full' using errcode = '22023';
  end if;
  if head.seq is not null and p_parent is distinct from head.commit then raise exception 'stale_parent' using errcode = '40001'; end if;
  if not exists (select 1 from os_private.acx_blobs where sha256 = p_bundle_sha256 and complete)
     or (p_full_sha256 is not null and not exists (select 1 from os_private.acx_blobs where sha256 = p_full_sha256 and complete)) then
    raise exception 'bundle_not_uploaded' using errcode = '22023';
  end if;
  if jsonb_typeof(p_tests) <> 'object' or coalesce((p_tests ->> 'failed')::integer, 1) <> 0 or coalesce((p_tests ->> 'passed')::integer, 0) < 1 then
    raise exception 'tests_not_green' using errcode = '22023';
  end if;
  select count(*) into n from public.os_code_deliveries where id = any (coalesce(p_deliveries, '{}')) and status = 'approved';
  if n <> coalesce(cardinality(p_deliveries), 0) then raise exception 'delivery_not_approved' using errcode = '22023'; end if;
  insert into public.os_code_mainline (commit, parent_commit, bundle_sha256, full_sha256, tests, deliveries, published_by)
  values (p_commit, p_parent, p_bundle_sha256, p_full_sha256, p_tests, coalesce(p_deliveries, '{}'), t.id) returning seq into created;
  update public.os_code_deliveries set status = 'integrated', integrated_commit = p_commit, updated_at = now() where id = any (coalesce(p_deliveries, '{}'));
  perform os_private.acx_event('mainline_published', t.id, null, created, jsonb_build_object('commit', p_commit, 'deliveries', coalesce(cardinality(p_deliveries), 0)));
  return jsonb_build_object('seq', created, 'commit', p_commit);
end;
$$;

create or replace function public.os_code_set_preview(p_seq bigint, p_url text, p_token_sha256 text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.os_project_api_tokens;
begin
  t := os_private.acx_token(p_token_sha256, array['code:integrate']);
  update public.os_code_mainline set preview_url = p_url where seq = p_seq and preview_url is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform os_private.acx_event('preview_recorded', t.id, null, p_seq, jsonb_build_object('url', p_url));
  return jsonb_build_object('seq', p_seq, 'preview_url', p_url);
end;
$$;

-- What any code token needs to start or continue: the chain from the latest full snapshot to the head.
create or replace function public.os_code_head(p_token_sha256 text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.os_project_api_tokens; since bigint;
begin
  t := os_private.acx_token(p_token_sha256, array['code:pull', 'code:integrate', 'code:deliver']);
  select max(seq) into since from public.os_code_mainline where full_sha256 is not null;
  return jsonb_build_object('token', jsonb_build_object('name', t.name, 'prefix', t.prefix, 'scopes', t.scopes, 'expires_at', t.expires_at),
    'chain', coalesce((select jsonb_agg(jsonb_build_object('seq', seq, 'commit', commit, 'parent', parent_commit,
      'bundle_sha256', bundle_sha256, 'full_sha256', full_sha256, 'tests', tests, 'preview_url', preview_url, 'created_at', created_at) order by seq)
      from public.os_code_mainline where since is not null and seq >= since), '[]'::jsonb));
end;
$$;

-- ── Grants (token-gated definers; reviewed in tests/security.test.cjs) ────────────────────────────────────────────
revoke all on function os_private.acx_token(text, text[]) from public;
revoke all on function os_private.acx_event(text, uuid, uuid, bigint, jsonb) from public;
revoke all on function public.os_code_put_chunk(text, bigint, integer, text, text) from public, anon, authenticated;
revoke all on function public.os_code_get_chunk(text, integer, text) from public, anon, authenticated;
revoke all on function public.os_code_submit(jsonb, text, text) from public, anon, authenticated;
revoke all on function public.os_code_my_deliveries(text) from public, anon, authenticated;
revoke all on function public.os_code_inbox(text, text) from public, anon, authenticated;
revoke all on function public.os_code_set_status(uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.os_code_review(uuid, text, text) from public, anon, authenticated;
revoke all on function public.os_code_publish(text, text, text, text, jsonb, uuid[], text) from public, anon, authenticated;
revoke all on function public.os_code_set_preview(bigint, text, text) from public, anon, authenticated;
revoke all on function public.os_code_head(text) from public, anon, authenticated;
grant execute on function public.os_code_put_chunk(text, bigint, integer, text, text) to anon, authenticated;
grant execute on function public.os_code_get_chunk(text, integer, text) to anon, authenticated;
grant execute on function public.os_code_submit(jsonb, text, text) to anon, authenticated;
grant execute on function public.os_code_my_deliveries(text) to anon, authenticated;
grant execute on function public.os_code_inbox(text, text) to anon, authenticated;
grant execute on function public.os_code_set_status(uuid, text, jsonb, text) to anon, authenticated;
grant execute on function public.os_code_publish(text, text, text, text, jsonb, uuid[], text) to anon, authenticated;
grant execute on function public.os_code_set_preview(bigint, text, text) to anon, authenticated;
grant execute on function public.os_code_head(text) to anon, authenticated;
grant execute on function public.os_code_review(uuid, text, text) to authenticated;
