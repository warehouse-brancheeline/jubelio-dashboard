-- Refresh current order workflow stages every 30 minutes using the existing
-- server-only API key from Vault. The key never reaches the browser.
select cron.unschedule(jobid)
from cron.job
where jobname = 'jubelio-dashboard-orders';

select cron.schedule(
  'jubelio-dashboard-orders',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://rzunzsphlsqjcungtawo.supabase.co/functions/v1/jubelio-backfill-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'jubelio_cron_secret_key'
      )
    ),
    body := '{"source":"cron","action":"dashboard"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
