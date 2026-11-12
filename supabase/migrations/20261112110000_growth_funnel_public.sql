-- Public opt-in funnel intake: owner-approved exposure (2026-11-12) after the security review in
-- docs/handoff/CRM_BACKEND_CONTRACT.md §6. Grants anonymous visitors EXACTLY two SECURITY DEFINER functions:
--   crm_growth_funnel_view   — display strings of an ACTIVE Avalon funnel (never client/Type B funnels);
--   crm_growth_funnel_submit — bounded, validated, throttled intake that writes at most one lead at stage "new".
-- No table privilege is granted to anon. Rollback: revoke execute on both functions from anon.
begin;
grant execute on function public.crm_growth_funnel_view(text) to anon;
grant execute on function public.crm_growth_funnel_submit(jsonb) to anon;

-- The security posture review treats these two reviewed functions like the other approved public RPCs (same body as
-- 20261108100000 otherwise); any OTHER anonymous definer is still reported as a high finding.
create or replace function public.crm_agent_security_posture_internal() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare no_rls jsonb; anon_tables jsonb; anon_fns jsonb; findings jsonb := '[]';
begin
  select coalesce(jsonb_agg(c.relname order by c.relname), '[]') into no_rls from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  select coalesce(jsonb_agg(distinct g.table_name), '[]') into anon_tables from information_schema.role_table_grants g where g.table_schema = 'public' and g.grantee = 'anon';
  select coalesce(jsonb_agg(p.proname order by p.proname), '[]') into anon_fns from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and pg_catalog.has_function_privilege('anon', p.oid, 'execute') and p.proname not in ('crm_public_inquiry', 'crm_ai_public_control', 'os_bridge_api_open_import', 'os_bridge_api_import_status',
      'crm_growth_funnel_view', 'crm_growth_funnel_submit');
  if jsonb_array_length(no_rls) > 0 then findings := findings || jsonb_build_array(jsonb_build_object('severity', 'high', 'finding', 'Tablas públicas sin RLS: ' || no_rls::text)); end if;
  if jsonb_array_length(anon_tables) > 0 then findings := findings || jsonb_build_array(jsonb_build_object('severity', 'high', 'finding', 'Tablas con privilegios para anon: ' || anon_tables::text)); end if;
  if jsonb_array_length(anon_fns) > 0 then findings := findings || jsonb_build_array(jsonb_build_object('severity', 'high', 'finding', 'Funciones con privilegios de definidor ejecutables por anon: ' || anon_fns::text)); end if;
  return jsonb_build_object('findings', findings, 'scope', 'catalog_review_only',
    'owners', (select count(*) from public.agency_memberships where role = 'owner'),
    'non_owner_members', (select count(*) from public.agency_memberships where role <> 'owner'));
end $$;
revoke all on function public.crm_agent_security_posture_internal() from public, anon, authenticated;

commit;
