-- Avalon sales core: clients, contacts, service catalog, multi-service sales,
-- work orders, departmental projects, tasks, notifications, payments and a
-- protected operations timeline.
--
-- PREPARED ONLY. Apply to an isolated database (CI / Supabase branch) first.
-- Production requires explicit owner approval, a backup and a comparison with
-- the real Supabase migration ledger.
--
-- Depends on: 20261102053022 (agency_memberships), 20261102070500 (os_projects)
-- and 20261102085430 (crm_private.is_owner/stamp/audit, crm_leads, crm_stages).
-- Inserts configuration only (departments, service catalog, automation rules).
-- No users, memberships, clients or business records are created.
--
-- Security model: same single-agency owner model as crm_core. RLS on every
-- table. Sales, lines, work orders, notifications and timeline cannot be
-- written directly by clients; they are produced by owner-checked
-- SECURITY DEFINER functions with a fixed search_path and no dynamic SQL.
begin;

-- ---------------------------------------------------------------- helpers
create sequence crm_private.client_code_seq;
create sequence crm_private.sale_number_seq;
revoke all on sequence crm_private.client_code_seq, crm_private.sale_number_seq from public;
grant usage on sequence crm_private.client_code_seq to authenticated;

create function crm_private.uuid_or_null(value text) returns uuid
language sql immutable set search_path = '' as $$
  select case when value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then value::uuid end
$$;

-- Decimal amounts arrive as strings; reject exponents, signs and >2 decimals.
create function crm_private.amount(value text, fallback numeric) returns numeric
language plpgsql immutable set search_path = '' as $$
begin
  if value is null or btrim(value) = '' then return fallback; end if;
  if btrim(value) !~ '^[0-9]{1,13}(\.[0-9]{1,2})?$' then
    raise exception 'sale_invalid_amount' using errcode = '22023';
  end if;
  return btrim(value)::numeric;
end $$;

create function crm_private.day(value text, fallback date) returns date
language plpgsql immutable set search_path = '' as $$
begin
  if value is null or btrim(value) = '' then return fallback; end if;
  if btrim(value) !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'sale_invalid_date' using errcode = '22023'; end if;
  return btrim(value)::date;
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'sale_invalid_date' using errcode = '22023';
end $$;

