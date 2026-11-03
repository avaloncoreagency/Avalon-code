-- Avalon Radar: provisional, source-grounded profile scoring at discovery.
-- A public listing alone NEVER proves business needs or justifies pipeline.
-- 1 star = public listing for review; 2 stars = listing with web+phone;
-- higher scores still require explicit CRM service-need evidence.
begin;
CREATE OR REPLACE FUNCTION crm_private.radar_tier(p uuid, OUT stars smallint, OUT confidence text, OUT reasons jsonb)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare missing int; improve int; present int; assessed int; high int; applicable int;
  public_profile public.crm_prospects%rowtype;
  contact_channels integer;
begin
  select count(*) filter (where n.state = 'verified_missing'),
         count(*) filter (where n.state = 'opportunity_to_improve'),
         count(*) filter (where n.state = 'verified_present'),
         count(*) filter (where n.state in ('verified_missing', 'opportunity_to_improve', 'verified_present')),
         count(*) filter (where n.state in ('verified_missing', 'opportunity_to_improve', 'verified_present') and n.confidence = 'high'),
         6 - count(*) filter (where n.state = 'not_applicable')
    into missing, improve, present, assessed, high, applicable
    from public.crm_prospect_needs n where n.prospect_id = p;
  reasons := jsonb_build_array(
    missing || ' necesidad(es) verificada(s)', improve || ' oportunidad(es) de mejora verificada(s)',
    present || ' herramienta(s) presente(s) verificada(s)', assessed || '/' || applicable || ' servicios aplicables evaluados');
  if assessed = 0 or (assessed < 2 and missing = 0 and improve = 0) then
    -- Discovery is NOT evidence of unmet service needs. A public directory
    -- profile permits only an explicitly labelled, LOW-confidence initial
    -- lead-priority tier (1-2). Never use this branch for a 3-5 star lead.
    select * into public_profile from public.crm_prospects pr where pr.id = p;
    if public_profile.source_ref is not null
      and length(btrim(coalesce(public_profile.company, ''))) >= 2
      and length(btrim(coalesce(public_profile.category, ''))) >= 2
      and public_profile.lat is not null and public_profile.lon is not null then
      contact_channels :=
        case when length(btrim(coalesce(public_profile.phone,''))) > 0 then 1 else 0 end +
        case when length(btrim(coalesce(public_profile.website,''))) > 0 then 1 else 0 end;
      stars := case when contact_channels = 2 then 2 else 1 end;
      confidence := 'low';
      reasons := reasons || jsonb_build_array(
        'Precalificación automática: ficha pública identificada con categoría y ubicación (fuente: ' ||
          coalesce(public_profile.source_kind, 'directorio') || ').',
        case when contact_channels = 2
          then 'El directorio muestra teléfono y web: prioridad de contacto; ninguno confirma necesidad de servicio.'
          else 'Información comercial incompleta: investigación y contacto pendientes.' end,
        'Sin necesidad comercial demostrada; puntuación provisional, no autoriza crear leads en pipeline.'
      );
      return;
    end if;
    stars := null; confidence := 'none';
    reasons := reasons || jsonb_build_array('Sin calificar: no existe ficha pública suficiente ni necesidad comercial verificada.');
    return;
  end if;
  stars := case
    when missing >= 3 and missing >= applicable - 1 then 5
    when missing >= 3 or (missing >= 2 and improve >= 1) then 4
    when missing >= 1 then 3
    when improve >= 1 then 2
    else 1 end;
  confidence := case
    when assessed >= applicable - 1 and high >= 2 then 'high'
    when assessed >= greatest(2, applicable / 2) then 'medium'
    else 'low' end;
end $function$;


-- Automatically score NEW discoveries and changes to publicly observed
-- contact data. Rescore UPDATE touches stars only, so it cannot recurse into
-- this UPDATE OF trigger. Existing verified CRM evidence still takes priority.
create or replace function crm_private.radar_profile_rescore()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $function$
declare t record;
begin
  if new.source_ref is null or new.status = 'converted' then return null; end if;
  select * into t from crm_private.radar_tier(new.id);
  update public.crm_prospects p
     set stars = t.stars, confidence = t.confidence, stars_reasons = t.reasons
   where p.id = new.id and (
     p.stars is distinct from t.stars
     or p.confidence is distinct from t.confidence
     or p.stars_reasons is distinct from t.reasons
   );
  return null;
end $function$;
revoke all on function crm_private.radar_profile_rescore() from public;
drop trigger if exists crm_radar_profile_prequalification on public.crm_prospects;
create trigger crm_radar_profile_prequalification
  after insert or update of source_ref,phone,website,category,industry,lat,lon
  on public.crm_prospects
  for each row
  when (new.source_ref is not null and new.status <> 'converted')
  execute function crm_private.radar_profile_rescore();

-- Backfill only radar discoveries. This follows the existing owner-stamped
-- CRM audit path rather than bypassing authorization or dropping triggers.
do $backfill$
declare actor uuid;
begin
  if exists (select 1 from public.crm_prospects
             where source_ref is not null and status <> 'converted') then
    select user_id into actor from public.agency_memberships
      where role = 'owner' order by created_at limit 1;
    if actor is null then raise exception 'Cannot backfill radar without an agency owner'; end if;
    perform set_config('request.jwt.claim.sub', actor::text, true);
    with scored as materialized (
      select p.id, tier.stars, tier.confidence, tier.reasons
      from public.crm_prospects p
      cross join lateral crm_private.radar_tier(p.id) tier
      where p.source_ref is not null and p.status <> 'converted'
    )
    update public.crm_prospects p
       set stars=scored.stars, confidence=scored.confidence,
           stars_reasons=scored.reasons
      from scored
     where p.id=scored.id
       and (p.stars is distinct from scored.stars
         or p.confidence is distinct from scored.confidence
         or p.stars_reasons is distinct from scored.reasons);
  end if;
end $backfill$;

commit;
