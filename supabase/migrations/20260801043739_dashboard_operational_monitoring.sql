-- Operational dashboard model. Order monitoring uses the order creation date in WITA.
-- Settlement metrics remain unavailable when Jubelio has not supplied settlement fields.

create or replace function public.dashboard_status_group(p_status text)
returns text
language sql
immutable
security invoker
set search_path = public
as $$
  select case
    when upper(coalesce(nullif(btrim(p_status), ''), 'UNKNOWN')) in
      ('CANCELLED', 'CANCELED', 'CANCEL', 'REQUEST_CANCEL', 'CANCEL_REQUESTED')
      then 'CANCELLED'
    when upper(coalesce(nullif(btrim(p_status), ''), 'UNKNOWN')) in
      ('RETURN', 'RETURNED', 'REFUND', 'REFUNDED', 'RETURN_REQUESTED')
      then 'RETURNED'
    when upper(coalesce(nullif(btrim(p_status), ''), 'UNKNOWN')) in
      ('COMPLETED', 'COMPLETE', 'SUCCESS', 'SUCCEEDED', 'DELIVERED', 'RECEIVED')
      then 'COMPLETED'
    when upper(coalesce(nullif(btrim(p_status), ''), 'UNKNOWN')) in
      ('SHIPPED', 'IN_TRANSIT', 'TO_CONFIRM_RECEIVE', 'ON_DELIVERY')
      then 'SHIPPED'
    when upper(coalesce(nullif(btrim(p_status), ''), 'UNKNOWN')) in
      ('READY_TO_SHIP', 'FINISH_PACK', 'PACKED')
      then 'READY_TO_SHIP'
    when upper(coalesce(nullif(btrim(p_status), ''), 'UNKNOWN')) in
      ('PROCESSING', 'READY_TO_PICK', 'PICKING', 'FINISH_PICK', 'READY_TO_PACK',
       'PACKING', 'FAILED_PICK', 'EMPTY_STOCK')
      then 'PROCESSING'
    when upper(coalesce(nullif(btrim(p_status), ''), 'UNKNOWN')) in
      ('NEW', 'READY_TO_PROCESS', 'PENDING', 'UNPAID', 'WAITING_PAYMENT', 'PAID')
      then 'NEW'
    else 'UNKNOWN'
  end;
$$;

create or replace function public.dashboard_status_label(p_group text)
returns text
language sql
immutable
security invoker
set search_path = public
as $$
  select case p_group
    when 'NEW' then 'Baru / belum diproses'
    when 'PROCESSING' then 'Sedang diproses'
    when 'READY_TO_SHIP' then 'Siap dikirim'
    when 'SHIPPED' then 'Dikirim / dalam perjalanan'
    when 'COMPLETED' then 'Selesai'
    when 'CANCELLED' then 'Dibatalkan'
    when 'RETURNED' then 'Retur / refund'
    else 'Status belum dikenal'
  end;
$$;

create or replace function public.dashboard_json_timestamptz(p_value text)
returns timestamptz
language sql
immutable
security invoker
set search_path = public
as $$
  select case
    when nullif(btrim(p_value), '') ~ '^\\d{4}-\\d{2}-\\d{2}' then p_value::timestamptz
    else null
  end;
$$;

create or replace function public.dashboard_json_numeric(p_value text)
returns numeric
language sql
immutable
security invoker
set search_path = public
as $$
  select case
    when nullif(replace(btrim(p_value), ',', ''), '') ~ '^-?[0-9]+([.][0-9]+)?$'
      then replace(btrim(p_value), ',', '')::numeric
    else null
  end;
$$;

drop view if exists public.dashboard_order_filter_options_v2;
drop view if exists public.dashboard_orders_operational;

