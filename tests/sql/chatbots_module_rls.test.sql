-- Chatbot module security checks. Disposable PostgreSQL only.
\set ON_ERROR_STOP on

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
do $$
declare bot_id uuid;
begin
  insert into public.os_projects (module,name,settings)
    values ('chatbots','Chatbot synthetic QA','{"chatbot":{"greeting":"Hello"}}')
    returning id into bot_id;
  assert exists (select 1 from public.os_projects where id=bot_id and module='chatbots');
  assert exists (select 1 from public.os_audit where project_id=bot_id and operation='INSERT');
  -- A pre-existing 'apps' module must remain accepted after adding chatbots.
  insert into public.os_projects (module,name) values ('apps','Existing apps regression QA');
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$
begin
  assert exists (select 1 from public.os_projects where module='chatbots'), 'second owner denied';
  update public.os_projects set description='Reviewed' where module='chatbots';
  assert exists (select 1 from public.os_projects where module='chatbots' and description='Reviewed');
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
do $$
begin
  assert (select count(*) from public.os_projects where module='chatbots')=0,'outsider reads bot';
  begin
    insert into public.os_projects (module,name) values ('chatbots','Unapproved');
    raise exception 'outsider could insert chatbot';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
do $$
begin
  assert (select count(*) from public.os_projects where module='chatbots')=0,'operator reads chatbot';
end $$;
reset role;

set role anon;
select set_config('request.jwt.claim.sub','',false);
do $$
begin
  begin
    perform 1 from public.os_projects;
    raise exception 'anonymous could read chatbot projects';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
begin
  assert (select count(*) from public.os_projects where module='chatbots')=1,'unexpected chatbot count';
  assert (select count(*) from public.os_projects where module='apps')=1,'existing apps module lost';
  assert (select relrowsecurity from pg_class where oid='public.os_projects'::regclass), 'RLS missing';
end $$;
select 'chatbots_module_rls: passed' as result;
