-- Security Recovery 2026-11-12: least-privilege future defaults for the
-- migration role postgres in the exposed public schema.
--
-- This affects FUTURE objects only. Existing ACLs, RLS policies, tables,
-- API grants and active sessions are not changed.
-- Explicit GRANT statements in future migrations remain mandatory.
--
-- Supabase docs: https://supabase.com/docs/guides/api/securing-your-api
-- The supabase_admin-owned defaults require a separate privileged action:
-- the postgres connection cannot ALTER DEFAULT PRIVILEGES FOR supabase_admin
-- (verified isolated with SQLSTATE 42501). Never silently claim coverage.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

-- PostgreSQL's built-in PUBLIC EXECUTE default for new functions is global,
-- so the global revocation is needed as well as per-schema revocation.
alter default privileges for role postgres
  revoke execute on functions from public;

-- Existing intentional public RPCs (quote intake, AI control, Bridge)
-- retain their current grants; new public RPCs must grant explicitly.
