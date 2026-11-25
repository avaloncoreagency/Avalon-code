-- AVL-CLAUDE-ASCENSION-001 (REVIEW ONLY — apply only with an explicit owner GO for this file).
-- Additive: widens the allowed message kinds of crm_email_outbox for the client lifecycle e-mails (onboarding
-- confirmation, progress update, delivery notice, support information, renewal prepared for review).
-- No data change, no RLS/grant change. Rollback: restore the previous three-value check (only if no row uses a new kind).
begin;
alter table public.crm_email_outbox drop constraint if exists crm_email_outbox_kind_check;
alter table public.crm_email_outbox add constraint crm_email_outbox_kind_check check (kind in ('client_welcome', 'invoice_copy',
  'document_delivery', 'onboarding_confirmation', 'progress_update', 'delivery_notice', 'support_info', 'renewal_review'));
commit;
