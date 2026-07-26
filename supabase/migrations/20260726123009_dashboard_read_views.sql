-- Reader-safe models for the Jubelio operations dashboard.
-- security_invoker ensures underlying RLS policies remain effective.

create index if not exists orders_store_name_idx
  on public.orders (store_name);

create index if not exists orders_location_name_idx
  on public.orders ((nullif(btrim(raw_data ->> 'location_name'), '')));

create index if not exists orders_status_date_idx
  on public.orders (status, order_date desc);

create index if not exists inventory_location_available_idx
  on public.inventory (location_id, available_quantity);

drop view if exists public.dashboard_locations;
drop view if exists public.dashboard_inventory;
drop view if exists public.dashboard_orders;

create view public.dashboard_orders
with (security_invoker = true)
as
select
  o.order_id,
  o.order_number,
  o.order_date,
  (o.order_date at time zone 'Asia/Makassar')::date as business_date,
  o.marketplace,
  o.store_name,
  o.customer_name,
  o.status,
  o.subtotal,
  o.grand_total,
  nullif(btrim(o.raw_data ->> 'location_name'), '') as location_name,
  o.synced_at,
  lower(concat_ws(
    ' ',
    o.order_number,
    o.marketplace,
    o.store_name,
    o.customer_name,
    o.status,
    o.raw_data ->> 'location_name'
  )) as search_text
from public.orders o;

create view public.dashboard_inventory
with (security_invoker = true)
as
select
  i.item_id,
  p.sku,
  p.name as product_name,
  p.brand,
  p.category,
  i.location_id,
  i.location_name,
  greatest(coalesce(i.quantity, 0), 0)::numeric as on_hand_quantity,
  greatest(coalesce(i.available_quantity, 0), 0)::numeric as available_quantity,
  greatest(
    coalesce(
      nullif(i.raw_data ->> 'order_qty', '')::numeric,
      greatest(coalesce(i.quantity, 0) - coalesce(i.available_quantity, 0), 0),
      0
    ),
    0
  )::numeric as allocated_quantity,
  null::numeric as incoming_quantity,
  case
    when greatest(coalesce(i.available_quantity, 0), 0) = 0 then 'OUT_OF_STOCK'
    when greatest(coalesce(i.available_quantity, 0), 0) <= 5 then 'LOW_STOCK'
    else 'HEALTHY'
  end as stock_status,
  i.synced_at,
  lower(concat_ws(' ', p.sku, p.name, p.brand, p.category, i.location_name)) as search_text
from public.inventory i
join public.products p on p.item_id = i.item_id;

create view public.dashboard_locations
with (security_invoker = true)
as
select
  di.location_id,
  di.location_name,
  count(distinct di.item_id)::bigint as sku_count,
  sum(di.on_hand_quantity)::numeric as on_hand_quantity,
  sum(di.available_quantity)::numeric as available_quantity,
  sum(di.allocated_quantity)::numeric as allocated_quantity,
  count(*) filter (where di.stock_status = 'OUT_OF_STOCK')::bigint as out_of_stock_count,
  count(*) filter (where di.stock_status = 'LOW_STOCK')::bigint as low_stock_count,
  max(di.synced_at) as synced_at
from public.dashboard_inventory di
group by di.location_id, di.location_name;

drop policy if exists "Authenticated users can read sync state" on public.sync_state;
create policy "Authenticated users can read sync state"
on public.sync_state
for select
to authenticated
using (true);

revoke all on public.dashboard_orders from anon;
revoke all on public.dashboard_inventory from anon;
revoke all on public.dashboard_locations from anon;
grant select on public.dashboard_orders to authenticated;
grant select on public.dashboard_inventory to authenticated;
grant select on public.dashboard_locations to authenticated;
