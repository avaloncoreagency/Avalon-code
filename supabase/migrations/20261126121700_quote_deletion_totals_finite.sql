-- Depends on commercial_authority. Preserve the exact-number invariant of the
-- source revision when copying its totals into the deletion review history.
alter table public.crm_quote_deletion_requests
  add constraint crm_quote_deletion_requests_one_time_total_finite
    check (one_time_total not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  add constraint crm_quote_deletion_requests_monthly_total_finite
    check (monthly_total not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric));
