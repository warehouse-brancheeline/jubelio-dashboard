-- Order archive, phase 2: automatic retention enforcement.
--
-- 2026-08-07 one-time cleanup already removed 135,279 orders older than 6
-- months (2023-05-31 through 2026-02-07) after orders_daily_rollup /
-- product_daily_rollup (added in the previous migration) were confirmed to
-- preserve revenue/order-count trends and product sales history for that
-- range. order_items cascades automatically (order_items_order_id_fkey is
-- ON DELETE CASCADE). Full order-level detail beyond the retention window
-- remains available in Jubelio itself; this database is a read cache for
-- the dashboard, not the system of record.
--
-- This migration schedules that same cleanup to run automatically going
-- forward, plus the daily rollup refresh, so retention stays enforced
-- without manual intervention.

create or replace function public.enforce_order_retention(p_retention_months integer default 6)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  -- Make sure the rollup covers everything about to be pruned.
  perform public.refresh_daily_rollups(current_date - (p_retention_months + 1) * interval '1 month');

  delete from public.orders
  where order_date < now() - (p_retention_months * interval '1 month');
  get diagnostics deleted_count = row_count;

  return deleted_count;
end;
$$;

revoke all on function public.enforce_order_retention(integer) from public, anon, authenticated;
grant execute on function public.enforce_order_retention(integer) to service_role;

select cron.schedule(
  'enforce-order-retention',
  '0 21 * * 0',
  $$select public.enforce_order_retention(6)$$
);

-- cron.schedule() upserts by job name, so this is safe to re-run: it
-- records the daily rollup-refresh job (already running live since the
-- previous migration) in this file's history too.
select cron.schedule(
  'refresh-daily-rollups',
  '30 20 * * *',
  $$select public.refresh_daily_rollups((current_date - interval '10 days')::date)$$
);