create view public.dashboard_orders_operational
with (security_invoker = true)
as
with location_map as (
  select location_id, max(location_name) as location_name
  from public.inventory
  group by location_id
), prepared as (
  select
    o.*,
    public.dashboard_status_group(o.status) as status_group,
    case
      when lower(coalesce(o.raw_data ->> 'is_escrow_updated', 'false')) = 'true'
        or upper(coalesce(
          nullif(o.raw_data ->> 'settlement_status', ''),
          nullif(o.raw_data ->> 'payout_status', ''),
          nullif(o.raw_data ->> 'escrow_status', ''),
          ''
        )) in ('SETTLED', 'PAID', 'DISBURSED', 'RELEASED') then 'SETTLED'
      when o.raw_data ?| array[
        'is_escrow_updated', 'mp_escrow_date', 'settlement_status', 'settlement_date',
        'settlement_amount', 'payout_status', 'payout_date', 'payout_amount',
        'escrow_status', 'escrow_amount'
      ] then 'UNSETTLED'
      else 'UNAVAILABLE'
    end as settlement_status,
    case
      when coalesce(o.raw_data ->> 'location_id', '') ~ '^-?[0-9]+$'
        then (o.raw_data ->> 'location_id')::bigint
      else null
    end as source_location_id
  from public.orders o
)
select
  p.order_id,
  p.order_number,
  nullif(p.raw_data ->> 'invoice_no', '') as invoice_number,
  nullif(coalesce(
    nullif(p.raw_data ->> 'tracking_no', ''),
    nullif(p.raw_data ->> 'tracking_number', ''),
    nullif(p.raw_data ->> 'b_tracking_no', '')
  ), '') as tracking_number,
  p.order_date,
  (p.order_date at time zone 'Asia/Makassar')::date as business_date,
  coalesce(public.dashboard_json_timestamptz(p.raw_data ->> 'created_date'), p.order_date)
    as created_at,
  public.dashboard_json_timestamptz(coalesce(
    p.raw_data ->> 'processed_date',
    p.raw_data ->> 'invoice_created_date'
  )) as processed_at,
  public.dashboard_json_timestamptz(coalesce(
    p.raw_data ->> 'shipped_date',
    p.raw_data ->> 'awb_created_date'
  )) as shipped_at,
  public.dashboard_json_timestamptz(coalesce(
    p.raw_data ->> 'completed_date',
    p.raw_data ->> 'mp_completed_date',
    p.raw_data ->> 'received_date'
  )) as completed_at,
  public.dashboard_json_timestamptz(coalesce(
    p.raw_data ->> 'settlement_date',
    p.raw_data ->> 'payout_date',
    p.raw_data ->> 'mp_escrow_date'
  )) as settlement_at,
  coalesce(nullif(p.marketplace, ''), 'UNKNOWN') as marketplace,
  p.store_name,
  p.customer_name,
  nullif(coalesce(nullif(p.raw_data ->> 'shipping_full_name', ''), p.customer_name), '')
    as recipient_name,
  p.status as raw_status,
  p.status_group,
  public.dashboard_status_label(p.status_group) as status_label,
  case p.status_group
    when 'NEW' then 1 when 'PROCESSING' then 2 when 'READY_TO_SHIP' then 3
    when 'SHIPPED' then 4 when 'COMPLETED' then 5 else 0
  end as status_rank,
  p.settlement_status,
  case p.settlement_status
    when 'SETTLED' then 'Sudah cair'
    when 'UNSETTLED' then 'Belum cair'
    else 'Data pencairan tidak tersedia'
  end as settlement_label,
  coalesce(
    public.dashboard_json_numeric(p.raw_data ->> 'settlement_amount'),
    public.dashboard_json_numeric(p.raw_data ->> 'payout_amount'),
    public.dashboard_json_numeric(p.raw_data ->> 'escrow_amount')
  ) as settlement_amount,
  p.subtotal,
  p.grand_total,
  public.dashboard_json_numeric(coalesce(
    p.raw_data ->> 'order_processing_fee',
    p.raw_data ->> 'service_fee',
    p.raw_data ->> 'admin_fee'
  )) as fee_amount,
  p.source_location_id as location_id,
  coalesce(
    nullif(btrim(p.raw_data ->> 'location_name'), ''),
    lm.location_name
  ) as location_name,
  nullif(coalesce(p.raw_data ->> 'shipper', p.raw_data ->> 'shipping_provider'), '')
    as shipper,
  coalesce(nullif(p.raw_data ->> 'dashboard_sync_stage', ''), p.status, 'UNKNOWN')
    as sync_stage,
  p.synced_at,
  lower(concat_ws(
    ' ', p.order_number, p.raw_data ->> 'invoice_no', p.raw_data ->> 'tracking_no',
    p.raw_data ->> 'tracking_number', p.raw_data ->> 'b_tracking_no', p.marketplace,
    p.store_name, p.customer_name, p.status, p.status_group,
    coalesce(nullif(btrim(p.raw_data ->> 'location_name'), ''), lm.location_name)
  )) as search_text
