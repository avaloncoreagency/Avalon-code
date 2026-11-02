-- Avalon OS module foundation: Website Designer, E-commerce Designer,
-- CRM Creator, AI Receptionist and Marketing Hub.
--
-- Reviewed and approved by the owners; applied to the Supabase testing branch
-- first (security advisors clean), then to production as version 20261102070500.
--
-- Security model (single agency, owner-only, same as current membership model):
--   * Every table has RLS; only verified owners in public.agency_memberships pass.
--   * anon has no privileges. authenticated gets only the verbs each table needs.
--   * Projects are archived, never hard-deleted by the application.
--   * Audit rows are written by a SECURITY DEFINER trigger and are read-only.
--   * Ids, authors, creation time and parent project are immutable.
--   * version increments on every update (optimistic concurrency in the app).
-- No user, membership or business data is inserted by this migration.
-- Does not touch Samuel's CRM tables (crm_*) or the crm_private schema.

begin;

create schema if not exists os_private;
revoke all on schema os_private from public;
grant usage on schema os_private to authenticated;

create or replace function os_private.is_owner() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.agency_memberships m
    where m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;
revoke all on function os_private.is_owner() from public;
grant execute on function os_private.is_owner() to authenticated;

-- Shared: protect immutable columns and bump version/updated_at.
create or replace function os_private.touch() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb := to_jsonb(old);
  col text;
begin
  foreach col in array array['id', 'created_by', 'created_at', 'project_id', 'module'] loop
    if (n ? col) and (n -> col) is distinct from (o -> col) then
      raise exception 'Column % is immutable', col using errcode = '42501';
    end if;
  end loop;
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

-- Children may only attach to a project of the expected module.
create or replace function os_private.require_module() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.os_projects p
    where p.id = new.project_id and p.module = tg_argv[0]
  ) then
    raise exception 'Project does not belong to module %', tg_argv[0] using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Append-only audit trail.
create table public.os_audit (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid not null,
  project_id uuid,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id uuid,
  summary text not null default '' check (char_length(summary) <= 160),
  created_at timestamptz not null default now()
);
create index os_audit_recent on public.os_audit (created_at desc);
create index os_audit_project on public.os_audit (project_id, created_at desc);

create or replace function os_private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.os_audit (table_name, record_id, project_id, operation, actor_id, summary)
  values (
    tg_table_name,
    (r ->> 'id')::uuid,
    case when tg_table_name = 'os_projects' then (r ->> 'id')::uuid else (r ->> 'project_id')::uuid end,
    tg_op,
    auth.uid(),
    left(coalesce(r ->> 'name', r ->> 'title', r ->> 'question', ''), 160)
  );
  return null;
end;
$$;
revoke all on function os_private.audit() from public;

-- Projects for every module. Module-specific configuration lives in settings,
-- validated by the application and bounded here.
create table public.os_projects (
  id uuid primary key default gen_random_uuid(),
  module text not null check (module in ('website', 'ecommerce', 'crm_creator', 'receptionist', 'marketing')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 262144),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);
create index os_projects_module on public.os_projects (module, status, updated_at desc);

-- Website Designer
create table public.os_website_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.os_projects (id) on delete cascade,
  slug text not null check (char_length(slug) between 1 and 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  seo_description text not null default '' check (char_length(seo_description) <= 300),
  blocks jsonb not null default '[]'::jsonb
    check (jsonb_typeof(blocks) = 'array' and jsonb_array_length(blocks) <= 60 and pg_column_size(blocks) <= 262144),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  position integer not null default 0 check (position between 0 and 10000),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (project_id, slug),
  check ((status = 'published') = (published_at is not null))
);
create index os_website_pages_project on public.os_website_pages (project_id, position);

create table public.os_website_page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.os_website_pages (id) on delete cascade,
  page_version integer not null check (page_version > 0),
  title text not null,
  blocks jsonb not null check (jsonb_typeof(blocks) = 'array'),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (page_id, page_version)
);

