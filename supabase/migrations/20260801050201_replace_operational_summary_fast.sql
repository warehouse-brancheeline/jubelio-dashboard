-- Replace the wide multi-use CTE with independent index-backed queries. This
-- avoids temporary-file spills when the dashboard is filtered.
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
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_date_from date := least(coalesce(p_date_from,current_date-29),coalesce(p_date_to,current_date));
  v_date_to date := greatest(coalesce(p_date_from,current_date-29),coalesce(p_date_to,current_date));
  v_days integer;
  v_previous_from date;
  v_previous_to date;
  v_kpis jsonb;
  v_comparison jsonb;
  v_inventory jsonb;
  v_trend jsonb;
  v_statuses jsonb;
  v_funnel jsonb;
  v_channels jsonb;
  v_warehouses jsonb;
  v_attention jsonb;
  v_quality jsonb;
  v_sla jsonb;
begin
  v_days := greatest(v_date_to-v_date_from+1,1);
  v_previous_from := v_date_from-v_days;
  v_previous_to := v_date_from-1;

  select to_jsonb(x) into v_kpis from (
    select
      count(*)::bigint order_count,
      count(*) filter(where status_group not in ('CANCELLED','RETURNED'))::bigint valid_order_count,
      coalesce(sum(grand_total) filter(where status_group not in ('CANCELLED','RETURNED')),0)::numeric order_value,
      count(*) filter(where status_group='NEW')::bigint new_order_count,
      count(*) filter(where status_group='PROCESSING')::bigint processing_order_count,
      count(*) filter(where status_group='READY_TO_SHIP')::bigint ready_to_ship_count,
      count(*) filter(where status_group='SHIPPED')::bigint shipped_order_count,
      count(*) filter(where status_group='COMPLETED')::bigint completed_order_count,
      count(*) filter(where status_group='CANCELLED')::bigint cancelled_order_count,
      count(*) filter(where status_group='RETURNED')::bigint returned_order_count,
      count(*) filter(where status_group='UNKNOWN')::bigint unknown_order_count,
      coalesce(sum(grand_total) filter(where status_group='COMPLETED'),0)::numeric completed_revenue,
      coalesce(sum(grand_total) filter(where status_group in ('NEW','PROCESSING','READY_TO_SHIP','SHIPPED','UNKNOWN')),0)::numeric unfinished_value,
      count(*) filter(where settlement_status<>'UNAVAILABLE')::bigint settlement_data_count,
      count(*) filter(where settlement_status='SETTLED')::bigint settled_order_count,
      coalesce(sum(coalesce(settlement_amount,grand_total)) filter(where settlement_status='SETTLED'),0)::numeric settled_value,
      coalesce(sum(grand_total) filter(where status_group='COMPLETED' and settlement_status='UNSETTLED'),0)::numeric unsettled_value,
      coalesce(avg(grand_total) filter(where status_group not in ('CANCELLED','RETURNED')),0)::numeric average_order_value,
      avg(extract(epoch from(processed_at-created_at))/3600) filter(where processed_at>=created_at) average_process_hours,
      count(*) filter(where processed_at>=created_at)::bigint process_time_sample,
      avg(extract(epoch from(shipped_at-created_at))/3600) filter(where shipped_at>=created_at) average_ship_hours,
      count(*) filter(where shipped_at>=created_at)::bigint ship_time_sample,
      max(synced_at) order_synced_at,max(order_date) last_order_at,
      case when count(*) filter(where status_group not in ('CANCELLED','RETURNED'))=0 then 0
        else round(count(*) filter(where status_group='COMPLETED')*100.0/
          count(*) filter(where status_group not in ('CANCELLED','RETURNED')),2) end completion_rate,
      case when count(*)=0 then 0 else round(count(*) filter(where status_group in ('CANCELLED','RETURNED'))*100.0/count(*),2) end cancellation_rate,
      case when count(*) filter(where status_group in ('NEW','PROCESSING','READY_TO_SHIP','SHIPPED','UNKNOWN'))=0 then 0
        else round(count(*) filter(where status_group='NEW')*100.0/
          count(*) filter(where status_group in ('NEW','PROCESSING','READY_TO_SHIP','SHIPPED','UNKNOWN')),2) end pending_rate
    from public.dashboard_orders_operational o
    where o.business_date between v_date_from and v_date_to
      and (nullif(btrim(p_marketplace),'') is null or o.marketplace=p_marketplace)
      and (nullif(btrim(p_store),'') is null or o.store_name=p_store)
      and (nullif(btrim(p_location),'') is null or o.location_name=p_location)
      and (nullif(btrim(p_status_group),'') is null or o.status_group=upper(p_status_group))
      and (nullif(btrim(p_settlement_status),'') is null or o.settlement_status=upper(p_settlement_status))
  ) x;

  select to_jsonb(x) into v_comparison from (
    select
      count(*)>0 available,count(*)::bigint order_count,
      coalesce(sum(grand_total) filter(where status_group not in ('CANCELLED','RETURNED')),0)::numeric order_value,
      count(*) filter(where status_group='COMPLETED')::bigint completed_order_count,
      count(*) filter(where status_group in ('CANCELLED','RETURNED'))::bigint cancelled_order_count,
      count(*) filter(where status_group='NEW')::bigint new_order_count,
      count(*) filter(where status_group not in ('CANCELLED','RETURNED'))::bigint valid_order_count,
      coalesce(sum(coalesce(settlement_amount,grand_total)) filter(where settlement_status='SETTLED'),0)::numeric settled_value,
      count(*) filter(where settlement_status<>'UNAVAILABLE')>0 settlement_available,
      case when count(*) filter(where status_group not in ('CANCELLED','RETURNED'))=0 then null
        else round(count(*) filter(where status_group='COMPLETED')*100.0/
          count(*) filter(where status_group not in ('CANCELLED','RETURNED')),2) end completion_rate,
      case when count(*)=0 then null else round(count(*) filter(where status_group in ('CANCELLED','RETURNED'))*100.0/count(*),2) end cancellation_rate
    from public.dashboard_orders_operational o
    where o.business_date between v_previous_from and v_previous_to
      and (nullif(btrim(p_marketplace),'') is null or o.marketplace=p_marketplace)
      and (nullif(btrim(p_store),'') is null or o.store_name=p_store)
      and (nullif(btrim(p_location),'') is null or o.location_name=p_location)
      and (nullif(btrim(p_status_group),'') is null or o.status_group=upper(p_status_group))
      and (nullif(btrim(p_settlement_status),'') is null or o.settlement_status=upper(p_settlement_status))
  ) x;

  select to_jsonb(x) into v_inventory from (
    select count(*)::bigint inventory_rows,coalesce(sum(on_hand_quantity),0)::numeric total_on_hand,
      coalesce(sum(available_quantity),0)::numeric total_available,
      coalesce(sum(allocated_quantity),0)::numeric total_allocated,
      count(*) filter(where stock_status='LOW_STOCK')::bigint low_stock_rows,
      count(*) filter(where stock_status='OUT_OF_STOCK')::bigint out_of_stock_rows,
      count(distinct location_id)::bigint location_count,max(synced_at) inventory_synced_at
    from public.dashboard_inventory i
    where nullif(btrim(p_location),'') is null or i.location_name=p_location
  ) x;
  v_kpis := v_kpis || v_inventory || jsonb_build_object(
    'backfill_loaded',(select count(*) from public.orders),
    'backfill_total',coalesce((select total_count from public.sync_state where sync_type='completed_orders_backfill'),0),
    'backfill_completed',coalesce((select completed from public.sync_state where sync_type='completed_orders_backfill'),false),
    'backfill_updated_at',(select updated_at from public.sync_state where sync_type='completed_orders_backfill')
  );

  select coalesce(jsonb_agg(to_jsonb(x) order by x.business_date),'[]'::jsonb) into v_trend
  from (
    select d::date business_date,count(o.order_id)::bigint order_count,
      coalesce(sum(o.grand_total) filter(where o.status_group not in ('CANCELLED','RETURNED')),0)::numeric order_value,
      coalesce(sum(o.grand_total) filter(where o.status_group='COMPLETED'),0)::numeric completed_revenue
    from generate_series(v_date_from,v_date_to,interval '1 day') d
    left join public.dashboard_orders_operational o on o.business_date=d::date
      and (nullif(btrim(p_marketplace),'') is null or o.marketplace=p_marketplace)
      and (nullif(btrim(p_store),'') is null or o.store_name=p_store)
      and (nullif(btrim(p_location),'') is null or o.location_name=p_location)
      and (nullif(btrim(p_status_group),'') is null or o.status_group=upper(p_status_group))
      and (nullif(btrim(p_settlement_status),'') is null or o.settlement_status=upper(p_settlement_status))
    group by d::date
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.order_count desc),'[]'::jsonb) into v_statuses from (
    select status_group,status_label,count(*)::bigint order_count,coalesce(sum(grand_total),0)::numeric order_value
    from public.dashboard_orders_operational o where o.business_date between v_date_from and v_date_to
      and (nullif(btrim(p_marketplace),'') is null or o.marketplace=p_marketplace)
      and (nullif(btrim(p_store),'') is null or o.store_name=p_store)
      and (nullif(btrim(p_location),'') is null or o.location_name=p_location)
      and (nullif(btrim(p_status_group),'') is null or o.status_group=upper(p_status_group))
      and (nullif(btrim(p_settlement_status),'') is null or o.settlement_status=upper(p_settlement_status))
    group by status_group,status_label
  ) x;

  v_funnel := jsonb_build_array(
    jsonb_build_object('stage_order',1,'stage','Order masuk','order_count',(v_kpis->>'order_count')::bigint),
    jsonb_build_object('stage_order',2,'stage','Diproses','order_count',
      (v_kpis->>'processing_order_count')::bigint+(v_kpis->>'ready_to_ship_count')::bigint+
      (v_kpis->>'shipped_order_count')::bigint+(v_kpis->>'completed_order_count')::bigint),
    jsonb_build_object('stage_order',3,'stage','Siap dikirim','order_count',
      (v_kpis->>'ready_to_ship_count')::bigint+(v_kpis->>'shipped_order_count')::bigint+
      (v_kpis->>'completed_order_count')::bigint),
    jsonb_build_object('stage_order',4,'stage','Dikirim','order_count',
      (v_kpis->>'shipped_order_count')::bigint+(v_kpis->>'completed_order_count')::bigint),
    jsonb_build_object('stage_order',5,'stage','Selesai','order_count',(v_kpis->>'completed_order_count')::bigint),
    jsonb_build_object('stage_order',6,'stage','Cair','order_count',(v_kpis->>'settled_order_count')::bigint)
  );

  select coalesce(jsonb_agg(to_jsonb(x) order by x.order_count desc),'[]'::jsonb) into v_channels from (
    select marketplace,count(*)::bigint order_count,
      coalesce(sum(grand_total) filter(where status_group not in ('CANCELLED','RETURNED')),0)::numeric order_value,
      count(*) filter(where status_group='COMPLETED')::bigint completed_count,
      count(*) filter(where status_group in ('CANCELLED','RETURNED'))::bigint cancelled_count,
      coalesce(avg(grand_total) filter(where status_group not in ('CANCELLED','RETURNED')),0)::numeric average_order_value
    from public.dashboard_orders_operational o where o.business_date between v_date_from and v_date_to
      and (nullif(btrim(p_marketplace),'') is null or o.marketplace=p_marketplace)
      and (nullif(btrim(p_store),'') is null or o.store_name=p_store)
      and (nullif(btrim(p_location),'') is null or o.location_name=p_location)
      and (nullif(btrim(p_status_group),'') is null or o.status_group=upper(p_status_group))
      and (nullif(btrim(p_settlement_status),'') is null or o.settlement_status=upper(p_settlement_status))
    group by marketplace
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.order_count desc),'[]'::jsonb) into v_warehouses from (
    select coalesce(location_name,'Gudang tidak tersedia') location_name,count(*)::bigint order_count,
      count(*) filter(where status_group='NEW')::bigint new_count,
      count(*) filter(where status_group='SHIPPED')::bigint shipped_count,
      count(*) filter(where status_group='COMPLETED')::bigint completed_count,
      avg(extract(epoch from(processed_at-created_at))/3600) filter(where processed_at>=created_at) average_process_hours
    from public.dashboard_orders_operational o where o.business_date between v_date_from and v_date_to
      and (nullif(btrim(p_marketplace),'') is null or o.marketplace=p_marketplace)
      and (nullif(btrim(p_store),'') is null or o.store_name=p_store)
      and (nullif(btrim(p_location),'') is null or o.location_name=p_location)
      and (nullif(btrim(p_status_group),'') is null or o.status_group=upper(p_status_group))
      and (nullif(btrim(p_settlement_status),'') is null or o.settlement_status=upper(p_settlement_status))
    group by coalesce(location_name,'Gudang tidak tersedia')
  ) x;

  select to_jsonb(s) into v_sla from public.dashboard_sla_settings s where id=true;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sla_order,x.waiting_hours desc),'[]'::jsonb) into v_attention from (
    select o.order_id,o.order_number,o.invoice_number,o.tracking_number,o.order_date,o.created_at,
      o.raw_status,o.status_group,o.status_label,o.settlement_status,o.settlement_label,o.marketplace,
      o.store_name,o.location_name,o.shipper,o.grand_total,
      greatest(extract(epoch from(now()-o.created_at))/3600,0)::numeric waiting_hours,
      case
        when o.raw_status in ('FAILED_PICK','EMPTY_STOCK','REQUEST_CANCEL') then 'Kritis'
        when o.status_group='NEW' and now()-o.created_at>=make_interval(hours=>s.new_critical_hours) then 'Kritis'
        when o.status_group='PROCESSING' and now()-o.created_at>=make_interval(hours=>s.processing_critical_hours) then 'Kritis'
        when o.status_group='SHIPPED' and now()-o.created_at>=make_interval(hours=>s.shipped_critical_hours) then 'Kritis'
        when o.status_group='COMPLETED' and o.settlement_status='UNSETTLED' and now()-o.created_at>=make_interval(hours=>s.unsettled_critical_hours) then 'Kritis'
        when o.status_group in ('NEW','PROCESSING','SHIPPED') then 'Terlambat'
        when o.status_group='COMPLETED' and o.settlement_status='UNSETTLED' then 'Perlu perhatian'
        else 'Normal' end sla_status,
      case when o.raw_status='FAILED_PICK' then 'Picking gagal' when o.raw_status='EMPTY_STOCK' then 'Stok kosong'
        when o.raw_status='REQUEST_CANCEL' then 'Permintaan pembatalan' when o.status_group='NEW' then 'Belum diproses'
        when o.status_group='PROCESSING' then 'Belum dikirim' when o.status_group='SHIPPED' then 'Belum selesai'
        when o.status_group='COMPLETED' and o.settlement_status='UNSETTLED' then 'Selesai tetapi belum cair'
        else o.status_label end attention_reason,
      case when o.raw_status in ('FAILED_PICK','EMPTY_STOCK','REQUEST_CANCEL') then 1
        when o.status_group='NEW' and now()-o.created_at>=make_interval(hours=>s.new_critical_hours) then 1
        when o.status_group='PROCESSING' and now()-o.created_at>=make_interval(hours=>s.processing_critical_hours) then 1
        when o.status_group='SHIPPED' and now()-o.created_at>=make_interval(hours=>s.shipped_critical_hours) then 1
        when o.status_group='COMPLETED' and o.settlement_status='UNSETTLED' and now()-o.created_at>=make_interval(hours=>s.unsettled_critical_hours) then 1
        else 2 end sla_order
    from public.dashboard_orders_operational o cross join public.dashboard_sla_settings s
    where s.id=true and o.business_date between v_date_from and v_date_to
      and (nullif(btrim(p_marketplace),'') is null or o.marketplace=p_marketplace)
      and (nullif(btrim(p_store),'') is null or o.store_name=p_store)
      and (nullif(btrim(p_location),'') is null or o.location_name=p_location)
      and (nullif(btrim(p_status_group),'') is null or o.status_group=upper(p_status_group))
      and (nullif(btrim(p_settlement_status),'') is null or o.settlement_status=upper(p_settlement_status))
      and (o.status_group in ('NEW','PROCESSING','SHIPPED','CANCELLED','RETURNED')
        or o.raw_status in ('FAILED_PICK','EMPTY_STOCK','REQUEST_CANCEL')
        or (o.status_group='COMPLETED' and o.settlement_status='UNSETTLED'))
    order by sla_order,waiting_hours desc limit 50
  ) x;

  v_quality := jsonb_build_object(
    'status_reconciled',(select coalesce(sum((value->>'order_count')::bigint),0) from jsonb_array_elements(v_statuses))=(v_kpis->>'order_count')::bigint,
    'unknown_status_count',(v_kpis->>'unknown_order_count')::bigint,
    'missing_location_count',(select count(*) from public.dashboard_orders_operational o where o.business_date between v_date_from and v_date_to and o.location_name is null),
    'settlement_unavailable_count',(v_kpis->>'order_count')::bigint-(v_kpis->>'settlement_data_count')::bigint,
    'process_time_sample',(v_kpis->>'process_time_sample')::bigint,'ship_time_sample',(v_kpis->>'ship_time_sample')::bigint
  );

  return jsonb_build_object(
    'range',jsonb_build_object('date_from',v_date_from,'date_to',v_date_to,'previous_from',v_previous_from,'previous_to',v_previous_to,'days',v_days),
    'kpis',v_kpis,'comparison',v_comparison,'inventory',v_inventory,'trend',v_trend,
    'status_distribution',v_statuses,'funnel',v_funnel,'channels',v_channels,
    'warehouses',v_warehouses,'attention',v_attention,'quality',v_quality,'sla',v_sla
  );
end;
$$;

revoke all on function public.dashboard_operational_summary(date,date,text,text,text,text,text) from public,anon;
grant execute on function public.dashboard_operational_summary(date,date,text,text,text,text,text) to authenticated;
