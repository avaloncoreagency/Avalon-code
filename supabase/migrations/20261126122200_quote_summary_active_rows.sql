-- Keep the summary in sync with the active Quotes list after logical deletion.
create or replace function public.crm_quote_summary() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'draft', count(*) filter (where q.status in ('draft', 'internal_review', 'approved')),
    'sent', count(*) filter (where q.status = 'sent' and q.valid_until >= (now() at time zone 'America/New_York')::date),
    'overdue', count(*) filter (where q.status = 'sent' and q.valid_until < (now() at time zone 'America/New_York')::date),
    'accepted_without_contract', count(*) filter (where q.status = 'accepted' and not exists (
      select 1 from public.crm_client_agreement_drafts d join public.crm_quote_versions v on v.id = d.quote_version_id where v.quote_id = q.id)))
  from public.crm_quotes q
  where q.deleted_at is null
$$;
