-- Avalon staff portal: RLS isolation matrix on a REAL Supabase Postgres (isolated Preview project ONLY).
-- Synthetic identities inside ONE transaction that always ends in an exception => everything rolls back.
-- Never run against production. Expected result (2026-11-24, xrtgnmuiyqmtisdrzqcg):
--   e1_my_leads 1, e1_view_redacted 1, e1_crm_leads/clients/sales 0, e1_audit 0, e1_self_assign denied,
--   e1_self_promote_rows 0, e2_my_leads 0, e2_sees_e1_casefiles 0, e2_inbox 1, e2_client_grants 0,
--   owner_reads_others_dms 0, owner_casefiles 1, e1_revoked_leads/casefiles/dms 0, e1_revoked_send denied,
--   x_leads 0, x_contacts 0, x_self_enroll denied.
do $$
declare
  o uuid := '00000000-0000-4000-8000-00000000a001'; e1 uuid := '00000000-0000-4000-8000-00000000e001';
  e2 uuid := '00000000-0000-4000-8000-00000000e002'; x uuid := '00000000-0000-4000-8000-00000000f001';
  lead uuid; other uuid; client uuid; r jsonb := '{}'; n int;
begin
  insert into auth.users(id, email, aud, role) values
    (o,'owner-qa@example.invalid','authenticated','authenticated'),(e1,'e1-qa@example.invalid','authenticated','authenticated'),
    (e2,'e2-qa@example.invalid','authenticated','authenticated'),(x,'x-qa@example.invalid','authenticated','authenticated');
  insert into agency_memberships(user_id, role) values (o,'owner'),(e1,'operator'),(e2,'operator');
  perform set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  insert into crm_leads(company,contact,email,phone,source,owner_id) values('QA Lead','Ana','ana@example.invalid','+100','QA',o) returning id into lead;
  insert into crm_leads(company,contact,source,owner_id) values('QA Other','Bo','QA',o) returning id into other;
  insert into crm_clients(legal_name,source,owner_id) values('QA Client','QA',o) returning id into client;
  insert into staff_portal_access(user_id,active,job_title,can_create_casefiles,can_message) values (e1,true,'seller',true,true),(e2,true,'operator',true,true);
  insert into staff_contacts(user_id,display_name,is_listed) values (e1,'E1',true),(e2,'E2',true) on conflict (user_id) do update set is_listed=true;
  insert into staff_lead_grants(user_id,lead_id,access_level) values (e1,lead,'view');
  insert into staff_client_grants(user_id,client_id,client_name,access_level) values (e1,client,'QA Client','work');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub',e1,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from staff_my_leads(); r := r || jsonb_build_object('e1_my_leads', n);
  select count(*) into n from staff_my_leads() where email is null; r := r || jsonb_build_object('e1_view_redacted', n);
  select count(*) into n from crm_leads; r := r || jsonb_build_object('e1_crm_leads', n);
  select count(*) into n from crm_clients; r := r || jsonb_build_object('e1_crm_clients', n);
  select count(*) into n from crm_sales; r := r || jsonb_build_object('e1_crm_sales', n);
  select count(*) into n from staff_permission_events; r := r || jsonb_build_object('e1_audit', n);
  insert into staff_casefiles(title, linked_client_id) values ('E1 private', client);
  insert into staff_private_messages(recipient_id, body) values (e2, 'hola');
  begin insert into staff_lead_grants(user_id,lead_id,access_level) values (e1,other,'work'); r := r || '{"e1_self_assign":"ALLOWED"}';
  exception when others then r := r || '{"e1_self_assign":"denied"}'; end;
  update staff_portal_access set job_title='account_executive' where user_id=e1; get diagnostics n = row_count; r := r || jsonb_build_object('e1_self_promote_rows', n);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub',e2,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from staff_my_leads(); r := r || jsonb_build_object('e2_my_leads', n);
  select count(*) into n from staff_casefiles; r := r || jsonb_build_object('e2_sees_e1_casefiles', n);
  select count(*) into n from staff_private_messages; r := r || jsonb_build_object('e2_inbox', n);
  select count(*) into n from staff_client_grants; r := r || jsonb_build_object('e2_client_grants', n);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from staff_private_messages; r := r || jsonb_build_object('owner_reads_others_dms', n);
  select count(*) into n from staff_casefiles; r := r || jsonb_build_object('owner_casefiles', n);
  update staff_portal_access set active=false where user_id=e1;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub',e1,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from staff_my_leads(); r := r || jsonb_build_object('e1_revoked_leads', n);
  select count(*) into n from staff_casefiles; r := r || jsonb_build_object('e1_revoked_casefiles', n);
  select count(*) into n from staff_private_messages; r := r || jsonb_build_object('e1_revoked_dms', n);
  begin insert into staff_private_messages(recipient_id, body) values (e2,'after'); r := r || '{"e1_revoked_send":"ALLOWED"}';
  exception when others then r := r || '{"e1_revoked_send":"denied"}'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub',x,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from staff_my_leads(); r := r || jsonb_build_object('x_leads', n);
  select count(*) into n from staff_contacts; r := r || jsonb_build_object('x_contacts', n);
  begin insert into staff_portal_access(user_id,active) values (x,true); r := r || '{"x_self_enroll":"ALLOWED"}';
  exception when others then r := r || '{"x_self_enroll":"denied"}'; end;
  execute 'reset role';
  raise exception 'QA_RESULT %', r;  -- always rolls back: nothing persists
end $$;
