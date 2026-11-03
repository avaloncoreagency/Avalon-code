-- Operational setup ONLY (do not add this script to the app migration chain).
-- Requires the reviewed worker function to be deployed and validated first.
-- Supabase project: ltbwzcrxeuczdhhtbqgm.
-- The dedicated secret is generated inside Postgres, NEVER committed or printed.

create extension if not exists pg_net;
create extension if not exists pg_cron;

do $avalon$
declare
  token text;
begin
  if not exists (select 1 from public.crm_radar_worker_config where id='avalon' and enabled=false and token_sha256='') then
    raise exception 'Worker must be new and disabled; refusing secret rotation';
  end if;
  if exists (select 1 from vault.secrets where name='avalon_radar_hourly_token') then
    raise exception 'Vault secret already exists; refusing duplicate';
  end if;
  token := encode(extensions.gen_random_bytes(32),'hex');
  perform vault.create_secret(token, 'avalon_radar_hourly_token');
  update public.crm_radar_worker_config
    set token_sha256=encode(sha256(convert_to(token,'UTF8')),'hex'),
        updated_at=now()
    where id='avalon' and enabled=false;
end
$avalon$;

-- Then call this HTTP probe ONCE (without printing the Vault secret) to
-- validate auth, bundled Deno code and read permissions. It does NO crawling:
-- select net.http_post(
--   url:='https://ltbwzcrxeuczdhhtbqgm.supabase.co/functions/v1/avalon-radar-worker',
--   headers:=jsonb_build_object('Content-Type','application/json',
--     'x-avalon-radar-job',
--     (select decrypted_secret from vault.decrypted_secrets where name='avalon_radar_hourly_token')),
--   body:='{"dry_run":true}'::jsonb,
--   timeout_milliseconds:=120000
-- );
-- Inspect net._http_response by the returned ID and require HTTP 200.
-- Then enable and schedule:
-- update public.crm_radar_worker_config set enabled=true where id='avalon';
-- select cron.schedule('avalon-radar-hourly','5 * * * *',
--   $$select net.http_post(
--     url:='https://ltbwzcrxeuczdhhtbqgm.supabase.co/functions/v1/avalon-radar-worker',
--     headers:=jsonb_build_object('Content-Type','application/json',
--       'x-avalon-radar-job',
--       (select decrypted_secret from vault.decrypted_secrets where name='avalon_radar_hourly_token')),
--     body:='{}'::jsonb,
--     timeout_milliseconds:=120000
--   )$$);
