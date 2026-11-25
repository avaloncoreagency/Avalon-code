begin;

-- Keep the share record for owners while immediately denying suspended operators.
alter policy staff_shares_read on public.staff_work_item_shares
  using ((select crm_private.is_owner()) or
    (user_id = (select auth.uid()) and (select crm_private.staff_active())));

commit;
