-- Avalon Service Factory: additive, owner-only catalog metadata.
-- PREVIEW/STAGING FIRST. Never apply on production without explicit owner
-- approval, migration-ledger review, verified backup and rollback plan.
-- Keeps all existing SKU codes, active flags, sale lines and task templates.
-- Existing SKUs default to readiness 'draft' (NOT a readiness certification);
-- their pre-existing active flags remain unchanged to avoid a surprise outage.
begin;

alter table public.crm_service_catalog
  add column family text not null default 'general'
    check (family in ('general','web','ecommerce','crm','ai','automation','marketing','brand','creative')),
  add column readiness text not null default 'draft'
    check (readiness in ('draft','internal_ready','sellable','paused','retired')),
  add column requirements text not null default ''
    check (char_length(requirements) <= 4000),
  add column exclusions text not null default ''
    check (char_length(exclusions) <= 4000),
  add column estimated_hours numeric(10,2)
    check (estimated_hours is null or estimated_hours between 0 and 10000),
  add column estimated_cost numeric(15,2)
    check (estimated_cost is null or estimated_cost between 0 and 1000000000000),
  add column qa_checklist jsonb not null default '[]'::jsonb
    check (jsonb_typeof(qa_checklist) = 'array'
      and pg_column_size(qa_checklist) <= 8192),
  add column template_revision integer not null default 1
    check (template_revision between 1 and 1000000);

comment on column public.crm_service_catalog.readiness is
  'INTERNAL review status; this does not change crm_confirm_sale eligibility. Legacy active SKUs require explicit readiness review.';
comment on column public.crm_service_catalog.estimated_cost is
  'Estimated direct cost, optional. NULL means unknown; do not treat as zero.';
comment on column public.crm_service_catalog.estimated_hours is
  'Estimated human hours, optional. NULL means unknown.';
comment on column public.crm_service_catalog.template_revision is
  'Version of the reusable task/onboarding template, independent from row version.';

-- RLS, ownership checks, immutable actor stamping and auditing are inherited
-- from crm_service_catalog (migration 20261102170000). No new grants.
commit;
