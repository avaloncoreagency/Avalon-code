# Avalon OS — Auth, RLS and founder onboarding

## Confirmed access policy
- The two founding partners will both receive the **owner** role, with identical authorization.
- Both must have separate Supabase Auth identities and separate verified email addresses.
- Roles are assigned **only by a trusted administrator** after checking the Auth user IDs.
- No self-service signup or client-side role escalation is allowed.
- Do not insert founders' emails, passwords, UUIDs or secret API keys into Git.

## Existing implementation (feature branch only)
- Supabase SSR browser/server clients and cookie refresh middleware.
- Password login form and server action; private dashboard gated by membership.
- Draft migration: `public.profiles` and `public.agency_memberships`, RLS enabled.
- Membership policies only allow a user to read their own membership.
- Profiles are readable only to their own authorized members.
- Application users have no INSERT/UPDATE/DELETE grants or policies.
- No customer-data tables or access have been added.

## Invite-only provisioning checklist (after emails are provided)
1. In Supabase Auth, restrict public signups and configure Site URL and redirect allowlist.
2. Invite each founder to their **own** email using the Supabase admin dashboard.
3. Confirm each account is verified; retrieve the actual `auth.users.id` values.
4. After migration has passed isolated tests and is explicitly approved for production, insert one `agency_memberships` row for each verified UUID with `role = 'owner'` using a trusted admin session.
5. Create matching `profiles` records as needed.
6. Test sign-in and sign-out separately for both accounts, plus unauthorized and anonymous sessions.
7. Verify no customer data can be read before successful authorization.

## Verification matrix (must run against isolated local Supabase before deployment)
| Scenario | Expected result |
|---|---|
| Anonymous SELECT profiles/memberships | Denied or zero rows |
| Authenticated user with no membership | Can read no profiles; can read no membership |
| Owner A reads own membership and profile | Own rows only |
| Owner A attempts to read Owner B's rows | Zero rows |
| Owner B reads own membership and profile | Own rows only |
| Owner A/B attempts INSERT, UPDATE, DELETE membership | Denied |
| Owner A/B attempts INSERT, UPDATE, DELETE profile | Denied |
| Invalid credentials | No session or dashboard access |
| Signed-out user visits /dashboard | Redirected to /login |
| Authenticated non-member visits /dashboard | Redirected to /login |
| Signed-in owner visits /dashboard | Allowed |
| Session expiration/refresh and sign-out | No stale authorized access |

## Blocking items before merge
- Run `npm install` to produce and review a lockfile, then `npm run typecheck` and `npm run build` in CI.
- Install or verify the `server-only` dependency and review SSR package versions.
- Generate a properly named migration using the Supabase CLI; the existing SQL file was staged manually.
- Execute the migration and the verification matrix **only in an isolated development database**.
- Configure Supabase Auth redirect URLs, invite-only access and rate limits.
- Test the server-side middleware and login UX; add a visible error message and sign-out flow.
- Review GitHub repo visibility: the repository was previously reported as public.
- Review the existing Vercel Git integration: feature branches / PRs may trigger preview deployments automatically.
- Explicitly approve any production migration, PR merge, and deployment separately.

**Current status:** prepared for review, not production-ready. No database migration applied; no invitations sent.
