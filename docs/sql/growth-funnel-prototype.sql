-- AVALON GROWTH 001. ISOLATED PROTOTYPE ONLY.
-- Apply to disposable PostgreSQL/PGlite after existing Avalon migrations.
-- NOT A PRODUCTION MIGRATION. SHIN/Claude must approve a Supabase CLI migration,
-- RLS, trigger impersonation, privacy/retention, rollback and live Preview before rollout.
-- Inbound voluntary form opt-in -> CRM lead at "new", never a sale, appointment or outreach.
begin;

create table public.crm_growth_funnels (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key = 'avalon'),
  slug text not null unique check (length(slug) between 3 and 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(btrim(title)) between 4 and 120),
  subheading text not null default '' check (length(subheading) <= 500),
  cta text not null default 'Solicitar información' check (length(btrim(cta)) between 4 and 80),
  template text not null check (template in ('capture','sales','appointments')),
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  client_id uuid references public.crm_clients(id),
  project_id uuid references public.os_projects(id),
  created_by uuid not null default auth.uid() references public.agency_memberships(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);
create index crm_growth_funnels_client_idx on public.crm_growth_funnels(client_id, status);
alter table public.crm_growth_funnels enable row level security;
revoke all on public.crm_growth_funnels from anon, authenticated;
grant select, insert, update on public.crm_growth_funnels to authenticated;
create policy growth_owner_read on public.crm_growth_funnels
  for select to authenticated using ((select crm_private.is_owner()) and agency_key='avalon');
create policy growth_owner_insert on public.crm_growth_funnels
  for insert to authenticated with check ((select crm_private.is_owner()) and agency_key='avalon'
    and created_by=(select auth.uid()));
create policy growth_owner_update on public.crm_growth_funnels
  for update to authenticated using ((select crm_private.is_owner()) and agency_key='avalon')
  with check ((select crm_private.is_owner()) and agency_key='avalon');

-- Preserve the creator/identity across owner edits, and detect stale versions.
create function crm_private.growth_funnel_touch() returns trigger
language plpgsql security invoker set search_path='' as $
begin
  if new.id is distinct from old.id or new.created_by is distinct from old.created_by
     or new.agency_key is distinct from old.agency_key then
    raise exception 'Funnel identity is immutable' using errcode='42501';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'Funnel version conflict' using errcode='23514';
  end if;
  new.updated_at := now();
  return new;
end $;
revoke all on function crm_private.growth_funnel_touch() from public, anon, authenticated;
create trigger crm_growth_funnel_touch before update on public.crm_growth_funnels
  for each row execute function crm_private.growth_funnel_touch();

create table public.crm_growth_funnel_submissions (
  id uuid primary key default gen_random_uuid(),
  agency_key text not null default 'avalon' check (agency_key='avalon'),
  funnel_id uuid not null references public.crm_growth_funnels(id),
  lead_id uuid not null references public.crm_leads(id),
  email_hash text not null check (length(email_hash)=64),
  message text not null check (length(btrim(message)) between 10 and 2000),
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(funnel_id,email_hash)
);
create index crm_growth_funnel_submissions_recent on public.crm_growth_funnel_submissions(created_at desc);
create index crm_growth_funnel_submissions_lead on public.crm_growth_funnel_submissions(lead_id);
alter table public.crm_growth_funnel_submissions enable row level security;
revoke all on public.crm_growth_funnel_submissions from anon, authenticated;
grant select on public.crm_growth_funnel_submissions to authenticated;
create policy growth_submissions_owner_read on public.crm_growth_funnel_submissions
  for select to authenticated using ((select crm_private.is_owner()) and agency_key='avalon');

