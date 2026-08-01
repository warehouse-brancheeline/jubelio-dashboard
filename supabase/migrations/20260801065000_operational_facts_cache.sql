-- Persist parsed operational fields so dashboard reads do not repeatedly parse
-- the raw Jubelio JSON. This is refreshed after each order sync.
drop materialized view if exists public.dashboard_order_facts;
create materialized view public.dashboard_order_facts as
select order_id,order_number,invoice_number,tracking_number,order_date,business_date,
  created_at,processed_at,shipped_at,completed_at,settlement_at,raw_status,status_group,
  status_label,status_rank,settlement_status,settlement_label,settlement_amount,
  grand_total,marketplace,store_name,location_name,shipper,synced_at
from public.dashboard_orders_operational;

create unique index dashboard_order_facts_order_id_idx on public.dashboard_order_facts(order_id);
create index dashboard_order_facts_date_idx on public.dashboard_order_facts(business_date,order_id);
create index dashboard_order_facts_filters_idx on public.dashboard_order_facts(business_date,marketplace,store_name,location_name,status_group,settlement_status);

revoke all on public.dashboard_order_facts from public,anon;
grant select on public.dashboard_order_facts to authenticated,service_role;

create or replace function public.refresh_dashboard_order_facts()
returns void language plpgsql security definer set search_path=public as $$
begin
  refresh materialized view concurrently public.dashboard_order_facts;
end;
$$;
revoke all on function public.refresh_dashboard_order_facts() from public,anon,authenticated;
grant execute on function public.refresh_dashboard_order_facts() to service_role;

do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.dashboard_operational_summary(date,date,text,text,text,text,text)'::regprocedure)
    into v_definition;
  execute replace(v_definition,'public.dashboard_orders_operational','public.dashboard_order_facts');
end;
$$;

revoke all on function public.dashboard_operational_summary(date,date,text,text,text,text,text) from public,anon;
grant execute on function public.dashboard_operational_summary(date,date,text,text,text,text,text) to authenticated;
