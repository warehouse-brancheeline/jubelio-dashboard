-- Dead stock / slow-moving product monitoring. "Shelf life" was requested
-- but Jubelio's inventory payload for this account carries no expiry or
-- batch date (use_batch_number is false on sampled items), so this tracks
-- how long a SKU with stock on hand has gone without a completed sale
-- instead, per what the account actually holds. Threshold is configurable
-- (UI defaults to 60 days / ~2 months per the operator's requirement) and
-- looks across full order history, not bounded to the forecast window.

create function public.dead_stock_products(
  p_threshold_days integer default 60,
  p_location text default null,
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with params as (
  select
    greatest(coalesce(p_threshold_days, 60), 1) as threshold_days,
    nullif(btrim(p_location), '') as location_filter,
    greatest(coalesce(p_page, 1), 1) as page_number,
    least(greatest(coalesce(p_page_size, 25), 10), 100) as page_size,
    nullif(lower(btrim(p_search)), '') as search_text
),
inventory_by_product as (
  select
    i.item_id,
    p.sku,
    max(p.name) as product_name,
    sum(greatest(coalesce(i.quantity, 0), 0))::numeric as stock_available,
    max(i.synced_at) as stock_synced_at
  from public.inventory i
  join public.products p on p.item_id = i.item_id
  cross join params x
  where x.location_filter is null or i.location_name = x.location_filter
  group by i.item_id, p.sku
  having sum(greatest(coalesce(i.quantity, 0), 0)) > 0
),
last_sale as (
  select
    oi.sku,
    max((o.order_date at time zone 'Asia/Makassar')::date) as last_sale_date,
    sum(oi.quantity) filter (
      where (o.order_date at time zone 'Asia/Makassar')::date >= current_date - 90
    )::numeric as units_last_90_days
  from public.order_items oi
  join public.orders o on o.order_id = oi.order_id
  where upper(coalesce(o.status, '')) in ('COMPLETED', 'SUCCESS', 'SUCCEEDED')
    and upper(coalesce(o.marketplace, '')) <> 'INTERNAL'
    and upper(coalesce(o.store_name, '')) <> 'INTERNAL'
    and upper(coalesce(o.raw_data ->> 'order_type', '')) <> 'INTERNAL'
    and coalesce((o.raw_data ->> 'is_canceled')::boolean, false) is false
    and coalesce((oi.raw_data ->> 'is_canceled_item')::boolean, false) is false
    and coalesce((oi.raw_data ->> 'is_return_resolved')::boolean, false) is false
  group by oi.sku
),
combined as (
  select
    inv.item_id,
    inv.sku,
    inv.product_name,
    inv.stock_available,
    inv.stock_synced_at,
    ls.last_sale_date,
    coalesce(ls.units_last_90_days, 0)::numeric as units_last_90_days,
    case
      when ls.last_sale_date is null then null
      else (current_date - ls.last_sale_date)
    end::integer as days_since_last_sale
  from inventory_by_product inv
  left join last_sale ls on ls.sku = inv.sku
),
flagged as (
  select
    c.*,
    (c.last_sale_date is null or c.days_since_last_sale >= x.threshold_days) as is_dead_stock
  from combined c
  cross join params x
),
filtered as (
  select f.*
  from flagged f
  cross join params x
  where f.is_dead_stock
    and (
      x.search_text is null
      or lower(concat_ws(' ', f.sku, f.product_name)) like '%' || x.search_text || '%'
    )
),
summary as (
  select
    count(*)::bigint as product_count,
    coalesce(sum(stock_available), 0)::numeric as stock_units,
    count(*) filter (where last_sale_date is null)::bigint as never_sold_count
  from filtered
),
paged as (
  select
    item_id, sku, product_name, stock_available, stock_synced_at,
    last_sale_date, days_since_last_sale, units_last_90_days
  from filtered
  order by (last_sale_date is null) desc, days_since_last_sale desc nulls first, sku
  limit (select page_size from params)
  offset ((select page_number - 1 from params) * (select page_size from params))
)
select jsonb_build_object(
  'summary', jsonb_build_object(
    'product_count', s.product_count,
    'stock_units', s.stock_units,
    'never_sold_count', s.never_sold_count,
    'threshold_days', x.threshold_days
  ),
  'rows', coalesce((select jsonb_agg(to_jsonb(p)) from paged p), '[]'::jsonb)
)
from summary s
cross join params x;
$$;

revoke all on function public.dead_stock_products(integer, text, integer, integer, text)
  from public, anon;
grant execute on function public.dead_stock_products(integer, text, integer, integer, text)
  to authenticated;
