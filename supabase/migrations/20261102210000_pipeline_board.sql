-- Pipeline board: per-lead stage history and attachments in the lead/client timeline.
-- PREPARED ONLY — isolated database first; production needs owner approval.
begin;

-- 1. Stage history, written by trigger (clients cannot forge or edit it) ----------
create table public.crm_lead_stage_history (
  id bigint generated always as identity primary key,
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  lead_id uuid not null references public.crm_leads (id),
  from_stage text references public.crm_stages (id),
  to_stage text not null references public.crm_stages (id),
  actor_id uuid,
  seconds_in_previous integer check (seconds_in_previous >= 0),
  changed_at timestamptz not null default clock_timestamp()
);
create index crm_lead_stage_history_lead on public.crm_lead_stage_history (lead_id, changed_at desc);

create function crm_private.lead_stage_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_lead_stage_history (lead_id, from_stage, to_stage, actor_id) values (new.id, null, new.stage_id, auth.uid());
  elsif new.stage_id is distinct from old.stage_id then
    insert into public.crm_lead_stage_history (lead_id, from_stage, to_stage, actor_id, seconds_in_previous)
    values (new.id, old.stage_id, new.stage_id, auth.uid(), greatest(0, extract(epoch from (now() - old.stage_changed_at))::integer));
  end if;
  return null;
end $$;
revoke all on function crm_private.lead_stage_history() from public;
create trigger crm_leads_stage_history after insert or update of stage_id on public.crm_leads
  for each row execute function crm_private.lead_stage_history();
-- Existing leads get their current stage as the first history entry.
insert into public.crm_lead_stage_history (lead_id, from_stage, to_stage, actor_id, changed_at)
  select id, null, stage_id, created_by, coalesce(stage_changed_at, created_at) from public.crm_leads;

-- 2. Attachments on a lead or a client (small documents; always served as download) --
create table public.crm_attachments (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  lead_id uuid references public.crm_leads (id),
  client_id uuid references public.crm_clients (id),
  filename text not null check (length(btrim(filename)) between 1 and 200 and filename !~ '[/\\]'),
  mime text not null check (mime in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  content bytea not null check (octet_length(content) between 1 and 5242880),
  note text not null default '' check (length(note) <= 500),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1,
  check (lead_id is not null or client_id is not null),
  check (octet_length(content) = size_bytes)
);
create index crm_attachments_lead on public.crm_attachments (lead_id, created_at desc) where lead_id is not null;
create index crm_attachments_client on public.crm_attachments (client_id, created_at desc) where client_id is not null;

create function crm_private.attachment_quota() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.lead_id is not null and (select coalesce(sum(size_bytes), 0) from public.crm_attachments where lead_id = new.lead_id) + new.size_bytes > 26214400 then
    raise exception 'attachment_quota' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function crm_private.attachment_quota() from public;
create trigger crm_attachments_quota before insert on public.crm_attachments for each row execute function crm_private.attachment_quota();

-- 3. RLS and grants (history: read-only; attachments: read + insert, immutable) ----
do $$ declare t text; begin
  foreach t in array array['crm_lead_stage_history', 'crm_attachments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy crm_read on public.%I for select to authenticated using ((select crm_private.is_owner()) and agency_key = ''avalon'')', t);
  end loop;
end $$;
grant insert on public.crm_attachments to authenticated;
create policy crm_insert on public.crm_attachments for insert to authenticated with check ((select crm_private.is_owner()) and agency_key = 'avalon');
create trigger crm_stamp before insert on public.crm_attachments for each row execute function crm_private.stamp();

commit;
