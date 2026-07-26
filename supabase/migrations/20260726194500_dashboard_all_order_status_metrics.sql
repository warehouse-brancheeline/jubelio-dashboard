-- Separate order value, completed revenue, and unfinished workload.
-- All functions remain security invoker so the underlying authenticated RLS applies.

drop function if exists public.dashboard_kpis(date,date,text,text,text,text);
drop function if exists public.dashboard_order_trend(date,date,text,text,text,text);
drop function if exists public.dashboard_channel_summary(date,date,text,text,text,text);
drop function if exists public.dashboard_order_totals(date,date,text,text,text,text,text);

create function public.dashboard_kpis(
  p_date_from date default null,
  p_date_to date default null,
  p_marketplace text default null,
  p_store text default null,
  p_location text default null,
  p_status text default null
)
returns table (
  order_count bigint,
  order_value numeric,
  completed_order_count bigint,
  completed_revenue numeric,
  open_order_count bigint,
  open_order_value numeric,
  cancelled_order_count bigint,
  revenue numeric,
  last_order_at timestamptz,
  order_synced_at timestamptz,
  inventory_rows bigint,
  total_on_hand numeric,
  total_available numeric,
  total_allocated numeric,
  low_stock_rows bigint,
  out_of_stock_rows bigint,
  location_count bigint,
  inventory_synced_at timestamptz,
  backfill_loaded bigint,
  backfill_total integer,
  backfill_completed boolean,
  backfill_updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered_orders as (
    select
      o.*,
      upper(coalesce(o.status, 'UNKNOWN')) as normalized_status
    from public.dashboard_orders o
    where (p_date_from is null or o.business_date >= p_date_from)
      and (p_date_to is null or o.business_date <= p_date_to)
      and (p_marketplace is null or o.marketplace = p_marketplace)
      and (p_store is null or o.store_name = p_store)
      and (p_location is null or o.location_name = p_location)
      and (p_status is null or o.status = p_status)
  ),
  order_metrics as (
    select
      count(*)::bigint as order_count,
      coalesce(sum(grand_total) filter (
        where normalized_status not in ('CANCELLED', 'CANCELED', 'RETURNED')
      ), 0)::numeric as order_value,
      count(*) filter (where normalized_status = 'COMPLETED')::bigint as completed_order_count,
      coalesce(sum(grand_total) filter (where normalized_status = 'COMPLETED'), 0)::numeric
        as completed_revenue,
      count(*) filter (
        where normalized_status not in ('COMPLETED', 'CANCELLED', 'CANCELED', 'RETURNED')
      )::bigint as open_order_count,
      coalesce(sum(grand_total) filter (
        where normalized_status not in ('COMPLETED', 'CANCELLED', 'CANCELED', 'RETURNED')
      ), 0)::numeric as open_order_value,
      count(*) filter (
        where normalized_status in ('CANCELLED', 'CANCELED', 'RETURNED')
      )::bigint as cancelled_order_count,
      max(order_date) as last_order_at,
      max(synced_at) as order_synced_at
    from filtered_orders
  ),
  filtered_inventory as (
    select *
    from public.dashboard_inventory i
    where (p_location is null or i.location_name = p_location)
  ),
  backfill as (
    select ss.total_count, ss.completed, ss.updated_at
    from public.sync_state ss
    where ss.sync_type = 'completed_orders_backfill'
    limit 1
  )
  select
    om.order_count,
    om.order_value,
    om.completed_order_count,
    om.completed_revenue,
    om.open_order_count,
    om.open_order_value,
    om.cancelled_order_count,
    om.completed_revenue as revenue,
    om.last_order_at,
    om.order_synced_at,
    (select count(*) from filtered_inventory)::bigint,
    coalesce((select sum(on_hand_quantity) from filtered_inventory), 0)::numeric,
    coalesce((select sum(available_quantity) from filtered_inventory), 0)::numeric,
    coalesce((select sum(allocated_quantity) from filtered_inventory), 0)::numeric,
    (select count(*) from filtered_inventory where stock_status = 'LOW_STOCK')::bigint,
    (select count(*) from filtered_inventory where stock_status = 'OUT_OF_STOCK')::bigint,
    (select count(distinct location_id) from filtered_inventory)::bigint,
    (select max(synced_at) from filtered_inventory),
    (select count(*) from public.orders)::bigint,
    coalesce((select total_count from backfill), 0)::integer,
    coalesce((select completed from backfill), false)::boolean,
    (select updated_at from backfill)
  from order_metrics om;
$$;

create function public.dashboard_order_trend(
  p_date_from date default null,
  p_date_to date default null,
  p_marketplace text default null,
  p_store text default null,
  p_location text default null,
  p_status text default null
)
returns table (
  business_date date,
  order_count bigint,
  order_value numeric,
  completed_revenue numeric,
  revenue numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    o.business_date,
    count(*)::bigint as order_count,
    coalesce(sum(o.grand_total) filter (
      where upper(coalesce(o.status, 'UNKNOWN')) not in ('CANCELLED', 'CANCELED', 'RETURNED')
    ), 0)::numeric as order_value,
    coalesce(sum(o.grand_total) filter (
      where upper(coalesce(o.status, 'UNKNOWN')) = 'COMPLETED'
    ), 0)::numeric as completed_revenue,
    coalesce(sum(o.grand_total) filter (
      where upper(coalesce(o.status, 'UNKNOWN')) = 'COMPLETED'
    ), 0)::numeric as revenue
  from public.dashboard_orders o
  where (p_date_from is null or o.business_date >= p_date_from)
    and (p_date_to is null or o.business_date <= p_date_to)
    and (p_marketplace is null or o.marketplace = p_marketplace)
    and (p_store is null or o.store_name = p_store)
    and (p_location is null or o.location_name = p_location)
    and (p_status is null or o.status = p_status)
  group by o.business_date
  order by o.business_date;
$$;

create function public.dashboard_channel_summary(
  p_date_from date default null,
  p_date_to date default null,
  p_marketplace text default null,
  p_store text default null,
  p_location text default null,
  p_status text default null
)
returns table (
  marketplace text,
  order_count bigint,
  order_value numeric,
  completed_revenue numeric,
  revenue numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    o.marketplace,
    count(*)::bigint as order_count,
    coalesce(sum(o.grand_total) filter (
      where upper(coalesce(o.status, 'UNKNOWN')) not in ('CANCELLED', 'CANCELED', 'RETURNED')
    ), 0)::numeric as order_value,
    coalesce(sum(o.grand_total) filter (
      where upper(coalesce(o.status, 'UNKNOWN')) = 'COMPLETED'
    ), 0)::numeric as completed_revenue,
    coalesce(sum(o.grand_total) filter (
      where upper(coalesce(o.status, 'UNKNOWN')) = 'COMPLETED'
    ), 0)::numeric as revenue
  from public.dashboard_orders o
  where (p_date_from is null or o.business_date >= p_date_from)
    and (p_date_to is null or o.business_date <= p_date_to)
    and (p_marketplace is null or o.marketplace = p_marketplace)
    and (p_store is null or o.store_name = p_store)
    and (p_location is null or o.location_name = p_location)
    and (p_status is null or o.status = p_status)
  group by o.marketplace
  order by 3 desc, o.marketplace;
$$;

create function public.dashboard_order_totals(
  p_date_from date default null,
  p_date_to date default null,
  p_marketplace text default null,
  p_store text default null,
  p_location text default null,
  p_status text default null,
  p_search text default null
)
returns table (
  order_count bigint,
  order_value numeric,
  completed_revenue numeric,
  revenue numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::bigint as order_count,
    coalesce(sum(o.grand_total) filter (
      where upper(coalesce(o.status, 'UNKNOWN')) not in ('CANCELLED', 'CANCELED', 'RETURNED')
    ), 0)::numeric as order_value,
    coalesce(sum(o.grand_total) filter (
      where upper(coalesce(o.status, 'UNKNOWN')) = 'COMPLETED'
    ), 0)::numeric as completed_revenue,
    coalesce(sum(o.grand_total) filter (
      where upper(coalesce(o.status, 'UNKNOWN')) = 'COMPLETED'
    ), 0)::numeric as revenue
  from public.dashboard_orders o
  where (p_date_from is null or o.business_date >= p_date_from)
    and (p_date_to is null or o.business_date <= p_date_to)
    and (p_marketplace is null or o.marketplace = p_marketplace)
    and (p_store is null or o.store_name = p_store)
    and (p_location is null or o.location_name = p_location)
    and (p_status is null or o.status = p_status)
    and (
      p_search is null
      or position(lower(btrim(p_search)) in o.search_text) > 0
    );
$$;

revoke all on function public.dashboard_kpis(date,date,text,text,text,text) from public, anon;
revoke all on function public.dashboard_order_trend(date,date,text,text,text,text) from public, anon;
revoke all on function public.dashboard_channel_summary(date,date,text,text,text,text) from public, anon;
revoke all on function public.dashboard_order_totals(date,date,text,text,text,text,text)
from public, anon;

grant execute on function public.dashboard_kpis(date,date,text,text,text,text) to authenticated;
grant execute on function public.dashboard_order_trend(date,date,text,text,text,text) to authenticated;
grant execute on function public.dashboard_channel_summary(date,date,text,text,text,text) to authenticated;
grant execute on function public.dashboard_order_totals(date,date,text,text,text,text,text)
to authenticated;
