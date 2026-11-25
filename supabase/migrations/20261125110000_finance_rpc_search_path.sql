-- Backend hardening (advisor 0011 function_search_path_mutable). Both read-model RPCs from
-- 20261124134350_sales_collections_read_model are SECURITY INVOKER and fully schema-qualified, so pinning an empty
-- search_path changes no result: it only removes the ability of a caller's session search_path to shadow objects.
begin;
alter function public.crm_sales_with_receivables(text) set search_path = '';
alter function public.crm_overdue_collection_metrics() set search_path = '';
commit;
