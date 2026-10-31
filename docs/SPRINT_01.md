# Sprint 01 — Google OAuth and Avalon OS suite

## Architecture decision pending
The public domain layout (marketing site on apex + private app subdomain, or login on apex) has not been finalized. Avoid hard-coding a production host; use environment-aware redirect URLs and an explicit Supabase allowlist. Do not configure a production redirect until approved.

## Workstream A — Miguel / Codex A
Branch: `feature/sprint-01-miguel-google-auth`.
Ownership: `src/app/login/**`, `src/app/auth/**`, `src/lib/supabase/**`, `src/lib/auth/**`, Auth tests.
- Inspect existing SSR clients, middleware and current login.
- Implement `signInWithOAuth({ provider: "google" })` with safe callback URL.
- Implement callback exchanging authorization code for session, handling failures safely.
- Restrict private access via verified user identity and trusted membership. Do not provision actual owners yet.
- Provide setup instructions for Google Cloud OAuth client and Supabase Google provider without secrets.
- Include negative tests for nonmember and signed-out users.
- Do not touch dashboard layout files.

## Workstream B — Samuel / Codex B
Branch: `feature/sprint-01-samuel-suite`.
Ownership: `src/app/dashboard/**` UI and new `src/components/suite/**`, module placeholder routes.
- Preserve the existing server membership gate and sign-out action.
- Build responsive suite with navigation: Dashboard, CRM, Website Designer, CRM Creator, AI Receptionist, E-commerce, Marketing Hub.
- Each item must have a working protected destination, clearly marked MVP.
- Accessible keyboard navigation, mobile layout and consistent brand styling.
- Use no real customer data and do not change auth, migrations or middleware.

## Integration (after two PRs)
1. Each agent commits only its owned files and opens PR against `feature/avalon-auth-rls`.
2. Review both PRs, resolve conflicts and run full CI.
3. Verify OAuth with test identities, RLS, sign-out and redirects without changing production.
4. Confirm domain strategy, OAuth settings and owners' account activation separately.
5. Obtain explicit approval before merge to main, migrations, invitations or production deployment.

## Definition of done
- Two reviewed PRs, CI green, test evidence, no secrets in repository, and manual approval recorded.
- Merely opening PRs or writing code does not count as passing tests.

## Credit budget
- ChatGPT: one scope/acceptance document and final review.
- Codex A: OAuth and authorization only.
- Codex B: suite UI only.
- Claude: one targeted security review of OAuth/RLS after implementation, if necessary.
- Use CI logs before spending model tokens debugging.
