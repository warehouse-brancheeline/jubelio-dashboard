-- The operational summary takes about five seconds on the current dataset.
-- Give only this RPC enough headroom during concurrent dashboard reads instead
-- of raising the timeout for every authenticated Data API query.
alter function public.dashboard_operational_summary(date,date,text,text,text,text,text)
  set statement_timeout = '15s';
