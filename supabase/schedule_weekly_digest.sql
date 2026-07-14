-- ============================================================
-- Schedules the weekly-digest Edge Function to run every Monday
-- at 08:00 UTC. Run this once AFTER you've deployed the function
-- (see the "Weekly digest emails" section in README.md).
--
-- Edit the two placeholders below before running:
--   <project-ref>   e.g. abcdefghijklmno
--   <anon-or-service-key>  the anon public key is fine — the function
--                          itself uses the service role key internally
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'weekly-pending-digest',
  '0 8 * * 1', -- every Monday, 08:00 UTC — edit to taste (min hour dom month dow)
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/weekly-digest',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <anon-or-service-key>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To check it's registered:
-- select * from cron.job;

-- To remove it later:
-- select cron.unschedule('weekly-pending-digest');
