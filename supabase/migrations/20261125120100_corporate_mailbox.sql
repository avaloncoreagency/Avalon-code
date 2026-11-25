-- AVL-COMMS-FINAL-001 · M04: one corporate mailbox for every Avalon communication (owner instruction, 2026-11-25).
-- Only communication settings change: owner sign-in accounts, memberships, owner identities and every message already in
-- the outbox (frozen, historical) are untouched. A field is moved only while it still holds the previous default, so a
-- value an owner set deliberately in Configuración → Comunicaciones is never overwritten. The invitation sender stays
-- 'unverified' until SPF/DKIM evidence from a real received message is recorded.
begin;
alter table public.avalon_company_settings alter column support_email set default 'avalonacoreagency@gmail.com';
alter table public.avalon_company_settings alter column reply_to_email set default 'avalonacoreagency@gmail.com';
alter table public.avalon_company_settings alter column client_sender_email set default 'avalonacoreagency@gmail.com';
update public.avalon_company_settings set
  support_email = case when support_email = 'avalonagencymh@gmail.com' then 'avalonacoreagency@gmail.com' else support_email end,
  reply_to_email = case when reply_to_email = 'avalonagencymh@gmail.com' then 'avalonacoreagency@gmail.com' else reply_to_email end,
  client_sender_email = case when client_sender_email = 'avalonagencymh@gmail.com' then 'avalonacoreagency@gmail.com' else client_sender_email end,
  updated_at = now()
where id = 1 and 'avalonagencymh@gmail.com' in (support_email, reply_to_email, client_sender_email);
commit;
