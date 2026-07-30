-- Auditable restock forecast based on completed customer transactions.

create table if not exists public.forecast_product_settings (
  item_id bigint primary key references public.products(item_id) on delete cascade,
  lead_time_days integer check (lead_time_days between 1 and 365),
  moq numeric check (moq > 0),
  safety_stock numeric check (safety_stock >= 0),
  incoming_quantity numeric check (incoming_quantity >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.forecast_product_settings enable row level security;

drop policy if exists "Authenticated users can read forecast settings"
  on public.forecast_product_settings;
create policy "Authenticated users can read forecast settings"
on public.forecast_product_settings
for select
to authenticated
using (true);

drop policy if exists "Authenticated users can insert forecast settings"
  on public.forecast_product_settings;
create policy "Authenticated users can insert forecast settings"
on public.forecast_product_settings
for insert
to authenticated
with check ((select auth.uid()) is not null and updated_by = (select auth.uid()));

drop policy if exists "Authenticated users can update forecast settings"
  on public.forecast_product_settings;
create policy "Authenticated users can update forecast settings"
on public.forecast_product_settings
for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null and updated_by = (select auth.uid()));

revoke all on public.forecast_product_settings from public, anon;
grant select, insert, update on public.forecast_product_settings to authenticated;

create index if not exists order_items_sku_order_idx
  on public.order_items (sku, order_id);

create index if not exists orders_completed_business_date_idx
  on public.orders (((order_date at time zone 'Asia/Makassar')::date), order_id)
  where upper(coalesce(status, '')) in ('COMPLETED', 'SUCCESS', 'SUCCEEDED');

drop function if exists public.forecast_restock(
  date,date,text,integer,integer,integer,numeric,numeric,numeric,numeric,integer,integer,text,text
);

create function public.forecast_restock(
  p_date_from date,
  p_date_to date,
  p_location text default null,
  p_default_lead_time_days integer default 14,
  p_safety_stock_days integer default 7,
  p_coverage_days integer default 30,
  p_z_score numeric default 1.65,
  p_trend_floor numeric default -0.30,
  p_trend_cap numeric default 0.50,
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
with
params as (
  select
    least(coalesce(p_date_from, current_date - 29), coalesce(p_date_to, current_date)) as date_from,
    greatest(coalesce(p_date_from, current_date - 29), coalesce(p_date_to, current_date)) as date_to,
    greatest(
      greatest(coalesce(p_date_from, current_date - 29), coalesce(p_date_to, current_date))
      - least(coalesce(p_date_from, current_date - 29), coalesce(p_date_to, current_date)) + 1,
      1
    )::integer as analysis_days,
    nullif(btrim(p_location), '') as location_filter,
    greatest(coalesce(p_default_lead_time_days, 14), 1) as default_lead_time_days,
    greatest(coalesce(p_safety_stock_days, 7), 0) as safety_stock_days,
    greatest(coalesce(p_coverage_days, 30), 1) as coverage_days,
    greatest(coalesce(p_z_score, 1.65), 0) as z_score,
    least(coalesce(p_trend_floor, -0.30), 0)::numeric as trend_floor,
    greatest(coalesce(p_trend_cap, 0.50), 0)::numeric as trend_cap,
    greatest(coalesce(p_default_moq, 1), 0.000001)::numeric as default_moq,
    greatest(coalesce(p_page, 1), 1) as page_number,
    least(greatest(coalesce(p_page_size, 25), 10), 100) as page_size,
    nullif(lower(btrim(p_search)), '') as search_text,
    nullif(upper(btrim(p_priority)), '') as priority_filter
),
inventory_by_product as (
  select
    i.item_id,
    p.sku,
    max(p.name) as product_name,
    sum(greatest(coalesce(i.quantity, 0), 0))::numeric as stock_available,
    sum(greatest(
      coalesce(
        nullif(i.raw_data ->> 'order_qty', '')::numeric,
        greatest(coalesce(i.quantity, 0) - coalesce(i.available_quantity, 0), 0),
        0
      ),
      0
    ))::numeric as allocated_quantity,
    max(i.synced_at) as stock_synced_at
  from public.inventory i
  join public.products p on p.item_id = i.item_id
  cross join params x
  where x.location_filter is null or i.location_name = x.location_filter
  group by i.item_id, p.sku
),
completed_orders as (
  select
    o.order_id,
    (o.order_date at time zone 'Asia/Makassar')::date as business_date,
    coalesce(
      nullif(o.raw_data ->> 'buyer_id', ''),
      nullif(o.raw_data ->> 'contact_id', ''),
      nullif(lower(o.raw_data ->> 'customer_email'), ''),
      nullif(lower(o.customer_name), ''),
      'ORDER-' || o.order_id::text
    ) as customer_key
  from public.orders o
  cross join params x
  where (o.order_date at time zone 'Asia/Makassar')::date between x.date_from and x.date_to
    and upper(coalesce(o.status, '')) in ('COMPLETED', 'SUCCESS', 'SUCCEEDED')
    and upper(coalesce(o.marketplace, '')) <> 'INTERNAL'
    and upper(coalesce(o.store_name, '')) <> 'INTERNAL'
    and upper(coalesce(o.raw_data ->> 'order_type', '')) <> 'INTERNAL'
    and coalesce((o.raw_data ->> 'is_canceled')::boolean, false) is false
),
order_product_sales as (
  select
    co.order_id,
    co.business_date,
    co.customer_key,
    oi.sku,
    max(coalesce(oi.product_name, p.name, oi.sku)) as product_name,
    sum(greatest(coalesce(oi.quantity, 0), 0))::numeric as units
  from completed_orders co
  join public.order_items oi on oi.order_id = co.order_id
  left join public.products p on p.sku = oi.sku
  where coalesce((oi.raw_data ->> 'is_canceled_item')::boolean, false) is false
    and coalesce((oi.raw_data ->> 'is_return_resolved')::boolean, false) is false
    and nullif(btrim(oi.sku), '') is not null
    and coalesce(oi.quantity, 0) > 0
  group by co.order_id, co.business_date, co.customer_key, oi.sku
),
quantity_bounds as (
  select
    sku,
    percentile_cont(0.25) within group (order by units) as q1,
    percentile_cont(0.75) within group (order by units) as q3
  from order_product_sales
  group by sku
),
bounded_sales as (
  select
    s.*,
    greatest(
      1,
      ceil(b.q3 + 1.5 * (b.q3 - b.q1))
    )::numeric as outlier_cap,
    least(
      s.units,
      greatest(1, ceil(b.q3 + 1.5 * (b.q3 - b.q1)))::numeric
    )::numeric as normal_units,
    (s.units > greatest(1, ceil(b.q3 + 1.5 * (b.q3 - b.q1)))) as is_outlier
  from order_product_sales s
  join quantity_bounds b using (sku)
),
customer_sales as (
  select sku, customer_key, sum(units)::numeric as customer_units
  from bounded_sales
  group by sku, customer_key
),
customer_metrics as (
  select
    sku,
    count(*)::bigint as unique_customers,
    max(customer_units)::numeric as largest_customer_units
  from customer_sales
  group by sku
),
sales_metrics as (
  select
    s.sku,
    max(s.product_name) as product_name,
    sum(s.units)::numeric as actual_units,
    sum(s.normal_units)::numeric as normal_units,
    count(distinct s.order_id)::bigint as transaction_count,
    count(distinct s.business_date)::bigint as active_sales_days,
    min(s.business_date) as first_sale_date,
    max(s.business_date) as last_sale_date,
    sum(s.normal_units) filter (
      where s.business_date < x.date_from + (x.analysis_days / 2)
    )::numeric as early_units,
    sum(s.normal_units) filter (
      where s.business_date >= x.date_from + (x.analysis_days / 2)
    )::numeric as recent_units,
    sum(s.units) filter (
      where s.business_date < x.date_from + (x.analysis_days / 2)
    )::numeric as actual_early_units,
    sum(s.units) filter (
      where s.business_date >= x.date_from + (x.analysis_days / 2)
    )::numeric as actual_recent_units,
    sum(s.units) filter (where s.is_outlier)::numeric as outlier_units,
    count(*) filter (where s.is_outlier)::bigint as outlier_transactions
  from bounded_sales s
  cross join params x
  group by s.sku, x.date_from, x.analysis_days
),
daily_sales as (
  select
    s.sku,
    s.business_date,
    sum(s.normal_units)::numeric as normal_units
  from bounded_sales s
  group by s.sku, s.business_date
),
daily_variation as (
  select
    sm.sku,
    coalesce(stddev_samp(coalesce(ds.normal_units, 0)), 0)::numeric as daily_stddev
  from sales_metrics sm
  cross join params x
  cross join lateral generate_series(x.date_from, x.date_to, interval '1 day') d(day)
  left join daily_sales ds
    on ds.sku = sm.sku
   and ds.business_date = d.day::date
  group by sm.sku
),
coverage as (
  select
    count(*)::bigint as completed_orders_in_period,
    count(*) filter (
      where exists (select 1 from public.order_items oi where oi.order_id = co.order_id)
    )::bigint as orders_with_items
  from completed_orders co
),
base as (
  select
    inv.item_id,
    inv.sku,
    coalesce(sm.product_name, inv.product_name, inv.sku) as product_name,
    inv.stock_available,
    coalesce(fs.incoming_quantity, 0)::numeric as incoming_quantity,
    inv.allocated_quantity,
    greatest(
      inv.stock_available + coalesce(fs.incoming_quantity, 0) - inv.allocated_quantity,
      0
    )::numeric as net_stock,
    coalesce(sm.actual_units, 0)::numeric as actual_units,
    coalesce(sm.normal_units, 0)::numeric as normal_units,
    coalesce(sm.transaction_count, 0)::bigint as transaction_count,
    coalesce(cm.unique_customers, 0)::bigint as unique_customers,
    coalesce(sm.active_sales_days, 0)::bigint as active_sales_days,
    sm.first_sale_date,
    sm.last_sale_date,
    coalesce(sm.early_units, 0)::numeric as early_units,
    coalesce(sm.recent_units, 0)::numeric as recent_units,
    coalesce(sm.actual_early_units, 0)::numeric as actual_early_units,
    coalesce(sm.actual_recent_units, 0)::numeric as actual_recent_units,
    coalesce(sm.outlier_units, 0)::numeric as outlier_units,
    coalesce(sm.outlier_transactions, 0)::bigint as outlier_transactions,
    case
      when coalesce(sm.actual_units, 0) > 0
        then coalesce(cm.largest_customer_units, 0) / sm.actual_units
      else 0
    end::numeric as largest_customer_share,
    coalesce(dv.daily_stddev, 0)::numeric as daily_stddev,
    coalesce(fs.lead_time_days, x.default_lead_time_days)::integer as lead_time_days,
    coalesce(fs.moq, x.default_moq)::numeric as moq,
    fs.safety_stock as stored_safety_stock,
    (fs.item_id is not null) as has_product_settings,
    inv.stock_synced_at,
    x.*
  from inventory_by_product inv
  cross join params x
  left join sales_metrics sm on sm.sku = inv.sku
  left join customer_metrics cm on cm.sku = inv.sku
  left join daily_variation dv on dv.sku = inv.sku
  left join public.forecast_product_settings fs on fs.item_id = inv.item_id
),
rates as (
  select
    b.*,
    (b.normal_units / b.analysis_days)::numeric as avg_daily_sales,
    (b.actual_units / b.analysis_days)::numeric as actual_avg_daily_sales,
    case
      when b.early_units = 0 and b.recent_units = 0 then 0
      when b.early_units = 0 and b.recent_units > 0 then null
      else ((b.recent_units - b.early_units) / b.early_units)
    end::numeric as trend_rate,
    case
      when b.actual_early_units = 0 and b.actual_recent_units = 0 then 0
      when b.actual_early_units = 0 and b.actual_recent_units > 0 then null
      else ((b.actual_recent_units - b.actual_early_units) / b.actual_early_units)
    end::numeric as actual_trend_rate
  from base b
),
trend_adjusted as (
  select
    r.*,
    case
      when r.trend_rate is null and r.recent_units > 0 then 1 + r.trend_cap
      else 1 + greatest(r.trend_floor, least(coalesce(r.trend_rate, 0), r.trend_cap))
    end::numeric as trend_factor,
    case
      when r.actual_trend_rate is null and r.actual_recent_units > 0 then 1 + r.trend_cap
      else 1 + greatest(r.trend_floor, least(coalesce(r.actual_trend_rate, 0), r.trend_cap))
    end::numeric as actual_trend_factor,
    case
      when r.trend_rate is null and r.recent_units > 0 then 'Produk baru atau mulai diminati'
      when r.trend_rate > 0.10 then 'Naik'
      when r.trend_rate < -0.10 then 'Turun'
      else 'Stabil'
    end as trend_status
  from rates r
),
demand as (
  select
    t.*,
    (t.avg_daily_sales * t.lead_time_days * t.trend_factor)::numeric as lead_time_demand,
    case
      when t.stored_safety_stock is not null then t.stored_safety_stock
      when t.analysis_days >= 30
        and coalesce(t.last_sale_date - t.first_sale_date + 1, 0) >= 30
        and t.daily_stddev > 0
        then t.z_score * t.daily_stddev * sqrt(t.lead_time_days)
      else t.avg_daily_sales * t.safety_stock_days
    end::numeric as safety_stock,
    (
      t.avg_daily_sales
      * (t.lead_time_days + t.coverage_days)
      * t.trend_factor
    )::numeric as target_demand,
    (
      t.actual_avg_daily_sales
      * (t.lead_time_days + t.coverage_days)
      * t.actual_trend_factor
    )::numeric as actual_target_demand
  from trend_adjusted t
),
recommendations as (
  select
    d.*,
    (d.lead_time_demand + d.safety_stock)::numeric as reorder_point,
    (d.target_demand + d.safety_stock)::numeric as target_stock,
    (d.actual_target_demand + d.safety_stock)::numeric as actual_target_stock,
    case
      when d.avg_daily_sales * d.trend_factor > 0
        then d.net_stock / (d.avg_daily_sales * d.trend_factor)
      else null
    end::numeric as days_until_stockout,
    ceil(
      greatest(0, d.target_demand + d.safety_stock - d.net_stock) / d.moq
    ) * d.moq as recommended_restock,
    ceil(
      greatest(0, d.actual_target_demand + d.safety_stock - d.net_stock) / d.moq
    ) * d.moq as actual_restock
  from demand d
),
classified as (
  select
    r.*,
    case
      when r.recommended_restock <= 0 then 'Tidak perlu restock'
      when r.net_stock <= 0
        or (r.days_until_stockout is not null and r.days_until_stockout <= r.lead_time_days)
        then 'Kritis'
      when r.net_stock <= r.reorder_point then 'Tinggi'
      when r.net_stock <= r.reorder_point
        + (r.avg_daily_sales * r.trend_factor * 7) then 'Sedang'
      else 'Rendah'
    end as priority,
    case
      when r.analysis_days < 30
        or r.transaction_count < 3
        or coalesce(r.last_sale_date - r.first_sale_date + 1, 0) < 30
        or r.largest_customer_share > 0.50
        or (r.actual_units > 0 and r.outlier_units / r.actual_units > 0.50)
        or (r.trend_rate is null and r.recent_units > 0)
        then 'Rendah'
      when r.analysis_days >= 90
        and coalesce(r.last_sale_date - r.first_sale_date + 1, 0) >= 90
        and r.transaction_count >= 10
        and r.active_sales_days >= 20
        and r.largest_customer_share <= 0.50
        and (r.actual_units = 0 or r.outlier_units / r.actual_units <= 0.20)
        then 'Tinggi'
      else 'Sedang'
    end as confidence_level
  from recommendations r
),
explained as (
  select
    c.*,
    concat_ws(
      ' ',
      case
        when c.recommended_restock > 0 then
          'Restock ' || trim(to_char(c.recommended_restock, 'FM999999999990D99')) || ' unit.'
        else 'Stok masih mencukupi berdasarkan forecast normal.'
      end,
      'Penjualan normal ' || trim(to_char(c.avg_daily_sales, 'FM999999990D00'))
        || ' unit/hari selama ' || c.analysis_days || ' hari.',
      case
        when c.trend_status = 'Produk baru atau mulai diminati'
          then 'Produk baru atau mulai diminati, faktor tren dibatasi.'
        else 'Tren ' || lower(c.trend_status) || ' '
          || trim(to_char(coalesce(c.trend_rate, 0) * 100, 'FM999990D0')) || '%.'
      end,
      'Stok bersih ' || trim(to_char(c.net_stock, 'FM999999999990D99'))
        || ', reorder point ' || trim(to_char(c.reorder_point, 'FM999999999990D99')) || '.',
      case when c.largest_customer_share > 0.50
        then 'Peringatan: lebih dari 50% unit berasal dari satu customer.' end,
      case when c.outlier_transactions > 0
        then c.outlier_transactions || ' transaksi outlier dibatasi pada forecast normal.' end,
      case when not c.has_product_settings
        then 'Lead time, MOQ, incoming, dan safety stock memakai nilai default.' end
    ) as recommendation_reason
  from classified c
),
filtered as (
  select
    e.*,
    case e.priority
      when 'Kritis' then 1
      when 'Tinggi' then 2
      when 'Sedang' then 3
      when 'Rendah' then 4
      else 5
    end as priority_order
  from explained e
  where (
    e.search_text is null
    or lower(concat_ws(' ', e.sku, e.product_name)) like '%' || e.search_text || '%'
  )
    and (
      e.priority_filter is null
      or upper(e.priority) = e.priority_filter
    )
),
summary as (
  select
    count(*)::bigint as product_count,
    count(*) filter (where priority = 'Kritis')::bigint as critical_count,
    count(*) filter (where priority = 'Tinggi')::bigint as high_count,
    count(*) filter (where priority = 'Sedang')::bigint as medium_count,
    count(*) filter (where priority = 'Rendah')::bigint as low_count,
    count(*) filter (where priority = 'Tidak perlu restock')::bigint as no_restock_count,
    coalesce(sum(recommended_restock), 0)::numeric as recommended_units,
    count(*) filter (where confidence_level = 'Rendah')::bigint as low_confidence_count
  from filtered
),
paged as (
  select
    item_id,
    sku,
    product_name,
    stock_available,
    incoming_quantity,
    allocated_quantity,
    net_stock,
    actual_units as total_units_sold,
    normal_units as normal_units_sold,
    avg_daily_sales,
    avg_daily_sales * 7 as avg_weekly_sales,
    avg_daily_sales * 30 as avg_monthly_sales,
    transaction_count,
    unique_customers,
    active_sales_days,
    trend_rate * 100 as trend_percentage,
    trend_status,
    trend_factor,
    lead_time_days,
    safety_stock,
    reorder_point,
    avg_daily_sales * 30 * trend_factor as demand_30_days,
    days_until_stockout,
    case
      when days_until_stockout is null then null
      else current_date + ceil(greatest(days_until_stockout, 0))::integer
    end as estimated_stockout_date,
    recommended_restock,
    actual_restock,
    priority,
    confidence_level,
    recommendation_reason,
    largest_customer_share * 100 as largest_customer_percentage,
    outlier_transactions,
    outlier_units,
    daily_stddev,
    moq,
    has_product_settings,
    stock_synced_at
  from filtered
  order by priority_order, days_until_stockout asc nulls last, recommended_restock desc, sku
  limit (select page_size from params)
  offset (
    (select page_number - 1 from params)
    * (select page_size from params)
  )
)
select jsonb_build_object(
  'summary', jsonb_build_object(
    'product_count', s.product_count,
    'critical_count', s.critical_count,
    'high_count', s.high_count,
    'medium_count', s.medium_count,
    'low_count', s.low_count,
    'no_restock_count', s.no_restock_count,
    'recommended_units', s.recommended_units,
    'low_confidence_count', s.low_confidence_count
  ),
  'coverage', jsonb_build_object(
    'date_from', x.date_from,
    'date_to', x.date_to,
    'analysis_days', x.analysis_days,
    'completed_orders', cv.completed_orders_in_period,
    'orders_with_items', cv.orders_with_items,
    'coverage_percentage', case
      when cv.completed_orders_in_period = 0 then 0
      else round(cv.orders_with_items * 100.0 / cv.completed_orders_in_period, 2)
    end,
    'location', x.location_filter
  ),
  'assumptions', jsonb_build_object(
    'completed_statuses', jsonb_build_array('COMPLETED', 'SUCCESS', 'SUCCEEDED'),
    'internal_transactions_excluded', true,
    'outlier_method', 'Batas atas IQR: Q3 + 1,5 x IQR per SKU',
    'default_lead_time_days', x.default_lead_time_days,
    'safety_stock_days', x.safety_stock_days,
    'coverage_days', x.coverage_days,
    'z_score', x.z_score,
    'trend_floor', x.trend_floor,
    'trend_cap', x.trend_cap,
    'default_moq', x.default_moq,
    'incoming_source', 'forecast_product_settings, default 0 jika belum diisi'
  ),
  'rows', coalesce((select jsonb_agg(to_jsonb(p)) from paged p), '[]'::jsonb)
)
from summary s
cross join params x
cross join coverage cv;
$$;

revoke all on function public.forecast_restock(
  date,date,text,integer,integer,integer,numeric,numeric,numeric,numeric,integer,integer,text,text
) from public, anon;

grant execute on function public.forecast_restock(
  date,date,text,integer,integer,integer,numeric,numeric,numeric,numeric,integer,integer,text,text
) to authenticated;
