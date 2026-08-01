-- Fixes found during the 2026-08-01 production audit.
-- Public RPCs remain security invoker and server-only refresh stays locked down.

create index if not exists orders_status_order_date_order_id_idx
  on public.orders (status, order_date desc, order_id);
create index if not exists orders_synced_at_idx
  on public.orders (synced_at desc);

-- The UI sends trend limits as percentages (-30 and 50). The original
-- implementation expects decimal rates (-0.30 and 0.50).
alter function public.forecast_restock(date,date,text,integer,integer,integer,numeric,numeric,numeric,numeric,integer,integer,text,text)
  rename to forecast_restock_legacy;

create function public.forecast_restock(
  p_date_from date default null,
  p_date_to date default null,
  p_location text default null,
  p_default_lead_time_days integer default 14,
  p_safety_stock_days integer default 7,
  p_coverage_days integer default 30,
  p_z_score numeric default 1.65,
  p_trend_floor numeric default -30,
  p_trend_cap numeric default 50,
  p_default_moq numeric default 1,
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default null,
  p_priority text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with result as (
  select public.forecast_restock_legacy(
    p_date_from,p_date_to,p_location,p_default_lead_time_days,p_safety_stock_days,
    p_coverage_days,p_z_score,p_trend_floor/100.0,p_trend_cap/100.0,p_default_moq,
    p_page,p_page_size,p_search,p_priority
  ) as payload
), marked as (
  select jsonb_set(
    jsonb_set(
      payload,
      '{coverage,usable}',
      to_jsonb(coalesce((payload #>> '{coverage,coverage_percentage}')::numeric >= 90, false)),
      true
    ),
    '{coverage,status}',
    to_jsonb(case
      when coalesce((payload #>> '{coverage,coverage_percentage}')::numeric,0) >= 90
        then 'LAYAK'
      else 'BELUM_LAYAK'
    end::text),
    true
  ) as payload
  from result
)
select payload from marked;
$$;

revoke all on function public.forecast_restock(date,date,text,integer,integer,integer,numeric,numeric,numeric,numeric,integer,integer,text,text)
  from public,anon;
grant execute on function public.forecast_restock(date,date,text,integer,integer,integer,numeric,numeric,numeric,numeric,integer,integer,text,text)
  to authenticated;

-- Allow operational detail navigation to request more than one status group.
create or replace function public.dashboard_order_totals_v2(
  p_date_from date default null,
  p_date_to date default null,
  p_marketplace text default null,
  p_store text default null,
  p_location text default null,
  p_status_group text default null,
  p_settlement_status text default null,
  p_search text default null
)
returns table (order_count bigint,order_value numeric,completed_revenue numeric)
language sql stable security invoker set search_path=public
as $$
  select count(*)::bigint,
    coalesce(sum(o.grand_total) filter (where o.status_group not in ('CANCELLED','RETURNED')),0)::numeric,
    coalesce(sum(o.grand_total) filter (where o.status_group='COMPLETED'),0)::numeric
  from public.dashboard_order_facts o
  where (p_date_from is null or o.business_date>=p_date_from)
    and (p_date_to is null or o.business_date<=p_date_to)
    and (p_marketplace is null or o.marketplace=p_marketplace)
    and (p_store is null or o.store_name=p_store)
    and (p_location is null or o.location_name=p_location)
    and (p_status_group is null or o.status_group=any(string_to_array(p_status_group,',')))
    and (p_settlement_status is null or o.settlement_status=p_settlement_status)
    and (p_search is null or position(lower(btrim(p_search)) in lower(concat_ws(' ',
      o.order_number,o.invoice_number,o.tracking_number,o.marketplace,o.store_name,o.status_group,o.location_name)))>0);
$$;
revoke all on function public.dashboard_order_totals_v2(date,date,text,text,text,text,text,text) from public,anon;
grant execute on function public.dashboard_order_totals_v2(date,date,text,text,text,text,text,text) to authenticated;

-- PostgREST's short statement timeout caused every cache refresh to fail.
-- The advisory lock prevents overlapping cron runs from refreshing it twice.
create or replace function public.refresh_dashboard_order_facts()
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not pg_try_advisory_xact_lock(hashtext('refresh_dashboard_order_facts')) then
    return;
  end if;
  perform set_config('statement_timeout','120000',true);
  refresh materialized view concurrently public.dashboard_order_facts;
end;
$$;
revoke all on function public.refresh_dashboard_order_facts() from public,anon,authenticated;
grant execute on function public.refresh_dashboard_order_facts() to service_role;

-- Add live source/cache comparison without re-parsing all order JSON in the
-- main summary function.
alter function public.dashboard_operational_summary(date,date,text,text,text,text,text)
  rename to dashboard_operational_summary_legacy;

create function public.dashboard_operational_summary(
  p_date_from date default null,
  p_date_to date default null,
  p_marketplace text default null,
  p_store text default null,
  p_location text default null,
  p_status_group text default null,
  p_settlement_status text default null
)
returns jsonb
language sql
stable
security invoker
set search_path=public
as $$
with base as (
  select public.dashboard_operational_summary_legacy(
    p_date_from,p_date_to,p_marketplace,p_store,p_location,p_status_group,p_settlement_status
  ) payload
), health as (
  select
    (select count(*) from public.orders)::bigint raw_count,
    (select count(*) from public.dashboard_order_facts)::bigint cache_count,
    (select max(synced_at) from public.orders) raw_synced_at,
    (select max(synced_at) from public.dashboard_order_facts) cache_synced_at
)
select jsonb_set(
  b.payload,
  '{quality,sync_health}',
  jsonb_build_object(
    'raw_count',h.raw_count,
    'cache_count',h.cache_count,
    'missing_from_cache',greatest(h.raw_count-h.cache_count,0),
    'raw_synced_at',h.raw_synced_at,
    'cache_synced_at',h.cache_synced_at,
    'lag_minutes',case when h.raw_synced_at is null or h.cache_synced_at is null then null
      else round(extract(epoch from (h.raw_synced_at-h.cache_synced_at))/60.0,1) end,
    'stale',h.cache_synced_at is null or h.raw_synced_at-h.cache_synced_at > interval '30 minutes'
      or h.raw_count<>h.cache_count
  ),
  true
)
from base b cross join health h;
$$;
revoke all on function public.dashboard_operational_summary(date,date,text,text,text,text,text) from public,anon;
grant execute on function public.dashboard_operational_summary(date,date,text,text,text,text,text) to authenticated;

-- Re-scan the 90-day item history after adding the supporting index. Existing
-- rows are skipped by the worker, so this retries only missing order details.
update public.sync_state
set next_page=1, completed=false, updated_at=now()
where sync_type='forecast_order_items_backfill';
