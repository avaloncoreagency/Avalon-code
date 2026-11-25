# E-mail, invitations and client experience — setup and current status

Mission AVALON-CLAUDE-CAX-OMEGA-001. This guide covers what is implemented in code and what still needs an
owner to configure. It contains **no credentials**: App Passwords and SMTP passwords never go in GitHub, Issues or
prompts.

## Where things live

| Area | Location in Avalon OS | Owner of the code |
| --- | --- | --- |
| Agent invitations and agent management | **AGENT PORTAL** — sidebar entry directly above «Configuración» (`/admin/staff`) | Staff portal: Codex (#341/#342). Invitation identity panel: `src/components/agents/invitation-panel.tsx` (this PR) |
| Client e-mail sender, support e-mail/phone/hours, welcome preview | Configuración → Comunicaciones con clientes (`/admin/settings/communications`) | This PR |
| Client onboarding, checklists, manuals, welcome e-mail, delivery | CRM → Onboarding y entregas (`/admin/workspace/crm/onboarding`) and Clients 360 | This PR |

Agent invitations are intentionally **not** in Configuración. There is one Agent Portal; no second agent area exists.

## Senders (exact addresses, never substituted automatically)

| Purpose | Address | Status until evidence exists |
| --- | --- | --- |
| Agent invitations (Supabase Auth custom SMTP) | `avalonacoreagency@gmail.com` | SMTP saved by the owner 2026-11-25 (Auth e-mail limit moved 2/h → 30/h); **unverified until a received message shows SPF/DKIM pass** |
| Client e-mails (welcome, onboarding, delivery, manuals, invoice copy, support, maintenance, renewal) and Reply-To | `avalonacoreagency@gmail.com` (AVL-COMMS-FINAL-001) | **BLOCKED until `AVALON_SMTP_*` is set in Vercel Production** |
| Client support contact | `avalonacoreagency@gmail.com` | shown in e-mails and PDFs (owners can change it in Configuración → Comunicaciones) |
| Support phone | none | stays «pending»; it is shown only after an owner records an approved **business** number |

«Verified» can only be saved in the Agent Portal with technical evidence (the database refuses `verified` without at
least 10 characters of evidence). Good evidence: the `Authentication-Results` header of a real invitation received in
Gmail showing `spf=pass` and `dkim=pass header.d=gmail.com`.

### Facts about gmail.com senders

- Avalon does not control the DNS of `gmail.com`. SPF/DKIM/DMARC for `@gmail.com` are Google's. A message passes them
  only when it is sent **through Google** (smtp.gmail.com) authenticated as that same account.
- Sending «From: …@gmail.com» through any other provider will fail DMARC and land in spam. Do not do it.
- Gmail's yellow «important» marker and any «verified» badge are decided by Gmail. They cannot be promised or faked.
  Ask each recipient to add the sender to their contacts.
- A personal Gmail account has daily sending limits; it is fine for invitations and onboarding volume, not for bulk.

## 1. Agent invitations (Supabase Auth, one provider per invitation)

The invitation is sent **once**, by Supabase Auth, with its real activation link (`{{ .ConfirmationURL }}`). No second
custom e-mail is sent for the same event, and the agent stays **inactive** until Miguel or Samuel approve permissions
in the Agent Portal.

Owner steps (Supabase dashboard of the target project — staging first):

1. Google account `avalonacoreagency@gmail.com`: enable 2-Step Verification, then create an **App Password**.
2. Supabase → Authentication → Emails → SMTP settings → enable custom SMTP:
   host `smtp.gmail.com`, port `465`, username `avalonacoreagency@gmail.com`, password = the App Password,
   sender e-mail `avalonacoreagency@gmail.com`, sender name `Avalon Core Agency`.
3. Supabase → Authentication → Email templates → **Invite user**:
   - Subject: `Avalon Core Agency — {{ .Data.inviter_name }} te invita a unirte al equipo`
   - Body: paste `supabase/templates/invite.html` (generated from `src/lib/comms/email.ts`; regenerate with
     `node scripts/email/build-auth-templates.cjs`, CI checks it with `--check`).
4. Send one invitation to a test inbox you control, open «Show original», copy the `Authentication-Results` line and
   record it as evidence in AGENT PORTAL → Identidad de las invitaciones → «Verificado».

### Invitation data contract (`staff-invite` Edge Function)

The template reads `.Data.*`. The function must pass, resolved **server-side from the authenticated owner** (never from
a browser parameter):

| Key | Value |
| --- | --- |
| `inviter_name` | Official owner name (`Miguel Hobaica` / `Samuel Muñoz`) or the inviter's directory name |
| `inviter_title` | Profile title, default `Cofundador` / `Co-founder` for the official owners |
| `invitee_name` | Optional, typed by the owner |
| `role_label` | Optional role shown in the text (e.g. «Agente comercial») |
| `lang` | `es` (default) or `en` |

Without these keys the template still works (generic greeting), but the signature line would be empty — so the
function change ships together with the Staff release.

## 2. Client e-mails (onboarding outbox)

Messages are prepared in Onboarding y entregas, previewed, and only sent after an owner approves. Each message has an
idempotency key (no duplicates on double click / refresh) and frozen content (what was approved is what is sent).

- **Without SMTP** the «Aprobar y enviar» button stays disabled and the page says BLOCKED. An owner can send the
  prepared text from Gmail and record the message id as evidence («Registrar envío manual»).
- **With SMTP** (server-side Vercel environment variables, never `NEXT_PUBLIC_*`):
  `AVALON_SMTP_HOST=smtp.gmail.com`, `AVALON_SMTP_PORT=465`, `AVALON_SMTP_USER=avalonacoreagency@gmail.com`,
  `AVALON_SMTP_PASS=<a second App Password of that account, named "Avalon Vercel SMTP">` (Production only; Preview must not send). The transport refuses to send if `AVALON_SMTP_USER` differs from the
  configured client sender. «Enviado» is recorded only with the provider's message id.
- Invoice copies reuse the existing `crm_invoices` and invoice PDF; void invoices or invoices of another client are
  refused. Manuals are private PDFs verified by sha256; there are no public file URLs.

## 3. Database

Migration `supabase/migrations/20261124140000_client_experience.sql` is **review only — not applied to production**.
It adds `avalon_company_settings`, `crm_client_onboardings`, `crm_client_documents`, `crm_email_outbox` and
`crm_testimonial_consents` (owners only, RLS deny by default). Until it is applied, the pages show «migración
pendiente» and use the documented defaults; nothing is fabricated.

## Status

| Item | Status |
| --- | --- |
| Templates ES/EN, official logo, owner signature from session | Implemented, unit tested |
| Agent invitations inside AGENT PORTAL | Panel implemented; portal page ships with Staff (#341/#342) |
| Invitation sender `avalonacoreagency@gmail.com` | BLOCKED until SMTP + evidence |
| Client SMTP `avalonacoreagency@gmail.com` | BLOCKED until env vars are set |
| Support phone | Pending (no number invented) |
| Migration 20261124140000 | Applied to production 2026-11-24 with owner GO |
| Migration 20261124190000 (lifecycle e-mail kinds) | Review only, NOT applied; until then those 5 message types show «requires migration» |
| Contracts ACA-MSA-1.2 | Review only: shown for attorney review, NOT offered for new drafts; 1.1 remains the only selectable version |

## AVL-COMMS-FINAL-001 (2026-11-25)
- One corporate mailbox, `avalonacoreagency@gmail.com`, for invitations, every client e-mail, Reply-To and the support contact
  (`CORPORATE_MAILBOX` in `src/lib/comms/email.ts`; migration `20261125120100_corporate_mailbox` moves only fields that still hold
  the old default). Owner sign-in accounts, memberships, owner identities and historical outbox rows are unchanged.
- Onboarding e-mails from EM-001 (#353) reuse the one outbox: information request, materials request (pending checklist of the
  service), kickoff confirmation, review request, approval request, receipt confirmation and maintenance notice, besides the
  existing confirmation, progress, delivery, support and renewal messages. Each one needs recorded facts or the owner's note.
- Communication Center: `/admin/workspace/crm/communications` (owners only) lists every outbox message with recipient, sender,
  attachments, status, attempts, errors and send evidence; preparing, approving, sending and retrying stay in each onboarding.
  "Sent" means the SMTP server accepted the message, never that it reached the inbox.
- Supabase invitation template: paste `supabase/templates/invite.html` into Authentication → Emails → Templates → Invite user
  (it is generated from `email.ts`; `node scripts/email/build-auth-templates.cjs --check` keeps them in sync).
