-- REVIEW ONLY. Production has an extra anon EXECUTE grant; staging/repository do not.
-- The current function is SECURITY INVOKER and checks is_owner: no anonymous restore was demonstrated.
-- Apply only after owner authorization and baseline ACL backup. No tables or data are changed.
begin;
do $$
begin
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.os_project_restore_version(uuid,text)') and not prosecdef
   and prosrc like '%os_private.is_owner()%') then
   raise exception 'Unexpected restore function; review before changing grants';
 end if;
end;
$$;
revoke execute on function public.os_project_restore_version(uuid,text) from public,anon;
commit;
-- Rollback: restore the captured ACL only if explicitly approved. Do not regrant anonymous access by default.
