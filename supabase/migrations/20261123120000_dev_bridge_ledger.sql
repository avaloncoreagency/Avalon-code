-- Avalon Dev Bridge 3.0 — verifiable work ledger (sessions, events, declared hours, commitments). ADDITIVE ONLY.
-- REVIEW ONLY until Miguel AND Samuel explicitly approve applying it to production.
--
-- Builds on Dev Bridge 2.0 (read-only GitHub/Vercel/Supabase snapshots, no database). Adds a persistent, append-only
-- ledger. Kept separate from crm_timeline: development activity is not commercial activity.
--
-- Identity, never inferred:
--   * dev_bridge_people maps an Auth user to the owner label (miguel | samuel). Each owner claims ONLY their own label,
--     once. Branch names, commit authors or agent names are never proof of identity.
--   * dev_bridge_agents: miguel.claude, miguel.codex, samuel.claude, samuel.codex. Each has its own revocable token
--     (stored as sha256). ONLY the owner of an agent can issue its token: Miguel cannot activate Samuel's agents.
-- Time, never invented:
--   * declared hours (dev_bridge_time_entries) are SELF_REPORTED by the owner who worked them; corrections append a
--     new row that supersedes the old one with a reason (the original stays);
--   * session time is measured from SERVER timestamps (recorded_at) of authenticated agent events, never from
--     client-supplied clocks; commits are never converted into hours.
-- Verification, never self-granted:
--   * a commitment becomes `verified` only when an owner accepts it with evidence; when both owners are registered the
--     acceptor must be the OTHER owner. Agents can never verify anything.
-- Privacy: no keystrokes, screenshots, chat transcripts or personal data. Owners can read everything (symmetric).

begin;

create table public.dev_bridge_people (
  owner text primary key check (owner in ('miguel', 'samuel')),
  user_id uuid not null unique references auth.users(id),
  claimed_at timestamptz not null default now()
);

create table public.dev_bridge_agents (
  id text primary key check (id ~ '^(miguel|samuel)\.(claude|codex)$'),
  owner text not null check (owner in ('miguel', 'samuel')),
  tool text not null check (tool in ('claude_code', 'codex')),
  token_sha256 text unique check (token_sha256 is null or token_sha256 ~ '^[0-9a-f]{64}$'),
  token_prefix text check (token_prefix is null or token_prefix ~ '^avd_[A-Za-z0-9_-]{4}$'),
  token_issued_at timestamptz,
  token_issued_by uuid references auth.users(id),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  check (split_part(id, '.', 1) = owner),
  check ((split_part(id, '.', 2) = 'claude') = (tool = 'claude_code'))
);
insert into public.dev_bridge_agents (id, owner, tool) values
  ('miguel.claude', 'miguel', 'claude_code'), ('miguel.codex', 'miguel', 'codex'),
  ('samuel.claude', 'samuel', 'claude_code'), ('samuel.codex', 'samuel', 'codex');

create table public.dev_bridge_sessions (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.dev_bridge_agents(id),
  owner text not null check (owner in ('miguel', 'samuel')),
  tool text not null check (tool in ('claude_code', 'codex')),
  client_key text not null check (length(client_key) between 8 and 100),
  project text not null default 'avalon-code' check (length(project) between 1 and 80),
  department text not null default '' check (length(department) <= 60),
  issue_number integer check (issue_number is null or issue_number > 0),
  title text not null check (length(btrim(title)) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'interrupted', 'blocked')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  summary text not null default '' check (length(summary) <= 4000),
  next_action text not null default '' check (length(next_action) <= 1000),
  version integer not null default 1,
  unique (agent_id, client_key)
);
create index dev_bridge_sessions_owner on public.dev_bridge_sessions (owner, started_at desc);

