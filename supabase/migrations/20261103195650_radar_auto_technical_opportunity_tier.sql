-- Evidence-backed site optimization can be a two-star opportunity with one reliable category.
-- Unverified and mere website-presence records still stay unrated.
CREATE OR REPLACE FUNCTION crm_private.radar_tier(p uuid, OUT stars smallint, OUT confidence text, OUT reasons jsonb)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare missing int; improve int; present int; assessed int; high int; applicable int;
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
    stars := null; confidence := 'none';
    reasons := reasons || jsonb_build_array('Sin calificar: evidencia insuficiente (la falta de datos no cuenta como necesidad)');
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
