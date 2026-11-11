# AVALON GROWTH 001 — AI Communications / Marketing Hub

**Status (2026-11-10):** Isolated implementation candidate. No merge, production migration, launch, advertising, payments or external communications are authorized by this PR.

## Scope and source of truth

Avalon remains one Next.js application and one CRM. This change is additive, not a second backend:

- **AI Communications Hub** `/admin/workspace/ai-communications`: navigation and truthful readiness for AI Chatbots (PR #141, independent), existing AI Receptionist, shared Knowledge Base contract, Conversations, Appointments (existing CRM calendar) and Analytics.
- **Marketing Hub / Growth** `/admin/workspace/marketing-hub/growth`: links existing Campaigns to new Funnel Builder, Meta Ads planning, Marketing Analytics, Marketing Automations and Creative Bridge. Does not replace `os_marketing_items`.
- **Funnel Builder** `/admin/workspace/marketing-hub/funnels` (owner only): capture, sales inquiry, appointment-request templates; saves a *draft* until an owner explicitly activates it. Optional exact `crm_clients.id` and `os_projects.id` associations.
- **Public form** `/f/[slug]`: dynamic and noindex; the public RPC returns only published/active copy. The visitor explicitly checks consent; the server never reveals the CRM ID.

The original public quote `crm_public_inquiry` is untouched: it still creates a **pending prospect for owner review**. Growth forms are a separate, explicit inbound, opt-in channel. Radar's approval requirement for researched/unsolicited businesses is unchanged.

## Proven inbound flow — required P0

`Owner draft → explicit activation → GET /f/[slug] → company/name/email/message + consent → Next Server Action → Supabase publishable/anon RPC → SQL anti-spam/idempotency → crm_leads(stage='new') → crm_growth_funnel_submissions(lead_id, funnel_id)`

- `docs/sql/growth-funnel-prototype.sql` is **proposal only**. Tests apply it to disposable PGlite **after** current Avalon migrations; it is not included under `supabase/migrations` and is not applied remotely.
- `crm_growth_funnels`: project ID, optional client ID, owner, template, headline, CTA, draft/active/paused/archived, version, timestamps. No separate customer identity.
- `crm_growth_funnel_submissions`: funnel ID, canonical lead ID, email hash, visitor message, verified consent timestamp; unique `(funnel_id,email_hash)`. Owner-only SELECT; no anon table read or write.
- `crm_growth_funnel_view(slug)`: public *read-only* RPC for active page copy. No client IDs, private history or contacts.
- `crm_growth_funnel_submit(request)`: **the only new anon write capability**, narrow SQL SECURITY DEFINER with fixed `search_path`, validated size/fields/consent, honeypot, global 30/hour and per-email 3/day, serialized deduplication. Reuses existing CRM lead with exact normalized email; otherwise inserts one stage `new` lead audited under the approved owner, with `source='Funnel: <slug>'`. Replays return generic `ok` without a duplicate lead.
- **No** CRM client, sale, invoice, appointment, conversation, outbound email, phone call, ad or external spend is created. The **existing CRM stage trigger** creates one **internal pending follow-up activity** on initial insertion; this is a task inside Avalon, NOT an external communication. Replays do not duplicate it. A sales/cita funnel is *only* a request. No pageview stats/ROAS are guessed.

### Privilege review required (SHIN + Claude)

The write RPC is a deliberate *privileged public intake exception*. It sets the assigned, currently authorized owner claim temporarily to satisfy Avalon's existing CRM stamp/audit triggers. This follows the existing `crm_public_inquiry` pattern, **but expands it to create a lead**. Before migrating to any Supabase environment outside disposable test fixtures, review abuse and privacy risks, trigger behavior, lack of ownership escalation, rate limits, single-agency assumptions, retention and erasure. Do not grant anon INSERT on CRM tables, expose service-role keys or disable RLS. SHIN must generate a new migration with Supabase CLI, run advisors and provide rollback. The SQL proposal must not be copied to production.

### Integration and deduplication contract

- New lead identity: `crm_leads.id`, NOT the raw name/email or the campaign.
- Funnel origin: `crm_growth_funnel_submissions.funnel_id` + `lead_id` + consent timestamp; `crm_leads.source` marks the *first* creation source, while subsequent submissions preserve additional attribution without changing the original lead.
- Optional funnel ownership: `crm_growth_funnels.client_id` references existing `crm_clients.id`; `project_id` references existing `os_projects.id` (Marketing project, verified by owner UI). No automatic identity matching by company name.
- Existing lead by email: reuse it; never overwrite owner, stage, client, value or contact information. A duplicate submit for the same funnel+email creates zero extra rows.
- `crm_public_inquiry` for quotes, Radar research and `crm_convert_prospect` are not modified. Inbound leads never imply confirmed sales.
- Funnel analytics: exact CRM leads where `source LIKE 'Funnel: %'` and exact number of submissions, if SQL succeeds. These are two different counts. Missing migrations or provider data show unavailable, not zero.

## AI Communications Hub handoff (HARU + SHIN + Claude)

The existing **AI Receptionist** stays independent. AI Chatbots' Library/Builder is owned by draft PR #141. Do not cherry-pick or implement a duplicate chatbots module here.

Future authorized, owner-scoped contracts:

`knowledge_documents` (not installed): `id,client_id,source_ref,approved_by,approved_at,version,checksum,allowed_products:['chatbot','receptionist'],access_status`; no raw document is shared by default. Indexing, revocation, and allowed retrieval must pass RLS/consent checks. Conversations will need `id,client_id,product_kind,source_provider,consent_at,provider_event_id,started_at,status` plus provider-specific permission, deletion and retention rules. `Appointments` reuse existing CRM calendar IDs and require explicit confirmation. No fake conversations or LLM output.

## Marketing Hub contracts (REN + HARU + SORA)

- Campaigns remains `os_projects(module='marketing')` and `os_marketing_items` for multichannel planning. Proposed internal budget fields `budget_planned,currency,approval_status,approved_by` need reviewed persistence. **Do not map planned budget to spent**.
- Meta Ads is **NOT_CONNECTED**. Official Meta Marketing API access requires authorized accounts and tokens; `ads_read` for read/reporting, `ads_management` for management; the separate Marketing API Access Tier controls larger rate limits/feature access. Ads from customer accounts may require App Review/business verification and appropriate authorization. Never infer a connected Meta account from a URL, run any API call or publish an ad without account+budget authorization.
- Funnel and Campaigns share Marketing project IDs; CRM is canonical for incoming leads. Marketing Automations must later require consent, per-client suppression/DNC, owner control, idempotency and provider quota checks.
- Creative Assets reuse `/admin/creative-bridge` and its content-addressed, approved library. PR #151 is a separate draft; a `reference_only` receipt is not an imported asset or an ad creative approved for use.

Official Meta documentation: https://developers.facebook.com/docs/marketing-apis/ ; https://www.postman.com/meta/facebook-marketing-api/collection/0zr4mes/facebook-marketing-api-mapi ; https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/ .

## Verification

1. `NODE_PATH=./tests/qa/node_modules node --test tests/growth-funnel.database.cjs` — real isolated PGlite tables/functions/CRM triggers, anon vs owner vs non-owner, consent, honeypot, throttles, replay, three funnel templates and an exact single lead; 0 fake sales and appointments.
2. `node --test tests/growth-funnel.test.cjs` — template and UI guard checks.
3. `npm run build`, `npm run typecheck`, `npm run lint`.
4. `NODE_PATH=./tests/qa/node_modules node --test tests/growth-funnel.http.cjs` after build and installing Playwright Chromium — actual 390px form through Next Server Action, synthetic Supabase HTTP to PGlite, one lead on replay. No live DB.
5. Exact-SHA GitHub Actions logs are the proof; these instructions alone are **not** proof of success. Vercel Preview must use a completely isolated Supabase database. Do not bypass `next.config.ts` safeguard.

## Blockers / next handoff

- **SHIN + Claude:** security review, SQL migration from this isolated proposal, rollback, separate staging URL/keys and test against isolated Supabase before any production release.
- **KENJI:** verify the exact PR SHA CI and mobile browser; then hosted Preview 320/390px, no horizontal overflow, non-owner rejection, retry, form validation and failure messages.
- **REN + HARU:** reconcile PR #141 navigational entry points, real client/project associations, CRM lifecycle and owners' approval controls; no duplicate module or database.
- **SORA:** after staging approval, verify a single synthetic visitor's submission returns a real UUID in CRM, with `crm_growth_funnel_submissions.lead_id` matching and zero duplicates, before declaring an E2E live.
- **No production changes, merge, Meta APIs, paid telephony, advertising, credentials, emails or Higgsfield credits in this mission.**

Rollback: revert this PR and leave the proposal unapplied. Any later reviewed migration requires its own tested down-migration.
