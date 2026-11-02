-- CRM 13-stage pipeline, consolidated from PR #20 onto the single client model.
-- PREPARED ONLY — apply to an isolated database first; production needs explicit
-- owner approval and a ledger check. Replaces PR #20's 20261102120000 file, which
-- was never applied to production and created a second crm_clients table. Here the
-- client entity is the one from 20261102170000_avalon_sales_core (crm_clients with
-- origin_lead_id), so leads, conversions, sales and projects share one client.
-- Additive and non-destructive: no table/column is dropped, no row is deleted.
begin;

-- 1. Stages become configurable (without losing data) --------------------------
alter table public.crm_stages
 add column color text not null default '' check (color ~ '^(#[0-9a-fA-F]{6})?$'),
 add column stale_days integer not null default 14 check (stale_days between 1 and 365),
 add column default_probability numeric(5,2) not null default 0 check (default_probability between 0 and 100),
 add column followup_days integer check (followup_days between 0 and 365),
 add column followup_text text not null default '' check (length(followup_text) <= 300),
 add column active boolean not null default true;

-- Positions can be re-ordered inside one transaction.
alter table public.crm_stages drop constraint crm_stages_position_key;
alter table public.crm_stages add constraint crm_stages_position_key unique (position) deferrable initially deferred;

insert into public.crm_stages(id, label, kind, position) values
 ('researched', 'Investigado', 'open', 100),
 ('contact-pending', 'Contacto pendiente', 'open', 101),
 ('replied', 'Respondió', 'open', 102),
 ('diagnosed', 'Diagnóstico realizado', 'open', 103),
 ('nurture', 'Nutrición / seguimiento futuro', 'open', 104);

update public.crm_stages s set label = v.label, position = v.pos, stale_days = v.stale,
  default_probability = v.prob, followup_days = v.fu, followup_text = v.fu_text, updated_at = now()
from (values
 ('new','Nuevo lead',0,3,5,1,'Investigar y calificar el lead nuevo'),
 ('researched','Investigado',1,5,10,1,'Preparar el primer contacto'),
 ('contact-pending','Contacto pendiente',2,3,10,0,'Realizar el primer contacto'),
 ('contacted','Contactado',3,7,15,3,'Dar seguimiento al primer contacto'),
 ('replied','Respondió',4,5,25,1,'Responder y calificar la necesidad'),
 ('qualified','Calificado',5,7,35,2,'Agendar una reunión'),
 ('meeting','Reunión agendada',6,5,45,1,'Confirmar la reunión y preparar la agenda'),
 ('diagnosed','Diagnóstico realizado',7,7,60,2,'Preparar la propuesta con base en el diagnóstico'),
 ('proposal','Propuesta enviada',8,10,70,4,'Dar seguimiento a la propuesta'),
 ('negotiation','Negociación',9,10,85,3,'Resolver objeciones y cerrar'),
 ('won','Ganado',10,30,100,null,''),
 ('lost','Perdido',11,30,0,null,''),
 ('nurture','Nutrición / seguimiento futuro',12,60,10,30,'Retomar la conversación')
) as v(id,label,pos,stale,prob,fu,fu_text) where s.id = v.id;

-- Owners may edit/add stages; nobody may delete them (no data loss).
grant insert, update on public.crm_stages to authenticated;
create policy crm_insert on public.crm_stages for insert to authenticated
 with check ((select crm_private.is_owner()) and agency_key = 'avalon');
create policy crm_update on public.crm_stages for update to authenticated
 using ((select crm_private.is_owner()) and agency_key = 'avalon')
 with check ((select crm_private.is_owner()) and agency_key = 'avalon');

create function crm_private.stage_guard() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if not crm_private.is_owner() then raise exception 'CRM forbidden' using errcode = '42501'; end if;
 new.updated_at := clock_timestamp();
 if TG_OP = 'UPDATE' then
  new.id := old.id; new.agency_key := old.agency_key;
  if new.kind <> old.kind and exists(select 1 from public.crm_leads where stage_id = old.id) then
   raise exception 'No se puede cambiar el tipo de una etapa que tiene leads' using errcode = '23514';
  end if;
  if old.active and not new.active and exists(select 1 from public.crm_leads where stage_id = old.id and not archived) then
   raise exception 'Mueve los leads de la etapa antes de desactivarla' using errcode = '23514';
  end if;
 end if;
 return new;