from prepared p
left join location_map lm on lm.location_id = p.source_location_id;

create view public.dashboard_order_filter_options_v2
with (security_invoker = true)
as
select distinct marketplace, store_name, status_group, status_label,
  settlement_status, settlement_label, location_name
from public.dashboard_orders_operational;

create table if not exists public.dashboard_sla_settings (
  id boolean primary key default true check (id),
  new_attention_hours integer not null default 2 check (new_attention_hours > 0),
  new_critical_hours integer not null default 6 check (new_critical_hours > new_attention_hours),
  processing_attention_hours integer not null default 12 check (processing_attention_hours > 0),
  processing_critical_hours integer not null default 24 check (processing_critical_hours > processing_attention_hours),
  shipped_attention_hours integer not null default 72 check (shipped_attention_hours > 0),
  shipped_critical_hours integer not null default 120 check (shipped_critical_hours > shipped_attention_hours),
  unsettled_attention_hours integer not null default 72 check (unsettled_attention_hours > 0),
  unsettled_critical_hours integer not null default 168 check (unsettled_critical_hours > unsettled_attention_hours),
  updated_at timestamptz not null default now()
);

insert into public.dashboard_sla_settings (id) values (true)
on conflict (id) do nothing;

alter table public.dashboard_sla_settings enable row level security;
drop policy if exists "Authenticated users can read dashboard SLA" on public.dashboard_sla_settings;
create policy "Authenticated users can read dashboard SLA"
on public.dashboard_sla_settings for select to authenticated using (true);

create index if not exists orders_business_date_order_id_idx
  on public.orders (((order_date at time zone 'Asia/Makassar')::date), order_id);
create index if not exists orders_marketplace_store_idx
  on public.orders (marketplace, store_name);
create index if not exists orders_location_id_raw_idx
  on public.orders (((raw_data ->> 'location_id')));

