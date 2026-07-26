drop view if exists public.dashboard_order_filter_options;

create view public.dashboard_order_filter_options
with (security_invoker = true)
as
select distinct marketplace, store_name, status
from public.orders;

revoke all on public.dashboard_order_filter_options from anon;
grant select on public.dashboard_order_filter_options to authenticated;
