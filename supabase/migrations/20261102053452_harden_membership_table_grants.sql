-- Applied to production. Removes table privileges that RLS does not cover and
-- that API roles never need on the membership table.
revoke truncate, trigger, references on public.agency_memberships from anon, authenticated;
