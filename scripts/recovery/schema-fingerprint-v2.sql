-- Read-only catalog fingerprint. No customer rows, credentials or function bodies are returned.
-- Unlike v1, covers policy predicates, defaults, indexes, trigger definitions and signature-specific grants.
with namespaces as (
 select oid,nspname from pg_namespace where nspname in ('public','crm_private','os_private')
), tables as (
 select c.* from pg_class c join namespaces n on n.oid=c.relnamespace
 where c.relkind in ('r','p','v') and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
), functions as (
 select p.* from pg_proc p join namespaces n on n.oid=p.pronamespace
 where p.prokind='f' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
), entries as (
 select 'tables' as section,c.oid::regclass::text as identity,
  c.relkind::text||':'||c.relrowsecurity||':'||c.relforcerowsecurity as definition from tables c
 union all
 select 'columns',c.oid::regclass::text||'.'||a.attname,
  format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull||':'||a.attidentity::text||':'||a.attgenerated::text||':'||coalesce(pg_get_expr(ad.adbin,ad.adrelid),'')
 from tables c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
 left join pg_attrdef ad on ad.adrelid=c.oid and ad.adnum=a.attnum
 union all
 select 'constraints',c.conrelid::regclass::text||'.'||c.conname,pg_get_constraintdef(c.oid)||':'||c.convalidated
 from pg_constraint c join tables t on t.oid=c.conrelid
 union all
 select 'policies',p.polrelid::regclass::text||'.'||p.polname,
 p.polcmd::text||':'||p.polpermissive||':'||coalesce((select string_agg(case when role_id=0 then 'PUBLIC' else role_id::regrole::text end,',' order by role_id) from unnest(p.polroles) role_id),'')||':'||coalesce(pg_get_expr(p.polqual,p.polrelid),'')||':'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')
 from pg_policy p join tables t on t.oid=p.polrelid
 union all
 select 'triggers',t.tgrelid::regclass::text||'.'||t.tgname,pg_get_triggerdef(t.oid)||':'||t.tgenabled::text
 from pg_trigger t join tables c on c.oid=t.tgrelid where not t.tgisinternal
 union all
 select 'indexes',i.indexrelid::regclass::text,pg_get_indexdef(i.indexrelid)||':'||i.indisvalid||':'||i.indisready
 from pg_index i join tables t on t.oid=i.indrelid
 union all
 select 'functions',p.pronamespace::regnamespace::text||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
 p.prosecdef::text||':'||p.provolatile::text||':'||p.proleakproof||':'||pg_get_function_result(p.oid)||':'||coalesce(array_to_string(p.proconfig,','),'')||':'||md5(p.prosrc)
 from functions p
 union all
 select 'function_grants',p.pronamespace::regnamespace::text||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')->'||case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end,
 a.privilege_type||':'||a.is_grantable
 from functions p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 union all
 select 'table_grants',t.oid::regclass::text||'->'||case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end||':'||a.privilege_type,a.is_grantable::text
 from tables t cross join lateral aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a
 union all
 select 'default_grants',d.defaclnamespace::regnamespace::text||':'||d.defaclrole::regrole::text||':'||d.defaclobjtype::text||'->'||case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end||':'||a.privilege_type,a.is_grantable::text
 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
 where d.defaclnamespace=0 or d.defaclnamespace in(select oid from namespaces)
)
select section,count(*)::int as objects,md5(string_agg(identity||'='||definition,E'\n' order by identity,definition)) as digest
from entries group by section order by section;
