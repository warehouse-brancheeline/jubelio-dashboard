-- Fill historical order item detail gradually so forecast quality improves
-- without exceeding the free Edge Function runtime.
select cron.unschedule(jobid)
from cron.job
where jobname = 'jubelio-forecast-items';

select cron.schedule(
  'jubelio-forecast-items',
  '*/10 * * * *',
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
    body := '{"source":"cron","action":"forecast_items"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
