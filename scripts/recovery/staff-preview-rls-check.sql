-- Avalon staff portal isolated Preview health diagnostic.
-- READ ONLY. Safe to run with Supabase SQL editor using the preview project.
-- This is a schema/privilege check, not a substitute for actual role RLS tests.
select
  current_database() as database_name,
  to_regclass('public.agency_memberships') is not null as has_memberships,
  to_regclass('public.crm_clients') is not null as has_client_core,
  to_regclass('public.office_profiles') is not null as has_office_profiles,
  to_regclass('public.office_messages') is not null as has_office_messages,
  to_regclass('public.staff_portal_access') is not null as has_staff_access,
  to_regclass('public.staff_client_grants') is not null as has_client_grants,
  to_regclass('public.staff_casefiles') is not null as has_private_casefiles,
  to_regclass('public.staff_private_messages') is not null as has_private_messages,
  (select count(*)::int from supabase_migrations.schema_migrations) as registered_migrations;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  (select count(*)::int from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as policy_count,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_can_read,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_has_grant
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'staff_%'
order by c.relname;

-- These counts must be zero on a newly created, unseeded Preview. 
-- Query only the isolated project: never inspect production account contents in outputs.
select
  (select count(*)::int from public.agency_memberships) as membership_count,
  (select count(*)::int from public.staff_portal_access) as activated_access_rows,
  (select count(*)::int from public.staff_casefiles) as staff_casefiles,
  (select count(*)::int from public.staff_private_messages) as staff_messages;
