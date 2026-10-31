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

- `npm test`: 18 passing tests with synthetic identities and mocked Supabase.
- `npm run typecheck` and `npm run build`: passed (Next.js 15.5.28).
- `npm audit --omit=dev`: zero reported vulnerabilities. Exact PostCSS and sharp
  overrides address transitive advisories without a Next.js major migration.
- Chromium: 1440×1000, 768×1024 and 375×812; no horizontal overflow or JS errors.
  EN/ES persistence, missing-config error, public home, private redirects and
  API 401 verified against the local production build.
- `npm run lint`: blocked by the pre-existing missing ESLint 9 flat configuration
  (`ESLint couldn't find an eslint.config.(js|mjs|cjs) file`).
- Live Google login, owner accounts, session renewal/logout and database RLS are
  pending the approved nonproduction setup above; no real identities were used.
