-- Avalon OS STABLE V1 — finance P0 from Codex independent QA (PR #322). FORWARD-ONLY. REVIEW ONLY until approved.
--
-- Defect 1 (reproduced on main@04969aa): PostgreSQL numeric accepts 'NaN', and NaN compares GREATER than every number,
-- so guards such as `amount <= 0` or `check (amount > 0)` let it through. crm_attribution_record stored a NaN
-- conversion that poisoned the unverified aggregate. The same blind spot exists on every numeric money column.
--   Fix A (defense in depth): every numeric column of every public table rejects NaN and ±Infinity at the table level,
--          so no RPC, direct insert or future function can store a non-finite amount.
--   Fix B: crm_attribution_record rejects non-finite input with the documented `amount_invalid` error (Codex proposal).
--
-- Defect 2 (reproduced): a legitimate pre-V5 `verified` conversion cannot advance to `invoiced`, because the V5
-- evidence constraints require client_payment_* / attribution_* fields that legacy rows never had, while UI and RPC
-- offer the transition.
--   Fix C: verified → invoiced carries the row's ORIGINAL legacy verification (verified_at, verified_by,
--          verification_ref) into both V5 evidence slots, explicitly prefixed `legacy-v4:` so nobody mistakes it for a
--          new, separate check. Nothing is invented; the append-only event log records the carry-over.
--
-- No historical rows are rewritten by this migration. Before applying to production, run the read-only preflight in
-- docs/stable-v1/FINANCE_P0_322.md: adding the CHECK constraints fails (safely, nothing changes) if a non-finite value
-- already exists.

begin;

-- Fix A ─ finite-number constraints on every numeric column (nullable columns stay nullable).
do $$
declare col record; cname text;
begin
  for col in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.data_type = 'numeric' and t.table_type = 'BASE TABLE'
    order by 1, 2
  loop
    cname := left(col.table_name || '_' || col.column_name || '_finite', 63);
    if not exists (select 1 from pg_constraint where conname = cname and conrelid = format('public.%I', col.table_name)::regclass) then
      execute format(
        'alter table public.%I add constraint %I check (%I not in (''NaN''::numeric, ''Infinity''::numeric, ''-Infinity''::numeric))',
        col.table_name, cname, col.column_name);
    end if;
  end loop;
end $$;

-- Fix B ─ same function as 20261119150000, plus the non-finite guard (Codex's proposal in PR #322).
create or replace function public.crm_attribution_record(request jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cl public.crm_clients; term public.crm_commercial_terms; signed public.crm_contracts;
  amt numeric(15,2); excluded numeric(15,2); v_id uuid; v_ref text; v_source text;
begin
  if auth.uid() is null or not crm_private.is_owner() or not crm_private.can_view_client_finances() then
    raise exception 'finance_forbidden' using errcode='42501';
  end if;
  select * into cl from public.crm_clients where id=(request->>'client_id')::uuid;
  if not found or cl.origin_lead_id is null then raise exception 'client_lead_required' using errcode='23514'; end if;
  select * into term from public.crm_commercial_terms
    where lead_id=cl.origin_lead_id and kind='agreed' for share;
  if not found or term.billing_model not in ('commission','hybrid') or term.commission_pct is null
    or term.commission_pct <= 0 or term.commission_approved_by is null
    or term.commission_base <> 'gross_revenue' then
    raise exception 'approved_revenue_commission_required' using errcode='23514';
  end if;
  select * into signed from public.crm_contracts
    where lead_id=cl.origin_lead_id and terms_id=term.id and status='verified_signed'
    order by verified_at desc limit 1;
  if not found or signed.verified_at is null or term.updated_at > signed.verified_at then
    raise exception 'signed_current_terms_required' using errcode='23514';
  end if;
  begin
    amt := (request->>'gross_collected')::numeric(15,2);
    excluded := coalesce((request->>'excluded_amount')::numeric(15,2),0);
  exception when others then raise exception 'amount_invalid' using errcode='22023'; end;
  -- NaN compares greater than every number, so the range checks below cannot catch it on their own.
  if amt::text in ('NaN','Infinity','-Infinity') or excluded::text in ('NaN','Infinity','-Infinity') then
    raise exception 'amount_invalid' using errcode='22023';
  end if;
  v_ref := btrim(coalesce(request->>'external_ref',''));
  v_source := btrim(coalesce(request->>'source',''));
  if amt is null or amt <= 0 or excluded < 0 or excluded >= amt or
      length(v_ref) not between 3 and 160 or length(v_source) not between 3 and 120 then
    raise exception 'conversion_invalid' using errcode='22023';
  end if;
  insert into public.crm_attributed_conversions (
    client_id,terms_id,contract_id,source,external_ref,currency,gross_collected,
    excluded_amount,rate_pct,created_by
  ) values (
    cl.id,term.id,signed.id,v_source,v_ref,term.currency,amt,excluded,term.commission_pct,auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

-- Fix C ─ same function as 20261121182000, with an explicit, evidence-preserving legacy `verified` → `invoiced` path.
create or replace function public.crm_attribution_advance(p_conversion uuid, p_to text, p_evidence text, p_expected_version integer)
returns integer
language plpgsql security definer set search_path = '' as $$
declare c public.crm_attributed_conversions; note text := btrim(coalesce(p_evidence, '')); v_from text; v_legacy text;
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
  elsif p_to = 'invoiced' and c.status = 'eligible' then
    update public.crm_attributed_conversions set status = p_to, invoice_ref = note, invoiced_at = now(),
      invoiced_by = auth.uid(), version = version + 1 where id = c.id;
  elsif p_to = 'invoiced' and c.status = 'verified' then
    -- Pre-V5 rows were verified once (payment + attribution together). Require that original evidence, and carry it
    -- into both V5 slots with its ORIGINAL time and actor, labelled as legacy. Never fabricate a new verification.
    if c.verified_at is null or length(btrim(c.verification_ref)) < 3 then
      raise exception 'legacy_evidence_missing' using errcode = '23514';
    end if;
    v_legacy := left('legacy-v4: ' || btrim(c.verification_ref), 250);
    update public.crm_attributed_conversions set status = p_to,
      client_payment_ref = case when length(btrim(c.client_payment_ref)) >= 3 then c.client_payment_ref else v_legacy end,
      client_payment_verified_at = coalesce(c.client_payment_verified_at, c.verified_at),
      client_payment_verified_by = coalesce(c.client_payment_verified_by, c.verified_by),
      attribution_ref = case when length(btrim(c.attribution_ref)) >= 3 then c.attribution_ref else v_legacy end,
      attribution_verified_at = coalesce(c.attribution_verified_at, c.verified_at),
      attribution_verified_by = coalesce(c.attribution_verified_by, c.verified_by),
      invoice_ref = note, invoiced_at = now(), invoiced_by = auth.uid(), version = version + 1 where id = c.id;
    note := left(note || ' · legacy-v4 verification carried over: ' || btrim(c.verification_ref), 500);
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

commit;