-- Snapshot every content change atomically with the page write.
create or replace function os_private.snapshot_page() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.blocks is distinct from old.blocks or new.title is distinct from old.title then
    insert into public.os_website_page_versions (page_id, page_version, title, blocks)
    values (new.id, new.version, new.title, new.blocks);
  end if;
  return null;
end;
$$;

-- E-commerce Designer (catalog only; no payments, no orders processing)
create table public.os_store_products (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.os_projects (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  sku text not null default '' check (char_length(sku) <= 64 and sku ~ '^[A-Za-z0-9._-]*$'),
  category text not null default '' check (char_length(category) <= 80),
  description text not null default '' check (char_length(description) <= 4000),
  price_cents bigint not null default 0 check (price_cents between 0 and 100000000000),
  inventory integer not null default 0 check (inventory between 0 and 10000000),
  image_url text not null default ''
    check (image_url = '' or (char_length(image_url) <= 1000 and image_url ~ '^https://[^[:space:]<>"]+$')),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);
create unique index os_store_products_sku on public.os_store_products (project_id, lower(sku)) where sku <> '';
create index os_store_products_project on public.os_store_products (project_id, status, name);

-- AI Receptionist knowledge (FAQ and knowledge base entries)
create table public.os_receptionist_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.os_projects (id) on delete cascade,
  kind text not null check (kind in ('faq', 'knowledge')),
  question text not null check (char_length(btrim(question)) between 1 and 300),
  answer text not null check (char_length(btrim(answer)) between 1 and 8000),
  position integer not null default 0 check (position between 0 and 10000),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);
create index os_receptionist_entries_project on public.os_receptionist_entries (project_id, kind, position);

-- Marketing Hub content plan (internal planning only; nothing is published externally)
create table public.os_marketing_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.os_projects (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  channel text not null check (channel in ('instagram', 'facebook', 'tiktok', 'linkedin', 'x', 'youtube', 'email', 'blog', 'ads', 'other')),
  status text not null default 'idea' check (status in ('idea', 'draft', 'review', 'approved', 'planned', 'published', 'cancelled')),
  planned_for date,
  body text not null default '' check (char_length(body) <= 20000),
  asset_url text not null default ''
    check (asset_url = '' or (char_length(asset_url) <= 1000 and asset_url ~ '^https://[^[:space:]<>"]+$')),
  notes text not null default '' check (char_length(notes) <= 4000),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);
create index os_marketing_items_project on public.os_marketing_items (project_id, planned_for);
create index os_marketing_items_open on public.os_marketing_items (planned_for) where status not in ('published', 'cancelled');

-- Triggers
create trigger os_projects_touch before update on public.os_projects for each row execute function os_private.touch();
create trigger os_website_pages_touch before update on public.os_website_pages for each row execute function os_private.touch();
create trigger os_store_products_touch before update on public.os_store_products for each row execute function os_private.touch();
create trigger os_receptionist_entries_touch before update on public.os_receptionist_entries for each row execute function os_private.touch();
create trigger os_marketing_items_touch before update on public.os_marketing_items for each row execute function os_private.touch();

create trigger os_website_pages_module before insert on public.os_website_pages for each row execute function os_private.require_module('website');
create trigger os_store_products_module before insert on public.os_store_products for each row execute function os_private.require_module('ecommerce');
create trigger os_receptionist_entries_module before insert on public.os_receptionist_entries for each row execute function os_private.require_module('receptionist');
create trigger os_marketing_items_module before insert on public.os_marketing_items for each row execute function os_private.require_module('marketing');

create trigger os_website_pages_snapshot after insert or update on public.os_website_pages for each row execute function os_private.snapshot_page();

create trigger os_projects_audit after insert or update or delete on public.os_projects for each row execute function os_private.audit();
create trigger os_website_pages_audit after insert or update or delete on public.os_website_pages for each row execute function os_private.audit();
create trigger os_store_products_audit after insert or update or delete on public.os_store_products for each row execute function os_private.audit();
create trigger os_receptionist_entries_audit after insert or update or delete on public.os_receptionist_entries for each row execute function os_private.audit();
create trigger os_marketing_items_audit after insert or update or delete on public.os_marketing_items for each row execute function os_private.audit();

