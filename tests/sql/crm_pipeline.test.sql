-- Behaviour tests for 20261102180000_crm_pipeline_13.sql (PR #20 consolidated on the single
-- crm_clients model of the sales core). Isolated DB, synthetic identities.
-- Expects the migrations to be applied; creates its own owners.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1','pipe-one@example.test'),
  ('00000000-0000-4000-8000-0000000000a2','pipe-two@example.test'),
  ('00000000-0000-4000-8000-0000000000a3','pipe-out@example.test');
insert into public.agency_memberships (user_id, role) values
  ('00000000-0000-4000-8000-0000000000a1','owner'),('00000000-0000-4000-8000-0000000000a2','owner');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',false);
do $$
declare l uuid; c uuid; c2 uuid; n int; ok boolean;
begin
  assert (select count(*) from public.crm_stages where active)=13, '13 stages';
  assert (select string_agg(id,',' order by position) from public.crm_stages)='new,researched,contact-pending,contacted,replied,qualified,meeting,diagnosed,proposal,negotiation,won,lost,nurture','stage order';

  insert into public.crm_leads(company,contact,email,source,owner_id,value)
   values('Acme QA','Ana','ana@acme.test','manual','00000000-0000-4000-8000-0000000000a1',1000) returning id into l;
  assert (select probability from public.crm_leads where id=l)=5,'default probability from stage';
  assert (select count(*) from public.crm_activities where lead_id=l and kind='system' and status='pending')=1,'auto follow-up on entry';
  update public.crm_leads set stage_id='researched' where id=l;
  assert (select count(*) from public.crm_activities where lead_id=l and kind='system')=2,'auto follow-up on move';
  update public.crm_leads set value=2000 where id=l;
  assert (select count(*) from public.crm_activities where lead_id=l and kind='system')=2,'no follow-up without stage change';

  -- stale detection
  assert not (select is_stale from public.crm_lead_health where lead_id=l),'fresh lead is not stale';
  perform set_config('app.t','1',true);
  -- cannot convert before winning
  begin perform public.crm_convert_lead_to_client(l,'convert','Cliente aprobó propuesta');ok:=false;exception when others then ok:=true;end;
  assert ok,'convert requires won stage';
  update public.crm_leads set stage_id='won' where id=l;
  assert (select count(*) from public.crm_clients)=0,'won does not auto-create a client';
  begin perform public.crm_convert_lead_to_client(l,'convert','corto');ok:=false;exception when others then ok:=true;end;
  assert ok,'rationale required';
  c:=public.crm_convert_lead_to_client(l,'convert','Contrato firmado, inicia onboarding',array['website','crm']);
  c2:=public.crm_convert_lead_to_client(l,'convert','Contrato firmado, inicia onboarding');
  assert c=c2,'idempotent';
  assert (select count(*) from public.crm_clients)=1 and (select count(*) from public.crm_conversions where lead_id=l)=1,'one client, one decision';
  assert (select status from public.crm_clients where id=c)='active' and (select origin_lead_id from public.crm_clients where id=c)=l,'client linked to its origin lead';
  assert (select count(*) from public.crm_contacts where client_id=c and is_primary)=1,'lead contact becomes primary contact';
  -- A sale from the converted lead reuses the same client: one client system, no duplicates.
  assert (public.crm_confirm_sale(jsonb_build_object('idempotency_key','99999999-9999-4999-8999-999999999999','lead_id',l,
    'lines',jsonb_build_array(jsonb_build_object('service_code','desarrollo-web','unit_price','1200'))))->>'client_id')::uuid=c,'sale reuses converted client';
  assert (select count(*) from public.crm_clients)=1,'still one client after the sale';
  assert (select count(*) from public.crm_timeline where client_id=c and event_type='lead.converted')=1,'conversion on the client timeline';
  assert (select count(*) from public.crm_audit where entity='crm_clients' and record_id=c)=1,'client audited';

  -- stage guards
  begin update public.crm_stages set active=false where id='won';ok:=false;exception when others then ok:=true;end;
  assert ok,'cannot deactivate stage with leads';
  begin update public.crm_stages set kind='open' where id='won';ok:=false;exception when others then ok:=true;end;
  assert ok,'cannot change kind of used stage';
  begin delete from public.crm_stages where id='nurture';ok:=false;exception when others then ok:=true;end;
  assert ok,'no delete';
  update public.crm_stages set active=false where id='nurture';
  begin update public.crm_leads set stage_id='nurture' where id=l;ok:=false;exception when others then ok:=true;end;
  assert ok,'cannot move into inactive stage';
  update public.crm_stages set active=true,label='Nutrición' where id='nurture';
  -- reorder inside one transaction (deferred unique)
  update public.crm_stages set position=position+1000;
  update public.crm_stages set position=position-1000;
  -- client history without lead
  insert into public.crm_activities(client_id,body,kind) values(c,'Llamada de kickoff','call');
  begin insert into public.crm_activities(body) values('huérfana');ok:=false;exception when others then ok:=true;end;
  assert ok,'activity needs lead or client';
  -- decline path records a decision without client
  insert into public.crm_leads(company,email,source,owner_id,stage_id)
   values('Beta QA','b@beta.test','manual','00000000-0000-4000-8000-0000000000a1','won') returning id into l;
  assert public.crm_convert_lead_to_client(l,'decline','Fuera de alcance de servicios') is null,'decline returns null';
  assert (select count(*) from public.crm_clients)=1,'decline creates no client';
  -- clients cannot forge conversions directly
  begin insert into public.crm_conversions(lead_id,decision,rationale,snapshot,decided_by) values(l,'decline','x forged decision','{}',auth.uid());ok:=false;exception when others then ok:=true;end;
  assert ok,'conversions are append-only through the function';
  -- duplicate client email blocked
  begin insert into public.crm_clients(legal_name,source,owner_id) values('  acme   QA ','manual','00000000-0000-4000-8000-0000000000a1');ok:=false;exception when others then ok:=true;end;
  assert ok,'duplicate client (normalized name) blocked';
end $$;
-- outsider sees and does nothing
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a3',false);
do $$ declare ok boolean; begin
  assert (select count(*) from public.crm_clients)=0 and (select count(*) from public.crm_conversions)=0 and (select count(*) from public.crm_lead_health)=0,'outsider sees nothing';
  begin perform public.crm_convert_lead_to_client(gen_random_uuid(),'convert','intento de intruso');ok:=false;exception when others then ok:=true;end;
  assert ok,'outsider cannot convert';
  begin update public.crm_stages set label='hack';ok:=(select count(*) from public.crm_stages where label='hack')=0;exception when others then ok:=true;end;
  assert ok,'outsider cannot edit stages';
end $$;
reset role;
