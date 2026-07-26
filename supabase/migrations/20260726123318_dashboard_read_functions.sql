create or replace function public.dashboard_kpis(
  p_date_from date default null,
  p_date_to date default null,
  p_marketplace text default null,
  p_store text default null,
  p_location text default null,
  p_status text default null
)
returns table (
  order_count bigint,
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
    select *
    from public.dashboard_orders o
    where (p_date_from is null or o.business_date >= p_date_from)
      and (p_date_to is null or o.business_date <= p_date_to)
      and (p_marketplace is null or o.marketplace = p_marketplace)
      and (p_store is null or o.store_name = p_store)
      and (p_location is null or o.location_name = p_location)
      and (p_status is null or o.status = p_status)
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
    (select count(*) from filtered_orders)::bigint,
    coalesce((select sum(grand_total) from filtered_orders), 0)::numeric,
    (select max(order_date) from filtered_orders),
    (select max(synced_at) from filtered_orders),
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
    (select updated_at from backfill);
$$;

create or replace function public.dashboard_order_trend(
  p_date_from date default null,
  p_date_to date default null,
  p_marketplace text default null,
  p_store text default null,
  p_location text default null,
  p_status text default null
)
returns table (business_date date, order_count bigint, revenue numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    o.business_date,
    count(*)::bigint as order_count,
    coalesce(sum(o.grand_total), 0)::numeric as revenue
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

create or replace function public.dashboard_channel_summary(
  p_date_from date default null,
  p_date_to date default null,
  p_marketplace text default null,
  p_store text default null,
  p_location text default null,
  p_status text default null
)
returns table (marketplace text, order_count bigint, revenue numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    o.marketplace,
    count(*)::bigint as order_count,
    coalesce(sum(o.grand_total), 0)::numeric as revenue
  from public.dashboard_orders o
  where (p_date_from is null or o.business_date >= p_date_from)
    and (p_date_to is null or o.business_date <= p_date_to)
    and (p_marketplace is null or o.marketplace = p_marketplace)
    and (p_store is null or o.store_name = p_store)
    and (p_location is null or o.location_name = p_location)
    and (p_status is null or o.status = p_status)
  group by o.marketplace
  order by revenue desc, o.marketplace;
$$;

revoke all on function public.dashboard_kpis(date,date,text,text,text,text) from public, anon;
revoke all on function public.dashboard_order_trend(date,date,text,text,text,text) from public, anon;
revoke all on function public.dashboard_channel_summary(date,date,text,text,text,text) from public, anon;
grant execute on function public.dashboard_kpis(date,date,text,text,text,text) to authenticated;
grant execute on function public.dashboard_order_trend(date,date,text,text,text,text) to authenticated;
grant execute on function public.dashboard_channel_summary(date,date,text,text,text,text) to authenticated;
