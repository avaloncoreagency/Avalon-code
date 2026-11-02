# Avalon CRM HUD — Implementation contract (2026-11-02)

Status: approved product requirements; implementation pending. Owner: Avalon Core Agency. This file supersedes no existing code. Claude work paused; do not assume its branch is merged.

## Navigation and hierarchy
Avalon OS main HUD -> CRM dedicated HUD. Keep Operations Center for platform health, errors, releases and upgrades OUTSIDE CRM.
CRM top navigation in exact order: Lead Hunter | Leads Pipeline | Ventas | Calendario | Tareas.
CRM landing top section: real token consumption and cost per available provider/agent, with unavailable metrics clearly marked; next, CRM notifications in two classes only: Urgentes and Normales. Urgentes displayed first and stay until resolved/acknowledged.

## Functional screens
1. Lead Hunter: independent lead acquisition HUD; search/discover, enrich, qualify, deduplicate, provenance and transfer to pipeline with audit trail. Do not assume third-party APIs exist.
2. Leads Pipeline: Odoo-like draggable Kanban by configurable lead stages, with owner, priority, notes, activity history, due date. Persist stage transitions and enforce authorization. Lead transfer must not duplicate organization/contact.
3. Ventas: separate draggable Kanban of opportunities, proposal, negotiation, won/lost; linked to original lead/contact/company. Preserve existing 13-stage configuration where applicable, do not silently replace with a new set.
4. Calendario: internal events and task due dates, owner assignment to Miguel or Samuel; timezone-aware, permission checked.
5. Tareas: internal agency task assignments between Miguel and Samuel or self-assigned; priority, status, deadline, comments, linked client/project optionally. Distinct from platform maintenance tasks.

## Engineering acceptance criteria
- Inspect current implementation and existing CRM schema before changes. Reuse rather than rewrite.
- Use existing Supabase Auth/SSR and RLS owner membership; no profile selector.
- Verify token usage from actual provider records; no fabricated balance or spend.
- Kanban drag/drop supports keyboard accessibility and persisted stage changes with optimistic rollback.
- Audit event for stage moves, assignments, lead transfer, notification resolution.
- No production migration without backups, migration review and rollback plan. Test in Preview first.
- Run npm run lint, npm run typecheck, npm run build, npm test; report actual results.
- Keep main and production untouched until validation. Do not claim feature completed without code and tests.

## Suggested delivery sequence
A. Inventory existing routes/components/schema and Claude work; B. CRM shell/navigation + top widgets; C. Lead Hunter; D. pipeline; E. sales; F. calendar/tasks; G. cross-module validation and Preview.