end $$;
revoke all on function crm_private.stage_guard() from public;
create trigger crm_stage_guard before insert or update on public.crm_stages for each row execute function crm_private.stage_guard();

-- 2. Leads: richer data, stage clock, no moves into inactive stages -------------
alter table public.crm_leads
 add column website text not null default '' check (length(website) <= 300),
 add column industry text not null default '' check (length(industry) <= 120),
 add column location text not null default '' check (length(location) <= 200),
 add column stage_changed_at timestamptz not null default now(),
 add column prospect_id uuid references public.crm_prospects(id);
create index crm_leads_prospect on public.crm_leads(prospect_id) where prospect_id is not null;

create function crm_private.lead_stage() returns trigger language plpgsql security invoker set search_path = '' as $$
declare st public.crm_stages;
begin
 select * into st from public.crm_stages where id = new.stage_id;
 if TG_OP = 'INSERT' then
  new.stage_changed_at := now();
  if new.probability = 0 and st.kind = 'open' then new.probability := st.default_probability; end if;
 else
  new.stage_changed_at := old.stage_changed_at;
  if new.stage_id <> old.stage_id then
   new.stage_changed_at := now();
   if not st.active then raise exception 'La etapa está desactivada' using errcode = '23514'; end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function crm_private.lead_stage() from public;
create trigger crm_lead_stage before insert or update on public.crm_leads for each row execute function crm_private.lead_stage();

-- 3. Activities: notes/calls/emails/tasks linked to a lead OR a client ----------
alter table public.crm_activities
 add column kind text not null default 'note' check (kind in ('note','call','email','whatsapp','meeting','task','system')),
 add column client_id uuid;
alter table public.crm_activities alter column lead_id drop not null;
alter table public.crm_events add column client_id uuid;

-- 4. Activities and events can belong to the shared client ----------------------
alter table public.crm_activities add constraint crm_activities_client_fk foreign key (client_id) references public.crm_clients(id);
alter table public.crm_activities add constraint crm_activities_target check (lead_id is not null or client_id is not null);
alter table public.crm_events add constraint crm_events_client_fk foreign key (client_id) references public.crm_clients(id);
create index crm_activities_client on public.crm_activities(client_id, created_at desc) where client_id is not null;
create index crm_events_client on public.crm_events(client_id) where client_id is not null;

-- 5. Conversion decisions: append-only record -----------------------------------
create table public.crm_conversions (
 id uuid primary key default gen_random_uuid(), agency_key text not null default 'avalon' check (agency_key = 'avalon'),
 lead_id uuid not null references public.crm_leads(id),
 client_id uuid references public.crm_clients(id),
 decision text not null check (decision in ('convert', 'decline')),
 rationale text not null check (length(trim(rationale)) between 10 and 2000),
 snapshot jsonb not null,
 decided_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 check ((decision = 'convert') = (client_id is not null))
);
create index crm_conversions_lead on public.crm_conversions(lead_id, created_at desc);

