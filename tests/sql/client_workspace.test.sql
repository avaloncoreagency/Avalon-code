-- Isolated PostgreSQL acceptance: staff workspace, versioned notes, costs and RLS.
-- Requires the complete migration chain and crm_pipeline.test.sql with synthetic identities.
-- Test fixtures authorize the first owner explicitly for internal expenses.
insert into crm_private.finance_access(user_id)
values ('00000000-0000-4000-8000-0000000000a1')
on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',false);
do $$
declare c uuid; j uuid; ok boolean;
begin
  select id into c from public.crm_clients where legal_name='Acme QA';
  assert c is not null, 'synthetic client must exist';
  insert into public.crm_client_workspace (client_id,package_name,development_stage,next_step)
    values(c,'Growth Pro','Onboarding','Revisar brief');
  assert (select version from public.crm_client_workspace where client_id=c)=1, 'workspace initial version';
  update public.crm_client_workspace set development_stage='Implementación',next_step='Preparar sprint' where client_id=c;
  assert (select version from public.crm_client_workspace where client_id=c)=2, 'workspace increments version';
  assert (select count(*) from public.crm_client_workspace_revisions where client_id=c)=2, 'workspace before/after history';
  assert (select before_value->>'development_stage' from public.crm_client_workspace_revisions where client_id=c and version=2)='Onboarding', 'old stage preserved';
  insert into public.crm_client_journal(client_id,kind,title,body) values(c,'note','Kickoff','Llamada inicial') returning id into j;
  update public.crm_client_journal set body='Llamada inicial y brief' where id=j;
  assert (select version from public.crm_client_journal where id=j)=2, 'journal versioning';
  assert (select count(*) from public.crm_client_journal_revisions where entry_id=j)=2, 'journal immutable revisions';
  assert (select before_value->>'body' from public.crm_client_journal_revisions where entry_id=j and version=2)='Llamada inicial', 'journal previous body retained';
  insert into public.crm_client_costs(client_id,amount,currency,category,memo,incurred_on)
    values (c,125,'USD','Software','Licencia','2026-11-02'),(c,-25,'USD','Adjustment','Corrección aprobada','2026-11-03');
  assert crm_private.can_view_client_finances(), 'first owner is finance-authorized';
  assert (select sum(amount) from public.crm_client_costs where client_id=c and currency='USD')=100, 'signed adjustment totals';
  begin update public.crm_client_costs set amount=1 where client_id=c; ok:=false; exception when insufficient_privilege then ok:=true; end;
  assert ok, 'costs must be immutable';
  begin delete from public.crm_client_journal_revisions where entry_id=j;ok:=false;exception when insufficient_privilege then ok:=true;end;
  assert ok,'journal audit history must be immutable';
end $$;
reset role;
-- A different agency owner sees the SAME client record, can revise it and preserves the first editor's version.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a2',false);
do $$
declare c uuid; j uuid;
begin
  select id into c from public.crm_clients where legal_name='Acme QA';
  assert (select package_name from public.crm_client_workspace where client_id=c)='Growth Pro', 'second owner sees shared dossier';
  select id into j from public.crm_client_journal where client_id=c and title='Kickoff';
  assert j is not null, 'second owner sees same journal';
  update public.crm_client_workspace set next_step='Aprobación del segundo propietario' where client_id=c;
  update public.crm_client_journal set body='Validación del segundo propietario' where id=j;
  assert (select version from public.crm_client_workspace where client_id=c)=3, 'second owner advances shared workspace version';
  assert (select version from public.crm_client_journal where id=j)=3, 'second owner advances shared journal version';
  assert (select count(*) from public.crm_client_workspace_revisions where client_id=c)=3, 'all workspace revisions retained';
  assert (select count(*) from public.crm_client_journal_revisions where entry_id=j)=3, 'all journal revisions retained';
  assert (select count(*) from public.crm_client_costs where client_id=c)=0, 'second owner cannot read financial expenses';
  assert not crm_private.can_view_client_finances(), 'second owner is not finance-authorized';
  begin insert into public.crm_client_costs(client_id,amount,currency,category,memo,incurred_on)
    values(c,15,'USD','QA','Blocked',current_date); assert false, 'finance insert must be denied';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',false);
do $$
declare c uuid;
begin
  select id into c from public.crm_clients where legal_name='Acme QA';
  assert (select next_step from public.crm_client_workspace where client_id=c)='Aprobación del segundo propietario', 'first owner sees second owner changes';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a3',false);
do $$ declare ok boolean; begin
  assert (select count(*) from public.crm_client_workspace)=0, 'outsider workspace hidden';
  assert (select count(*) from public.crm_client_journal)=0, 'outsider journal hidden';
  assert (select count(*) from public.crm_client_costs)=0, 'outsider costs hidden';
  assert (select count(*) from public.crm_client_journal_revisions)=0, 'outsider audit hidden';
  begin insert into public.crm_client_journal(client_id,title,body) values(gen_random_uuid(),'Attack','Bypass');ok:=false;exception when others then ok:=true;end;
  assert ok,'outsider cannot create journals';
end $$;
reset role;
select 'client_workspace: all assertions passed' as result;
