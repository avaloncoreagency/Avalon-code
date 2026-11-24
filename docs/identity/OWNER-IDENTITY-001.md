# Permanent user display identity — OWNER-IDENTITY-001 / #335

All users are displayed through `src/lib/identity/owners.ts`. Existing profile display/full names are the source for other users; no email-prefix or UUID fallback. Miguel Hobaica and Samuel Muñoz have official aliases for historical owner labels and known account emails. This registry has no authority to grant membership or identify authenticated users.

`directory.ts` reads the existing RLS-protected office directory and selects owner records for existing owner assignment controls. It does not grant staff access to that directory; future staff screens must supply only their authorized subset to the same pure resolver. Permission errors do not trigger a fallback around RLS. Schema-missing fallback can read the existing owner directory, with missing profile names displayed as unavailable.

Consumers include session greetings, shell/profile overrides, CRM cards/table/forms/KPI labels/history, Client 360, sales/commissions/assignments, calendar, product audit/manual tests/notes/assignments, office/team chat, Dev Bridge pages and private CSV, quote editor/new canonical submissions and PDF author presentation. Existing contact email fields remain contact email fields. Internal UUIDs, form values, routing and attribution keys remain unchanged.

Historical quote canonical serialization/hash is unchanged. Rendering normalizes the explicit seller label on a detached PDF representation; original content, stored hashes, audit rows, signed documents and consolidated binary files are never rewritten. New quote submissions normalize the explicit seller field. Legal contracting-party names and client names are not globally replaced: they are legal/customer content, not account display identity.

## Verification and release
New tests cover known aliases, false matches, accented Samuel Muñoz, other profile users, missing directory labels, denied RLS, immutable directory/snapshot/digest, ES/EN PDF author and authorization separation. Existing mocks were extended to import the real identity resolver; authorization assertions remain intact. Repository-wide unit/type/lint/build and Chromium commercial regressions are required before release. Physical Safari not certified.

Main base: 04969aaf5cc329f2d659108cc84ea076be225800. Narrow overlaps with #330 Sales, #326 Dev Bridge and #332 shell were announced in their PRs. Their branches/migrations are not part of this change. The owner's explicit request authorizes merging/publishing this identity improvement after validation; it does not authorize unrelated staff/finance changes or Supabase mutations. No SQL/migrations/config/credentials are changed.

Rollback: revert the presentation commit and rebuild; no data rollback required. Future modules must consume this policy (also recorded in AGENTS.md). Missing full names require user profile completion, never invention or copying another user's identity.