create function crm_private.norm(value text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g'))
$$;

-- Task templates: [{ "title": text, "offset_days": 0..365, "priority": ... }]
create function crm_private.valid_template(t jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(t) <> 'array' or jsonb_array_length(t) > 25 then false else not exists (
    select 1 from jsonb_array_elements(t) e where case
      when jsonb_typeof(e) <> 'object' then true
      when jsonb_typeof(e -> 'title') is distinct from 'string' then true
      when length(btrim(e ->> 'title')) not between 1 and 200 then true
      when e ? 'offset_days' and jsonb_typeof(e -> 'offset_days') <> 'number' then true
      when e ? 'offset_days' and ((e ->> 'offset_days')::numeric not between 0 and 365
        or (e ->> 'offset_days')::numeric <> trunc((e ->> 'offset_days')::numeric)) then true
      when e ? 'priority' and coalesce(e ->> 'priority', '') not in ('low', 'normal', 'high', 'urgent') then true
      else false end)
  end
$$;
revoke all on function crm_private.uuid_or_null(text), crm_private.amount(text, numeric),
  crm_private.day(text, date), crm_private.norm(text), crm_private.valid_template(jsonb) from public;
grant execute on function crm_private.norm(text), crm_private.valid_template(jsonb) to authenticated;

-- ---------------------------------------------------------------- reference data
create table public.crm_departments (
  id text primary key check (id in ('website', 'ecommerce', 'crm_creator', 'receptionist', 'marketing', 'sales')),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  label text not null check (length(btrim(label)) between 1 and 80),
  label_en text not null check (length(btrim(label_en)) between 1 and 80),
  os_module text check (os_module in ('website', 'ecommerce', 'crm_creator', 'receptionist', 'marketing')),
  position integer not null unique
);
insert into public.crm_departments (id, label, label_en, os_module, position) values
  ('website', 'Website Designer', 'Website Designer', 'website', 0),
  ('ecommerce', 'E-commerce Designer', 'E-commerce Designer', 'ecommerce', 1),
  ('crm_creator', 'CRM Creator', 'CRM Creator', 'crm_creator', 2),
  ('receptionist', 'AI Receptionist', 'AI Receptionist', 'receptionist', 3),
  ('marketing', 'Marketing Hub', 'Marketing Hub', 'marketing', 4),
  ('sales', 'Equipo comercial / CRM', 'Sales team / CRM', null, 5);

create table public.crm_service_catalog (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  code text not null unique check (code ~ '^[a-z][a-z0-9-]{1,49}$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  name_en text not null default '' check (length(name_en) <= 120),
  department_id text not null references public.crm_departments (id),
  billing_type text not null check (billing_type in ('one_time', 'monthly', 'annual')),
  suggested_price numeric(15, 2) check (suggested_price between 0 and 1000000000000),
  default_assignee_id uuid references public.agency_memberships (user_id),
  deliverables text not null default '' check (length(deliverables) <= 4000),
  task_template jsonb not null default '[]'::jsonb check (crm_private.valid_template(task_template) and pg_column_size(task_template) <= 32768),
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index crm_service_catalog_department on public.crm_service_catalog (department_id) where active;

insert into public.crm_service_catalog (code, name, name_en, department_id, billing_type, deliverables, task_template) values
 ('desarrollo-web', 'Desarrollo web', 'Web development', 'website', 'one_time', 'Sitio responsive, formularios, SEO técnico base y entrega en preview.',
  '[{"title":"Kickoff y brief del sitio","offset_days":1,"priority":"high"},{"title":"Recopilar contenidos, marca y accesos autorizados","offset_days":3,"priority":"high"},{"title":"Arquitectura de páginas y wireframe","offset_days":7},{"title":"Diseño y desarrollo en preview","offset_days":21},{"title":"QA: responsive, formularios, enlaces y accesibilidad","offset_days":25,"priority":"high"},{"title":"Revisión y aprobación del cliente","offset_days":28,"priority":"high"}]'),
 ('tienda-online', 'Tienda online', 'Online store', 'ecommerce', 'one_time', 'Catálogo, configuración de tienda y checkout en modo de pruebas.',
  '[{"title":"Kickoff y alcance de la tienda","offset_days":1,"priority":"high"},{"title":"Catálogo inicial de productos","offset_days":7},{"title":"Configurar pagos en modo sandbox (sin cargos reales)","offset_days":14,"priority":"high"},{"title":"QA de checkout y pedido de prueba","offset_days":24,"priority":"high"},{"title":"Aprobación del cliente","offset_days":28,"priority":"high"}]'),
 ('crm-personalizado', 'CRM personalizado', 'Custom CRM', 'crm_creator', 'one_time', 'Modelo de entidades, pipeline, permisos y capacitación.',
  '[{"title":"Descubrimiento de procesos comerciales","offset_days":2,"priority":"high"},{"title":"Modelo de entidades y pipeline","offset_days":7},{"title":"Configuración de permisos y formularios","offset_days":14},{"title":"Pruebas con datos sintéticos","offset_days":21,"priority":"high"},{"title":"Capacitación y entrega","offset_days":28,"priority":"high"}]'),
 ('recepcionista-ia', 'Recepcionista de IA', 'AI receptionist', 'receptionist', 'one_time', 'Agente con base de conocimiento, prompt versionado y transferencia humana.',
  '[{"title":"Kickoff: canales autorizados y horarios","offset_days":1,"priority":"high"},{"title":"Base de conocimiento y FAQ","offset_days":5},{"title":"Prompt v1 versionado","offset_days":8},{"title":"Pruebas de conversación y transferencia humana","offset_days":12,"priority":"high"},{"title":"Aprobación y plan de activación","offset_days":15,"priority":"high"}]'),
 ('marketing-mensual', 'Marketing mensual', 'Monthly marketing', 'marketing', 'monthly', 'Estrategia, calendario editorial, creatividades y reporte mensual.',
  '[{"title":"Kickoff de objetivos y audiencias","offset_days":2,"priority":"high"},{"title":"Calendario editorial del mes","offset_days":5},{"title":"Primera tanda de creatividades","offset_days":10},{"title":"Revisión mensual de resultados","offset_days":30,"priority":"high"}]'),
 ('generacion-leads', 'Generación de leads', 'Lead generation', 'sales', 'monthly', 'Definición de ICP y lotes de prospectos para revisión comercial.',
  '[{"title":"Definir perfil de cliente ideal (ICP)","offset_days":2,"priority":"high"},{"title":"Configurar fuentes autorizadas","offset_days":5},{"title":"Primer lote de prospectos para revisión","offset_days":10},{"title":"Revisión mensual de resultados","offset_days":30,"priority":"high"}]');

create table public.crm_automation_rules (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  key text not null unique check (key in ('sale_projects', 'task_overdue', 'task_blocked', 'lead_followup', 'delivery_rollup')),
  label text not null, label_en text not null, description text not null default '',
  enabled boolean not null default true,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1
);
insert into public.crm_automation_rules (key, label, label_en, description) values
 ('sale_projects', 'Venta confirmada → proyectos y tareas', 'Confirmed sale → projects and tasks', 'Crea un proyecto por departamento y aplica la plantilla de tareas del servicio.'),
 ('task_overdue', 'Tarea vencida → aviso urgente', 'Overdue task → urgent notice', 'Notifica al responsable una sola vez por tarea vencida.'),
 ('task_blocked', 'Tarea bloqueada → aviso urgente', 'Blocked task → urgent notice', 'Avisa al responsable y al creador cuando una tarea se bloquea.'),
 ('lead_followup', 'Lead sin seguimiento → recordatorio', 'Lead without follow-up → reminder', 'Recuerda al responsable los seguimientos vencidos del pipeline.'),
 ('delivery_rollup', 'Órdenes entregadas → estado de la venta', 'Delivered orders → sale status', 'Actualiza el estado de entrega de la venta desde sus órdenes de trabajo.');

create function crm_private.rule_on(rule text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select coalesce((select enabled from public.crm_automation_rules where key = rule), true)
$$;
revoke all on function crm_private.rule_on(text) from public;

-- ---------------------------------------------------------------- clients
create table public.crm_clients (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  client_code text not null unique default ('CLI-' || lpad(nextval('crm_private.client_code_seq')::text, 6, '0')),
  legal_name text not null check (length(btrim(legal_name)) between 1 and 200),
  trade_name text not null default '' check (length(trade_name) <= 200),
  website text not null default '' check (website = '' or (length(website) <= 500 and website ~ '^https://[^[:space:]<>"]+$')),
  industry text not null default '' check (length(industry) <= 120),
  country text not null default '' check (length(country) <= 80),
  location text not null default '' check (length(location) <= 200),
  source text not null check (length(btrim(source)) between 1 and 200),
  notes text not null default '' check (length(notes) <= 4000),
  owner_id uuid not null references public.agency_memberships (user_id),
  origin_lead_id uuid unique references public.crm_leads (id),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1
);
-- Duplicate guard on the normalized legal name (never used as a relation key).
create unique index crm_clients_name_unique on public.crm_clients (lower(regexp_replace(btrim(legal_name), '\s+', ' ', 'g'))) where status <> 'archived';
create index crm_clients_owner on public.crm_clients (owner_id, updated_at desc);

create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  client_id uuid not null references public.crm_clients (id),
  full_name text not null check (length(btrim(full_name)) between 1 and 160),
  email text check (email is null or (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  phone text not null default '' check (length(phone) <= 40),
  role text not null default '' check (length(role) <= 120),
  is_primary boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1
);
create unique index crm_contacts_email_unique on public.crm_contacts (client_id, lower(btrim(email))) where email is not null;
create unique index crm_contacts_primary on public.crm_contacts (client_id) where is_primary;
create index crm_contacts_email on public.crm_contacts (lower(btrim(email))) where email is not null;

-- ---------------------------------------------------------------- sales
create table public.crm_sales (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  sale_number text not null unique,
  idempotency_key uuid not null unique,
  correlation_id uuid not null unique,
  client_id uuid not null references public.crm_clients (id),
  lead_id uuid references public.crm_leads (id),
  sold_on date not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(15, 2) not null check (subtotal >= 0),
  discount_total numeric(15, 2) not null default 0 check (discount_total >= 0 and discount_total <= subtotal),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  tax_total numeric(15, 2) not null default 0 check (tax_total >= 0),
  total numeric(15, 2) not null check (total = subtotal - discount_total + tax_total),
  recurring_monthly numeric(15, 2) not null default 0 check (recurring_monthly >= 0),
  billing_mode text not null check (billing_mode in ('one_time', 'installments', 'monthly', 'mixed')),
  upfront_amount numeric(15, 2) not null default 0 check (upfront_amount between 0 and total),
  seller_id uuid not null references public.agency_memberships (user_id),
  contract_status text not null default 'pending_signature' check (contract_status in ('pending_signature', 'signed', 'cancelled')),
  delivery_status text not null default 'not_started' check (delivery_status in ('not_started', 'in_progress', 'delivered', 'cancelled')),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  notes text not null default '' check (length(notes) <= 4000),
  confirmed_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index crm_sales_client on public.crm_sales (client_id, sold_on desc);
create index crm_sales_recent on public.crm_sales (sold_on desc, created_at desc);

create table public.crm_sale_lines (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  sale_id uuid not null references public.crm_sales (id),
  position integer not null check (position between 1 and 20),
  service_id uuid not null references public.crm_service_catalog (id),
  department_id text not null references public.crm_departments (id),
  description text not null default '' check (length(description) <= 2000),
  quantity numeric(10, 2) not null check (quantity > 0 and quantity <= 10000),
  unit_price numeric(15, 2) not null check (unit_price >= 0),
  discount numeric(15, 2) not null default 0 check (discount >= 0),
  line_total numeric(15, 2) not null check (line_total >= 0),
  billing_type text not null check (billing_type in ('one_time', 'monthly', 'annual')),
  start_on date,
  assignee_id uuid not null references public.agency_memberships (user_id),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (sale_id, position)
);

-- One work order per sold line: the structural idempotency guarantee.
create table public.crm_work_orders (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  sale_id uuid not null references public.crm_sales (id),
  sale_line_id uuid not null unique references public.crm_sale_lines (id),
  client_id uuid not null references public.crm_clients (id),
  department_id text not null references public.crm_departments (id),
  project_id uuid unique references public.os_projects (id),
  assignee_id uuid not null references public.agency_memberships (user_id),
  recurrence text not null default 'none' check (recurrence in ('none', 'monthly', 'annual')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'blocked', 'delivered', 'cancelled')),
  due_on date,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index crm_work_orders_department on public.crm_work_orders (department_id, status);
create index crm_work_orders_client on public.crm_work_orders (client_id);
create index crm_work_orders_sale on public.crm_work_orders (sale_id);

-- Stable relation from module projects to the client (replaces name/JSON matching).
alter table public.os_projects add column client_id uuid references public.crm_clients (id);
create index os_projects_client on public.os_projects (client_id, updated_at desc) where client_id is not null;

-- Money actually received. Contracted revenue (crm_sales.total) is never treated as collected.
create table public.crm_payments (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  sale_id uuid not null references public.crm_sales (id),
  amount numeric(15, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  received_on date not null,
  method text not null check (method in ('transfer', 'card', 'cash', 'other')),
  reference text not null default '' check (length(reference) <= 120),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index crm_payments_sale on public.crm_payments (sale_id);

-- ---------------------------------------------------------------- tasks
create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  title text not null check (length(btrim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 4000),
  assignee_id uuid not null references public.agency_memberships (user_id),
  client_id uuid references public.crm_clients (id),
  project_id uuid references public.os_projects (id),
  sale_id uuid references public.crm_sales (id),
  work_order_id uuid references public.crm_work_orders (id),
  department_id text references public.crm_departments (id),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  due_at timestamptz,
  completed_at timestamptz,
  source text not null default 'manual' check (source in ('manual', 'template', 'automation')),
  template_key text check (template_key is null or template_key ~ '^tpl-[0-9]{1,2}$'),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1
);
create unique index crm_tasks_template_once on public.crm_tasks (work_order_id, template_key) where work_order_id is not null and template_key is not null;
create index crm_tasks_assignee on public.crm_tasks (assignee_id, status, due_at);
create index crm_tasks_client on public.crm_tasks (client_id, created_at desc);
create index crm_tasks_project on public.crm_tasks (project_id);
create index crm_tasks_open_due on public.crm_tasks (due_at) where status in ('todo', 'in_progress', 'blocked');

create table public.crm_task_comments (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  task_id uuid not null references public.crm_tasks (id),
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index crm_task_comments_task on public.crm_task_comments (task_id, created_at);

-- ---------------------------------------------------------------- notifications
-- Commercial/operational inbox only. Vercel/Supabase technical notices do not belong here.
create table public.crm_notifications (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  recipient_id uuid not null references public.agency_memberships (user_id),
  severity text not null check (severity in ('urgent', 'normal')),
  category text not null check (category in ('sales', 'delivery', 'task', 'pipeline')),
  title text not null check (length(btrim(title)) between 1 and 200),
  body text not null default '' check (length(body) <= 1000),
  link text not null default '' check (link = '' or link ~ '^/admin/[A-Za-z0-9/_?=&.-]*$'),
  client_id uuid references public.crm_clients (id),
  sale_id uuid references public.crm_sales (id),
  task_id uuid references public.crm_tasks (id),
  dedupe_key text not null unique check (length(dedupe_key) between 1 and 200),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index crm_notifications_inbox on public.crm_notifications (recipient_id, read_at, severity, created_at desc);

-- ---------------------------------------------------------------- timeline
-- Business-level, append-only operations log. No secrets or credentials are stored.
create table public.crm_timeline (
  id bigint generated always as identity primary key,
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  correlation_id uuid,
  event_type text not null check (event_type ~ '^[a-z_]+\.[a-z_]+$'),
  module text not null check (module in ('crm', 'sales', 'website', 'ecommerce', 'crm_creator', 'receptionist', 'marketing', 'automation')),
  actor_id uuid,
  client_id uuid, sale_id uuid, project_id uuid, task_id uuid,
  entity text not null check (length(entity) between 1 and 60),
  record_id uuid,
  from_state text check (length(from_state) <= 60),
  to_state text check (length(to_state) <= 60),
  result text not null default 'success' check (result in ('success', 'error', 'skipped')),
  source text not null default 'app' check (source in ('app', 'rpc', 'trigger', 'automation')),
  detail text not null default '' check (length(detail) <= 500),
  created_at timestamptz not null default clock_timestamp()
);
create index crm_timeline_recent on public.crm_timeline (created_at desc);
create index crm_timeline_client on public.crm_timeline (client_id, created_at desc) where client_id is not null;
create index crm_timeline_correlation on public.crm_timeline (correlation_id) where correlation_id is not null;
create index crm_timeline_event on public.crm_timeline (event_type, created_at desc);
create index crm_timeline_actor on public.crm_timeline (actor_id, created_at desc);

create function crm_private.log(event_type text, module text, entity text, record_id uuid,
  client_id uuid default null, sale_id uuid default null, project_id uuid default null, task_id uuid default null,
  from_state text default null, to_state text default null, detail text default '', result text default 'success',
  source text default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.crm_timeline (correlation_id, event_type, module, actor_id, client_id, sale_id, project_id, task_id,
    entity, record_id, from_state, to_state, result, source, detail)
  values (crm_private.uuid_or_null(current_setting('avalon.correlation_id', true)), event_type, module, auth.uid(),
    client_id, sale_id, project_id, task_id, entity, record_id, left(from_state, 60), left(to_state, 60), result,
    coalesce(source, nullif(current_setting('avalon.source', true), ''), 'trigger'), left(coalesce(detail, ''), 500));
$$;

create function crm_private.notify(recipient uuid, severity text, category text, title text, body text, link text,
  dedupe text, client_id uuid default null, sale_id uuid default null, task_id uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare inserted integer;
begin
  insert into public.crm_notifications (recipient_id, severity, category, title, body, link, client_id, sale_id, task_id, dedupe_key)
  values (recipient, severity, category, left(title, 200), left(coalesce(body, ''), 1000), coalesce(link, ''), client_id, sale_id, task_id, left(dedupe, 200))
  on conflict (dedupe_key) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end $$;
revoke all on function crm_private.log(text, text, text, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text) from public;
revoke all on function crm_private.notify(uuid, text, text, text, text, text, text, uuid, uuid, uuid) from public;

-- ---------------------------------------------------------------- confirm sale
-- Atomic and idempotent. The same idempotency_key always returns the original
-- sale; nothing is created twice. Any failure rolls back the whole operation.
create function public.crm_confirm_sale(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  key uuid;
  existing public.crm_sales;
  sale public.crm_sales;
  client public.crm_clients;
  lead public.crm_leads;
  svc public.crm_service_catalog;
  dept public.crm_departments;
  nc jsonb := coalesce(request -> 'new_client', 'null'::jsonb);
  lines jsonb := request -> 'lines';
  line jsonb; contact jsonb; tpl jsonb;
  pos integer; idx integer;
  qty numeric; price numeric; ldisc numeric; ltotal numeric;
  subtotal numeric := 0; recurring numeric := 0; sale_discount numeric; rate numeric; tax numeric; total numeric; upfront numeric;
  seller uuid; assignee uuid; v_lead_id uuid; v_client_id uuid; dup uuid;
  sold date; start_day date; max_offset integer; t_offset integer; t_priority text;
  v_line_id uuid; v_wo_id uuid; v_project_id uuid; v_task_id uuid; line_tasks integer;
  corr uuid := gen_random_uuid();
  client_created boolean := false;
  n_contacts integer := 0; n_orders integer := 0; n_projects integer := 0; n_tasks integer := 0; n_notices integer := 0;
  v_currency text; v_billing text; projects_on boolean := crm_private.rule_on('sale_projects');
  owner_row record;
begin
  if actor is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if request is null or jsonb_typeof(request) <> 'object' then raise exception 'sale_invalid' using errcode = '22023'; end if;
  key := crm_private.uuid_or_null(request ->> 'idempotency_key');
  if key is null then raise exception 'sale_invalid_key' using errcode = '22023'; end if;

  -- Serialize concurrent submissions of the same key, then replay if already done.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('crm_sale:' || key::text, 0));
  select * into existing from public.crm_sales s where s.idempotency_key = key;
  if found then
    return jsonb_build_object('sale_id', existing.id, 'sale_number', existing.sale_number, 'client_id', existing.client_id,
      'replayed', true,
      'work_orders', (select count(*) from public.crm_work_orders w where w.sale_id = existing.id),
      'projects', (select count(*) from public.crm_work_orders w where w.sale_id = existing.id and w.project_id is not null),
      'tasks', (select count(*) from public.crm_tasks t where t.sale_id = existing.id));
  end if;

  perform set_config('avalon.correlation_id', corr::text, true);
  perform set_config('avalon.source', 'rpc', true);

  if jsonb_typeof(lines) is distinct from 'array' or jsonb_array_length(lines) not between 1 and 20 then
    raise exception 'sale_invalid_lines' using errcode = '22023';
  end if;
  seller := coalesce(crm_private.uuid_or_null(request ->> 'seller_id'), actor);
  if not exists (select 1 from public.agency_memberships m where m.user_id = seller and m.role = 'owner') then
    raise exception 'sale_invalid_member' using errcode = '22023';
  end if;
  v_currency := upper(coalesce(nullif(btrim(request ->> 'currency'), ''), 'USD'));
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'sale_invalid_currency' using errcode = '22023'; end if;
  v_billing := coalesce(nullif(request ->> 'billing_mode', ''), 'mixed');
  if v_billing not in ('one_time', 'installments', 'monthly', 'mixed') then raise exception 'sale_invalid' using errcode = '22023'; end if;
  sold := crm_private.day(request ->> 'sold_on', current_date);

  -- Pass 1: validate every line and compute totals server-side.
  for line in select value from jsonb_array_elements(lines) loop
    if jsonb_typeof(line) <> 'object' then raise exception 'sale_invalid_lines' using errcode = '22023'; end if;
    select * into svc from public.crm_service_catalog c where c.code = line ->> 'service_code' and c.active;
    if not found then raise exception 'sale_invalid_service' using errcode = '22023'; end if;
    qty := crm_private.amount(line ->> 'quantity', 1);
    price := crm_private.amount(line ->> 'unit_price', svc.suggested_price);
    ldisc := crm_private.amount(line ->> 'discount', 0);
    if price is null then raise exception 'sale_missing_price' using errcode = '22023'; end if;
    if qty <= 0 or qty > 10000 then raise exception 'sale_invalid_amount' using errcode = '22023'; end if;
    ltotal := round(qty * price - ldisc, 2);
    if ltotal < 0 then raise exception 'sale_invalid_discount' using errcode = '22023'; end if;
    assignee := crm_private.uuid_or_null(line ->> 'assignee_id');
    if assignee is not null and not exists (select 1 from public.agency_memberships m where m.user_id = assignee and m.role = 'owner') then
      raise exception 'sale_invalid_member' using errcode = '22023';
    end if;
    perform crm_private.day(line ->> 'start_on', null);
    subtotal := subtotal + ltotal;
    if svc.billing_type = 'monthly' then recurring := recurring + ltotal; end if;
  end loop;
  sale_discount := crm_private.amount(request ->> 'discount', 0);
  rate := crm_private.amount(request ->> 'tax_rate', 0);
  if sale_discount > subtotal then raise exception 'sale_invalid_discount' using errcode = '22023'; end if;
  if rate > 100 then raise exception 'sale_invalid_amount' using errcode = '22023'; end if;
  tax := round((subtotal - sale_discount) * rate / 100, 2);
  total := subtotal - sale_discount + tax;
  upfront := crm_private.amount(request ->> 'upfront_amount', 0);
  if upfront > total then raise exception 'sale_invalid_upfront' using errcode = '22023'; end if;

  -- Origin opportunity (optional).
  v_lead_id := crm_private.uuid_or_null(request ->> 'lead_id');
  if request ->> 'lead_id' is not null and request ->> 'lead_id' <> '' and v_lead_id is null then
    raise exception 'sale_lead_missing' using errcode = '22023';
  end if;
  if v_lead_id is not null then
    select * into lead from public.crm_leads l where l.id = v_lead_id and not l.archived for update;
    if not found then raise exception 'sale_lead_missing' using errcode = '22023'; end if;
  end if;

  -- Client: existing id, the client already created from this lead, or a new one.
  v_client_id := crm_private.uuid_or_null(request ->> 'client_id');
  if v_client_id is not null then
    select * into client from public.crm_clients c where c.id = v_client_id and c.status <> 'archived' for update;
    if not found then raise exception 'sale_client_missing' using errcode = '22023'; end if;
  elsif v_lead_id is not null and exists (select 1 from public.crm_clients c where c.origin_lead_id = v_lead_id) then
    select * into client from public.crm_clients c where c.origin_lead_id = v_lead_id for update;
  else
    if jsonb_typeof(nc) <> 'object' or length(btrim(coalesce(nc ->> 'legal_name', ''))) = 0 then
      raise exception 'sale_client_required' using errcode = '22023';
    end if;
    select c.id into dup from public.crm_clients c
      where c.status <> 'archived' and crm_private.norm(c.legal_name) = crm_private.norm(nc ->> 'legal_name') limit 1;
    if dup is null and jsonb_typeof(request -> 'contacts') = 'array' then
      select ct.client_id into dup from public.crm_contacts ct
        join jsonb_array_elements(request -> 'contacts') e on lower(btrim(ct.email)) = lower(btrim(e ->> 'email'))
        where ct.email is not null limit 1;
    end if;
    if dup is not null then
      raise exception 'sale_client_exists' using errcode = '23505', detail = dup::text;
    end if;
    insert into public.crm_clients (legal_name, trade_name, website, industry, country, location, source, notes, owner_id, origin_lead_id)
    values (btrim(nc ->> 'legal_name'), btrim(coalesce(nc ->> 'trade_name', '')), btrim(coalesce(nc ->> 'website', '')),
      btrim(coalesce(nc ->> 'industry', '')), btrim(coalesce(nc ->> 'country', '')), btrim(coalesce(nc ->> 'location', '')),
      coalesce(nullif(btrim(nc ->> 'source'), ''), lead.source, 'Venta directa'), coalesce(nc ->> 'notes', ''),
      coalesce(crm_private.uuid_or_null(nc ->> 'owner_id'), seller), v_lead_id)
    returning * into client;
    client_created := true;
    perform crm_private.log('client.created', 'sales', 'crm_clients', client.id, client_id => client.id, to_state => client.status, detail => client.client_code);
  end if;
  if not client_created then
    perform crm_private.log('client.linked', 'sales', 'crm_clients', client.id, client_id => client.id, detail => client.client_code);
  end if;

  -- Contacts: add new ones, never duplicate an e-mail inside the client.
  if jsonb_typeof(request -> 'contacts') = 'array' then
    if jsonb_array_length(request -> 'contacts') > 10 then raise exception 'sale_invalid' using errcode = '22023'; end if;
    for contact in select value from jsonb_array_elements(request -> 'contacts') loop
      continue when jsonb_typeof(contact) <> 'object' or length(btrim(coalesce(contact ->> 'full_name', ''))) = 0;
      continue when nullif(btrim(contact ->> 'email'), '') is not null and exists (select 1 from public.crm_contacts ct
        where ct.client_id = client.id and lower(btrim(ct.email)) = lower(btrim(contact ->> 'email')));
      insert into public.crm_contacts (client_id, full_name, email, phone, role, is_primary)
      values (client.id, btrim(contact ->> 'full_name'), nullif(lower(btrim(contact ->> 'email')), ''),
        btrim(coalesce(contact ->> 'phone', '')), btrim(coalesce(contact ->> 'role', '')),
        not exists (select 1 from public.crm_contacts ct where ct.client_id = client.id and ct.is_primary));
      n_contacts := n_contacts + 1;
    end loop;
  end if;
  if client_created and n_contacts = 0 and v_lead_id is not null and length(btrim(lead.contact)) > 0 then
    insert into public.crm_contacts (client_id, full_name, email, phone, is_primary)
    values (client.id, lead.contact, lead.email, lead.phone, true);
    n_contacts := 1;
  end if;
  if n_contacts > 0 then
    perform crm_private.log('contact.added', 'sales', 'crm_clients', client.id, client_id => client.id, detail => n_contacts || ' contacto(s)');
  end if;

  insert into public.crm_sales (sale_number, idempotency_key, correlation_id, client_id, lead_id, sold_on, currency, subtotal,
    discount_total, tax_rate, tax_total, total, recurring_monthly, billing_mode, upfront_amount, seller_id, contract_status, notes)
  values ('AV-' || to_char(sold, 'YYYY') || '-' || lpad(nextval('crm_private.sale_number_seq')::text, 5, '0'), key, corr,
    client.id, v_lead_id, sold, v_currency, subtotal, sale_discount, rate, tax, total, recurring, v_billing, upfront, seller,
    case when request ->> 'contract_status' = 'signed' then 'signed' else 'pending_signature' end, left(coalesce(request ->> 'notes', ''), 4000))
  returning * into sale;
  perform crm_private.log('sale.confirmed', 'sales', 'crm_sales', sale.id, client_id => client.id, sale_id => sale.id,
    to_state => 'confirmed', detail => sale.sale_number || ' · ' || sale.currency || ' ' || sale.total);

  if v_lead_id is not null and not exists (select 1 from public.crm_stages st where st.id = lead.stage_id and st.kind = 'won') then
    update public.crm_leads set stage_id = (select st.id from public.crm_stages st where st.kind = 'won' order by st.position limit 1)
      where id = v_lead_id;
    perform crm_private.log('lead.won', 'crm', 'crm_leads', v_lead_id, client_id => client.id, sale_id => sale.id,
      from_state => lead.stage_id, to_state => 'won');
  end if;

  -- Pass 2: lines → work orders → departmental projects → template tasks.
  pos := 0;
  for line in select value from jsonb_array_elements(lines) loop
    pos := pos + 1;
    select * into svc from public.crm_service_catalog c where c.code = line ->> 'service_code';
    select * into dept from public.crm_departments d where d.id = svc.department_id;
    qty := crm_private.amount(line ->> 'quantity', 1);
    price := crm_private.amount(line ->> 'unit_price', svc.suggested_price);
    ldisc := crm_private.amount(line ->> 'discount', 0);
    assignee := coalesce(crm_private.uuid_or_null(line ->> 'assignee_id'), svc.default_assignee_id, seller);
    start_day := crm_private.day(line ->> 'start_on', sold);
    insert into public.crm_sale_lines (sale_id, position, service_id, department_id, description, quantity, unit_price, discount,
      line_total, billing_type, start_on, assignee_id)
    values (sale.id, pos, svc.id, dept.id, left(btrim(coalesce(line ->> 'description', '')), 2000), qty, price, ldisc,
      round(qty * price - ldisc, 2), svc.billing_type, start_day, assignee)
    returning id into v_line_id;

    select coalesce(max(case when e ? 'offset_days' then (e ->> 'offset_days')::integer else 0 end), 0) into max_offset
      from jsonb_array_elements(svc.task_template) e;
    insert into public.crm_work_orders (sale_id, sale_line_id, client_id, department_id, assignee_id, recurrence, due_on)
    values (sale.id, v_line_id, client.id, dept.id, assignee,
      case svc.billing_type when 'monthly' then 'monthly' when 'annual' then 'annual' else 'none' end, start_day + max_offset)
    returning id into v_wo_id;
    n_orders := n_orders + 1;
    perform crm_private.log('service.assigned', 'sales', 'crm_work_orders', v_wo_id, client_id => client.id, sale_id => sale.id,
      to_state => dept.id, detail => svc.name || ' → ' || dept.label);

    v_project_id := null;
    if projects_on and dept.os_module is not null then
      insert into public.os_projects (module, name, description, status, client_id, settings)
      values (dept.os_module, left(client.legal_name || ' — ' || svc.name, 120),
        left(coalesce(nullif(btrim(line ->> 'description'), ''), svc.deliverables), 2000), 'active', client.id,
        case when client.origin_lead_id is not null
          then jsonb_build_object('operations', jsonb_build_object('client_lead_id', client.origin_lead_id::text)) else '{}'::jsonb end)
      returning id into v_project_id;
      update public.crm_work_orders set project_id = v_project_id where id = v_wo_id;
      n_projects := n_projects + 1;
      perform crm_private.log('project.created', dept.os_module, 'os_projects', v_project_id, client_id => client.id,
        sale_id => sale.id, project_id => v_project_id, to_state => 'active', detail => svc.name);
    end if;

    line_tasks := 0;
    if projects_on then
      for tpl, idx in select e, i from jsonb_array_elements(svc.task_template) with ordinality as x(e, i) loop
        t_offset := case when tpl ? 'offset_days' then (tpl ->> 'offset_days')::integer else 0 end;
        t_priority := coalesce(tpl ->> 'priority', 'normal');
        insert into public.crm_tasks (title, assignee_id, client_id, project_id, sale_id, work_order_id, department_id,
          priority, due_at, source, template_key)
        values (btrim(tpl ->> 'title'), assignee, client.id, v_project_id, sale.id, v_wo_id, dept.id, t_priority,
          ((start_day + t_offset)::timestamp + interval '17 hours') at time zone 'UTC', 'template', 'tpl-' || idx)
        returning id into v_task_id;
        n_tasks := n_tasks + 1; line_tasks := line_tasks + 1;
      end loop;
      if line_tasks > 0 then
        perform crm_private.log('tasks.generated', coalesce(dept.os_module, 'sales'), 'crm_work_orders', v_wo_id,
          client_id => client.id, sale_id => sale.id, project_id => v_project_id,
          detail => line_tasks || ' tarea(s) de plantilla');
      end if;
    end if;

    n_notices := n_notices + crm_private.notify(assignee, 'normal', 'delivery', 'Nuevo trabajo: ' || svc.name,
      client.legal_name || ' · ' || sale.sale_number, case when v_project_id is null then '/admin/workspace/crm/sales/' || sale.id
        else '/admin/workspace/products/' || v_project_id end, 'work-order:' || v_wo_id || ':' || assignee,
      client.id, sale.id, null);
  end loop;

  for owner_row in select m.user_id from public.agency_memberships m where m.role = 'owner' loop
    n_notices := n_notices + crm_private.notify(owner_row.user_id, 'normal', 'sales', 'Venta confirmada ' || sale.sale_number,
      client.legal_name || ' · ' || n_orders || ' servicio(s) · ' || sale.currency || ' ' || sale.total,
      '/admin/workspace/crm/sales/' || sale.id, 'sale:' || sale.id || ':' || owner_row.user_id, client.id, sale.id, null);
  end loop;
  perform crm_private.log('notification.sent', 'sales', 'crm_sales', sale.id, client_id => client.id, sale_id => sale.id,
    detail => n_notices || ' aviso(s)');

  return jsonb_build_object('sale_id', sale.id, 'sale_number', sale.sale_number, 'client_id', client.id, 'replayed', false,
    'client_created', client_created, 'contacts', n_contacts, 'work_orders', n_orders, 'projects', n_projects, 'tasks', n_tasks);
end $$;
revoke all on function public.crm_confirm_sale(jsonb) from public, anon;
grant execute on function public.crm_confirm_sale(jsonb) to authenticated;

-- A failed confirmation rolls back completely; this records the diagnosable error.
create function public.crm_record_sale_failure(idempotency_key uuid, code text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if code is null or code !~ '^[a-z_]{1,60}$' then raise exception 'sale_invalid' using errcode = '22023'; end if;
  if (select count(*) from public.crm_timeline t where t.correlation_id = idempotency_key and t.event_type = 'sale.failed') >= 5 then return; end if;
  insert into public.crm_timeline (correlation_id, event_type, module, actor_id, entity, result, source, detail)
  values (idempotency_key, 'sale.failed', 'sales', auth.uid(), 'crm_sales', 'error', 'app', code);
end $$;
revoke all on function public.crm_record_sale_failure(uuid, text) from public, anon;
grant execute on function public.crm_record_sale_failure(uuid, text) to authenticated;

-- ---------------------------------------------------------------- triggers
create function crm_private.payment_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare s public.crm_sales; paid numeric;
begin
  select * into s from public.crm_sales where id = new.sale_id for update;
  if not found or s.status <> 'confirmed' then raise exception 'payment_invalid_sale' using errcode = '23514'; end if;
  if new.currency <> s.currency then raise exception 'payment_currency_mismatch' using errcode = '23514'; end if;
  select coalesce(sum(amount), 0) into paid from public.crm_payments where sale_id = new.sale_id;
  if paid + new.amount > s.total then raise exception 'payment_exceeds_total' using errcode = '23514'; end if;
  return new;
end $$;

create function crm_private.payment_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.crm_sales;
begin
  select * into s from public.crm_sales where id = new.sale_id;
  perform crm_private.log('payment.recorded', 'sales', 'crm_payments', new.id, client_id => s.client_id, sale_id => s.id,
    detail => new.currency || ' ' || new.amount || ' · ' || new.method, source => 'app');
  return null;
end $$;

create function crm_private.task_before() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.completed_at := now();
  elsif new.status <> 'done' then new.completed_at := null; end if;
  if tg_op = 'UPDATE' then
    new.source := old.source; new.template_key := old.template_key; new.work_order_id := old.work_order_id; new.sale_id := old.sale_id;
  end if;
  return new;
end $$;

create function crm_private.task_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); area text;
begin
  area := coalesce((select d.os_module from public.crm_departments d where d.id = new.department_id), 'crm');
  if tg_op = 'INSERT' then
    if new.source = 'manual' then
      perform crm_private.log('task.created', area, 'crm_tasks', new.id, client_id => new.client_id, sale_id => new.sale_id,
        project_id => new.project_id, task_id => new.id, to_state => new.status, detail => left(new.title, 160), source => 'app');
      if new.assignee_id is distinct from actor then
        perform crm_private.notify(new.assignee_id, case when new.priority = 'urgent' then 'urgent' else 'normal' end, 'task',
          'Tarea asignada: ' || left(new.title, 150), '', '/admin/workspace/crm/tasks?task=' || new.id,
          'task-assigned:' || new.id || ':' || new.assignee_id, new.client_id, new.sale_id, new.id);
      end if;
    end if;
    return null;
  end if;
  if new.status is distinct from old.status then
    perform crm_private.log('task.status_changed', area, 'crm_tasks', new.id, client_id => new.client_id, sale_id => new.sale_id,
      project_id => new.project_id, task_id => new.id, from_state => old.status, to_state => new.status, detail => left(new.title, 160), source => 'app');
    if new.status = 'blocked' and crm_private.rule_on('task_blocked') then
      if new.assignee_id is distinct from actor then
        perform crm_private.notify(new.assignee_id, 'urgent', 'task', 'Tarea bloqueada: ' || left(new.title, 150), '',
          '/admin/workspace/crm/tasks?task=' || new.id, 'task-blocked:' || new.id || ':' || new.version || ':' || new.assignee_id,
          new.client_id, new.sale_id, new.id);
      end if;
      if new.created_by is distinct from actor and new.created_by is distinct from new.assignee_id
        and exists (select 1 from public.agency_memberships m where m.user_id = new.created_by) then
        perform crm_private.notify(new.created_by, 'urgent', 'task', 'Tarea bloqueada: ' || left(new.title, 150), '',
          '/admin/workspace/crm/tasks?task=' || new.id, 'task-blocked:' || new.id || ':' || new.version || ':' || new.created_by,
          new.client_id, new.sale_id, new.id);
      end if;
    end if;
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    perform crm_private.log('task.reassigned', area, 'crm_tasks', new.id, client_id => new.client_id, sale_id => new.sale_id,
      project_id => new.project_id, task_id => new.id, detail => left(new.title, 160), source => 'app');
    if new.assignee_id is distinct from actor then
      perform crm_private.notify(new.assignee_id, 'normal', 'task', 'Tarea asignada: ' || left(new.title, 150), '',
        '/admin/workspace/crm/tasks?task=' || new.id, 'task-assigned:' || new.id || ':' || new.assignee_id || ':' || new.version,
        new.client_id, new.sale_id, new.id);
    end if;
  end if;
  return null;
end $$;

create function crm_private.work_order_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare total_n integer; delivered_n integer; active_n integer; next_state text;
begin
  if new.status is not distinct from old.status then return null; end if;
  perform crm_private.log('work_order.status_changed', coalesce((select d.os_module from public.crm_departments d where d.id = new.department_id), 'sales'),
    'crm_work_orders', new.id, client_id => new.client_id, sale_id => new.sale_id, project_id => new.project_id,
    from_state => old.status, to_state => new.status, source => 'app');
  if crm_private.rule_on('delivery_rollup') then
    select count(*) filter (where status <> 'cancelled'), count(*) filter (where status = 'delivered'),
      count(*) filter (where status in ('in_progress', 'blocked', 'delivered'))
      into total_n, delivered_n, active_n from public.crm_work_orders where sale_id = new.sale_id;
    next_state := case when total_n = 0 then 'cancelled' when delivered_n = total_n then 'delivered'
      when active_n > 0 then 'in_progress' else 'not_started' end;
    if exists (select 1 from public.crm_sales s where s.id = new.sale_id and s.delivery_status <> next_state) then
      update public.crm_sales set delivery_status = next_state where id = new.sale_id;
      perform crm_private.log('sale.delivery_changed', 'automation', 'crm_sales', new.sale_id, client_id => new.client_id,
        sale_id => new.sale_id, to_state => next_state, source => 'automation');
    end if;
  end if;
  return null;
end $$;
revoke all on function crm_private.payment_guard(), crm_private.payment_events(), crm_private.task_before(),
  crm_private.task_events(), crm_private.work_order_events() from public;

create trigger crm_payments_guard before insert on public.crm_payments for each row execute function crm_private.payment_guard();
create trigger crm_payments_events after insert on public.crm_payments for each row execute function crm_private.payment_events();
create trigger crm_tasks_before before insert or update on public.crm_tasks for each row execute function crm_private.task_before();
create trigger crm_tasks_events after insert or update on public.crm_tasks for each row execute function crm_private.task_events();
create trigger crm_work_orders_events after update on public.crm_work_orders for each row execute function crm_private.work_order_events();

-- Deterministic alert sweep (no cron, no external calls). Safe to call repeatedly.
create function public.crm_refresh_alerts() returns integer
language plpgsql security definer set search_path = '' as $$
declare created integer := 0; r record;
begin
  if auth.uid() is null or not crm_private.is_owner() then raise exception 'crm_forbidden' using errcode = '42501'; end if;
  if crm_private.rule_on('task_overdue') then
    for r in select t.* from public.crm_tasks t where t.status in ('todo', 'in_progress', 'blocked') and t.due_at < now()
      order by t.due_at limit 200 loop
      created := created + crm_private.notify(r.assignee_id, 'urgent', 'task', 'Tarea vencida: ' || left(r.title, 150),
        'Venció el ' || to_char(r.due_at at time zone 'UTC', 'YYYY-MM-DD'), '/admin/workspace/crm/tasks?task=' || r.id,
        'task-overdue:' || r.id || ':' || to_char(r.due_at, 'YYYYMMDDHH24MI'), r.client_id, r.sale_id, r.id);
    end loop;
  end if;
  if crm_private.rule_on('lead_followup') then
    for r in select l.* from public.crm_leads l join public.crm_stages s on s.id = l.stage_id
      where not l.archived and s.kind = 'open' and l.follow_up_at < now() order by l.follow_up_at limit 200 loop
      created := created + crm_private.notify(r.owner_id, 'normal', 'pipeline', 'Seguimiento pendiente: ' || left(r.company, 150),
        'Programado para ' || to_char(r.follow_up_at at time zone 'UTC', 'YYYY-MM-DD'), '/admin/workspace/crm/leads?lead=' || r.id,
        'lead-followup:' || r.id || ':' || to_char(r.follow_up_at, 'YYYYMMDDHH24MI'));
    end loop;
  end if;
  if created > 0 then
    perform crm_private.log('automation.alerts', 'automation', 'crm_notifications', null, detail => created || ' aviso(s) nuevos', source => 'automation');
  end if;
  return created;
end $$;
revoke all on function public.crm_refresh_alerts() from public, anon;
grant execute on function public.crm_refresh_alerts() to authenticated;

-- Contracted vs collected, per currency. RLS applies (security invoker).
create function public.crm_sales_metrics() returns table (currency text, sales integer, contracted numeric,
  collected numeric, recurring_monthly numeric, upfront_agreed numeric)
language sql stable security invoker set search_path = '' as $$
  select s.currency, count(*)::integer, sum(s.total), coalesce(sum(p.paid), 0), sum(s.recurring_monthly), sum(s.upfront_amount)
  from public.crm_sales s
  left join (select sale_id, sum(amount) paid from public.crm_payments group by sale_id) p on p.sale_id = s.id
  where s.status = 'confirmed'
  group by s.currency order by s.currency
$$;
revoke all on function public.crm_sales_metrics() from public, anon;
grant execute on function public.crm_sales_metrics() to authenticated;

-- Owners can see each other (id + e-mail) to assign work. Display only; never used for authorization.
create function public.crm_owner_directory() returns table (user_id uuid, email text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, coalesce(u.email, '') from public.agency_memberships m join auth.users u on u.id = m.user_id
  where m.role = 'owner' and crm_private.is_owner() order by u.email
$$;
revoke all on function public.crm_owner_directory() from public, anon;
grant execute on function public.crm_owner_directory() to authenticated;

-- ---------------------------------------------------------------- RLS and grants
do $$ declare t text; begin
  foreach t in array array['crm_departments', 'crm_service_catalog', 'crm_automation_rules', 'crm_clients', 'crm_contacts',
    'crm_sales', 'crm_sale_lines', 'crm_work_orders', 'crm_payments', 'crm_tasks', 'crm_task_comments', 'crm_timeline'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy crm_read on public.%I for select to authenticated using ((select crm_private.is_owner()) and agency_key = ''avalon'')', t);
  end loop;
  foreach t in array array['crm_service_catalog', 'crm_automation_rules', 'crm_clients', 'crm_contacts', 'crm_sales',
    'crm_sale_lines', 'crm_work_orders', 'crm_payments', 'crm_tasks', 'crm_task_comments'] loop
    execute format('create policy crm_insert on public.%I for insert to authenticated with check ((select crm_private.is_owner()) and agency_key = ''avalon'')', t);
    execute format('create policy crm_update on public.%I for update to authenticated using ((select crm_private.is_owner()) and agency_key = ''avalon'') with check ((select crm_private.is_owner()) and agency_key = ''avalon'')', t);
    execute format('create trigger crm_stamp before insert or update on public.%I for each row execute function crm_private.stamp()', t);
    execute format('create trigger crm_audit after insert or update on public.%I for each row execute function crm_private.audit()', t);
  end loop;
end $$;

-- Writable surface per table (column-level where identity/relations must not change).
grant insert, update on public.crm_service_catalog to authenticated;
grant update (enabled) on public.crm_automation_rules to authenticated;
grant insert on public.crm_clients to authenticated;
grant update (legal_name, trade_name, website, industry, country, location, source, notes, owner_id, status) on public.crm_clients to authenticated;
grant insert on public.crm_contacts to authenticated;
grant update (full_name, email, phone, role, is_primary) on public.crm_contacts to authenticated;
grant update (contract_status, notes) on public.crm_sales to authenticated;
grant update (status, assignee_id, due_on) on public.crm_work_orders to authenticated;
grant insert on public.crm_payments to authenticated;
grant insert on public.crm_tasks to authenticated;
grant update (title, description, assignee_id, client_id, project_id, department_id, priority, status, due_at) on public.crm_tasks to authenticated;
grant insert on public.crm_task_comments to authenticated;

alter table public.crm_notifications enable row level security;
revoke all on public.crm_notifications from anon, authenticated;
grant select on public.crm_notifications to authenticated;
grant update (read_at) on public.crm_notifications to authenticated;
create policy crm_inbox_read on public.crm_notifications for select to authenticated
  using ((select crm_private.is_owner()) and recipient_id = (select auth.uid()));
create policy crm_inbox_update on public.crm_notifications for update to authenticated
  using ((select crm_private.is_owner()) and recipient_id = (select auth.uid()))
  with check ((select crm_private.is_owner()) and recipient_id = (select auth.uid()));

commit;
