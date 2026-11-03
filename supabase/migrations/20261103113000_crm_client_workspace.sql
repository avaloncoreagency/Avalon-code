-- Internal client financial workspace and editable, versioned history.
-- Prepared only: do not apply to production without isolated-database verification and approval.
begin;

create table public.crm_client_workspace (
  client_id uuid primary key references public.crm_clients(id),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  package_name text not null default '' check (length(package_name) <= 160),
  development_stage text not null default '' check (length(development_stage) <= 100),
  next_step text not null default '' check (length(next_step) <= 2000),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);

create table public.crm_client_workspace_revisions (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.crm_clients(id),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  version integer not null,
  before_value jsonb,
  after_value jsonb not null,
  edited_by uuid not null references auth.users(id),
  edited_at timestamptz not null default clock_timestamp(),
  unique (client_id, version)
);
create index crm_client_workspace_revisions_client on public.crm_client_workspace_revisions(client_id, id desc);

create table public.crm_client_journal (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  client_id uuid not null references public.crm_clients(id),
  kind text not null default 'note' check (kind in ('note','meeting','milestone','decision')),
  title text not null check (length(btrim(title)) between 1 and 160),
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);
create index crm_client_journal_client on public.crm_client_journal(client_id, created_at desc);

create table public.crm_client_journal_revisions (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.crm_client_journal(id),
  client_id uuid not null references public.crm_clients(id),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  version integer not null,
  before_value jsonb,
  after_value jsonb not null,
  edited_by uuid not null references auth.users(id),
  edited_at timestamptz not null default clock_timestamp(),
  unique (entry_id, version)
);
create index crm_client_journal_revisions_client on public.crm_client_journal_revisions(client_id, id desc);

-- Signed ledger: negative entries are explicit adjustments. Entries never change or disappear via app roles.
create table public.crm_client_costs (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  client_id uuid not null references public.crm_clients(id),
  amount numeric(15,2) not null check (amount <> 0 and amount between -1000000000000 and 1000000000000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  category text not null check (length(btrim(category)) between 1 and 100),
  memo text not null check (length(btrim(memo)) between 1 and 1000),
  incurred_on date not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default clock_timestamp()
);
create index crm_client_costs_client on public.crm_client_costs(client_id, incurred_on desc);

create function crm_private.client_workspace_stamp() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.client_id := old.client_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.version := old.version + 1;
  else
    new.version := 1;
    new.created_by := (select auth.uid());
    new.created_at := now();
  end if;
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end $$;

create function crm_private.client_workspace_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.crm_client_workspace_revisions(client_id, version, before_value, after_value, edited_by)
  values (
    new.client_id, new.version,
    case when tg_op = 'INSERT' then null else jsonb_build_object(
      'package_name', old.package_name, 'development_stage', old.development_stage, 'next_step', old.next_step) end,
    jsonb_build_object('package_name', new.package_name, 'development_stage', new.development_stage, 'next_step', new.next_step),
    new.updated_by
  );
  return null;
end $$;

create function crm_private.client_journal_stamp() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.client_id := old.client_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.version := old.version + 1;
  else
    new.version := 1;
    new.created_by := (select auth.uid());
    new.created_at := now();
  end if;
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end $$;

create function crm_private.client_journal_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.crm_client_journal_revisions(entry_id, client_id, version, before_value, after_value, edited_by)
  values (
    new.id, new.client_id, new.version,
    case when tg_op = 'INSERT' then null else jsonb_build_object('kind', old.kind, 'title', old.title, 'body', old.body) end,
    jsonb_build_object('kind', new.kind, 'title', new.title, 'body', new.body),
    new.updated_by
  );
  return null;
end $$;

revoke all on function crm_private.client_workspace_stamp(), crm_private.client_workspace_audit(),
  crm_private.client_journal_stamp(), crm_private.client_journal_audit() from public;
create trigger crm_client_workspace_stamp before insert or update on public.crm_client_workspace
for each row execute function crm_private.client_workspace_stamp();
create trigger crm_client_workspace_audit after insert or update on public.crm_client_workspace
for each row execute function crm_private.client_workspace_audit();
create trigger crm_client_journal_stamp before insert or update on public.crm_client_journal
for each row execute function crm_private.client_journal_stamp();
create trigger crm_client_journal_audit after insert or update on public.crm_client_journal
for each row execute function crm_private.client_journal_audit();

alter table public.crm_client_workspace enable row level security;
alter table public.crm_client_workspace_revisions enable row level security;
alter table public.crm_client_journal enable row level security;
alter table public.crm_client_journal_revisions enable row level security;
alter table public.crm_client_costs enable row level security;
revoke all on public.crm_client_workspace, public.crm_client_workspace_revisions,
  public.crm_client_journal, public.crm_client_journal_revisions, public.crm_client_costs from anon, authenticated;

grant select on public.crm_client_workspace, public.crm_client_workspace_revisions,
  public.crm_client_journal, public.crm_client_journal_revisions, public.crm_client_costs to authenticated;
grant insert (client_id, package_name, development_stage, next_step) on public.crm_client_workspace to authenticated;
grant update (package_name, development_stage, next_step) on public.crm_client_workspace to authenticated;
grant insert (client_id, kind, title, body) on public.crm_client_journal to authenticated;
grant update (kind, title, body) on public.crm_client_journal to authenticated;
grant insert (client_id, amount, currency, category, memo, incurred_on) on public.crm_client_costs to authenticated;

create policy crm_client_workspace_read on public.crm_client_workspace for select to authenticated
using ((select crm_private.is_owner()) and agency_key = 'avalon');
create policy crm_client_workspace_insert on public.crm_client_workspace for insert to authenticated
with check ((select crm_private.is_owner()) and agency_key = 'avalon');
create policy crm_client_workspace_update on public.crm_client_workspace for update to authenticated
using ((select crm_private.is_owner()) and agency_key = 'avalon')
with check ((select crm_private.is_owner()) and agency_key = 'avalon');
create policy crm_client_workspace_revisions_read on public.crm_client_workspace_revisions for select to authenticated
using ((select crm_private.is_owner()) and agency_key = 'avalon');

create policy crm_client_journal_read on public.crm_client_journal for select to authenticated
using ((select crm_private.is_owner()) and agency_key = 'avalon');
create policy crm_client_journal_insert on public.crm_client_journal for insert to authenticated
with check ((select crm_private.is_owner()) and agency_key = 'avalon');
create policy crm_client_journal_update on public.crm_client_journal for update to authenticated
using ((select crm_private.is_owner()) and agency_key = 'avalon')
with check ((select crm_private.is_owner()) and agency_key = 'avalon');
create policy crm_client_journal_revisions_read on public.crm_client_journal_revisions for select to authenticated
using ((select crm_private.is_owner()) and agency_key = 'avalon');

create policy crm_client_costs_read on public.crm_client_costs for select to authenticated
using ((select crm_private.is_owner()) and agency_key = 'avalon');
create policy crm_client_costs_insert on public.crm_client_costs for insert to authenticated
with check ((select crm_private.is_owner()) and agency_key = 'avalon');

-- Revision tables and cost rows have no UPDATE or DELETE grants/policies.
commit;
