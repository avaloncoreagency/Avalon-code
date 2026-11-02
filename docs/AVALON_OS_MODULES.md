# Avalon OS — HUD and modules (branch `feature/avalon-os-hud-modules`)

Status: implemented and approved by the owners. **Migration applied to the Supabase testing branch and to production (version `20261102070500`).** Merge order and production deploy are tracked in `docs/PRODUCTION_ACTIVATION.md`.

## What is operational vs pending

| Area | State | Notes |
|---|---|---|
| Login, OAuth, password, recovery, invitation | Operational (existing PR #4) + UX/a11y polish | Language cookie shared with the HUD; accessible show/hide password |
| HUD shell | Operational | Collapsible sidebar (cookie-persisted), mobile drawer, top bar with section, status, notifications, language, profile menu |
| Dashboard | Operational | Real counts only; elegant empty states; service status; recent audit activity |
| Website Designer | Operational once signed in as an owner | Projects, pages, block editor (hero/text/features/CTA), preview, versions + restore, draft/published (internal) |
| E-commerce Designer | Operational once signed in as an owner | Stores, products (SKU, category, price in minor units, inventory, https image), search, filters, pagination, catalog preview. No payments |
| CRM Creator | Operational once signed in as an owner | Entities/fields/pipelines/stages/roles, templates, JSON editor, JSON export, SQL preview (never executed) |
| AI Receptionist | Operational once signed in as an owner | Assistant config, hours, handoff, FAQ/knowledge CRUD, generated system prompt, token estimate. No provider connected; no simulated conversations |
| Marketing Hub | Operational once signed in as an owner | Campaigns, content items, status flow, editorial calendar, overdue tracking. Nothing posted externally |
| CRM | Samuel's PR #6 | Untouched. `/admin/workspace/crm` shows a placeholder until his static route merges and takes precedence |

Without the migration every module renders an honest "database pending" state; no data is invented.

## Architecture
- `src/lib/os/domain.ts` — pure validation/business logic (unit-tested, no I/O).
- `src/lib/os/data.ts` — Supabase access with the **user's** session; RLS is the final authority; error mapping.
- `src/lib/os/actions.ts` — `ownerForAction()` (every server action re-verifies identity + owner membership), safe internal redirects.
- `src/lib/os/integrations.ts` — provider registry + adapter contracts; all return `null` until approved.
- `src/lib/auth/session.ts` — one cached `getUser` + membership check per request.
- `src/components/suite/*` — shell. `Suite({ active })` API unchanged for the CRM branch.
- `src/components/os/*` — shared module UI (headers, flash, notices, forms, tables).
- Optimistic concurrency: every write filters by `version`; triggers bump it.

## Database — `supabase/migrations/20261102070500_avalon_os_modules.sql`
Tables: `os_projects`, `os_website_pages`, `os_website_page_versions`, `os_store_products`, `os_receptionist_entries`, `os_marketing_items`, `os_audit`.
- RLS on all; only `agency_memberships.role = 'owner'` passes (`os_private.is_owner()`).
- anon: no grants. Projects: no DELETE (archive instead). Versions and audit: append-only.
- Immutable `id/created_by/created_at/project_id/module`; author spoofing blocked by policy.
- Children can only attach to projects of their module.
- Verified in CI on PostgreSQL 16: `tests/sql/os_modules_rls.test.sql`.

### Applied
1. Testing branch first (22 policies, 15 triggers, no `anon` grants, no project DELETE; security advisors: 0 findings).
2. Production second, after explicit owner approval; same object counts verified.
3. `tests/sql/os_modules_rls.test.sql` runs on every PR in CI (PostgreSQL 16).
4. Migration files in the repo carry the exact versions recorded in production (`20261102053022`, `20261102053452`, `20261102070500`). The older draft files were removed because production superseded them; `profiles` is not used by the app.

### Rollback
- App: revert the merge commit / redeploy the previous Vercel deployment.
- Database (only if no real data must be kept): `drop table public.os_audit, public.os_marketing_items, public.os_receptionist_entries, public.os_store_products, public.os_website_page_versions, public.os_website_pages, public.os_projects cascade; drop schema os_private cascade;` — destructive, requires review.
