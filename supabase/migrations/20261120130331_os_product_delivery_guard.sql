-- Avalon OS · Commercial Core 360 · 8.2 Product delivery lifecycle. ADDITIVE ONLY.
-- Applied to production 2026-11-20 with owner authorization (ledger 20261120130331).
--
-- os_projects.settings.delivery = { stage, history[] } (no new column, no data rewrite, no RLS/grant change).
-- This BEFORE trigger only acts when settings.delivery changes. It guarantees what the application promises:
--   * only the documented transitions between the 8 stages;
--   * history is append-only and the new entry is attributed to the signed-in user (auth.uid());
--   * "delivered" and "live_verified" need a written note; "live_verified" also needs an HTTPS product URL AND an
--     HTTPS evidence link — a URL alone never marks a product as published;
--   * a write that drops settings.delivery (e.g. an older code path rebuilding settings) keeps the existing value.
-- Mirrors src/lib/os/delivery.ts.

begin;


create function os_private.product_delivery_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  d_new jsonb := new.settings -> 'delivery';
  d_old jsonb := case when TG_OP = 'UPDATE' then old.settings -> 'delivery' else null end;
  h_new jsonb; h_old jsonb; old_len int; new_len int; old_stage text; new_stage text; last jsonb; note text; evidence text; url text;
begin
  if TG_OP = 'UPDATE' and (d_new is null or jsonb_typeof(d_new) = 'null') and d_old is not null then
    -- Older code paths rebuild settings without this key: keep the recorded lifecycle instead of silently erasing it.
    new.settings := jsonb_set(coalesce(new.settings, '{}'::jsonb), '{delivery}', d_old);
    return new;
  end if;
  if d_new is not distinct from d_old then return new; end if;
  if jsonb_typeof(d_new) <> 'object' or jsonb_typeof(coalesce(d_new -> 'history', 'null'::jsonb)) <> 'array' then
    raise exception 'delivery_invalid' using errcode = '22023';
  end if;
  h_new := d_new -> 'history';
  h_old := coalesce(d_old -> 'history', '[]'::jsonb);
  old_len := jsonb_array_length(h_old);
  new_len := jsonb_array_length(h_new);
  old_stage := coalesce(d_old ->> 'stage', 'draft');
  new_stage := d_new ->> 'stage';
  if new_stage is null or new_stage not in ('draft', 'pending_development', 'in_development', 'in_review', 'ready_to_deliver',
      'delivered', 'live_verified', 'maintenance') then
    raise exception 'delivery_invalid_stage' using errcode = '22023';
  end if;
  -- Exactly one appended entry per change; earlier entries are immutable.
  if new_len <> old_len + 1 or new_len > 200 or (old_len > 0 and
      (select jsonb_agg(e order by i) from jsonb_array_elements(h_new) with ordinality as t(e, i) where i <= old_len) is distinct from h_old) then
    raise exception 'delivery_history_append_only' using errcode = '23514';
  end if;
  last := h_new -> (new_len - 1);
  if (old_stage, new_stage) not in (
      ('draft', 'pending_development'), ('draft', 'in_development'),
      ('pending_development', 'in_development'), ('pending_development', 'draft'),
      ('in_development', 'in_review'), ('in_development', 'pending_development'),
      ('in_review', 'ready_to_deliver'), ('in_review', 'in_development'),
      ('ready_to_deliver', 'delivered'), ('ready_to_deliver', 'in_review'),
      ('delivered', 'live_verified'), ('delivered', 'in_review'),
      ('live_verified', 'maintenance'), ('live_verified', 'in_review'),
      ('maintenance', 'in_review'), ('maintenance', 'live_verified'))
     or last ->> 'from' is distinct from old_stage
     or last ->> 'to' is distinct from new_stage then
    raise exception 'delivery_invalid_transition' using errcode = '23514';
  end if;
  if auth.uid() is null or last ->> 'by' is distinct from auth.uid()::text then
    raise exception 'delivery_actor_mismatch' using errcode = '42501';
  end if;
  note := btrim(coalesce(last ->> 'note', ''));
  evidence := btrim(coalesce(last ->> 'evidence_url', ''));
  if length(note) > 1000 or length(evidence) > 500 or (evidence <> '' and evidence !~ '^https://[^\s/@]+') then
    raise exception 'delivery_invalid_evidence' using errcode = '22023';
  end if;
  if new_stage in ('delivered', 'live_verified') and length(note) < 8 then
    raise exception 'delivery_note_required' using errcode = '23514';
  end if;
  if new_stage = 'live_verified' then
    url := btrim(coalesce(new.settings -> 'operations' ->> 'url', ''));
    if url !~ '^https://[^\s/@]+' then raise exception 'delivery_url_required' using errcode = '23514'; end if;
    if evidence = '' then raise exception 'delivery_evidence_required' using errcode = '23514'; end if;
  end if;
  return new;
end $$;
revoke all on function os_private.product_delivery_guard() from public;

create trigger os_projects_delivery_guard before insert or update of settings on public.os_projects
  for each row execute function os_private.product_delivery_guard();

commit;