create or replace function public.dashboard_operational_summary(
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
set search_path = public
as $$
with params as (
  select
    least(coalesce(p_date_from, current_date - 29), coalesce(p_date_to, current_date)) as date_from,
    greatest(coalesce(p_date_from, current_date - 29), coalesce(p_date_to, current_date)) as date_to,
    greatest(coalesce(p_date_to, current_date) - coalesce(p_date_from, current_date - 29) + 1, 1)::integer as days,
    nullif(btrim(p_marketplace), '') as marketplace_filter,
    nullif(btrim(p_store), '') as store_filter,
    nullif(btrim(p_location), '') as location_filter,
    nullif(upper(btrim(p_status_group)), '') as status_filter,
    nullif(upper(btrim(p_settlement_status)), '') as settlement_filter
), ranges as (
  select *, date_from - days as previous_from, date_from - 1 as previous_to from params
), base as not materialized (
  select o.*
  from public.dashboard_orders_operational o cross join ranges r
  where (r.marketplace_filter is null or o.marketplace = r.marketplace_filter)
    and (r.store_filter is null or o.store_name = r.store_filter)
    and (r.location_filter is null or o.location_name = r.location_filter)
    and (r.status_filter is null or o.status_group = r.status_filter)
    and (r.settlement_filter is null or o.settlement_status = r.settlement_filter)
    and o.business_date between r.previous_from and r.date_to
), filtered as not materialized (
  select b.* from base b cross join ranges r
  where b.business_date between r.date_from and r.date_to
), previous_filtered as not materialized (
  select b.* from base b cross join ranges r
  where b.business_date between r.previous_from and r.previous_to
), metrics as (
  select
    count(*)::bigint as order_count,
    count(*) filter (where status_group not in ('CANCELLED','RETURNED'))::bigint as valid_order_count,
    coalesce(sum(grand_total) filter (where status_group not in ('CANCELLED','RETURNED')),0)::numeric as order_value,
    count(*) filter (where status_group = 'NEW')::bigint as new_order_count,
    count(*) filter (where status_group = 'PROCESSING')::bigint as processing_order_count,
    count(*) filter (where status_group = 'READY_TO_SHIP')::bigint as ready_to_ship_count,
    count(*) filter (where status_group = 'SHIPPED')::bigint as shipped_order_count,
    count(*) filter (where status_group = 'COMPLETED')::bigint as completed_order_count,
    count(*) filter (where status_group = 'CANCELLED')::bigint as cancelled_order_count,
    count(*) filter (where status_group = 'RETURNED')::bigint as returned_order_count,
    count(*) filter (where status_group = 'UNKNOWN')::bigint as unknown_order_count,
    coalesce(sum(grand_total) filter (where status_group = 'COMPLETED'),0)::numeric as completed_revenue,
    coalesce(sum(grand_total) filter (where status_group in ('NEW','PROCESSING','READY_TO_SHIP','SHIPPED','UNKNOWN')),0)::numeric as unfinished_value,
    count(*) filter (where settlement_status <> 'UNAVAILABLE')::bigint as settlement_data_count,
    coalesce(sum(coalesce(settlement_amount,grand_total)) filter (where settlement_status = 'SETTLED'),0)::numeric as settled_value,
    coalesce(sum(grand_total) filter (where status_group = 'COMPLETED' and settlement_status = 'UNSETTLED'),0)::numeric as unsettled_value,
    avg(grand_total) filter (where status_group not in ('CANCELLED','RETURNED'))::numeric as average_order_value,
    avg(extract(epoch from (processed_at-created_at))/3600) filter (where processed_at >= created_at) as average_process_hours,
    count(*) filter (where processed_at >= created_at)::bigint as process_time_sample,
    avg(extract(epoch from (shipped_at-created_at))/3600) filter (where shipped_at >= created_at) as average_ship_hours,
    count(*) filter (where shipped_at >= created_at)::bigint as ship_time_sample,
    max(synced_at) as order_synced_at,
    max(order_date) as last_order_at
  from filtered
), previous_metrics as (
  select
    count(*)::bigint as order_count,
    coalesce(sum(grand_total) filter (where status_group not in ('CANCELLED','RETURNED')),0)::numeric as order_value,
    count(*) filter (where status_group = 'COMPLETED')::bigint as completed_order_count,
    count(*) filter (where status_group in ('CANCELLED','RETURNED'))::bigint as cancelled_order_count,
    count(*) filter (where status_group = 'NEW')::bigint as new_order_count,
    count(*) filter (where status_group not in ('CANCELLED','RETURNED'))::bigint as valid_order_count,
    coalesce(sum(coalesce(settlement_amount,grand_total)) filter (where settlement_status = 'SETTLED'),0)::numeric as settled_value,
    count(*) filter (where settlement_status <> 'UNAVAILABLE')::bigint as settlement_data_count
  from previous_filtered
), inventory_metrics as (
  select
    count(*)::bigint as inventory_rows,
    coalesce(sum(on_hand_quantity),0)::numeric as total_on_hand,
    coalesce(sum(available_quantity),0)::numeric as total_available,
    coalesce(sum(allocated_quantity),0)::numeric as total_allocated,
    count(*) filter (where stock_status='LOW_STOCK')::bigint as low_stock_rows,
    count(*) filter (where stock_status='OUT_OF_STOCK')::bigint as out_of_stock_rows,
    count(distinct location_id)::bigint as location_count,
    max(synced_at) as inventory_synced_at
  from public.dashboard_inventory i cross join ranges r
  where r.location_filter is null or i.location_name = r.location_filter
), dates as (
  select generate_series(r.date_from,r.date_to,interval '1 day')::date business_date from ranges r
), daily as (
  select d.business_date,
    count(f.order_id)::bigint order_count,
    coalesce(sum(f.grand_total) filter (where f.status_group not in ('CANCELLED','RETURNED')),0)::numeric order_value,
    coalesce(sum(f.grand_total) filter (where f.status_group='COMPLETED'),0)::numeric completed_revenue
  from dates d left join filtered f on f.business_date=d.business_date
  group by d.business_date order by d.business_date
), status_distribution as (
  select status_group,status_label,count(*)::bigint order_count,
    coalesce(sum(grand_total),0)::numeric order_value
  from filtered group by status_group,status_label
), funnel as (
  select * from (values
    (1,'Order masuk',(select count(*) from filtered)),
    (2,'Diproses',(select count(*) from filtered where status_rank>=2 and status_group not in ('CANCELLED','RETURNED'))),
    (3,'Siap dikirim',(select count(*) from filtered where status_rank>=3 and status_group not in ('CANCELLED','RETURNED'))),
    (4,'Dikirim',(select count(*) from filtered where status_rank>=4 and status_group not in ('CANCELLED','RETURNED'))),
    (5,'Selesai',(select count(*) from filtered where status_group='COMPLETED')),
    (6,'Cair',(select count(*) from filtered where settlement_status='SETTLED'))
  ) x(stage_order,stage,order_count)
), channels as (
  select marketplace,count(*)::bigint order_count,
    coalesce(sum(grand_total) filter (where status_group not in ('CANCELLED','RETURNED')),0)::numeric order_value,
    count(*) filter (where status_group='COMPLETED')::bigint completed_count,
    count(*) filter (where status_group in ('CANCELLED','RETURNED'))::bigint cancelled_count
  from filtered group by marketplace order by order_count desc
), warehouses as (
  select coalesce(location_name,'Gudang tidak tersedia') location_name,
    count(*)::bigint order_count,
    count(*) filter (where status_group='NEW')::bigint new_count,
    count(*) filter (where status_group='SHIPPED')::bigint shipped_count,
    count(*) filter (where status_group='COMPLETED')::bigint completed_count,
    avg(extract(epoch from (processed_at-created_at))/3600) filter (where processed_at>=created_at) average_process_hours
  from filtered group by coalesce(location_name,'Gudang tidak tersedia') order by order_count desc
), sla as (select * from public.dashboard_sla_settings where id=true limit 1),
attention as (
  select f.*,
    greatest(extract(epoch from (now()-f.created_at))/3600,0)::numeric as waiting_hours,
    case
      when f.raw_status in ('FAILED_PICK','EMPTY_STOCK','REQUEST_CANCEL') then 'Kritis'
      when f.status_group='NEW' and now()-f.created_at >= make_interval(hours=>s.new_critical_hours) then 'Kritis'
      when f.status_group='PROCESSING' and now()-f.created_at >= make_interval(hours=>s.processing_critical_hours) then 'Kritis'
      when f.status_group='SHIPPED' and now()-f.created_at >= make_interval(hours=>s.shipped_critical_hours) then 'Kritis'
      when f.status_group='COMPLETED' and f.settlement_status='UNSETTLED' and now()-f.created_at >= make_interval(hours=>s.unsettled_critical_hours) then 'Kritis'
      when f.status_group='NEW' and now()-f.created_at >= make_interval(hours=>s.new_attention_hours) then 'Terlambat'
      when f.status_group='PROCESSING' and now()-f.created_at >= make_interval(hours=>s.processing_attention_hours) then 'Terlambat'
      when f.status_group='SHIPPED' and now()-f.created_at >= make_interval(hours=>s.shipped_attention_hours) then 'Terlambat'
      when f.status_group='COMPLETED' and f.settlement_status='UNSETTLED' and now()-f.created_at >= make_interval(hours=>s.unsettled_attention_hours) then 'Perlu perhatian'
      else 'Normal'
    end as sla_status,
    case
      when f.raw_status='FAILED_PICK' then 'Picking gagal'
      when f.raw_status='EMPTY_STOCK' then 'Stok kosong'
      when f.raw_status='REQUEST_CANCEL' then 'Permintaan pembatalan'
      when f.status_group='NEW' then 'Belum diproses'
      when f.status_group='PROCESSING' then 'Belum dikirim'
      when f.status_group='SHIPPED' then 'Belum selesai'
      when f.status_group='COMPLETED' and f.settlement_status='UNSETTLED' then 'Selesai tetapi belum cair'
      when f.status_group in ('CANCELLED','RETURNED') then f.status_label
      else 'Perlu ditinjau'
    end as attention_reason
  from filtered f cross join sla s
  where f.status_group in ('NEW','PROCESSING','SHIPPED','CANCELLED','RETURNED')
     or f.raw_status in ('FAILED_PICK','EMPTY_STOCK','REQUEST_CANCEL')
     or (f.status_group='COMPLETED' and f.settlement_status='UNSETTLED')
), attention_page as (
  select order_id,order_number,invoice_number,tracking_number,order_date,created_at,
    raw_status,status_group,status_label,settlement_status,settlement_label,marketplace,
    store_name,location_name,shipper,grand_total,waiting_hours,sla_status,attention_reason
  from attention
  order by case sla_status when 'Kritis' then 1 when 'Terlambat' then 2 when 'Perlu perhatian' then 3 else 4 end,
    waiting_hours desc
  limit 50
), backfill as (
  select total_count,completed,updated_at from public.sync_state
  where sync_type='completed_orders_backfill' limit 1
)
select jsonb_build_object(
  'range',jsonb_build_object('date_from',r.date_from,'date_to',r.date_to,'previous_from',r.previous_from,'previous_to',r.previous_to,'days',r.days),
  'kpis',jsonb_build_object(
    'order_count',m.order_count,'valid_order_count',m.valid_order_count,'order_value',m.order_value,
    'new_order_count',m.new_order_count,'processing_order_count',m.processing_order_count,
    'ready_to_ship_count',m.ready_to_ship_count,'shipped_order_count',m.shipped_order_count,
    'completed_order_count',m.completed_order_count,'cancelled_order_count',m.cancelled_order_count,
    'returned_order_count',m.returned_order_count,'unknown_order_count',m.unknown_order_count,
    'completed_revenue',m.completed_revenue,'unfinished_value',m.unfinished_value,
    'settlement_data_count',m.settlement_data_count,'settled_value',m.settled_value,
    'unsettled_value',m.unsettled_value,'average_order_value',coalesce(m.average_order_value,0),
    'completion_rate',case when m.valid_order_count=0 then 0 else round(m.completed_order_count*100.0/m.valid_order_count,2) end,
    'cancellation_rate',case when m.order_count=0 then 0 else round((m.cancelled_order_count+m.returned_order_count)*100.0/m.order_count,2) end,
    'pending_rate',case when (m.valid_order_count-m.completed_order_count)=0 then 0 else round(m.new_order_count*100.0/(m.valid_order_count-m.completed_order_count),2) end,
    'average_process_hours',m.average_process_hours,'process_time_sample',m.process_time_sample,
    'average_ship_hours',m.average_ship_hours,'ship_time_sample',m.ship_time_sample,
    'order_synced_at',m.order_synced_at,'last_order_at',m.last_order_at,
    'inventory_rows',im.inventory_rows,'total_on_hand',im.total_on_hand,'total_available',im.total_available,
    'total_allocated',im.total_allocated,'low_stock_rows',im.low_stock_rows,
    'out_of_stock_rows',im.out_of_stock_rows,'location_count',im.location_count,
    'inventory_synced_at',im.inventory_synced_at,
    'backfill_loaded',(select count(*) from public.orders),'backfill_total',coalesce(b.total_count,0),
    'backfill_completed',coalesce(b.completed,false),'backfill_updated_at',b.updated_at
  ),
  'comparison',jsonb_build_object(
    'available',pm.order_count>0,
    'order_count',pm.order_count,'order_value',pm.order_value,
    'completion_rate',case when pm.valid_order_count=0 then null else round(pm.completed_order_count*100.0/pm.valid_order_count,2) end,
    'cancellation_rate',case when pm.order_count=0 then null else round(pm.cancelled_order_count*100.0/pm.order_count,2) end,
    'new_order_count',pm.new_order_count,'settled_value',pm.settled_value,
    'settlement_available',pm.settlement_data_count>0
  ),
  'inventory',to_jsonb(im),
  'trend',coalesce((select jsonb_agg(to_jsonb(d) order by d.business_date) from daily d),'[]'::jsonb),
  'status_distribution',coalesce((select jsonb_agg(to_jsonb(s) order by s.order_count desc) from status_distribution s),'[]'::jsonb),
  'funnel',coalesce((select jsonb_agg(to_jsonb(f) order by f.stage_order) from funnel f),'[]'::jsonb),
  'channels',coalesce((select jsonb_agg(to_jsonb(c) order by c.order_count desc) from channels c),'[]'::jsonb),
  'warehouses',coalesce((select jsonb_agg(to_jsonb(w) order by w.order_count desc) from warehouses w),'[]'::jsonb),
  'attention',coalesce((select jsonb_agg(to_jsonb(a)) from attention_page a),'[]'::jsonb),
  'quality',jsonb_build_object(
    'status_reconciled',(select count(*) from filtered)=(select coalesce(sum(order_count),0) from status_distribution),
    'unknown_status_count',m.unknown_order_count,
    'missing_location_count',(select count(*) from filtered where location_name is null),
    'settlement_unavailable_count',(select count(*) from filtered where settlement_status='UNAVAILABLE'),
    'process_time_sample',m.process_time_sample,'ship_time_sample',m.ship_time_sample
  ),
  'sla',to_jsonb(s)
)
from ranges r cross join metrics m cross join previous_metrics pm cross join inventory_metrics im
cross join sla s left join backfill b on true;
$$;

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
  from public.dashboard_orders_operational o
  where (p_date_from is null or o.business_date>=p_date_from)
    and (p_date_to is null or o.business_date<=p_date_to)
    and (p_marketplace is null or o.marketplace=p_marketplace)
    and (p_store is null or o.store_name=p_store)
    and (p_location is null or o.location_name=p_location)
    and (p_status_group is null or o.status_group=p_status_group)
    and (p_settlement_status is null or o.settlement_status=p_settlement_status)
    and (p_search is null or position(lower(btrim(p_search)) in o.search_text)>0);
$$;

revoke all on function public.dashboard_status_group(text) from public,anon;
revoke all on function public.dashboard_status_label(text) from public,anon;
revoke all on function public.dashboard_json_timestamptz(text) from public,anon;
revoke all on function public.dashboard_json_numeric(text) from public,anon;
revoke all on function public.dashboard_operational_summary(date,date,text,text,text,text,text) from public,anon;
revoke all on function public.dashboard_order_totals_v2(date,date,text,text,text,text,text,text) from public,anon;
revoke all on public.dashboard_orders_operational from anon;
revoke all on public.dashboard_order_filter_options_v2 from anon;
revoke all on public.dashboard_sla_settings from anon;

grant execute on function public.dashboard_status_group(text) to authenticated;
grant execute on function public.dashboard_status_label(text) to authenticated;
grant execute on function public.dashboard_json_timestamptz(text) to authenticated;
grant execute on function public.dashboard_json_numeric(text) to authenticated;
grant execute on function public.dashboard_operational_summary(date,date,text,text,text,text,text) to authenticated;
grant execute on function public.dashboard_order_totals_v2(date,date,text,text,text,text,text,text) to authenticated;
grant select on public.dashboard_orders_operational to authenticated;
grant select on public.dashboard_order_filter_options_v2 to authenticated;
grant select on public.dashboard_sla_settings to authenticated;
