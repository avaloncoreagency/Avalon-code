-- Read-only complement to schema-fingerprint.sql (Operation Phoenix).
-- schema-fingerprint.sql does not capture default privileges, so it cannot prove that
-- 20261112191000_future_public_default_acl is applied. Run this in the same SQL editor.
-- Expected after that migration: no row grants anon/authenticated anything for role postgres in schema public,
-- and the global function default for role postgres no longer includes EXECUTE for PUBLIC ("=X/postgres").
select pg_get_userbyid(d.defaclrole) as role,
       coalesce(n.nspname, '(all schemas)') as schema,
       case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences' when 'f' then 'functions'
                            when 'T' then 'types' when 'n' then 'schemas' end as object_type,
       d.defaclacl::text as acl
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
where pg_get_userbyid(d.defaclrole) = 'postgres'
order by 2, 3;
