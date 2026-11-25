-- AVL-COMMS-FINAL-001 · M07: onboarding e-mails from Client Operations EM-001 (#353) reuse the existing outbox (frozen content,
-- owner approval, compare-and-set send, audit). Additive: only the kind list grows; no row, status or policy changes.
begin;
alter table public.crm_email_outbox drop constraint if exists crm_email_outbox_kind_check;
alter table public.crm_email_outbox add constraint crm_email_outbox_kind_check check (kind in ('client_welcome', 'invoice_copy',
  'document_delivery', 'onboarding_confirmation', 'information_request', 'materials_request', 'kickoff_confirmation', 'progress_update',
  'review_request', 'approval_request', 'delivery_notice', 'receipt_confirmation', 'support_info', 'maintenance_notice', 'renewal_review'));
commit;