-- Won leads are NOT turned into clients automatically. This function (or a confirmed
-- sale) is the only way; it records the decision and is idempotent per lead. It never
-- duplicates a client: it reuses the client created from this lead, or an existing
-- client with the same normalized company name.
create function public.crm_convert_lead_to_client(p_lead_id uuid, p_decision text, p_rationale text, p_services text[] default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare l public.crm_leads; k text; cid uuid;
begin
 if auth.uid() is null or not crm_private.is_owner() then raise exception 'CRM forbidden' using errcode = '42501'; end if;
 if p_decision not in ('convert', 'decline') then raise exception 'Decisión inválida' using errcode = '23514'; end if;
 if length(trim(coalesce(p_rationale, ''))) < 10 then raise exception 'Registra el motivo de la decisión' using errcode = '23514'; end if;
 select * into l from public.crm_leads where id = p_lead_id for update;
 if not found then raise exception 'Lead inexistente'; end if;
 select kind into k from public.crm_stages where id = l.stage_id;
 if k <> 'won' then raise exception 'Solo un lead ganado puede convertirse' using errcode = '23514'; end if;
 select id into cid from public.crm_clients where origin_lead_id = l.id;
 if cid is null then select client_id into cid from public.crm_conversions where lead_id = l.id and decision = 'convert' limit 1; end if;
 if cid is not null then return cid; end if;
 if p_decision = 'decline' and exists(select 1 from public.crm_conversions where lead_id = l.id and decision = 'decline') then return null; end if;
 perform set_config('avalon.source', 'rpc', true);
 if p_decision = 'convert' then
  select c.id into cid from public.crm_clients c where c.status <> 'archived' and crm_private.norm(c.legal_name) = crm_private.norm(l.company) limit 1;
  if cid is null then
   insert into public.crm_clients(legal_name, website, industry, location, source, owner_id, origin_lead_id)
   values (btrim(l.company), case when l.website ~ '^https://[^[:space:]<>"]+$' and length(l.website) <= 500 then l.website else '' end,
     l.industry, l.location, coalesce(nullif(btrim(l.source), ''), 'Pipeline'), l.owner_id, l.id)
   returning id into cid;
   if length(btrim(l.contact)) > 0 then
    insert into public.crm_contacts(client_id, full_name, email, phone, is_primary) values (cid, btrim(l.contact), l.email, l.phone, true);
   end if;
   perform crm_private.log('client.created', 'crm', 'crm_clients', cid, client_id => cid, to_state => 'active', detail => 'Conversión de lead');
  end if;
  perform crm_private.log('lead.converted', 'crm', 'crm_leads', l.id, client_id => cid, from_state => l.stage_id, to_state => 'client', detail => left(trim(p_rationale), 160));
 end if;
 insert into public.crm_conversions(lead_id, client_id, decision, rationale, snapshot, decided_by)
 values (l.id, cid, p_decision, trim(p_rationale), to_jsonb(l) || jsonb_build_object('services', to_jsonb(coalesce(p_services, '{}'::text[]))), auth.uid());
 return cid;
end $$;
revoke all on function public.crm_convert_lead_to_client(uuid, text, text, text[]) from public, anon;
grant execute on function public.crm_convert_lead_to_client(uuid, text, text, text[]) to authenticated;

-- 6. Automatic follow-up task when a lead enters a stage ------------------------
create function crm_private.stage_followup() returns trigger language plpgsql security invoker set search_path = '' as $$
declare st public.crm_stages;
begin
 if TG_OP = 'UPDATE' and new.stage_id = old.stage_id then return new; end if;
 select * into st from public.crm_stages where id = new.stage_id;
 if st.followup_days is not null and st.kind = 'open' and not new.archived then
  insert into public.crm_activities(lead_id, body, status, due_at, kind)
  values (new.id, 'Seguimiento automático: ' || coalesce(nullif(st.followup_text, ''), 'revisar el lead'), 'pending',
          now() + make_interval(days => st.followup_days), 'system');
 end if;
 return new;
end $$;
revoke all on function crm_private.stage_followup() from public;
create trigger crm_stage_followup after insert or update of stage_id on public.crm_leads for each row execute function crm_private.stage_followup();

-- 7. Stale-lead detection (read-only view, runs with the caller's RLS) ----------
create view public.crm_lead_health with (security_invoker = true) as
select l.id as lead_id, l.stage_id, l.owner_id, l.value, l.probability,
       l.stage_changed_at, s.stale_days,
       (l.stage_changed_at < now() - make_interval(days => s.stale_days)) as is_stale,
       floor(extract(epoch from (now() - l.stage_changed_at)) / 86400)::integer as days_in_stage
from public.crm_leads l join public.crm_stages s on s.id = l.stage_id
where not l.archived and s.kind = 'open';
revoke all on public.crm_lead_health from anon, authenticated;
grant select on public.crm_lead_health to authenticated;

-- 8. RLS for the new table (append-only through the function) ------------------
do $$ declare t text; begin
 foreach t in array array['crm_conversions'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from anon, authenticated', t);
  execute format('grant select on public.%I to authenticated', t);
  execute format('create policy crm_read on public.%I for select to authenticated using ((select crm_private.is_owner()) and agency_key = ''avalon'')', t);
 end loop;
end $$;

commit;
