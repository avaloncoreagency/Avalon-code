# Avalon production activation — release gates

Status (2026-11-02): **released to production.** `main` 86605d8 (PRs #7 → #4 → #1, merged with owner approval) is live at `https://avaloncoreagency.com` as Vercel deployment `dpl_282K8JhRBk7xL94pQc2kqvjRSvVf`.

## Verified after release
- `/` still serves the original public placeholder (unchanged).
- `/admin/login` renders the private login (Google; password sign-in disabled in production).
- `/admin/dashboard` without a session redirects to `/admin/login`.
- Production Supabase `ltbwzcrxeuczdhhtbqgm`: migrations `20261102053022`, `20261102053452`, `20261102070500` match the repo; RLS on every `os_*` table, no `anon` grants, no project hard delete; two owner memberships (Miguel, Samuel), infra account has no membership.

## Still requires a human (Supabase / Google dashboards)
1. Supabase Auth → URL Configuration: Site URL `https://avaloncoreagency.com`; redirect allowlist exactly `https://avaloncoreagency.com/admin/auth/callback` and `https://avaloncoreagency.com/admin/reset-password`.
2. Supabase Auth → Providers → Google enabled with the Google Cloud client; Google authorized redirect URI `https://ltbwzcrxeuczdhhtbqgm.supabase.co/auth/v1/callback`. Public signups disabled.
3. Enable leaked-password protection (security advisor WARN).
4. First real sign-in by each owner, then sign-out, then a non-member attempt (must be rejected).
5. CRM (Samuel, PR #6) is not merged; `/admin/workspace/crm` shows a placeholder until he approves its merge and its migration.

## Rollback
Promote the previous production deployment in Vercel (or revert the merge commit on `main`). Database changes are additive; see `docs/AVALON_OS_MODULES.md`.

## Original gates (historical)
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
