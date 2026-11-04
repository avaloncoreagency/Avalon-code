-- PROPOSAL ONLY. Requires #87 registration proposal and existing OS/CRM schema.
-- Tested on disposable PostgreSQL only. No machine/owner identities provisioned here.
begin;
create function public.os_create_unassigned_creative_project(
 p_module text,p_source_ref text,p_name text,p_description text,p_agent text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare existing public.os_projects; new_id uuid;
begin
 if not coalesce(os_private.is_owner(),false) then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_module is null or p_module not in ('website','ecommerce','crm_creator') or p_agent is null or p_agent not in ('codex','claude')
  or p_source_ref is null or p_source_ref !~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$'
  or p_name is null or length(btrim(p_name)) not between 1 and 120 or p_description is null or length(p_description)>2000
 then raise exception 'Invalid project' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('avalon-creative-source:'||p_module||':'||p_source_ref,0));
 select * into existing from public.os_projects where module=p_module and settings#>>'{creative,provider}'='higgsfield' and settings#>>'{creative,external_ref}'=p_source_ref;
 if found then
  if existing.name<>btrim(p_name) then raise exception 'Source collision' using errcode='22023'; end if;
  return jsonb_build_object('project_id',existing.id,'created',false);
 end if;
 insert into public.os_projects(module,name,description,status,created_by,settings)
 values(p_module,btrim(p_name),p_description,'draft',auth.uid(),jsonb_build_object(
  'creative',jsonb_build_object('provider','higgsfield','external_ref',p_source_ref,'agent',p_agent,'state','unassigned','ingestion','owner_checkpoint'),
  'operations',jsonb_build_object('client_lead_id',''),
  'blueprint',jsonb_build_object('entities','[]'::jsonb,'pipelines','[]'::jsonb,'permissions','[]'::jsonb)
 )) returning id into new_id;
 return jsonb_build_object('project_id',new_id,'created',true);
end $$;

