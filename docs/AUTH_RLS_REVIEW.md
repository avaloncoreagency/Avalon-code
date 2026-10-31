# Avalon OS — Auth and RLS review (draft)

## Scope
- Next.js browser/server Supabase clients using the publishable key.
- Membership-gated server helper; it must be called by every protected server route/action.
- SQL migration for profiles and agency memberships, both with RLS.
- No client-side role assignment, no self-service registration, no customer data.

## Important: NOT production-ready
- The current home page is public/provisional; no protected dashboard or login has been enabled.
- Implement and test cookie/session refresh middleware (or Next.js proxy) before protected routes.
- Set up Supabase Auth email sign-in, verified redirects and invite-only onboarding manually.
- Provision the two founders' user IDs and roles only through a trusted admin workflow.
- Confirm who should be 'owner' vs 'admin' before provisioning.
- Review table grants and RLS using actual anon, member, and non-member test sessions.
- Verify RLS in an isolated development Supabase project before production.
- Never expose service_role/secret keys in NEXT_PUBLIC_* or in GitHub.
- The SQL file is a draft for review; no migrations have been applied.
- Dependencies should be pinned with a reviewed lockfile before merging.