-- Public read is intentionally limited to display strings; no owners, UUIDs,
-- client associations, submission records, secrets, pricing or raw metrics.
create function public.crm_growth_funnel_view(p_slug text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare f public.crm_growth_funnels;
begin
 if p_slug is null or length(p_slug) not between 3 and 60 or
    p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then return null; end if;
 select * into f from public.crm_growth_funnels where slug=p_slug and status='active';
 if not found then return null; end if;
 return jsonb_build_object('slug',f.slug,'title',f.title,'subheading',f.subheading,
    'cta',f.cta,'template',f.template);
end $$;
revoke all on function public.crm_growth_funnel_view(text) from public, anon, authenticated;
grant execute on function public.crm_growth_funnel_view(text) to anon, authenticated;

-- The only new anonymous write capability: a bounded, validated, single-purpose
-- RPC. No anonymous INSERT privileges on CRM tables are granted.
create function public.crm_growth_funnel_submit(request jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare
  v_slug text := btrim(coalesce(request->>'slug',''));
  v_company text := btrim(coalesce(request->>'company',''));
  v_name text := btrim(coalesce(request->>'name',''));
  v_email text := lower(btrim(coalesce(request->>'email','')));
  v_phone text := btrim(coalesce(request->>'phone',''));
  v_message text := btrim(coalesce(request->>'message',''));
  v_hash text;
  f public.crm_growth_funnels;
  v_lead uuid;
begin
  if jsonb_typeof(request) <> 'object' or pg_column_size(request) > 4096 then return 'invalid'; end if;
  -- Honeypot: answer generically but never write records.
  if coalesce(request->>'website_url','') <> '' then return 'ok'; end if;
  if request->'consent' is distinct from 'true'::jsonb then return 'invalid'; end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) not between 3 and 60
     or length(v_company) not between 2 and 200 or length(v_name) not between 2 and 160
     or length(v_phone)>40 or length(v_email)>254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or length(v_message) not between 10 and 2000 then return 'invalid'; end if;

  select * into f from public.crm_growth_funnels where slug=v_slug and status='active';
  if not found or not exists (
    select 1 from public.agency_memberships m
      where m.user_id=f.created_by and m.role='owner'
  ) then return 'unavailable'; end if;
  v_hash := encode(sha256(convert_to(v_email,'UTF8')),'hex');

  -- Serialize funnel submissions to prevent quota races and duplicate leads.
  perform pg_catalog.pg_advisory_xact_lock(7251837);
  if exists (select 1 from public.crm_growth_funnel_submissions s
             where s.funnel_id=f.id and s.email_hash=v_hash) then return 'ok'; end if;
  if (select count(*) from public.crm_growth_funnel_submissions s
        where s.email_hash=v_hash and s.created_at>now()-interval '24 hours') >= 3
     or (select count(*) from public.crm_growth_funnel_submissions s
        where s.created_at>now()-interval '1 hour') >= 30 then return 'throttled'; end if;

  -- Reuse an existing non-archived lead with this exact normalized email.
  -- A loose business-name match must never silently join two customers.
  select id into v_lead from public.crm_leads
   where lower(btrim(email))=v_email and not archived limit 1;
  if v_lead is null then
    -- Reuse the existing CRM audit/stamp guard (as in crm_public_inquiry).
    -- The assigned, still-authorized owner is recorded as the audited actor.
    perform set_config('request.jwt.claim.sub',f.created_by::text,true);
    begin
      insert into public.crm_leads(company,contact,email,phone,source,owner_id,stage_id)
       values(v_company,v_name,v_email,v_phone,left('Funnel: '||f.slug,200),f.created_by,'new')
       returning id into v_lead;
    exception when unique_violation then
      select id into v_lead from public.crm_leads
       where lower(btrim(email))=v_email and not archived limit 1;
      if v_lead is null then return 'unavailable'; end if;
    end;
  end if;
  insert into public.crm_growth_funnel_submissions(funnel_id,lead_id,email_hash,message,consent_at)
    values(f.id,v_lead,v_hash,v_message,now());
  return 'ok';
end $$;
revoke all on function public.crm_growth_funnel_submit(jsonb) from public, anon, authenticated;
grant execute on function public.crm_growth_funnel_submit(jsonb) to anon, authenticated;

commit;