-- Row level security
alter table public.os_projects enable row level security;
alter table public.os_website_pages enable row level security;
alter table public.os_website_page_versions enable row level security;
alter table public.os_store_products enable row level security;
alter table public.os_receptionist_entries enable row level security;
alter table public.os_marketing_items enable row level security;
alter table public.os_audit enable row level security;

create policy "Owners read projects" on public.os_projects for select to authenticated using ((select os_private.is_owner()));
create policy "Owners create projects" on public.os_projects for insert to authenticated with check ((select os_private.is_owner()) and created_by = (select auth.uid()));
create policy "Owners update projects" on public.os_projects for update to authenticated using ((select os_private.is_owner())) with check ((select os_private.is_owner()));

create policy "Owners read pages" on public.os_website_pages for select to authenticated using ((select os_private.is_owner()));
create policy "Owners create pages" on public.os_website_pages for insert to authenticated with check ((select os_private.is_owner()) and created_by = (select auth.uid()));
create policy "Owners update pages" on public.os_website_pages for update to authenticated using ((select os_private.is_owner())) with check ((select os_private.is_owner()));
create policy "Owners delete pages" on public.os_website_pages for delete to authenticated using ((select os_private.is_owner()));

create policy "Owners read page versions" on public.os_website_page_versions for select to authenticated using ((select os_private.is_owner()));
create policy "Owners create page versions" on public.os_website_page_versions for insert to authenticated with check ((select os_private.is_owner()) and created_by = (select auth.uid()));

create policy "Owners read products" on public.os_store_products for select to authenticated using ((select os_private.is_owner()));
create policy "Owners create products" on public.os_store_products for insert to authenticated with check ((select os_private.is_owner()) and created_by = (select auth.uid()));
create policy "Owners update products" on public.os_store_products for update to authenticated using ((select os_private.is_owner())) with check ((select os_private.is_owner()));
create policy "Owners delete products" on public.os_store_products for delete to authenticated using ((select os_private.is_owner()));

create policy "Owners read receptionist entries" on public.os_receptionist_entries for select to authenticated using ((select os_private.is_owner()));
create policy "Owners create receptionist entries" on public.os_receptionist_entries for insert to authenticated with check ((select os_private.is_owner()) and created_by = (select auth.uid()));
create policy "Owners update receptionist entries" on public.os_receptionist_entries for update to authenticated using ((select os_private.is_owner())) with check ((select os_private.is_owner()));
create policy "Owners delete receptionist entries" on public.os_receptionist_entries for delete to authenticated using ((select os_private.is_owner()));

create policy "Owners read marketing items" on public.os_marketing_items for select to authenticated using ((select os_private.is_owner()));
create policy "Owners create marketing items" on public.os_marketing_items for insert to authenticated with check ((select os_private.is_owner()) and created_by = (select auth.uid()));
create policy "Owners update marketing items" on public.os_marketing_items for update to authenticated using ((select os_private.is_owner())) with check ((select os_private.is_owner()));
create policy "Owners delete marketing items" on public.os_marketing_items for delete to authenticated using ((select os_private.is_owner()));

create policy "Owners read audit" on public.os_audit for select to authenticated using ((select os_private.is_owner()));

-- Least-privilege grants
revoke all on public.os_projects, public.os_website_pages, public.os_website_page_versions,
  public.os_store_products, public.os_receptionist_entries, public.os_marketing_items, public.os_audit
  from anon, authenticated;
grant select, insert, update on public.os_projects to authenticated;
grant select, insert, update, delete on public.os_website_pages, public.os_store_products,
  public.os_receptionist_entries, public.os_marketing_items to authenticated;
grant select, insert on public.os_website_page_versions to authenticated;
grant select on public.os_audit to authenticated;

commit;