create table public.dev_bridge_events (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique check (length(idempotency_key) between 8 and 200),
  source text not null check (source in ('agent', 'github', 'chatgpt_import', 'manual', 'system')),
  agent_id text references public.dev_bridge_agents(id),
  owner text check (owner is null or owner in ('miguel', 'samuel')),
  tool text check (tool is null or tool in ('claude_code', 'codex', 'chatgpt', 'github', 'manual')),
  session_id uuid references public.dev_bridge_sessions(id),
  kind text not null check (kind in (
    'session_start', 'session_pause', 'session_resume', 'session_checkpoint', 'session_stop', 'session_interrupted',
    'session_blocked', 'session_completed', 'commit', 'pull_request', 'review', 'issue', 'test', 'build', 'ci', 'handoff',
    'document', 'fix', 'blocker', 'release', 'revert', 'decision', 'note')),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  evidence text not null check (evidence in ('VERIFIED', 'SELF_REPORTED', 'IMPORTED', 'INFERRED', 'UNKNOWN')),
  title text not null check (length(btrim(title)) between 1 and 300),
  detail text not null default '' check (length(detail) <= 4000),
  evidence_url text check (evidence_url is null or (length(evidence_url) <= 500 and evidence_url ~ '^https://[^[:space:]<>"]+$')),
  ref text not null default '' check (length(ref) <= 200),
  department text not null default '' check (length(department) <= 60),
  issue_number integer check (issue_number is null or issue_number > 0),
  recorded_by uuid references auth.users(id)
);
create index dev_bridge_events_time on public.dev_bridge_events (occurred_at desc);
create index dev_bridge_events_owner on public.dev_bridge_events (owner, occurred_at desc);
create index dev_bridge_events_session on public.dev_bridge_events (session_id, recorded_at);

create table public.dev_bridge_time_entries (
  id uuid primary key default gen_random_uuid(),
  owner text not null check (owner in ('miguel', 'samuel')),
  work_date date not null,
  minutes integer not null check (minutes between 1 and 1440),
  description text not null check (length(btrim(description)) between 3 and 1000),
  issue_number integer check (issue_number is null or issue_number > 0),
  evidence_url text check (evidence_url is null or (length(evidence_url) <= 500 and evidence_url ~ '^https://[^[:space:]<>"]+$')),
  supersedes uuid unique references public.dev_bridge_time_entries(id),
  correction_reason text not null default '' check (length(correction_reason) <= 500),
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (supersedes is null or length(btrim(correction_reason)) >= 5)
);
create index dev_bridge_time_owner on public.dev_bridge_time_entries (owner, work_date desc);

