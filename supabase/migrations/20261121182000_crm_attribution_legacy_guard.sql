-- Avalon OS V5: forward-only hardening for databases that already recorded
-- 20261121181000 before its legacy RPC guard was reviewed.
-- REVIEW ONLY. Do not apply to production without owner-approved backup/release.
-- Safe on both fresh and existing V5 databases. No historical rows rewritten.
begin;

-- Replace rather than rely on a previously recorded migration being replayed.
create or replace function public.crm_attribution_advance(p_conversion uuid, p_to text, p_evidence text, p_expected_version integer)
returns integer
language plpgsql security definer set search_path = '' as $$
declare c public.crm_attributed_conversions; note text := btrim(coalesce(p_evidence, '')); v_from text;
begin
  if auth.uid() is null or not crm_private.is_owner() or not crm_private.can_view_client_finances() then
    raise exception 'finance_forbidden' using errcode = '42501';
  end if;
  select * into c from public.crm_attributed_conversions where id = p_conversion for update;
  if not found then raise exception 'conversion_not_found' using errcode = 'P0002'; end if;
  if p_expected_version is null or p_expected_version <> c.version then
    raise exception 'conversion_version_conflict' using errcode = '40001';
  end if;
  if length(note) < 3 or length(note) > 250 or (p_to in ('void', 'disputed') and length(note) < 5) then
    raise exception 'evidence_required' using errcode = '22023';
  end if;
  v_from := c.status;
  if p_to = 'client_paid_verified' and c.status = 'reported' then
    update public.crm_attributed_conversions set status = p_to, client_payment_ref = note,
      client_payment_verified_at = now(), client_payment_verified_by = auth.uid(), version = version + 1 where id = c.id;
  elsif p_to = 'attribution_verified' and c.status = 'client_paid_verified' then
    update public.crm_attributed_conversions set status = p_to, attribution_ref = note,
      attribution_verified_at = now(), attribution_verified_by = auth.uid(), version = version + 1 where id = c.id;
  elsif p_to = 'eligible' and c.status = 'attribution_verified' then
    -- verified_at / verification_ref keep the legacy `paid` constraint and legacy readers consistent.
    update public.crm_attributed_conversions set status = p_to, eligible_at = now(), verified_at = now(),
      verification_ref = left(c.attribution_ref, 250), verified_by = auth.uid(), version = version + 1 where id = c.id;
  elsif p_to = 'invoiced' and c.status in ('eligible', 'verified') then
    update public.crm_attributed_conversions set status = p_to, invoice_ref = note, invoiced_at = now(),
      invoiced_by = auth.uid(), version = version + 1 where id = c.id;
  elsif p_to = 'paid' and c.status = 'invoiced' then
    update public.crm_attributed_conversions set status = p_to, settlement_ref = note, paid_at = now(),
      paid_by = auth.uid(), version = version + 1 where id = c.id;
  elsif p_to = 'disputed' and c.status in ('reported', 'client_paid_verified', 'attribution_verified', 'eligible', 'verified', 'invoiced') then
    update public.crm_attributed_conversions set status = p_to, dispute_reason = note, disputed_at = now(),
      disputed_from = c.status, version = version + 1 where id = c.id;
  elsif c.status = 'disputed' and p_to = c.disputed_from then
    -- Resolution returns to exactly the step it was disputed from; the dispute stays in the event history.
    update public.crm_attributed_conversions set status = p_to, disputed_from = null, version = version + 1 where id = c.id;
  elsif p_to = 'void' and c.status not in ('paid', 'void') then
    update public.crm_attributed_conversions set status = 'void', void_reason = note, voided_at = now(),
      voided_by = auth.uid(), version = version + 1 where id = c.id;
  else
    raise exception 'invalid_conversion_transition' using errcode = '23514';
  end if;
  insert into public.crm_attribution_events (conversion_id, from_status, to_status, evidence, actor_id)
    values (c.id, v_from, p_to, note, auth.uid());
  return c.version + 1;
end $$;

-- Retire the legacy, non-versioned RPC *in the same migration that enables the new RPC*.
-- Merely revoking EXECUTE does not protect privileged or previously granted callers.
-- Replace the implementation with a fail-closed shim too, while preserving the
-- signature for old clients so failures are explicit and cannot mutate money.
-- Production must coordinate the app cutover: old clients will get a deliberate
-- denial rather than being allowed to post unaudited financial transitions.
create or replace function public.crm_attribution_transition(
  p_conversion uuid, p_to text, p_evidence text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'legacy_attribution_transition_disabled' using errcode = '0A000';
end $$;
revoke all on function public.crm_attribution_transition(uuid, text, text)
  from public, anon, authenticated, service_role;

commit;
