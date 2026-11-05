# Avalon OS — Six product workspaces (structure only)

Goal: keep all existing client projects and their editing tools, expose **Library**
and **Builder** for six product workspaces, and add **AI Chatbots**.

| Workspace | Library | Builder entry | Already available | Future integration |
|---|---|---|---|---|
| Website Designer | /admin/workspace/website-designer | /admin/workspace/website-designer/builder | Web pages/block editor | Puck visual editor |
| E-commerce Designer | /admin/workspace/ecommerce-designer | /admin/workspace/ecommerce-designer/builder | Catalog, products/inventory | Visual storefront + reviewed checkout |
| CRM Creator | /admin/workspace/crm-creator | /admin/workspace/crm-creator/builder | Blueprint editor | Advanced visual design |
| AI Chatbots | /admin/workspace/ai-chatbots | /admin/workspace/ai-chatbots/builder | Owner-only project register after migration | Knowledge, chatbot workflow, embeddable widget |
| AI Receptionist | /admin/workspace/ai-receptionist | /admin/workspace/ai-receptionist/builder | Assistant config, FAQ, hours | Real-time voice/telephony |
| Marketing Hub | /admin/workspace/marketing-hub | /admin/workspace/marketing-hub/builder | Campaign and editorial calendar | Funnels, automation, attribution |

The Library is the existing index route; the Builder has its own private route
and links only to real saved projects, using the current editors. None of the new
Builder entry points pretends to provide a connected external AI provider, voice
call, payment or site publication.

## Data

AI Chatbots uses the existing `public.os_projects` table and the same owner-only
authorization, audit, project settings, version and CRM linking flows as other
workspaces. The additive allowed-module migration is
`supabase/migrations/20261107090000_ai_chatbots_module.sql`.
**Do not apply it to production without the owner's express approval.**
Until applied, creating a chatbot project will fail with the database's
module check constraint. No data is rewritten or lost by the migration.

No new secrets, subscriptions, network integrations or packages were installed.

## Validation

Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.
Verify EN/ES, iPhone navigation, all six Library/Builder links, and ownership
gating in a real Preview before asking to merge.

Next deliverables should be tackled one at a time, beginning with the visual
Website Designer editor (Puck only after license and bundle-size review).
