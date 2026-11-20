-- Avalon OS · P0.2 Close the direct anonymous path to the public intake RPCs. REVIEW ONLY.
-- NOT a migration: it is intentionally excluded from automatic replay and MUST NOT be applied to production until:
--   1. the owners authorize it separately, with a verified backup;
--   2. AVALON_INTAKE_JWT_SECRET (the project's JWT signing secret) is configured server-side in Vercel, never in the
--      browser, and Supabase confirms it still verifies HS256 tokens for this project (legacy JWT secret);
--   3. the app version that signs the intake token (src/lib/supabase/intake.ts) is deployed FIRST.
-- Applying it before step 3 would make every website form submission fail (fail closed, not open).
--
-- Today anon can POST /rest/v1/rpc/crm_public_inquiry directly, skipping the Next.js server, its per-IP limit and the
-- Turnstile check. After this change only the dedicated role can execute the two intake functions:
--   * avalon_intake: NOLOGIN, no table privileges, no BYPASSRLS, EXECUTE on exactly two functions;
--   * the server presents a 60-second JWT { role: "avalon_intake" } signed with the project secret, so PostgREST
--     switches to that role. No service_role key is used and nothing reaches the browser.
-- Both functions stay SECURITY DEFINER with their existing validation, throttling and honeypot.

begin;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'avalon_intake') then
    create role avalon_intake nologin noinherit;
  end if;
end $$;
-- PostgREST connects as "authenticator" and switches to the JWT role; it must be allowed to.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'grant avalon_intake to authenticator';
  end if;
end $$;

grant usage on schema public to avalon_intake;
revoke all on function public.crm_public_inquiry(jsonb) from public, anon, authenticated;
revoke all on function public.crm_growth_funnel_submit(jsonb) from public, anon, authenticated;
grant execute on function public.crm_public_inquiry(jsonb) to avalon_intake;
grant execute on function public.crm_growth_funnel_submit(jsonb) to avalon_intake;
-- Public funnel pages still need to READ their published definition anonymously (unchanged).

commit;

-- Rollback (restores the current behavior):
--   grant execute on function public.crm_public_inquiry(jsonb) to anon;
--   grant execute on function public.crm_growth_funnel_submit(jsonb) to anon;
--   revoke execute on function public.crm_public_inquiry(jsonb), public.crm_growth_funnel_submit(jsonb) from avalon_intake;
