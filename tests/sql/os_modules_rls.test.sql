-- RLS, grants, triggers and audit tests for 20261102070500_avalon_os_modules.sql.
-- Runs in an isolated CI PostgreSQL only. Synthetic identities, no real data.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'owner-one@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'owner-two@example.test'),
  ('00000000-0000-4000-8000-000000000003', 'outsider@example.test'),
  ('00000000-0000-4000-8000-000000000004', 'operator@example.test');
insert into public.agency_memberships (user_id, role) values
  ('00000000-0000-4000-8000-000000000001', 'owner'),
  ('00000000-0000-4000-8000-000000000002', 'owner'),
  ('00000000-0000-4000-8000-000000000004', 'operator');

create table public.test_ids (name text primary key, id uuid not null);
grant all on public.test_ids to authenticated;

-- Owner one: full vertical slice in each module
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
do $$
declare
  w uuid; e uuid; c uuid; r uuid; m uuid; pg uuid; pr uuid; v int;
begin
  insert into public.os_projects (module, name) values ('website', 'Sitio Avalon') returning id into w;
  insert into public.os_projects (module, name) values ('ecommerce', 'Tienda demo QA') returning id into e;
  insert into public.os_projects (module, name, settings) values ('crm_creator', 'CRM cliente QA', '{"entities":[]}') returning id into c;
  insert into public.os_projects (module, name) values ('receptionist', 'Recepción QA') returning id into r;
  insert into public.os_projects (module, name) values ('marketing', 'Campaña QA') returning id into m;

  insert into public.os_website_pages (project_id, slug, title, blocks)
    values (w, 'inicio', 'Inicio', '[{"type":"hero","heading":"Hola"}]') returning id, version into pg, v;
  assert v = 1, 'new page starts at version 1';
  update public.os_website_pages set blocks = '[]' where id = pg;
  assert (select version from public.os_website_pages where id = pg) = 2, 'update bumps version';
  update public.os_website_pages set status = 'published', published_at = now() where id = pg;
  assert (select count(*) from public.os_website_page_versions where page_id = pg) = 2, 'only content changes are snapshotted';

  insert into public.os_store_products (project_id, name, sku, price_cents, inventory) values (e, 'Producto QA', 'QA-1', 1999, 5) returning id into pr;
  insert into public.os_receptionist_entries (project_id, kind, question, answer) values (r, 'faq', '¿Horario?', 'Lunes a viernes');
  insert into public.os_marketing_items (project_id, title, channel, planned_for) values (m, 'Post QA', 'instagram', current_date + 3);

  assert (select count(*) from public.os_audit where record_id = pg) = 3, 'page writes audited';
  assert (select count(*) from public.os_audit where project_id = e) = 2, 'project and product audited';

  -- Wrong module parent is rejected
  begin
    insert into public.os_store_products (project_id, name) values (w, 'Fuera de módulo');
    raise exception 'module mismatch accepted';
  exception when check_violation then null;
  end;

  -- Immutable columns
  begin
    update public.os_projects set module = 'ecommerce' where id = w;
    raise exception 'module change accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.os_store_products set project_id = w where id = pr;
    raise exception 'project change accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.os_projects set created_by = '00000000-0000-4000-8000-000000000003' where id = w;
    raise exception 'author change accepted';
  exception when insufficient_privilege then null;
  end;

  -- Author spoofing on insert
  begin
    insert into public.os_projects (module, name, created_by) values ('website', 'Spoof', '00000000-0000-4000-8000-000000000002');
    raise exception 'spoofed author accepted';
  exception when insufficient_privilege then null;
  end;

  -- Constraints
  begin
    insert into public.os_store_products (project_id, name, image_url) values (e, 'XSS', 'javascript:alert(1)');
    raise exception 'unsafe url accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.os_website_pages (project_id, slug, title) values (w, 'Bad Slug', 'x');
    raise exception 'invalid slug accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.os_store_products (project_id, name, sku) values (e, 'Duplicado', 'qa-1');
    raise exception 'duplicate sku accepted';
  exception when unique_violation then null;
  end;

  -- Append-only data
  begin
    update public.os_website_page_versions set title = 'tamper' where page_id = pg;
    raise exception 'version update accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.os_audit;
    raise exception 'audit delete accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.os_audit (table_name, record_id, operation) values ('x', gen_random_uuid(), 'INSERT');
    raise exception 'audit insert accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.os_projects where id = w;
    raise exception 'project hard delete accepted';
  exception when insufficient_privilege then null;
  end;

  insert into public.test_ids values ('website', w), ('page', pg), ('product', pr);
end $$;

-- Owner two shares the agency workspace with identical permissions
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
do $$
begin
  assert (select count(*) from public.os_projects) = 5, 'second owner sees shared projects';
  update public.os_store_products set inventory = 7 where id = (select id from public.test_ids where name = 'product');
  assert (select version from public.os_store_products where id = (select id from public.test_ids where name = 'product')) = 2;
  assert exists (select 1 from public.os_audit where actor_id = '00000000-0000-4000-8000-000000000002'), 'actor recorded';
end $$;

-- Authenticated outsider and non-owner member: nothing visible, nothing writable
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
do $$
begin
  assert (select count(*) from public.os_projects) = 0, 'outsider sees no projects';
  assert (select count(*) from public.os_store_products) = 0, 'outsider sees no products';
  assert (select count(*) from public.os_audit) = 0, 'outsider sees no audit';
  update public.os_store_products set inventory = 0;
  assert (select inventory from public.os_store_products) is null, 'still invisible';
  begin
    insert into public.os_projects (module, name) values ('website', 'Intruso');
    raise exception 'outsider insert accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
do $$
begin
  assert (select count(*) from public.os_projects) = 0, 'operator role is not an owner';
  begin
    insert into public.os_marketing_items (project_id, title, channel)
      values ((select id from public.test_ids where name = 'website'), 'x', 'blog');
    raise exception 'operator insert accepted';
  exception when insufficient_privilege or check_violation then null;
  end;
end $$;
reset role;

-- Outsider updates above must not have changed real rows
do $$
begin
  assert (select inventory from public.os_store_products where sku = 'QA-1') = 7, 'outsider update had no effect';
end $$;

-- Anonymous: no privileges at all
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$
begin
  begin
    perform 1 from public.os_projects;
    raise exception 'anon select accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Grants inventory: anon must hold nothing on os_* tables
do $$
begin
  assert not exists (
    select 1 from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public' and table_name like 'os\_%'
  ), 'anon has grants on os tables';
  assert not exists (
    select 1 from information_schema.role_table_grants
    where grantee = 'authenticated' and table_name in ('os_audit', 'os_website_page_versions')
      and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')
  ), 'append-only tables are writable';
  assert not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename like 'os\_%' and not rowsecurity
  ), 'table without RLS';
end $$;

drop table public.test_ids;
select 'os_modules_rls: all assertions passed' as result;
