-- AVALON GROWTH · public funnel intake grant. NOT A MIGRATION.
-- Apply ONLY after the owner approves the security review in docs/handoff/CRM_BACKEND_CONTRACT.md §6, on top of
-- supabase/migrations/20261112090000_crm_titan_backend.sql. It exposes exactly two SECURITY DEFINER functions to
-- anonymous visitors: a display-only read and a bounded, validated, throttled intake that writes at most one lead.
-- When approved, copy it into a dated migration and add both names to the anonymous-definer allowlist asserted in
-- tests/agents-engine.database.cjs (that test must change in the same reviewed PR).
-- Rollback: revoke execute on both functions from anon.
begin;
grant execute on function public.crm_growth_funnel_view(text) to anon;
grant execute on function public.crm_growth_funnel_submit(jsonb) to anon;
commit;
