-- Keep the shared base CTE bounded to the current and comparison periods so
-- Postgres can use orders_business_date_order_id_idx before deriving metrics.
do $$
declare
  definition text;
  old_fragment text := E'    and (r.settlement_filter is null or o.settlement_status = r.settlement_filter)\n), filtered as (';
  new_fragment text := E'    and (r.settlement_filter is null or o.settlement_status = r.settlement_filter)\n    and o.business_date between r.previous_from and r.date_to\n), filtered as (';
begin
  select pg_get_functiondef(
    'public.dashboard_operational_summary(date,date,text,text,text,text,text)'::regprocedure
  ) into definition;

  if position(old_fragment in definition) = 0 then
    raise exception 'dashboard_operational_summary fragment not found';
  end if;

  execute replace(definition, old_fragment, new_fragment);
end;
$$;
