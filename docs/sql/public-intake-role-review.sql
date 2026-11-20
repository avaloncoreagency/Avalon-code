-- Avalon OS · P0.2 Close the direct anonymous path to the public intake RPCs. REVIEW ONLY.
-- NOT a migration: intentionally excluded from automatic replay. MUST NOT be applied to production until the owners
-- authorize it separately, with a verified backup, AND the app version that sends the intake token is deployed first
-- (otherwise every website form submission fails closed).
--
-- Why not a custom JWT role: we cannot verify (without handling the project's private JWT secret) that this Supabase
-- project still accepts HS256 tokens signed with a legacy secret; projects on asymmetric signing keys would reject them.
-- This design needs no JWT and no privileged key. It reuses the repository's existing token-gated pattern
-- (os_bridge_api_* functions take a token whose SHA-256 is stored server-side):
--   * the Next.js server holds AVALON_INTAKE_TOKEN (server-only env, >= 32 chars, never NEXT_PUBLIC_);
--   * the database stores only its SHA-256 in crm_private.intake_tokens (no table grants to anon/authenticated);
--   * anon may execute ONLY the two gated wrappers, which reject a missing/unknown/revoked token before doing anything,
--     then call the existing intake functions (validation, honeypot, throttling and dedupe unchanged);
--   * anon loses EXECUTE on crm_public_inquiry / crm_growth_funnel_submit, so the Supabase REST API can no longer be
--     used to skip the server's Turnstile and per-IP checks.
-- Rotation: insert a new hash, deploy the new token, then set revoked_at on the old row. No downtime.

begin;

create table if not exists crm_private.intake_tokens (
  token_sha256 text primary key check (token_sha256 ~ '^[0-9a-f]{64}$'),
  label text not null default '' check (length(label) <= 80),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
revoke all on crm_private.intake_tokens from public, anon, authenticated;

create or replace function crm_private.intake_token_valid(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(length(p_token) between 32 and 256, false) and exists (
    select 1 from crm_private.intake_tokens t
    where t.token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and t.revoked_at is null)
$$;
revoke all on function crm_private.intake_token_valid(text) from public, anon, authenticated;

create or replace function public.crm_public_intake(request jsonb, p_token text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not crm_private.intake_token_valid(p_token) then return 'unavailable'; end if;
  return public.crm_public_inquiry(request);
end $$;

create or replace function public.crm_public_funnel_intake(request jsonb, p_token text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not crm_private.intake_token_valid(p_token) then return 'unavailable'; end if;
  return public.crm_growth_funnel_submit(request);
end $$;

revoke all on function public.crm_public_intake(jsonb, text) from public, authenticated;
revoke all on function public.crm_public_funnel_intake(jsonb, text) from public, authenticated;
grant execute on function public.crm_public_intake(jsonb, text) to anon;
grant execute on function public.crm_public_funnel_intake(jsonb, text) to anon;
revoke all on function public.crm_public_inquiry(jsonb) from public, anon, authenticated;
revoke all on function public.crm_growth_funnel_submit(jsonb) from public, anon, authenticated;

-- Register the server token (run separately, with the real value hashed OUTSIDE this repository):
--   insert into crm_private.intake_tokens(token_sha256, label) values ('<sha256 hex of AVALON_INTAKE_TOKEN>', 'vercel-production-2026-11');

commit;

-- Rollback (restores current behavior):
--   grant execute on function public.crm_public_inquiry(jsonb) to anon, authenticated;
--   grant execute on function public.crm_growth_funnel_submit(jsonb) to anon;
--   drop function public.crm_public_intake(jsonb, text); drop function public.crm_public_funnel_intake(jsonb, text);
