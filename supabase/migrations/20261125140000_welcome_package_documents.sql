-- AVL-CLAUDE-GENESIS-001 · G04: the client Welcome Package is an issued client document like the manual (versioned,
-- immutable, sha256 of the exact bytes, owner-only RLS, superseded by the next version). Additive: only the kind list grows.
begin;
alter table public.crm_client_documents drop constraint if exists crm_client_documents_kind_check;
alter table public.crm_client_documents add constraint crm_client_documents_kind_check check (kind in ('manual', 'welcome_package'));
commit;
