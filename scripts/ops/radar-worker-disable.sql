-- Immediate reversible kill switch for the autonomous Radar worker.
update public.crm_radar_worker_config set enabled=false, updated_at=now() where id='avalon';
select cron.unschedule('avalon-radar-hourly') where exists (select 1 from cron.job where jobname='avalon-radar-hourly');
-- Historical research reports and pipeline cards are deliberately preserved.
