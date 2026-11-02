-- Prepared only. Apply remotely ONLY after explicit approval.
-- Existing deployment is single-agency. Do not reuse this policy for multi-tenancy.
begin;
create schema if not exists crm_private;
revoke all on schema crm_private from public;
grant usage on schema crm_private to authenticated;
create function crm_private.is_owner() returns boolean language sql stable security invoker set search_path = '' as $$
 select exists(select 1 from public.agency_memberships where user_id = (select auth.uid()) and role = 'owner');
$$;
revoke all on function crm_private.is_owner() from public;
grant execute on function crm_private.is_owner() to authenticated;

create table public.crm_stages (
 id text primary key check (id ~ '^[a-z][a-z0-9-]{0,49}$'),
 label text not null check (length(label) between 1 and 80),
 kind text not null check (kind in ('open','won','lost')),
 position integer not null unique,
 agency_key text not null default 'avalon' check (agency_key = 'avalon'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.crm_stages(id,label,kind,position) values
 ('new','Nuevo','open',0),('contacted','Contactado','open',1),('qualified','Calificado','open',2),
 ('meeting','Reunión','open',3),('proposal','Propuesta','open',4),('negotiation','Negociación','open',5),
 ('won','Ganado','won',6),('lost','Perdido','lost',7);

create table public.crm_leads (
 id uuid primary key default gen_random_uuid(), agency_key text not null default 'avalon' check (agency_key = 'avalon'),
 company text not null check(length(trim(company)) between 1 and 200), contact text not null default '' check(length(contact)<=160),
 email text check(email is null or (length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 phone text not null default '' check(length(phone)<=40), source text not null check(length(trim(source)) between 1 and 200),
 owner_id uuid not null references public.agency_memberships(user_id), stage_id text not null default 'new' references public.crm_stages(id),
 value numeric(15,2) not null default 0 check(value between 0 and 1000000000000),
 probability numeric(5,2) not null default 0 check(probability between 0 and 100),
 priority text not null default 'normal' check(priority in ('low','normal','high')),
 follow_up_at timestamptz, loss_reason text not null default '' check(length(loss_reason)<=1000), archived boolean not null default false,
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1
);
create unique index crm_leads_email_unique on public.crm_leads(lower(trim(email))) where email is not null and not archived;
create unique index crm_leads_contact_unique on public.crm_leads(lower(trim(company)),lower(trim(contact))) where email is null and not archived;
create index crm_leads_filters on public.crm_leads(owner_id,created_at desc);
create index crm_leads_stage on public.crm_leads(stage_id) where not archived;
create index crm_leads_follow_up on public.crm_leads(follow_up_at) where not archived;
create index crm_leads_source on public.crm_leads(source);

create table public.crm_activities (
 id uuid primary key default gen_random_uuid(), agency_key text not null default 'avalon' check(agency_key='avalon'),
 lead_id uuid not null references public.crm_leads(id), body text not null check(length(trim(body)) between 1 and 4000),
 status text not null default 'completed' check(status in ('pending','completed')), due_at timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1
);
create index crm_activities_lead on public.crm_activities(lead_id,created_at desc);

create table public.crm_events (
 id uuid primary key default gen_random_uuid(), agency_key text not null default 'avalon' check(agency_key='avalon'),
 title text not null check(length(trim(title)) between 1 and 200), owner_id uuid not null references public.agency_memberships(user_id),
 lead_id uuid references public.crm_leads(id), starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
 timezone text not null check(length(timezone) between 1 and 100), participants text not null default '' check(length(participants)<=1000),
 kind text not null check(kind in ('meeting','call','follow-up','task')), status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')),
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1
);
create index crm_events_time on public.crm_events(owner_id,starts_at,ends_at) where status='scheduled';
create index crm_events_lead on public.crm_events(lead_id);

create table public.crm_prospects (
 id uuid primary key default gen_random_uuid(), agency_key text not null default 'avalon' check(agency_key='avalon'),
 company text not null check(length(trim(company)) between 1 and 200), contact text not null default '' check(length(contact)<=160),
 email text check(email is null or (length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 phone text not null default '' check(length(phone)<=40), source text not null check(length(trim(source)) between 1 and 200),
 owner_id uuid not null references public.agency_memberships(user_id), industry text not null default '' check(length(industry)<=120),
 location text not null default '' check(length(location)<=200), opportunity text not null check(length(trim(opportunity)) between 1 and 1000), acquired_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','converted')),
 lead_id uuid unique references public.crm_leads(id),
 check((status='converted') = (lead_id is not null)),
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1
);
create unique index crm_prospects_email_unique on public.crm_prospects(lower(trim(email))) where email is not null;
create unique index crm_prospects_contact_unique on public.crm_prospects(lower(trim(company)),lower(trim(contact))) where email is null;
create index crm_prospects_filters on public.crm_prospects(industry,location,status);

-- One manually reported consumption snapshot per provider/unit/billing period.
-- Threshold belongs to the snapshot; no external alerts or credentials are stored.
create table public.crm_usage (
 id uuid primary key default gen_random_uuid(), agency_key text not null default 'avalon' check(agency_key='avalon'),
 provider text not null check(provider in ('Codex','Claude','Higgsfield')), amount numeric not null check(amount>=0 and amount<=1e15),
 unit text not null check(length(trim(unit)) between 1 and 50), period_start timestamptz not null, period_end timestamptz not null check(period_end>period_start),
 limit_value numeric check(limit_value>=0 and limit_value<=1e15), threshold numeric not null default 80 check(threshold between 0 and 100),
 source text not null check(length(trim(source)) between 1 and 300), mode text not null default 'manual' check(mode='manual'),
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1,
 unique(provider,unit,period_start,period_end)
);

create table public.crm_audit (
 id uuid primary key default gen_random_uuid(), agency_key text not null default 'avalon' check(agency_key='avalon'),
 entity text not null, record_id uuid not null, actor_id uuid not null references auth.users(id), operation text not null check(operation in ('INSERT','UPDATE')),
 before_data jsonb, after_data jsonb not null, created_at timestamptz not null default now()
);
create index crm_audit_record on public.crm_audit(record_id,created_at desc);

create function crm_private.stamp() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not crm_private.is_owner() then raise exception 'CRM forbidden' using errcode='42501'; end if;
 if TG_OP='INSERT' then new.created_by := auth.uid(); new.created_at := now(); new.version := 1;
 else
   new.id := old.id; new.agency_key := old.agency_key; new.created_by := old.created_by; new.created_at := old.created_at; new.version := old.version+1;
 end if;
 new.updated_at := clock_timestamp();
 if TG_TABLE_NAME='crm_leads' then
 if (select kind from public.crm_stages where id=new.stage_id)='lost' and length(trim(new.loss_reason))=0 then
   raise exception 'Motivo de pérdida requerido' using errcode='23514';
 end if;
 end if;
 if TG_TABLE_NAME='crm_prospects' then
   if TG_OP='UPDATE' then
     if old.status='converted' then raise exception 'Converted prospect is immutable' using errcode='23514'; end if;
   end if;
   if new.status='converted' then
     if TG_OP='INSERT' then raise exception 'Approve before conversion' using errcode='23514'; end if;
     if old.status<>'approved' then raise exception 'Approve before conversion' using errcode='23514'; end if;
   end if;
 end if;
 return new;
end $$;
-- Narrow definer function is needed ONLY for append-only audit. No dynamic SQL,
-- no public RPC, no ability for authenticated clients to insert/change audit rows.
create function crm_private.audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.agency_memberships where user_id=auth.uid() and role='owner') then raise exception 'CRM forbidden' using errcode='42501'; end if;
 insert into public.crm_audit(entity,record_id,actor_id,operation,before_data,after_data)
 values(TG_TABLE_NAME,new.id,auth.uid(),TG_OP,case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
revoke all on function crm_private.audit() from public,anon,authenticated;
revoke all on function crm_private.stamp() from public;

create function crm_private.event_conflict() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Zona horaria inválida' using errcode='23514'; end if;
 -- Serialize event writes, then check overlaps with a fresh READ COMMITTED snapshot.
 perform pg_catalog.pg_advisory_xact_lock(7251801);
 if new.status='scheduled' and exists(select 1 from public.crm_events e where e.id<>new.id and e.status='scheduled'
   and e.starts_at<new.ends_at and e.ends_at>new.starts_at
   and (e.owner_id=new.owner_id or exists(
     select 1 from unnest(string_to_array(e.participants,',')) a
     join unnest(string_to_array(new.participants,',')) b on lower(trim(a))=lower(trim(b))
     where length(trim(a))>0))) then
   raise exception 'Conflicto de horario del responsable o participantes' using errcode='23P01';
 end if;
 return new;
end $$;
revoke all on function crm_private.event_conflict() from public;
create trigger crm_event_conflict before insert or update on public.crm_events for each row execute function crm_private.event_conflict();

-- Atomic, idempotent conversion: approved prospect and resulting lead share a transaction.
create function public.crm_convert_prospect(prospect_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare p public.crm_prospects; result uuid;
begin
 if not crm_private.is_owner() then raise exception 'CRM forbidden' using errcode='42501'; end if;
 select * into p from public.crm_prospects where id=prospect_id for update;
 if not found then raise exception 'Prospecto inexistente'; end if;
 if p.status='converted' then return p.lead_id; end if;
 if p.status<>'approved' then raise exception 'Revisa y aprueba el prospecto primero' using errcode='23514'; end if;
 insert into public.crm_leads(company,contact,email,phone,source,owner_id) values(p.company,p.contact,p.email,p.phone,p.source,p.owner_id) returning id into result;
 update public.crm_prospects set status='converted',lead_id=result where id=p.id;
 return result;
end $$;
revoke all on function public.crm_convert_prospect(uuid) from public,anon;
grant execute on function public.crm_convert_prospect(uuid) to authenticated;

-- All owners of the existing agency share CRM records. Other members have no access.
do $$ declare t text; begin
 foreach t in array array['crm_stages','crm_leads','crm_activities','crm_events','crm_prospects','crm_usage','crm_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy crm_read on public.%I for select to authenticated using ((select crm_private.is_owner()) and agency_key=''avalon'')',t);
  if t not in ('crm_stages','crm_audit') then
   execute format('grant insert,update on public.%I to authenticated',t);
   execute format('create policy crm_insert on public.%I for insert to authenticated with check ((select crm_private.is_owner()) and agency_key=''avalon'')',t);
   execute format('create policy crm_update on public.%I for update to authenticated using ((select crm_private.is_owner()) and agency_key=''avalon'') with check ((select crm_private.is_owner()) and agency_key=''avalon'')',t);
   execute format('create trigger crm_stamp before insert or update on public.%I for each row execute function crm_private.stamp()',t);
   execute format('create trigger crm_audit after insert or update on public.%I for each row execute function crm_private.audit()',t);
  end if;
 end loop;
end $$;
commit;
