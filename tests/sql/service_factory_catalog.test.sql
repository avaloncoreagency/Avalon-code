-- Runs after the existing crm_pipeline.test.sql in an isolated PostgreSQL 16.
-- Existing synthetic owners/outsider are reused, never production identities.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',false);
do $$ declare sid uuid; v int; ok boolean;
begin
  assert (select count(*) from public.crm_service_catalog) >= 6, 'existing services preserved';
  assert (select readiness from public.crm_service_catalog where code='desarrollo-web')='draft',
    'legacy SKU should not be labelled verified automatically';
  assert (select active from public.crm_service_catalog where code='desarrollo-web'),
    'legacy sales availability preserved';
  assert (select estimated_cost from public.crm_service_catalog where code='desarrollo-web') is null,
    'unknown cost must be NULL, not zero';
  insert into public.crm_service_catalog
    (code,name,name_en,department_id,billing_type,family,readiness,
     deliverables,requirements,exclusions,qa_checklist,estimated_hours,estimated_cost,task_template,active)
  values
    ('brand-identity-qa','Identidad sintética','Synthetic identity','marketing','one_time','brand','draft',
     'Brandbook de prueba','Logos originales','No incluye anuncios','["Prueba móvil","Licencia"]'::jsonb,
     12.5,120,'[{"title":"Kickoff","offset_days":1,"priority":"high"}]'::jsonb,false)
  returning id into sid;
  assert (select count(*) from public.crm_service_catalog where id=sid and family='brand'
      and active=false and template_revision=1)=1,'new service is a draft and inactive';
  v := (select version from public.crm_service_catalog where id=sid);
  update public.crm_service_catalog set readiness='sellable',template_revision=2 where id=sid and version=v;
  assert (select version from public.crm_service_catalog where id=sid) > v,
    'optimistic version increased';
  assert (select count(*) from public.crm_audit where entity='crm_service_catalog' and record_id=sid) >= 1,
    'catalog change must be audited';
  begin
    update public.crm_service_catalog set estimated_cost=-5 where id=sid;
    ok:=false;
  exception when check_violation then ok:=true;
  end;
  assert ok,'cost cannot be negative';
end $$;

-- Nonowner cannot read, create, update or activate catalog entries.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a3',false);
do $$ declare ok boolean; begin
  assert (select count(*) from public.crm_service_catalog)=0,'RLS: outsider sees no services';
  begin
    insert into public.crm_service_catalog(code,name,department_id,billing_type)
    values('unauthorized','Unauthorized','marketing','one_time');
    ok:=false;
  exception when insufficient_privilege then ok:=true;
  end;
  assert ok,'RLS: outsider cannot create service';
  begin
    update public.crm_service_catalog set readiness='sellable';
    ok:=(select count(*) from public.crm_service_catalog where readiness='sellable')=0;
  exception when others then ok:=true;
  end;
  assert ok,'RLS: outsider cannot update services';
end $$;
reset role;