create function public.os_link_creative_project(p_project_id uuid,p_lead_id uuid,p_version integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare project public.os_projects; lead public.crm_leads; v_client_id uuid; matches integer;
begin
 if not coalesce(os_private.is_owner(),false) then raise exception 'Forbidden' using errcode='42501'; end if;
 select * into project from public.os_projects where id=p_project_id for update;
 if not found or project.settings#>>'{creative,provider}' is distinct from 'higgsfield' then raise exception 'Not found' using errcode='22023'; end if;
 if project.status='archived' then raise exception 'Archived' using errcode='22023'; end if;
 if project.settings#>>'{operations,client_lead_id}'=p_lead_id::text then return jsonb_build_object('project_id',project.id,'lead_id',p_lead_id,'changed',false); end if;
 if project.version is distinct from p_version or coalesce(project.settings#>>'{operations,client_lead_id}','')<>'' or project.client_id is not null then raise exception 'Conflict' using errcode='40001'; end if;
 select * into lead from public.crm_leads where id=p_lead_id and not archived;
 if not found then raise exception 'Unknown lead' using errcode='22023'; end if;
 select count(*),min(id::text)::uuid into matches,v_client_id from public.crm_clients where status<>'archived' and (origin_lead_id=lead.id or lower(btrim(legal_name))=lower(btrim(lead.company)) or (btrim(trade_name)<>'' and lower(btrim(trade_name))=lower(btrim(lead.company))));
 if matches>1 then raise exception 'Ambiguous client' using errcode='22023'; end if;
 update public.os_projects set client_id=v_client_id,
 settings=jsonb_set(jsonb_set(project.settings,'{operations,client_lead_id}',to_jsonb(lead.id::text),true),'{creative,state}','"reference_only"'::jsonb,true)
 where id=project.id;
 return jsonb_build_object('project_id',project.id,'lead_id',lead.id,'changed',true);
end $$;

create function public.os_save_creative_checkpoint(p_project_id uuid,p_version integer,p_event_id text,p_manifest jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare project public.os_projects; events jsonb; fingerprint text;
begin
 if not coalesce(os_private.is_owner(),false) then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_event_id is null or p_event_id !~ '^[a-zA-Z0-9_.:-]{1,120}$' or p_manifest is null or jsonb_typeof(p_manifest)<>'object' or octet_length(p_manifest::text)>16000
 then raise exception 'Invalid checkpoint' using errcode='22023'; end if;
 select * into project from public.os_projects where id=p_project_id for update;
 if not found or project.settings#>>'{creative,provider}' is distinct from 'higgsfield' then raise exception 'Not found' using errcode='22023'; end if;
 if p_manifest->>'schema_version' is distinct from '1' or p_manifest->>'project_ref' is distinct from project.settings#>>'{creative,external_ref}' or coalesce(p_manifest->>'head_sha','')!~'^[a-f0-9]{40}$'
 then raise exception 'Identity mismatch' using errcode='22023'; end if;
 fingerprint:=encode(sha256(convert_to(p_manifest::text,'UTF8')),'hex');
 events:=coalesce(project.settings->'creative_checkpoint_events','{}'::jsonb);
 if events ? p_event_id then
  if events->>p_event_id<>fingerprint then raise exception 'Conflicting event' using errcode='40001'; end if;
  return jsonb_build_object('project_id',project.id,'replayed',true,'version',project.version);
 end if;
 if project.status='archived' or project.version is distinct from p_version then raise exception 'Conflict' using errcode='40001'; end if;
 if (select count(*) from jsonb_object_keys(events))>=100 then raise exception 'Checkpoint history bound reached' using errcode='54000'; end if;
 update public.os_projects set settings=project.settings||jsonb_build_object('creative_continuity',p_manifest,'creative_checkpoint_events',events||jsonb_build_object(p_event_id,fingerprint)) where id=project.id;
 return jsonb_build_object('project_id',project.id,'replayed',false,'version',project.version+1);
end $$;
create function public.os_link_creative_sale(p_project_id uuid,p_sale_id uuid,p_version integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare project public.os_projects; sale public.crm_sales;
begin
 if not coalesce(os_private.is_owner(),false) then raise exception 'Forbidden' using errcode='42501'; end if;
 select * into project from public.os_projects where id=p_project_id for update;
 if not found or project.settings#>>'{creative,provider}' is distinct from 'higgsfield' or project.status='archived' then raise exception 'Unknown project' using errcode='22023'; end if;
 select * into sale from public.crm_sales where id=p_sale_id and status='confirmed';
 if not found or project.client_id is null or project.client_id is distinct from sale.client_id then raise exception 'Confirmed sale/client mismatch' using errcode='22023'; end if;
 if project.settings#>>'{creative,verified_sale_id}'=sale.id::text then return jsonb_build_object('project_id',project.id,'sale_id',sale.id,'changed',false); end if;
 if project.version is distinct from p_version or coalesce(project.settings#>>'{creative,verified_sale_id}','')<>'' then raise exception 'Conflict' using errcode='40001'; end if;
 update public.os_projects set settings=jsonb_set(project.settings,'{creative,verified_sale_id}',to_jsonb(sale.id::text),true) where id=project.id;
 return jsonb_build_object('project_id',project.id,'sale_id',sale.id,'changed',true);
end $$;
revoke all on function public.os_link_creative_sale(uuid,uuid,integer) from public,anon;
grant execute on function public.os_link_creative_sale(uuid,uuid,integer) to authenticated;

revoke all on function public.os_create_unassigned_creative_project(text,text,text,text,text) from public,anon;
revoke all on function public.os_link_creative_project(uuid,uuid,integer) from public,anon;
revoke all on function public.os_save_creative_checkpoint(uuid,integer,text,jsonb) from public,anon;
grant execute on function public.os_create_unassigned_creative_project(text,text,text,text,text) to authenticated;
grant execute on function public.os_link_creative_project(uuid,uuid,integer) to authenticated;
grant execute on function public.os_save_creative_checkpoint(uuid,integer,text,jsonb) to authenticated;
commit;
