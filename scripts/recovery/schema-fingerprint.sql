-- Avalon · structural fingerprint (READ-ONLY). Same query on the isolated chain and on any real database; compare the
-- JSON with scripts/recovery/compare-fingerprint.cjs. Covers the app schemas only (public, crm_private, os_private).
-- Never returns data rows, secrets or user information: only object names, signatures and definitions' hashes.
with s as (select unnest(array['public', 'crm_private', 'os_private']) as n)
select jsonb_build_object(
  'tables', (select coalesce(jsonb_agg(c.relnamespace::regnamespace::text || '.' || c.relname || case when c.relrowsecurity then ' [rls]' else ' [no-rls]' end order by 1), '[]')
             from pg_class c where c.relkind in ('r', 'p', 'v') and c.relnamespace::regnamespace::text in (select n from s)),
  'columns', (select coalesce(jsonb_agg(table_schema || '.' || table_name || '.' || column_name || ':' || data_type || case when is_nullable = 'NO' then ' not null' else '' end order by 1), '[]')
              from information_schema.columns where table_schema in (select n from s)),
  'functions', (select coalesce(jsonb_agg(p.pronamespace::regnamespace::text || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
                || case when p.prosecdef then ' definer' else ' invoker' end || ' #' || left(md5(regexp_replace(p.prosrc, '\s+', ' ', 'g')), 10) order by 1), '[]')
                from pg_proc p where p.pronamespace::regnamespace::text in (select n from s) and p.prokind = 'f'),
  'triggers', (select coalesce(jsonb_agg(c.relname || '.' || t.tgname || ' -> ' || t.tgfoid::regproc::text order by 1), '[]')
               from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and c.relnamespace::regnamespace::text in (select n from s)),
  'policies', (select coalesce(jsonb_agg(schemaname || '.' || tablename || '.' || policyname || ' ' || cmd || ' ' || array_to_string(roles, ',') order by 1), '[]')
               from pg_policies where schemaname in (select n from s)),
  'constraints', (select coalesce(jsonb_agg(conrelid::regclass::text || '.' || conname || ' #' || left(md5(pg_get_constraintdef(oid)), 10) order by 1), '[]')
                  from pg_constraint where connamespace::regnamespace::text in (select n from s) and contype in ('c', 'u', 'f', 'p')),
  'function_grants', (select coalesce(jsonb_agg(routine_schema || '.' || routine_name || ' -> ' || grantee order by 1), '[]')
                      from information_schema.routine_privileges where routine_schema in (select n from s) and grantee in ('anon', 'authenticated', 'service_role')),
  'table_grants', (select coalesce(jsonb_agg(distinct table_schema || '.' || table_name || ' -> ' || grantee || ':' || privilege_type), '[]')
                   from information_schema.role_table_grants where table_schema in (select n from s) and grantee in ('anon', 'authenticated'))
) as fingerprint;
