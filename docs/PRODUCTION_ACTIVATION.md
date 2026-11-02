# Avalon production activation — release gates

Status: production domain is connected; login/dashboard release is NOT complete.

## Confirmed
- Vercel project: `avalon-core-agency` (`prj_tN1ZYrsx5fqoEePYjThsra3MvocP`).
- `avaloncoreagency.com` is verified and attached to this project.
- Current production deployment is main commit `4c55c5054db1d91d10ff338dbd345ba62745f2ff`, a public placeholder.
- Login/HUD is in PR #4, not main; profile dropdown is in draft PR #5.
- Production Supabase project `ltbwzcrxeuczdhhtbqgm` read-only audit found zero Auth users and no `public.agency_memberships` table.
- Vercel production `APP_ORIGIN=https://avaloncoreagency.com` and `AUTH_PASSWORD_LOGIN_ENABLED=false` have been configured. This does not deploy or enable login.
- Existing production publishable Supabase URL/key entries need their project reference verified before use. Never copy Preview branch keys into production.

## Required before release
1. Review/apply the existing owner membership migration to the production Supabase project; enforce RLS (self-read only; no client writes), with tests. Do not use manual SQL writes into `auth.users`.
2. Configure Supabase Auth site URL, exact redirect allowlist for `https://avaloncoreagency.com/admin/auth/callback`, email confirmation, provider, private signup settings and rate limits.
3. Create/verify only two owner Auth identities via trusted invitation/confirmation. Provision memberships by verified Auth UUID, not submitted email. Verify both owners can sign in and sign out, and nonmembers cannot enter.
4. Decide and validate email/password activation: production flag remains false until end-to-end verification. Set a server-only `AUTH_FLOW_SECRET` only when enabling invitation/recovery. Do not paste secret into source or chat.
5. Run CI lint/typecheck/build and integration tests against reviewed commit, plus staging auth/RLS checks.
6. Integrate PR #4 with the existing public site, preserving `/`; coordinate PR #5 separately. Stage a production build without domain alias, validate direct `/admin/login` and `/admin/dashboard` paths and session behavior, then promote.
7. After promotion test `https://avaloncoreagency.com/admin/login`, owners, logout, direct private API, public storefront, and rollback readiness.

## Safety
Never point production at a Preview Supabase branch, promote a Preview deployment as though it were a tested production build, enable public signup, or claim real owner login is ready before verified. Do not modify Samuel's CRM work as part of this release.
