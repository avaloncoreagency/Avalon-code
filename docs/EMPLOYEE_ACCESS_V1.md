# Avalon OS v1 — Employee access implementation contract

Status: specification only. No employee accounts or real privileges changed.
Branch ownership: core/security work; Samuel's CRM branch must not overwrite shared authorization or HUD navigation without coordination.

## Roles and permission semantics
- `owner`: global control, initially Miguel and Samuel only, assigned using trusted Supabase Auth UUID and membership in server-owned data.
- `employee`: never global owner; receives explicit permissions per module.
- Permissions: `none`, `view`, `edit`, `manage`. Each higher level includes lower capabilities *inside that module only*.
- No implicit permission on missing row. Fail closed.
- Modules (canonical slugs from `src/components/suite/modules.ts`): `crm`, `website-designer`, `ecommerce-designer`, `crm-creator`, `ai-receptionist`, `marketing-hub`.
- Example only: CRM edit; Website Designer view; E-commerce Designer none; CRM Creator none; AI Receptionist view; Marketing Hub none.

## Invitation flow
1. Authenticated owner opens profile menu -> Invite employees.
2. Owner enters email and grants explicit permissions, optionally expiration.
3. Server verifies owner membership by UUID, validates allowed module slugs and levels, creates an expiring one-time invitation with hashed token and records inviter. Do not store raw tokens or expose them to analytics/logs.
4. Invitee verifies email via supported Supabase Auth flow; token consumption must atomically check expiration, use count, invited email, verified identity, and membership state.
5. If manual approval is required, create a pending employee and require owner approval *after* verification; no access before activation.
6. Owners can revoke employee access and invitations; revocation must take effect on every server request. Maintain audit trail for grant, change, activation and revocation.
7. Do not implement public self-signup or allow an invitation to assign `owner`.

## Server enforcement
- Validate membership and permission on every private module page, server action and API route. Hiding a card in UI is not authorization.
- Scope all CRM business data to authorized tenant/workspace and use Supabase RLS. Never rely on email string, user_metadata or browser-provided role.
- Auth middleware may redirect unauthenticated visitors, but resource handlers must independently authorize direct requests.
- Keep privileged service-role keys on server only. Apply schema/RLS migrations only to isolated Preview after review.

## UI contract
- Top-right profile menu shows authenticated identity and logout to everyone.
- Invite Employees and Manage Access are owner-only functional actions *after backend enforcement exists*.
- Employee menu excludes owner-only links. Inaccessible modules should be absent or clearly disabled, with direct URL and API returning forbidden.
- Accessible keyboard navigation and narrow iPhone viewport behavior are required.

## Implementation and verification
- Create additive migration for membership role/permission records, invitation records, audit events, and RLS; migration must be reviewed before application.
- Centralize module slug and permission definitions; avoid duplicating constants between navigation, pages and backend.
- Unit/integration cases: owner; employee none/view/edit/manage; unapproved; revoked; expired/replayed invitation; wrong email; direct API bypass; no public signup.
- Performance baseline: measure duplicated Supabase Auth/member lookups on one dashboard navigation; optimize only with safe request-scoped reuse and verified tests.
- Do not merge PR #5 until CI/build and iPhone UI review pass. Do not deploy production or invite real users as part of this specification.
