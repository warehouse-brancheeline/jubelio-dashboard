create or replace function public.dashboard_printed_shipments(
  p_business_date date default ((now() at time zone 'Asia/Makassar')::date),
  p_location text default null,
  p_marketplace text default null,
  p_store text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
set statement_timeout = '12s'
as $$
with normalized as (
  select
    o.order_id,
    coalesce(nullif(o.order_number,''), o.order_id::text) order_number,
    o.status,
    o.order_date,
    o.synced_at,
    coalesce(nullif(o.marketplace,''), nullif(o.raw_data->>'source_name',''), nullif(o.raw_data->>'channel_name',''), 'Tidak tersedia') marketplace,
    coalesce(nullif(o.store_name,''), nullif(o.raw_data->>'store_name',''), 'Tidak tersedia') store_name,
    coalesce(nullif(o.raw_data->>'location_name',''), 'Tidak tersedia') location_name,
    coalesce(nullif(o.raw_data->>'shipper',''), nullif(o.raw_data->>'shipping_provider',''), 'Ekspedisi tidak tersedia') shipper,
    coalesce(
      nullif(o.raw_data->>'tracking_number',''),
      nullif(o.raw_data->>'tracking_no',''),
      nullif(split_part(o.raw_data->>'b_tracking_no','|',2),'')
    ) tracking_number,
    greatest(
      coalesce(nullif(o.raw_data->>'label_printed_count','')::integer,0),
      coalesce(nullif(o.raw_data->>'awb_printed_count','')::integer,0)
    ) print_count,
    nullif(o.raw_data->>'awb_created_date','')::timestamptz awb_created_at
  from public.orders o
), filtered as (
  select * from normalized n
  where n.tracking_number is not null
    and n.print_count > 0
    and n.awb_created_at is not null
    and (n.awb_created_at at time zone 'Asia/Makassar')::date = p_business_date
    and n.status not in ('CANCELED','CANCELLED','RETURNED','RETURN')
    and (p_location is null or n.location_name = p_location)
    and (p_marketplace is null or n.marketplace = p_marketplace)
    and (p_store is null or n.store_name = p_store)
), courier_rows as (
  select
    shipper,
    count(distinct tracking_number)::bigint resi_count,
    count(distinct order_id)::bigint order_count,
    sum(print_count)::bigint print_attempts,
    count(*) filter (where print_count > 1)::bigint reprint_count,
    min(awb_created_at) first_print_at,
    max(awb_created_at) last_print_at
  from filtered
  group by shipper
), details as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id', order_id,
    'order_number', order_number,
    'tracking_number', tracking_number,
    'shipper', shipper,
    'marketplace', marketplace,
    'store_name', store_name,
    'location_name', location_name,
    'awb_created_at', awb_created_at,
    'print_count', print_count,
    'status', status
  ) order by awb_created_at desc, order_id desc), '[]'::jsonb) value
  from filtered
), couriers as (
  select coalesce(jsonb_agg(to_jsonb(c) order by c.resi_count desc, c.shipper), '[]'::jsonb) value
  from courier_rows c
)
select jsonb_build_object(
  'business_date', p_business_date,
  'timezone', 'Asia/Makassar',
  'source_basis', 'AWB dibuat pada tanggal terpilih dan jumlah print lebih dari 0',
  'summary', jsonb_build_object(
    'resi_count', count(distinct f.tracking_number),
    'order_count', count(distinct f.order_id),
    'courier_count', count(distinct f.shipper),
    'print_attempts', coalesce(sum(f.print_count),0),
    'reprint_count', count(*) filter (where f.print_count > 1),
    'latest_sync', max(f.synced_at)
  ),
  'couriers', c.value,
  'details', d.value
)
from filtered f cross join couriers c cross join details d
group by c.value,d.value;
$$;

revoke all on function public.dashboard_printed_shipments(date,text,text,text) from public,anon;
grant execute on function public.dashboard_printed_shipments(date,text,text,text) to authenticated;
