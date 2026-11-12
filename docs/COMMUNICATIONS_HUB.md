# Avalon AI Communications Hub — 2026-11-12

**Branch:** `chatgpt/communications-hub-20261112`  **Review PR:** #164 → `integration/avalon-v1`.
**State:** development-only, no production changes. Source #155/#159 hub and #141 chatbots proposal, with safer integration into existing services.

## Product architecture
- **Hub:** `/admin/workspace/ai-communications` — owner-only, ES/EN status and routes to both independent products, CRM calendar, and CRM clients.
- **AI Chatbots:** `/admin/workspace/ai-chatbots` Library, `/builder`, `/[id]`, `/[id]/studio`. Uses `os_projects(module='chatbots')` and private `settings.chatbot`; validated owner server action, RLS and optimistic version protection. The configuration editor is **not** an inference engine and does **not** serve a public widget.
- **AI Receptionist:** existing `os_projects(module='receptionist')` and `os_receptionist_entries` with hours, FAQ, handoff. Legacy `/[id]/studio` saved data is **preserved** and labeled legacy; future new bots go into the independent chatbots product.
- **Client identities:** reuse existing `settings.operations.client_lead_id` (a real `crm_leads.id`) and existing projects/audit. No second backend or duplicate CRM customer table.
- **Knowledge Base:** separate per-product drafts only; sharing, source consent, revocation and versioned RLS not yet implemented.
- **Conversations, telephony, appointment confirmation, provider analytics:** NOT CONNECTED. Existing CRM calendar is the only real appointment tool. No messages, calls, appointments, provider spending or fabricated metrics.

## Security and migration
`supabase/migrations/20261107090000_ai_chatbots_module.sql` adds `chatbots` to the existing project module check. It preserves RLS policies, triggers, grants and original receptionist records. **Do not apply until security review, isolated Postgres and Supabase Preview tests, owner approval and rollback preparation.** If branch #141 is later merged, deduplicate this migration; never reapply it blindly.

`tests/sql/chatbots_module_rls.test.sql` adds synthetic two-owner, outsider, operator and anonymous checks. The existing OS modules workflow now exercises the new migration. Client-side module navigation is not authorization; server `requireOwner`, `ownerForAction` and database RLS remain mandatory.

## Acceptance checklist (not yet release approval)
1. Exact SHA: GitHub CI all required jobs green incl. `npm test`, typecheck, lint, build and SQL RLS.
2. Isolated Supabase: both owners can create different chatbots, open/edit/save/reload and see shared agency projects, outsider cannot read or write; version conflict preserves unsaved work.
3. Verify old receptionist knowledge/FAQs and legacy Nova projects survive unchanged.
4. Test navigation and visual layout at 320/390px iPhone + desktop, language ES/EN, screenreader labels and server-side denial.
5. Verify no external charges, AI responses, provider integrations, public widget or placeholder conversations. Resolve Vercel Preview isolation issue without pointing at production Supabase.
6. Reconcile #141 and #160 before any later integration into `main`.

**Rollback:** revert PR #164 while still unmerged; SQL unapplied outside isolated tests. For future deployment, a down migration must be reviewed and pre-existing bot projects handled without data loss.
