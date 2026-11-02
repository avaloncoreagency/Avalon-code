# Sprint 01 — private admin login

The confirmed routes are `/` (existing public page), `/admin/login`,
`/admin/auth/callback` and `/admin/dashboard`. GET `/login` and `/dashboard`
redirect to the canonical paths; the HUD and its logout action remain unchanged.
All `/admin/*` except the exact login/callback paths, legacy dashboard routes,
and all `/api/*` require a verified owner. Future public APIs need an explicit
policy. New private server actions must also call `getAuthorizedMember()`;
route handlers should do so before reading or changing data. Middleware is an
additional gate, not a substitute for operation-level authorization and RLS.

## Manual configuration (not performed)

- Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
  `APP_ORIGIN` per environment. Development example: `http://localhost:3000`.
  Use the actual HTTPS origin for preview/production. No service key is required.
- Configure a Google OAuth Web client, consent screen and (for testing) approved
  test accounts. Google authorized redirect URI is the Supabase project's
  `/auth/v1/callback`, not the application callback.
- Enable only Google in Supabase Auth and enter the client credentials there.
  Add each exact application `APP_ORIGIN/admin/auth/callback` to Supabase's
  redirect allowlist; set Site URL appropriately. Do not add broad wildcards.
- Keep `AUTH_PASSWORD_LOGIN_ENABLED=false`. Password code is retained behind
  that server-only flag; enabling it requires the provider decision to be reviewed.
  There is no public signup, invitation, membership insertion or automatic promotion
  in the application. Administratively provision the approved Auth identities and disable new
  signups in Supabase before enabling access; configure OAuth for those existing
  identities. An unapproved Google identity never grants application access.
- A trusted administrator must verify both approved founders' Google identities
  against their Supabase Auth UUIDs, then provision exactly those UUIDs as
  `owner` in `agency_memberships`. Both owners receive identical access. Do not
  grant access by matching a submitted email or editable user metadata.
- Review/apply the existing RLS migration separately with explicit approval.
  Confirm memberships allow only self-read and no client writes before real use.
- Verify both owners, an unapproved synthetic identity, cancellation, expired
  callback, refresh and logout against an approved nonproduction project.
  Local automated tests mock Supabase; they do not establish live Google/RLS success.

The decorative city SVG is a lightweight interpretation of the supplied reference,
not the original image. The UI intentionally makes no MFA or trusted-device claim.
No schema, real users or production settings were changed.

## Local verification — 2026-10-31

- `npm test`: 19 passing tests with synthetic identities and mocked Supabase.
- `npm run typecheck` and `npm run build`: passed (Next.js 15.5.28).
- `npm audit --omit=dev`: zero reported vulnerabilities. Exact PostCSS and sharp
  overrides address transitive advisories without a Next.js major migration.
- Chromium: 1440×1000, 768×1024 and 375×812; no horizontal overflow or JS errors.
  EN/ES persistence, missing-config error, public home, private redirects and
  API 401 verified against the local production build.
- `npm run lint`: passed with the Next.js/TypeScript flat configuration now included.
- `npm run test:integration`: real production Next.js + Supabase SSR over local
  HTTP, with synthetic Auth/Data endpoints: two owner UUIDs have identical
  access, PKCE challenge/verifier and cookies work, refresh renews the session,
  HUD logout clears cookies, callback replay/missing verifier and nonmembers
  are rejected. This verifies the application integration, not live Google/RLS.
- Read-only inspection of the linked Supabase project returned no tables in
  `public`; `agency_memberships` is absent. No SQL or provisioning was performed.
- Live Google login, owner accounts, session renewal/logout and database RLS are
  pending the approved nonproduction setup above; no real identities were used.

## Invitation and recovery extension

The testing database is the existing branch `feature/avalon-auth-rls`, reference
`thdgrczotqapnvcjefoi`, under the main project. Branch inspection and read-only SQL
confirm profiles and agency_memberships with RLS; do not repeat the migration.
The earlier main-project inspection did not describe this branch.

Routes now include `/admin/signup`, `/admin/forgot-password`,
`/admin/reset-password` and `/admin/auth/confirm`. Signup never calls signUp:
only an administrator-issued, verified invite allows password setup. Password
setup and membership provisioning are separate. Never provision the infrastructure
account as owner. Existing Google identities should be reused by UUID, with
password set on that same identity rather than creating a second account.

In testing only, set a random server-only AUTH_FLOW_SECRET (32+ characters),
keep AUTH_PASSWORD_LOGIN_ENABLED=false until Preview verification is approved,
and point Preview Supabase URL/key exclusively at the testing branch. Do not
copy the testing configuration to Production. Supabase's Auth rate limits must
remain enabled; configure email cooldowns and SMTP before sending real messages.
No application signup, invitation sender or membership writer is exposed.

Configure the branch's Invite user email template link as:
`{{ .RedirectTo }}/admin/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
and pass the exact Preview origin (no path) as redirectTo when an approved
administrator sends an invitation. For Reset Password use:
`{{ .SiteURL }}/admin/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`.
Set Site URL to the exact testing Preview origin; allowlist that origin plus
`/admin/auth/callback` and `/admin/reset-password`. Links are verified by Supabase
with expiry and one-time use; password forms additionally require a signed,
HttpOnly, 15-minute, user/purpose-bound cookie. No token is logged.

OAuth diagnosis: the testing branch's real authorize endpoint redirects to
accounts.google.com using Client ID
`e7k1bq8biu6r7c53dnbp9jo6bocnssuo.apps.googleusercontent.com` and the correct URI
`https://thdgrczotqapnvcjefoi.supabase.co/auth/v1/callback`.
For invalid_client, compare Supabase Authentication > Sign In / Providers >
Google > Client IDs against Google Cloud > Google Auth Platform > Clients >
the Web application's Client ID. Replace an absent/deleted/wrong ID there and
set Client Secret from that same client directly in Supabase. Add the callback
above under Authorized redirect URIs. Client validity/secret pairing cannot be
confirmed with the current tools. Never send the secret through chat.

No provider credentials, Preview environment variables or email templates were
changed, no invitations were sent, and no live email/Google success is claimed.

## Existing account confirmation without SMTP

Read-only audit on 2026-11-01: Samuel is confirmed with an owner membership;
Miguel exists unconfirmed without membership. Neither has a recorded first login.
Do not change auth.users with SQL or mark confirmation artificially.

A trusted operator with Supabase Auth Admin access can check the existing user UUID,
then call `auth.admin.generateLink({ type: 'magiclink', email: existingEmail })`.
This generates a link without sending mail. Use the returned hashed_token to build
`APP_ORIGIN/admin/auth/confirm?type=magiclink&token_hash=...`. Never print or commit
the token/link; deliver it only to Miguel through an independently verified private
channel. He must consume the link himself. The callback verifies it with Supabase
and permits choosing a password; it never creates an owner membership. Verify
email_confirmed_at and the same UUID afterward, then provision owner through the
trusted administrative process. Do not call generateLink for an unknown/nonexistent
email (it may create an account), and do not use updateUserById(email_confirm:true)
as a substitute for identity verification. Existing Supabase expiry/one-use rules apply.

No Auth Admin credentials or authenticated browser are available to this agent;
the link has not been generated or delivered. Google and email delivery are not
claimed as working. Public signup must remain disabled in hosted Auth settings.
