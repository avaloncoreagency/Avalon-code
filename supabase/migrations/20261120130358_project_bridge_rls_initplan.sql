-- Avalon OS · Performance (Supabase advisor auth_rls_initplan, 6 warnings). Applied to production 2026-11-20 with owner authorization (ledger 20261120130358).
-- Same predicates, evaluated once per statement instead of once per row: auth.uid()/is_owner() are wrapped in (select ...).
-- ALTER POLICY keeps each policy's name, command and roles; nothing is widened.
begin;
alter policy owners_insert on public.os_project_api_tokens
  with check ((select os_private.is_owner()) and created_by = (select auth.uid()));
alter policy owners_insert on public.os_project_deployments
  with check ((select os_private.is_owner()) and created_by = (select auth.uid()));
alter policy owners_insert on public.os_project_imports
  with check ((select os_private.is_owner()) and created_by = (select auth.uid()) and source_kind = 'upload');
alter policy owners_insert on public.os_project_publish_approvals
  with check ((select os_private.is_owner()) and approved_by = (select auth.uid()));
alter policy owners_insert on public.os_project_versions
  with check ((select os_private.is_owner()) and created_by = (select auth.uid()));
alter policy owners_seal on public.os_project_versions
  using ((select os_private.is_owner()) and created_by = (select auth.uid()))
  with check ((select os_private.is_owner()));
commit;
