-- Keep quality diagnostics inside the same global filter scope as the KPI.
do $$
declare
  v_definition text;
  v_old text := '(select count(*) from public.dashboard_orders_operational o where o.business_date between v_date_from and v_date_to and o.location_name is null)';
  v_new text := '(select count(*) from public.dashboard_orders_operational o where o.business_date between v_date_from and v_date_to and o.location_name is null
      and (nullif(btrim(p_marketplace),'''') is null or o.marketplace=p_marketplace)
      and (nullif(btrim(p_store),'''') is null or o.store_name=p_store)
      and (nullif(btrim(p_location),'''') is null or o.location_name=p_location)
      and (nullif(btrim(p_status_group),'''') is null or o.status_group=upper(p_status_group))
      and (nullif(btrim(p_settlement_status),'''') is null or o.settlement_status=upper(p_settlement_status)))';
begin
  select pg_get_functiondef('public.dashboard_operational_summary(date,date,text,text,text,text,text)'::regprocedure)
  into v_definition;
  if position(v_old in v_definition) = 0 then
    raise exception 'Expected quality expression was not found';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$$;

revoke all on function public.dashboard_operational_summary(date,date,text,text,text,text,text) from public,anon;
grant execute on function public.dashboard_operational_summary(date,date,text,text,text,text,text) to authenticated;
