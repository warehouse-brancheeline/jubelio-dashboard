drop view if exists public.dashboard_order_filter_options_v2;
create view public.dashboard_order_filter_options_v2 with (security_invoker=true) as
select distinct marketplace,store_name,status_group,status_label,
  settlement_status,settlement_label,location_name
from public.dashboard_order_facts;
revoke all on public.dashboard_order_filter_options_v2 from public,anon;
grant select on public.dashboard_order_filter_options_v2 to authenticated;

create or replace function public.dashboard_order_totals_v2(
  p_date_from date default null,p_date_to date default null,p_marketplace text default null,
  p_store text default null,p_location text default null,p_status_group text default null,
  p_settlement_status text default null,p_search text default null
)
returns table(order_count bigint,order_value numeric,completed_revenue numeric)
language sql stable security invoker set search_path=public as $$
select count(*)::bigint,
  coalesce(sum(grand_total) filter(where status_group not in('CANCELLED','RETURNED')),0)::numeric,
  coalesce(sum(grand_total) filter(where status_group='COMPLETED'),0)::numeric
from public.dashboard_order_facts o
where (p_date_from is null or business_date>=p_date_from) and(p_date_to is null or business_date<=p_date_to)
  and(p_marketplace is null or marketplace=p_marketplace) and(p_store is null or store_name=p_store)
  and(p_location is null or location_name=p_location) and(p_status_group is null or status_group=p_status_group)
  and(p_settlement_status is null or settlement_status=p_settlement_status)
  and(p_search is null or position(lower(btrim(p_search)) in lower(concat_ws(' ',order_number,invoice_number,tracking_number,marketplace,store_name,status_group,location_name)))>0);
$$;
revoke all on function public.dashboard_order_totals_v2(date,date,text,text,text,text,text,text) from public,anon;
grant execute on function public.dashboard_order_totals_v2(date,date,text,text,text,text,text,text) to authenticated;
