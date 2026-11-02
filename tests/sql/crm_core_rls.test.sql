-- RLS, grants, trigger and audit tests for 20261102085430_crm_core.sql.
-- Runs in an isolated CI PostgreSQL only, after 00_supabase_stub.sql, the
-- membership migrations and crm_core. Synthetic identities, no real data.
-- Independent of os_modules_rls.test.sql (uses its own synthetic UUIDs).
\set ON_ERROR_STOP on

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-4000-9000-000000000001', 'crm-owner-a@example.test'),
  ('00000000-0000-4000-9000-000000000002', 'crm-owner-b@example.test'),
  ('00000000-0000-4000-9000-000000000003', 'crm-outsider@example.test'),
  ('00000000-0000-4000-9000-000000000004', 'crm-operator@example.test');
insert into public.agency_memberships (user_id, role) values
  ('00000000-0000-4000-9000-000000000001', 'owner'),
  ('00000000-0000-4000-9000-000000000002', 'owner'),
  ('00000000-0000-4000-9000-000000000004', 'operator');

create table public.crm_test_ids (name text primary key, id uuid not null);
grant all on public.crm_test_ids to authenticated;

-- 1. Owner A creates data through the normal path; stamps and audit are server-side.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-9000-000000000001', false);
do $$
declare l uuid; p uuid; converted uuid; again uuid;
begin
  insert into public.crm_leads (company, contact, email, source, owner_id, created_by, version)
    values ('Empresa QA', 'Ana', 'ana@example.test', 'web', '00000000-0000-4000-9000-000000000001',
            '00000000-0000-4000-9000-000000000003', 99) -- forged author/version must be ignored
    returning id into l;
  assert (select created_by from public.crm_leads where id = l) = '00000000-0000-4000-9000-000000000001', 'created_by is forced to the caller';
  assert (select version from public.crm_leads where id = l) = 1, 'version is forced to 1 on insert';
  assert (select count(*) from public.crm_audit where record_id = l and operation = 'INSERT'
          and actor_id = '00000000-0000-4000-9000-000000000001') = 1, 'insert audited with real actor';

  update public.crm_leads set value = 1000, created_by = '00000000-0000-4000-9000-000000000003' where id = l;
  assert (select created_by from public.crm_leads where id = l) = '00000000-0000-4000-9000-000000000001', 'created_by immutable on update';
  assert (select version from public.crm_leads where id = l) = 2, 'update bumps version';

  begin
    update public.crm_leads set stage_id = 'lost' where id = l;
    raise exception 'lost without reason should fail';
  exception when check_violation then null; end;

  insert into public.crm_prospects (company, source, owner_id, opportunity, acquired_at)
    values ('Prospecto QA', 'feria', '00000000-0000-4000-9000-000000000001', 'Web nueva', now()) returning id into p;
  begin
    perform public.crm_convert_prospect(p);
    raise exception 'unapproved prospect should not convert';
  exception when check_violation then null; end;
  update public.crm_prospects set status = 'approved' where id = p;
  converted := public.crm_convert_prospect(p);
  again := public.crm_convert_prospect(p);
  assert converted is not null and converted = again, 'conversion is idempotent';

  insert into public.crm_test_ids values ('lead', l), ('prospect', p);
end $$;

-- 2. Audit trail and stages are read-only for clients.
do $$ begin
  begin
    insert into public.crm_audit (entity, record_id, actor_id, operation, after_data)
      values ('x', gen_random_uuid(), '00000000-0000-4000-9000-000000000001', 'INSERT', '{}');
    raise exception 'audit insert should be denied';
  exception when insufficient_privilege then null; end;
  begin
    update public.crm_audit set after_data = '{}';
    raise exception 'audit update should be denied';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.crm_leads;
    raise exception 'hard delete should be denied';
  exception when insufficient_privilege then null; end;
  begin
    update public.crm_stages set label = 'hacked';
    raise exception 'stage update should be denied';
  exception when insufficient_privilege then null; end;
  -- The stamp trigger silently restores agency_key (and the check constraint
  -- would reject any other value): the tenant key can never be changed.
  update public.crm_leads set agency_key = 'other';
  assert (select count(*) from public.crm_leads where agency_key <> 'avalon') = 0, 'agency_key is immutable';
end $$;

-- 3. Second owner shares the agency CRM (both founders keep identical access).
select set_config('request.jwt.claim.sub', '00000000-0000-4000-9000-000000000002', false);
do $$ begin
  assert (select count(*) from public.crm_leads) = 2, 'owner B sees agency leads';
  update public.crm_leads set priority = 'high' where id = (select id from public.crm_test_ids where name = 'lead');
  assert (select actor_id from public.crm_audit where operation = 'UPDATE' order by created_at desc, id limit 1)
         = '00000000-0000-4000-9000-000000000002', 'audit records owner B as actor';
end $$;

-- 4. Authenticated non-owners (no membership, operator) see nothing and write nothing.
do $$
declare uid text;
begin
  foreach uid in array array['00000000-0000-4000-9000-000000000003', '00000000-0000-4000-9000-000000000004'] loop
    perform set_config('request.jwt.claim.sub', uid, false);
    assert (select count(*) from public.crm_leads) = 0, 'non-owner reads no leads';
    assert (select count(*) from public.crm_prospects) = 0, 'non-owner reads no prospects';
    assert (select count(*) from public.crm_audit) = 0, 'non-owner reads no audit';
    assert (select count(*) from public.crm_stages) = 0, 'non-owner reads no stages';
    update public.crm_leads set value = 0;
    assert not found, 'non-owner update touches no rows';
    begin
      insert into public.crm_leads (company, source, owner_id) values ('X', 'y', uid::uuid);
      raise exception 'non-owner insert should fail';
    exception when insufficient_privilege or foreign_key_violation then null; end;
    begin
      perform public.crm_convert_prospect((select id from public.crm_test_ids where name = 'prospect'));
      raise exception 'non-owner conversion should fail';
    exception when insufficient_privilege then null; end;
  end loop;
end $$;

-- 5. Anonymous visitors have no privileges at all.
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$
declare t text;
begin
  foreach t in array array['crm_stages','crm_leads','crm_activities','crm_events','crm_prospects','crm_usage','crm_audit'] loop
    begin
      execute format('select 1 from public.%I limit 1', t);
      raise exception 'anon read on % should be denied', t;
    exception when insufficient_privilege then null; end;
  end loop;
  begin
    perform public.crm_convert_prospect(gen_random_uuid());
    raise exception 'anon rpc should be denied';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
drop table public.crm_test_ids;
select 'crm_core_rls: all assertions passed' as result;