create table public.dev_bridge_commitments (
  id uuid primary key default gen_random_uuid(),
  owner text not null check (owner in ('miguel', 'samuel')),
  title text not null check (length(btrim(title)) between 3 and 200),
  acceptance_criteria text not null check (length(btrim(acceptance_criteria)) between 5 and 2000),
  agreed_on date not null,
  target_date date not null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'blocked', 'ready_for_review', 'completed', 'verified', 'cancelled')),
  evidence_url text check (evidence_url is null or (length(evidence_url) <= 500 and evidence_url ~ '^https://[^[:space:]<>"]+$')),
  dependencies text not null default '' check (length(dependencies) <= 1000),
  issue_number integer check (issue_number is null or issue_number > 0),
  delivered_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  version integer not null default 1,
  check (status <> 'verified' or (accepted_at is not null and accepted_by is not null and evidence_url is not null))
);
create table public.dev_bridge_commitment_events (
  id uuid primary key default gen_random_uuid(),
  commitment_id uuid not null references public.dev_bridge_commitments(id),
  from_status text not null,
  to_status text not null,
  note text not null default '' check (length(note) <= 1000),
  target_date_from date,
  target_date_to date,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index dev_bridge_commitment_events_c on public.dev_bridge_commitment_events (commitment_id, created_at);
create index dev_bridge_commitment_events_actor on public.dev_bridge_commitment_events (actor_id);
create index dev_bridge_time_recorded_by on public.dev_bridge_time_entries (recorded_by);
create index dev_bridge_commitments_created_by on public.dev_bridge_commitments (created_by);
create index dev_bridge_commitments_accepted_by on public.dev_bridge_commitments (accepted_by);
create index dev_bridge_events_recorded_by on public.dev_bridge_events (recorded_by);
create index dev_bridge_events_agent on public.dev_bridge_events (agent_id);
create index dev_bridge_agents_issued_by on public.dev_bridge_agents (token_issued_by);

-- Owners read everything (transparent and symmetric). Nobody writes tables directly: only the reviewed RPCs below.
alter table public.dev_bridge_people enable row level security;
alter table public.dev_bridge_agents enable row level security;
alter table public.dev_bridge_sessions enable row level security;
alter table public.dev_bridge_events enable row level security;
alter table public.dev_bridge_time_entries enable row level security;
alter table public.dev_bridge_commitments enable row level security;
alter table public.dev_bridge_commitment_events enable row level security;
revoke all on public.dev_bridge_people from anon, authenticated, public;
revoke all on public.dev_bridge_agents from anon, authenticated, public;
revoke all on public.dev_bridge_sessions from anon, authenticated, public;
revoke all on public.dev_bridge_events from anon, authenticated, public;
revoke all on public.dev_bridge_time_entries from anon, authenticated, public;
revoke all on public.dev_bridge_commitments from anon, authenticated, public;
revoke all on public.dev_bridge_commitment_events from anon, authenticated, public;
grant select on public.dev_bridge_people, public.dev_bridge_sessions, public.dev_bridge_events, public.dev_bridge_time_entries,
  public.dev_bridge_commitments, public.dev_bridge_commitment_events to authenticated;
-- Token hashes are never readable from the client: expose agent status columns only.
grant select (id, owner, tool, token_prefix, token_issued_at, expires_at, revoked_at, last_used_at) on public.dev_bridge_agents to authenticated;
create policy dev_bridge_read on public.dev_bridge_people for select to authenticated using ((select crm_private.is_owner()));
create policy dev_bridge_read on public.dev_bridge_agents for select to authenticated using ((select crm_private.is_owner()));
create policy dev_bridge_read on public.dev_bridge_sessions for select to authenticated using ((select crm_private.is_owner()));
create policy dev_bridge_read on public.dev_bridge_events for select to authenticated using ((select crm_private.is_owner()));
create policy dev_bridge_read on public.dev_bridge_time_entries for select to authenticated using ((select crm_private.is_owner()));
create policy dev_bridge_read on public.dev_bridge_commitments for select to authenticated using ((select crm_private.is_owner()));
create policy dev_bridge_read on public.dev_bridge_commitment_events for select to authenticated using ((select crm_private.is_owner()));

-- The caller's owner label, or an error. Being an owner in agency_memberships is required AND the label must be claimed.
create function crm_private.dev_bridge_me() returns text
language plpgsql stable security definer set search_path = '' as $$
declare v text;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'dev_bridge_forbidden' using errcode = '42501'; end if;
  select owner into v from public.dev_bridge_people where user_id = auth.uid();
  if v is null then raise exception 'dev_bridge_identity_unclaimed' using errcode = '42501'; end if;
  return v;
end $$;
revoke all on function crm_private.dev_bridge_me() from public, anon, authenticated;

-- Each owner claims their own label exactly once. A claimed label can never be taken by the other account.
create function public.dev_bridge_claim_owner(p_owner text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'dev_bridge_forbidden' using errcode = '42501'; end if;
  if p_owner not in ('miguel', 'samuel') then raise exception 'dev_bridge_invalid' using errcode = '22023'; end if;
  if exists (select 1 from public.dev_bridge_people where user_id = auth.uid()) then
    if exists (select 1 from public.dev_bridge_people where user_id = auth.uid() and owner = p_owner) then return p_owner; end if;
    raise exception 'dev_bridge_identity_conflict' using errcode = '23505';
  end if;
  if exists (select 1 from public.dev_bridge_people where owner = p_owner) then
    raise exception 'dev_bridge_identity_conflict' using errcode = '23505';
  end if;
  insert into public.dev_bridge_people (owner, user_id) values (p_owner, auth.uid());
  insert into public.dev_bridge_events (idempotency_key, source, owner, tool, kind, occurred_at, evidence, title, recorded_by)
    values ('identity:' || p_owner, 'system', p_owner, 'manual', 'note', now(), 'VERIFIED', 'Identidad Dev Bridge registrada', auth.uid());
  return p_owner;
end $$;

-- Only the owner of an agent can issue or revoke its token (the client generates it; only the hash arrives here).
create function public.dev_bridge_agent_token(p_agent text, p_token_sha256 text, p_prefix text, p_days integer) returns void
language plpgsql security definer set search_path = '' as $$
declare me text := crm_private.dev_bridge_me(); a public.dev_bridge_agents;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'dev_bridge_forbidden' using errcode = '42501'; end if;
  select * into a from public.dev_bridge_agents where id = p_agent for update;
  if not found then raise exception 'dev_bridge_invalid' using errcode = '22023'; end if;
  if a.owner <> me then raise exception 'dev_bridge_not_your_agent' using errcode = '42501'; end if;
  if p_token_sha256 is null then
    update public.dev_bridge_agents set revoked_at = now() where id = p_agent;
    insert into public.dev_bridge_events (idempotency_key, source, agent_id, owner, tool, kind, occurred_at, evidence, title, recorded_by)
      values ('agent-revoke:' || p_agent || ':' || extract(epoch from clock_timestamp())::text, 'system', p_agent, me, a.tool, 'note', now(), 'VERIFIED', 'Token de agente revocado', auth.uid());
    return;
  end if;
  if p_token_sha256 !~ '^[0-9a-f]{64}$' or p_prefix !~ '^avd_[A-Za-z0-9_-]{4}$' or p_days not between 1 and 90 then
    raise exception 'dev_bridge_invalid' using errcode = '22023';
  end if;
  update public.dev_bridge_agents set token_sha256 = p_token_sha256, token_prefix = p_prefix, token_issued_at = now(),
    token_issued_by = auth.uid(), expires_at = now() + make_interval(days => p_days), revoked_at = null, last_used_at = null
    where id = p_agent;
  insert into public.dev_bridge_events (idempotency_key, source, agent_id, owner, tool, kind, occurred_at, evidence, title, recorded_by)
    values ('agent-token:' || p_agent || ':' || p_prefix || ':' || extract(epoch from clock_timestamp())::text, 'system', p_agent, me, a.tool, 'note', now(), 'VERIFIED', 'Token de agente emitido', auth.uid());
end $$;

-- Agent ingestion (token-gated, called by /api/dev-bridge/v1/events with the publishable key; no privileged key).
-- Session time uses SERVER clock (recorded_at); the client's occurred_at is kept only as a reported value.
create function public.dev_bridge_agent_event(p_token_sha256 text, p_event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.dev_bridge_agents; s public.dev_bridge_sessions; v_kind text := coalesce(p_event ->> 'kind', '');
  v_key text := btrim(coalesce(p_event ->> 'idempotency_key', '')); v_title text := btrim(coalesce(p_event ->> 'title', ''));
  v_session uuid; v_existing public.dev_bridge_events; v_next text; v_count integer; v_url text := nullif(btrim(coalesce(p_event ->> 'evidence_url', '')), '');
  v_occurred timestamptz;
begin
  select * into a from public.dev_bridge_agents where token_sha256 = p_token_sha256 for update;
  if a.id is null or a.revoked_at is not null or a.expires_at is null or a.expires_at < now() then
    raise exception 'invalid_token' using errcode = '28000';
  end if;
  if jsonb_typeof(p_event) <> 'object' or pg_column_size(p_event) > 16384 or length(v_key) not between 8 and 160 then
    raise exception 'invalid_event' using errcode = '22023';
  end if;
  v_key := a.id || ':' || v_key;
  select * into v_existing from public.dev_bridge_events where idempotency_key = v_key;
  if v_existing.id is not null then
    return jsonb_build_object('event_id', v_existing.id, 'session_id', v_existing.session_id, 'replayed', true);
  end if;
  select count(*) into v_count from public.dev_bridge_events where agent_id = a.id and recorded_at > now() - interval '1 hour';
  if v_count >= 600 then raise exception 'rate_limited' using errcode = '54000'; end if;
  update public.dev_bridge_agents set last_used_at = now() where id = a.id;
  begin v_occurred := coalesce((p_event ->> 'occurred_at')::timestamptz, now()); exception when others then v_occurred := now(); end;
  if v_occurred > now() + interval '5 minutes' or v_occurred < now() - interval '30 days' then v_occurred := now(); end if;

  if v_kind = 'session_start' then
    if length(v_title) not between 1 and 200 then raise exception 'invalid_event' using errcode = '22023'; end if;
    insert into public.dev_bridge_sessions (agent_id, owner, tool, client_key, project, department, issue_number, title)
      values (a.id, a.owner, a.tool, v_key, left(coalesce(nullif(p_event ->> 'project', ''), 'avalon-code'), 80),
        left(coalesce(p_event ->> 'department', ''), 60), nullif((p_event ->> 'issue_number'), '')::integer, left(v_title, 200))
      returning id into v_session;
  elsif v_kind like 'session_%' then
    begin v_session := (p_event ->> 'session_id')::uuid; exception when others then raise exception 'invalid_event' using errcode = '22023'; end;
    select * into s from public.dev_bridge_sessions where id = v_session for update;
    if s.id is null or s.agent_id <> a.id then raise exception 'session_not_found' using errcode = 'P0002'; end if;
    v_next := case v_kind
      when 'session_pause' then case when s.status = 'active' then 'paused' end
      when 'session_resume' then case when s.status in ('paused', 'blocked', 'interrupted') then 'active' end
      when 'session_checkpoint' then case when s.status = 'active' then 'active' end
      when 'session_blocked' then case when s.status in ('active', 'paused') then 'blocked' end
      when 'session_interrupted' then case when s.status in ('active', 'paused') then 'interrupted' end
      when 'session_stop' then case when s.status in ('active', 'paused', 'blocked', 'interrupted') then 'completed' end
      when 'session_completed' then case when s.status in ('active', 'paused', 'blocked', 'interrupted') then 'completed' end
    end;
    if v_next is null then raise exception 'invalid_session_transition' using errcode = '23514'; end if;
    update public.dev_bridge_sessions set status = v_next, version = version + 1,
      ended_at = case when v_next = 'completed' then now() else ended_at end,
      summary = case when v_next = 'completed' then left(coalesce(p_event ->> 'summary', summary), 4000) else summary end,
      next_action = left(coalesce(p_event ->> 'next_action', next_action), 1000)
      where id = s.id;
    if v_title = '' then v_title := v_kind; end if;
  elsif v_kind in ('commit', 'pull_request', 'review', 'issue', 'test', 'build', 'ci', 'handoff', 'document', 'fix', 'blocker', 'release', 'revert', 'decision', 'note') then
    if length(v_title) not between 1 and 300 then raise exception 'invalid_event' using errcode = '22023'; end if;
    if p_event ? 'session_id' then
      begin v_session := (p_event ->> 'session_id')::uuid; exception when others then raise exception 'invalid_event' using errcode = '22023'; end;
      if not exists (select 1 from public.dev_bridge_sessions where id = v_session and agent_id = a.id) then
        raise exception 'session_not_found' using errcode = 'P0002';
      end if;
    end if;
  else
    raise exception 'invalid_event' using errcode = '22023';
  end if;
  if v_url is not null and (length(v_url) > 500 or v_url !~ '^https://[^[:space:]<>"]+$') then raise exception 'invalid_event' using errcode = '22023'; end if;
  insert into public.dev_bridge_events (idempotency_key, source, agent_id, owner, tool, session_id, kind, occurred_at, evidence,
      title, detail, evidence_url, ref, department, issue_number)
    values (v_key, 'agent', a.id, a.owner, a.tool, v_session, v_kind,
      -- Session lifecycle: identity and server time are verified. Work claims (tests passed, fixed…) are self-reported.
      case when v_kind like 'session_%' then now() else v_occurred end,
      case when v_kind like 'session_%' then 'VERIFIED' else 'SELF_REPORTED' end,
      left(v_title, 300), left(coalesce(p_event ->> 'detail', ''), 4000), v_url, left(coalesce(p_event ->> 'ref', ''), 200),
      left(coalesce(p_event ->> 'department', ''), 60), nullif((p_event ->> 'issue_number'), '')::integer)
    returning id into v_existing.id;
  return jsonb_build_object('event_id', v_existing.id, 'session_id', v_session, 'replayed', false);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'invalid_event' using errcode = '22023';
end $$;

-- Owner-recorded entries: declared hours, ChatGPT/manual handoffs, GitHub history import.
create function public.dev_bridge_declare_time(p_work_date date, p_minutes integer, p_description text, p_issue integer,
  p_evidence_url text, p_supersedes uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me text := crm_private.dev_bridge_me(); old public.dev_bridge_time_entries; v uuid;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'dev_bridge_forbidden' using errcode = '42501'; end if;
  if p_work_date is null or p_work_date > current_date + 1 or p_work_date < current_date - 730 then raise exception 'dev_bridge_invalid' using errcode = '22023'; end if;
  if p_supersedes is not null then
    select * into old from public.dev_bridge_time_entries where id = p_supersedes for update;
    if old.id is null or old.owner <> me then raise exception 'dev_bridge_not_your_entry' using errcode = '42501'; end if;
    if exists (select 1 from public.dev_bridge_time_entries where supersedes = p_supersedes) then raise exception 'dev_bridge_already_corrected' using errcode = '23505'; end if;
  end if;
  insert into public.dev_bridge_time_entries (owner, work_date, minutes, description, issue_number, evidence_url, supersedes, correction_reason, recorded_by)
    values (me, p_work_date, p_minutes, btrim(p_description), p_issue, nullif(btrim(coalesce(p_evidence_url, '')), ''), p_supersedes, coalesce(btrim(p_reason), ''), auth.uid())
    returning id into v;
  return v;
end $$;

create function public.dev_bridge_record(p_entry jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me text := crm_private.dev_bridge_me(); v uuid; v_source text := coalesce(p_entry ->> 'source', 'manual');
  v_url text := nullif(btrim(coalesce(p_entry ->> 'evidence_url', '')), ''); v_key text := btrim(coalesce(p_entry ->> 'idempotency_key', ''));
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'dev_bridge_forbidden' using errcode = '42501'; end if;
  if v_source not in ('chatgpt_import', 'manual') or length(v_key) not between 8 and 160 then raise exception 'dev_bridge_invalid' using errcode = '22023'; end if;
  select id into v from public.dev_bridge_events where idempotency_key = me || ':' || v_key;
  if v is not null then return v; end if;
  insert into public.dev_bridge_events (idempotency_key, source, owner, tool, kind, occurred_at, evidence, title, detail, evidence_url,
      department, issue_number, recorded_by)
    values (me || ':' || v_key, v_source, me, case when v_source = 'chatgpt_import' then 'chatgpt' else 'manual' end,
      coalesce(nullif(p_entry ->> 'kind', ''), 'handoff'), coalesce((p_entry ->> 'occurred_at')::timestamptz, now()),
      -- An owner can only record their OWN work. With an https evidence link it is IMPORTED; without it, SELF_REPORTED.
      case when v_url is null then 'SELF_REPORTED' else 'IMPORTED' end,
      btrim(p_entry ->> 'title'), left(coalesce(p_entry ->> 'detail', ''), 4000), v_url,
      left(coalesce(p_entry ->> 'department', ''), 60), nullif(p_entry ->> 'issue_number', '')::integer, auth.uid())
    returning id into v;
  return v;
exception when invalid_text_representation or check_violation or not_null_violation then
  raise exception 'dev_bridge_invalid' using errcode = '22023';
end $$;

-- GitHub facts read by the server with its read-only token. The FACT (commit/PR exists, date, URL) is VERIFIED;
-- attribution is only an inference from an owner:* Issue label, otherwise UNKNOWN. Original dates are preserved.
create function public.dev_bridge_import_github(p_events jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare me text := crm_private.dev_bridge_me(); e jsonb; n integer := 0; v_owner text;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'dev_bridge_forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 3000 then raise exception 'dev_bridge_invalid' using errcode = '22023'; end if;
  for e in select * from jsonb_array_elements(p_events) loop
    v_owner := nullif(e ->> 'owner', '');
    if v_owner is not null and v_owner not in ('miguel', 'samuel') then v_owner := null; end if;
    insert into public.dev_bridge_events (idempotency_key, source, owner, tool, kind, occurred_at, evidence, title, evidence_url, ref, issue_number, recorded_by)
      values ('github:' || (e ->> 'key'), 'github', v_owner, 'github', e ->> 'kind', (e ->> 'occurred_at')::timestamptz,
        case when v_owner is null then 'UNKNOWN' else 'INFERRED' end, left(e ->> 'title', 300), e ->> 'url', left(coalesce(e ->> 'ref', ''), 200),
        nullif(e ->> 'issue_number', '')::integer, auth.uid())
      on conflict (idempotency_key) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
exception when invalid_text_representation or check_violation or not_null_violation then
  raise exception 'dev_bridge_invalid' using errcode = '22023';
end $$;

create function public.dev_bridge_commitment_create(p_owner text, p_title text, p_criteria text, p_agreed date, p_target date,
  p_dependencies text, p_issue integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me text := crm_private.dev_bridge_me(); v uuid;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'dev_bridge_forbidden' using errcode = '42501'; end if;
  if p_owner not in ('miguel', 'samuel') or p_target < p_agreed then raise exception 'dev_bridge_invalid' using errcode = '22023'; end if;
  insert into public.dev_bridge_commitments (owner, title, acceptance_criteria, agreed_on, target_date, dependencies, issue_number, created_by)
    values (p_owner, btrim(p_title), btrim(p_criteria), p_agreed, p_target, coalesce(p_dependencies, ''), p_issue, auth.uid()) returning id into v;
  insert into public.dev_bridge_commitment_events (commitment_id, from_status, to_status, note, target_date_to, actor_id)
    values (v, 'none', 'pending', 'Compromiso registrado por ' || me, p_target, auth.uid());
  return v;
exception when check_violation or not_null_violation then raise exception 'dev_bridge_invalid' using errcode = '22023';
end $$;

create function public.dev_bridge_commitment_transition(p_id uuid, p_to text, p_note text, p_evidence_url text, p_new_target date,
  p_expected_version integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare me text := crm_private.dev_bridge_me(); c public.dev_bridge_commitments; other_claimed boolean;
  v_url text := nullif(btrim(coalesce(p_evidence_url, '')), ''); ok boolean;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'dev_bridge_forbidden' using errcode = '42501'; end if;
  select * into c from public.dev_bridge_commitments where id = p_id for update;
  if c.id is null then raise exception 'dev_bridge_not_found' using errcode = 'P0002'; end if;
  if p_expected_version is distinct from c.version then raise exception 'dev_bridge_version_conflict' using errcode = '40001'; end if;
  ok := case p_to
    when 'in_progress' then c.status in ('pending', 'blocked')
    when 'blocked' then c.status in ('pending', 'in_progress', 'ready_for_review')
    when 'ready_for_review' then c.status in ('in_progress')
    when 'completed' then c.status in ('in_progress', 'ready_for_review')
    when 'verified' then c.status = 'completed'
    when 'in_progress_reopen' then c.status in ('completed', 'ready_for_review')
    when 'cancelled' then c.status not in ('verified', 'cancelled')
    when 'reschedule' then c.status not in ('verified', 'cancelled', 'completed')
    else false end;
  if not ok then raise exception 'dev_bridge_invalid_transition' using errcode = '23514'; end if;
  if p_to in ('blocked', 'cancelled', 'reschedule', 'in_progress_reopen') and length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'dev_bridge_reason_required' using errcode = '22023';
  end if;
  if p_to in ('ready_for_review', 'completed') and c.owner <> me then raise exception 'dev_bridge_not_your_commitment' using errcode = '42501'; end if;
  if p_to = 'verified' then
    if v_url is null and c.evidence_url is null then raise exception 'dev_bridge_evidence_required' using errcode = '22023'; end if;
    -- Independence: when both owners are registered, the responsible owner cannot verify their own commitment.
    select exists (select 1 from public.dev_bridge_people where owner <> c.owner) into other_claimed;
    if other_claimed and me = c.owner then raise exception 'dev_bridge_needs_other_owner' using errcode = '42501'; end if;
  end if;
  if p_to = 'reschedule' then
    if p_new_target is null or p_new_target < c.agreed_on then raise exception 'dev_bridge_invalid' using errcode = '22023'; end if;
    update public.dev_bridge_commitments set target_date = p_new_target, version = version + 1 where id = c.id;
    insert into public.dev_bridge_commitment_events (commitment_id, from_status, to_status, note, target_date_from, target_date_to, actor_id)
      values (c.id, c.status, c.status, btrim(p_note), c.target_date, p_new_target, auth.uid());
    return c.version + 1;
  end if;
  update public.dev_bridge_commitments set
    status = case when p_to = 'in_progress_reopen' then 'in_progress' else p_to end,
    evidence_url = coalesce(v_url, evidence_url),
    delivered_at = case when p_to = 'completed' then now() else delivered_at end,
    accepted_at = case when p_to = 'verified' then now() else accepted_at end,
    accepted_by = case when p_to = 'verified' then auth.uid() else accepted_by end,
    version = version + 1
    where id = c.id;
  insert into public.dev_bridge_commitment_events (commitment_id, from_status, to_status, note, actor_id)
    values (c.id, c.status, case when p_to = 'in_progress_reopen' then 'in_progress' else p_to end, coalesce(btrim(p_note), ''), auth.uid());
  return c.version + 1;
end $$;

revoke all on function public.dev_bridge_claim_owner(text), public.dev_bridge_agent_token(text, text, text, integer),
  public.dev_bridge_agent_event(text, jsonb), public.dev_bridge_declare_time(date, integer, text, integer, text, uuid, text),
  public.dev_bridge_record(jsonb), public.dev_bridge_import_github(jsonb),
  public.dev_bridge_commitment_create(text, text, text, date, date, text, integer),
  public.dev_bridge_commitment_transition(uuid, text, text, text, date, integer) from public;
grant execute on function public.dev_bridge_claim_owner(text), public.dev_bridge_agent_token(text, text, text, integer),
  public.dev_bridge_declare_time(date, integer, text, integer, text, uuid, text), public.dev_bridge_record(jsonb),
  public.dev_bridge_import_github(jsonb), public.dev_bridge_commitment_create(text, text, text, date, date, text, integer),
  public.dev_bridge_commitment_transition(uuid, text, text, text, date, integer) to authenticated;
grant execute on function public.dev_bridge_agent_event(text, jsonb) to anon, authenticated;

commit;
