create or replace function public.dashboard_order_totals(
  p_date_from date default null,
  p_date_to date default null,
  p_marketplace text default null,
  p_store text default null,
  p_location text default null,
  p_status text default null,
  p_search text default null
)
returns table (
  order_count bigint,
  revenue numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::bigint as order_count,
    coalesce(sum(o.grand_total), 0)::numeric as revenue
  from public.dashboard_orders o
  where (p_date_from is null or o.business_date >= p_date_from)
    and (p_date_to is null or o.business_date <= p_date_to)
    and (p_marketplace is null or o.marketplace = p_marketplace)
    and (p_store is null or o.store_name = p_store)
    and (p_location is null or o.location_name = p_location)
    and (p_status is null or o.status = p_status)
    and (
      p_search is null
      or position(lower(btrim(p_search)) in o.search_text) > 0
    );
$$;

revoke all on function public.dashboard_order_totals(date,date,text,text,text,text,text)
from public, anon;

grant execute
on function public.dashboard_order_totals(date,date,text,text,text,text,text)
to authenticated;
