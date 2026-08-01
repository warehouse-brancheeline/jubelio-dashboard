-- Build the filtered operational snapshot once. The previous implementation
-- rescanned the JSON-heavy view for every widget and exceeded the API timeout.
create or replace function public.dashboard_operational_summary(
  p_date_from date default null, p_date_to date default null,
  p_marketplace text default null, p_store text default null,
  p_location text default null, p_status_group text default null,
  p_settlement_status text default null
)
returns jsonb language sql stable security invoker set search_path=public as $$
with p as (
  select least(coalesce(p_date_from,current_date-29),coalesce(p_date_to,current_date)) d1,
    greatest(coalesce(p_date_from,current_date-29),coalesce(p_date_to,current_date)) d2,
    greatest(abs(coalesce(p_date_to,current_date)-coalesce(p_date_from,current_date-29))+1,1)::int days
), r as (select *,d1-days prev1,d1-1 prev2 from p),
base as materialized (
  select o.order_date,o.business_date,o.created_at,o.processed_at,o.shipped_at,
    o.status_group,o.status_label,o.status_rank,o.settlement_status,o.settlement_amount,
    o.grand_total,o.marketplace,o.location_name,o.synced_at
  from public.dashboard_orders_operational o cross join r
  where o.business_date between r.d1 and r.d2
    and (nullif(btrim(p_marketplace),'') is null or o.marketplace=p_marketplace)
    and (nullif(btrim(p_store),'') is null or o.store_name=p_store)
    and (nullif(btrim(p_location),'') is null or o.location_name=p_location)
    and (nullif(btrim(p_status_group),'') is null or o.status_group=upper(p_status_group))
    and (nullif(btrim(p_settlement_status),'') is null or o.settlement_status=upper(p_settlement_status))
), f as not materialized (select b.* from base b),
prev as not materialized (
  select o.order_date,o.business_date,o.created_at,o.processed_at,o.shipped_at,
    o.status_group,o.status_label,o.status_rank,o.settlement_status,o.settlement_amount,
    o.grand_total,o.marketplace,o.location_name,o.synced_at
  from public.dashboard_orders_operational o cross join r
  where o.business_date between r.prev1 and r.prev2
    and (nullif(btrim(p_marketplace),'') is null or o.marketplace=p_marketplace)
    and (nullif(btrim(p_store),'') is null or o.store_name=p_store)
    and (nullif(btrim(p_location),'') is null or o.location_name=p_location)
    and (nullif(btrim(p_status_group),'') is null or o.status_group=upper(p_status_group))
    and (nullif(btrim(p_settlement_status),'') is null or o.settlement_status=upper(p_settlement_status))
),
m as (
  select count(*)::bigint order_count,count(*) filter(where status_group not in('CANCELLED','RETURNED'))::bigint valid_order_count,
    coalesce(sum(grand_total) filter(where status_group not in('CANCELLED','RETURNED')),0)::numeric order_value,
    count(*) filter(where status_group='NEW')::bigint new_order_count,
    count(*) filter(where status_group='PROCESSING')::bigint processing_order_count,
    count(*) filter(where status_group='READY_TO_SHIP')::bigint ready_to_ship_count,
    count(*) filter(where status_group='SHIPPED')::bigint shipped_order_count,
    count(*) filter(where status_group='COMPLETED')::bigint completed_order_count,
    count(*) filter(where status_group='CANCELLED')::bigint cancelled_order_count,
    count(*) filter(where status_group='RETURNED')::bigint returned_order_count,
    count(*) filter(where status_group='UNKNOWN')::bigint unknown_order_count,
    coalesce(sum(grand_total) filter(where status_group='COMPLETED'),0)::numeric completed_revenue,
    coalesce(sum(grand_total) filter(where status_group in('NEW','PROCESSING','READY_TO_SHIP','SHIPPED','UNKNOWN')),0)::numeric unfinished_value,
    count(*) filter(where settlement_status<>'UNAVAILABLE')::bigint settlement_data_count,
    count(*) filter(where settlement_status='SETTLED')::bigint settled_order_count,
    coalesce(sum(coalesce(settlement_amount,grand_total)) filter(where settlement_status='SETTLED'),0)::numeric settled_value,
    coalesce(sum(grand_total) filter(where status_group='COMPLETED' and settlement_status='UNSETTLED'),0)::numeric unsettled_value,
    coalesce(avg(grand_total) filter(where status_group not in('CANCELLED','RETURNED')),0)::numeric average_order_value,
    avg(extract(epoch from(processed_at-created_at))/3600) filter(where processed_at>=created_at) average_process_hours,
    count(*) filter(where processed_at>=created_at)::bigint process_time_sample,
    avg(extract(epoch from(shipped_at-created_at))/3600) filter(where shipped_at>=created_at) average_ship_hours,
    count(*) filter(where shipped_at>=created_at)::bigint ship_time_sample,max(synced_at) order_synced_at,max(order_date) last_order_at
  from f
), pm as (
  select count(*)::bigint order_count,
    coalesce(sum(grand_total) filter(where status_group not in('CANCELLED','RETURNED')),0)::numeric order_value,
    count(*) filter(where status_group='COMPLETED')::bigint completed_order_count,
    count(*) filter(where status_group in('CANCELLED','RETURNED'))::bigint cancelled_order_count,
    count(*) filter(where status_group='NEW')::bigint new_order_count,
    count(*) filter(where status_group not in('CANCELLED','RETURNED'))::bigint valid_order_count,
    coalesce(sum(coalesce(settlement_amount,grand_total)) filter(where settlement_status='SETTLED'),0)::numeric settled_value,
    count(*) filter(where settlement_status<>'UNAVAILABLE')>0 settlement_available from prev
), im as (
  select count(*)::bigint inventory_rows,coalesce(sum(on_hand_quantity),0)::numeric total_on_hand,
    coalesce(sum(available_quantity),0)::numeric total_available,coalesce(sum(allocated_quantity),0)::numeric total_allocated,
    count(*) filter(where stock_status='LOW_STOCK')::bigint low_stock_rows,
    count(*) filter(where stock_status='OUT_OF_STOCK')::bigint out_of_stock_rows,
    count(distinct location_id)::bigint location_count,max(synced_at) inventory_synced_at
  from public.dashboard_inventory where nullif(btrim(p_location),'') is null or location_name=p_location
), daily as (
  select d::date business_date,count(f.status_group)::bigint order_count,
    coalesce(sum(f.grand_total) filter(where f.status_group not in('CANCELLED','RETURNED')),0)::numeric order_value,
    coalesce(sum(f.grand_total) filter(where f.status_group='COMPLETED'),0)::numeric completed_revenue
  from r cross join generate_series(r.d1,r.d2,interval '1 day') d left join f on f.business_date=d::date group by d::date
), sd as (
  select status_group,status_label,count(*)::bigint order_count,coalesce(sum(grand_total),0)::numeric order_value
  from f group by status_group,status_label
), ch as (
  select marketplace,count(*)::bigint order_count,
    coalesce(sum(grand_total) filter(where status_group not in('CANCELLED','RETURNED')),0)::numeric order_value,
    count(*) filter(where status_group='COMPLETED')::bigint completed_count,
    count(*) filter(where status_group in('CANCELLED','RETURNED'))::bigint cancelled_count,
    coalesce(avg(grand_total) filter(where status_group not in('CANCELLED','RETURNED')),0)::numeric average_order_value
  from f group by marketplace
), wh as (
  select coalesce(location_name,'Gudang tidak tersedia') location_name,count(*)::bigint order_count,
    count(*) filter(where status_group='NEW')::bigint new_count,count(*) filter(where status_group='SHIPPED')::bigint shipped_count,
    count(*) filter(where status_group='COMPLETED')::bigint completed_count,
    avg(extract(epoch from(processed_at-created_at))/3600) filter(where processed_at>=created_at) average_process_hours
  from f group by coalesce(location_name,'Gudang tidak tersedia')
), sla as (select * from public.dashboard_sla_settings where id=true), att as (
  select f.order_id,f.order_number,f.invoice_number,f.tracking_number,f.order_date,f.created_at,f.raw_status,
    f.status_group,f.status_label,f.settlement_status,f.settlement_label,f.marketplace,f.store_name,f.location_name,
    f.shipper,f.grand_total,greatest(extract(epoch from(now()-f.created_at))/3600,0)::numeric waiting_hours,
    case when f.raw_status in('FAILED_PICK','EMPTY_STOCK','REQUEST_CANCEL') then 'Kritis'
      when f.status_group='NEW' and now()-f.created_at>=make_interval(hours=>s.new_critical_hours) then 'Kritis'
      when f.status_group='PROCESSING' and now()-f.created_at>=make_interval(hours=>s.processing_critical_hours) then 'Kritis'
      when f.status_group='SHIPPED' and now()-f.created_at>=make_interval(hours=>s.shipped_critical_hours) then 'Kritis'
      when f.status_group='COMPLETED' and f.settlement_status='UNSETTLED' and now()-f.created_at>=make_interval(hours=>s.unsettled_critical_hours) then 'Kritis'
      when f.status_group in('NEW','PROCESSING','SHIPPED') then 'Terlambat'
      when f.status_group='COMPLETED' and f.settlement_status='UNSETTLED' then 'Perlu perhatian' else 'Normal' end sla_status,
    case when f.raw_status='FAILED_PICK' then 'Picking gagal' when f.raw_status='EMPTY_STOCK' then 'Stok kosong'
      when f.raw_status='REQUEST_CANCEL' then 'Permintaan pembatalan' when f.status_group='NEW' then 'Belum diproses'
      when f.status_group='PROCESSING' then 'Belum dikirim' when f.status_group='SHIPPED' then 'Belum selesai'
      when f.status_group='COMPLETED' and f.settlement_status='UNSETTLED' then 'Selesai tetapi belum cair' else f.status_label end attention_reason
  from public.dashboard_orders_operational f cross join r cross join sla s
  where f.business_date between r.d1 and r.d2
    and (nullif(btrim(p_marketplace),'') is null or f.marketplace=p_marketplace)
    and (nullif(btrim(p_store),'') is null or f.store_name=p_store)
    and (nullif(btrim(p_location),'') is null or f.location_name=p_location)
    and (nullif(btrim(p_status_group),'') is null or f.status_group=upper(p_status_group))
    and (nullif(btrim(p_settlement_status),'') is null or f.settlement_status=upper(p_settlement_status))
    and (f.status_group in('NEW','PROCESSING','SHIPPED','CANCELLED','RETURNED')
    or f.raw_status in('FAILED_PICK','EMPTY_STOCK','REQUEST_CANCEL') or(f.status_group='COMPLETED' and f.settlement_status='UNSETTLED')
    )
  order by case when f.raw_status in('FAILED_PICK','EMPTY_STOCK','REQUEST_CANCEL') then 1 else 2 end,
    greatest(extract(epoch from(now()-f.created_at))/3600,0) desc limit 50
)
select jsonb_build_object(
 'range',jsonb_build_object('date_from',r.d1,'date_to',r.d2,'previous_from',r.prev1,'previous_to',r.prev2,'days',r.days),
 'kpis',to_jsonb(m)||to_jsonb(im)||jsonb_build_object(
   'completion_rate',case when m.valid_order_count=0 then 0 else round(m.completed_order_count*100.0/m.valid_order_count,2) end,
   'cancellation_rate',case when m.order_count=0 then 0 else round((m.cancelled_order_count+m.returned_order_count)*100.0/m.order_count,2) end,
   'pending_rate',case when m.valid_order_count-m.completed_order_count=0 then 0 else round(m.new_order_count*100.0/(m.valid_order_count-m.completed_order_count),2) end,
   'backfill_loaded',(select count(*) from public.orders),'backfill_total',coalesce((select total_count from public.sync_state where sync_type='completed_orders_backfill'),0),
   'backfill_completed',coalesce((select completed from public.sync_state where sync_type='completed_orders_backfill'),false),
   'backfill_updated_at',(select updated_at from public.sync_state where sync_type='completed_orders_backfill')),
 'comparison',to_jsonb(pm)||jsonb_build_object('available',pm.order_count>0,
   'completion_rate',case when pm.valid_order_count=0 then null else round(pm.completed_order_count*100.0/pm.valid_order_count,2) end,
   'cancellation_rate',case when pm.order_count=0 then null else round(pm.cancelled_order_count*100.0/pm.order_count,2) end),
 'trend',coalesce((select jsonb_agg(to_jsonb(x) order by business_date) from daily x),'[]'),
 'status_distribution',coalesce((select jsonb_agg(to_jsonb(x) order by order_count desc) from sd x),'[]'),
 'funnel',jsonb_build_array(
   jsonb_build_object('stage_order',1,'stage','Order masuk','order_count',m.order_count),
   jsonb_build_object('stage_order',2,'stage','Diproses','order_count',m.processing_order_count+m.ready_to_ship_count+m.shipped_order_count+m.completed_order_count),
   jsonb_build_object('stage_order',3,'stage','Siap dikirim','order_count',m.ready_to_ship_count+m.shipped_order_count+m.completed_order_count),
   jsonb_build_object('stage_order',4,'stage','Dikirim','order_count',m.shipped_order_count+m.completed_order_count),
   jsonb_build_object('stage_order',5,'stage','Selesai','order_count',m.completed_order_count),
   jsonb_build_object('stage_order',6,'stage','Cair','order_count',m.settled_order_count)),
 'channels',coalesce((select jsonb_agg(to_jsonb(x) order by order_count desc) from ch x),'[]'),
 'warehouses',coalesce((select jsonb_agg(to_jsonb(x) order by order_count desc) from wh x),'[]'),
 'attention',coalesce((select jsonb_agg(to_jsonb(x)) from att x),'[]'),
 'quality',jsonb_build_object('status_reconciled',(select count(*) from f)=coalesce((select sum(order_count) from sd),0),
   'unknown_status_count',m.unknown_order_count,'missing_location_count',(select count(*) from f where location_name is null),
   'settlement_unavailable_count',(select count(*) from f where settlement_status='UNAVAILABLE'),
   'process_time_sample',m.process_time_sample,'ship_time_sample',m.ship_time_sample),
 'sla',to_jsonb(s))
from r cross join m cross join pm cross join im cross join sla s;
$$;

revoke all on function public.dashboard_operational_summary(date,date,text,text,text,text,text) from public,anon;
grant execute on function public.dashboard_operational_summary(date,date,text,text,text,text,text) to authenticated;
