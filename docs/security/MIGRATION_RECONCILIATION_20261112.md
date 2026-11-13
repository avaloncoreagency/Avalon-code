# Migration reconciliation — Avalon OS · 12 November 2026

**Read-only audit — NO SQL applied to production.** Source: GitHub `main`, Supabase production migration records and isolated Preview migration records. Matching names **does not prove identical SQL contents**.

## Inventory

| Source | Recorded | Basis |
|---|---:|---|
| Repository `supabase/migrations` | 31 SQL files | GitHub `main` |
| Production Supabase | 26 applied entries | `supabase_migrations.schema_migrations` |
| Isolated Preview Supabase | 32 entries | The 31 names in `main` plus isolated AI Chatbots migration |

By exact migration name: 22 GitHub names appear in production and 31 appear in the isolated Preview.

## GitHub migrations with no matching name in production (9)

| File | Recommended action |
|---|---|
| `20261103113000_crm_client_workspace.sql` | Compare with production `crm_client_workspace_finance_access` and live objects |
| `20261103223000_staff_profiles_notifications.sql` | Compare with `staff_profiles_global_notifications` |
| `20261109160000_code_exchange.sql` | Compare with `code_exchange_with_anon_disabled` and existing `os_code_*` functions |
| `20261110140000_radar_search_runs.sql` | Candidate for isolated validation and planned production migration |
| `20261111090000_code_exchange_disabled.sql` | Review whether its `anon` revocations were already applied in production |
| `20261111100000_crm_intelligence.sql` | Candidate requiring contract/CRM compatibility checks |
| `20261112090000_crm_titan_backend.sql` | Candidate; must be reconciled against previous CRM tables |
| `20261112100000_crm_titan_documents.sql` | Candidate; review dependencies and Storage |
| `20261112110000_growth_funnel_public.sql` | Candidate; review public endpoints, grants and spam limits |

**Not all nine are safe to apply as new migrations.** At least some were already represented in production by different names or combined migrations.

## Production-only names (4)

- `20261103205807_crm_client_workspace_finance_access`
- `20261103212000_radar_scheduler_extensions`
- `20261103213432_staff_profiles_global_notifications`
- `20261112142022_code_exchange_with_anon_disabled`

## Same migration name, different version timestamp

`radar_source_research`, `radar_scheduler_core`, `radar_profile_prequalification`, `manager_execution`, `project_client_canonical`, `radar_rules_decisions`, `manager_missions`, `ai_engine`, `radar_owner_approval` and `project_bridge`.

## Preview-only migration

- `20261112170550_ai_chatbots_module_isolated_preview` — remains excluded from production until separately reviewed.

## Safe integration process

1. Obtain a restorable backup snapshot and perform a restore drill in an isolated project. Record rollback criteria.
2. Export and compare exact historical SQL for the production-only and renamed migrations against `main`. Include dependent triggers, grants, RLS, sequences, types, Storage policies and extensions.
3. For each proposed change, verify it is **not already present** in production under another migration identifier.
4. Create a forward-only migration on a fresh isolated branch that reproduces the reconciled production baseline; run PGlite/SQL tests, negative auth checks, data preservation, and CRM/Radar smoke tests.
5. If a migration cannot be made safe and idempotent, stop; do not blindly run it, delete migration history or mark it as applied.
6. Only after owner approval schedule production migration during a controlled release with verified backup and rollback steps.
7. Re-run Supabase advisors, verify the two owners' access, and validate the public quote intake.

## Additional security caution

`pg_net` is version `0.20.4` in schema `public`, with PostgreSQL `extrelocatable = false`. A blind `ALTER EXTENSION pg_net SET SCHEMA extensions` is not a valid repair. Determine a supported replacement/upgrade path and review dependencies first.

**Current result: migration inventory reconciled by name, content and deployment order NOT yet reconciled.** Do not declare production migration-complete.
