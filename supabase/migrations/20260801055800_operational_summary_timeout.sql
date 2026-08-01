-- The summary reconciles several operational aggregates over a large order history.
-- Keep this override scoped to the authenticated summary function only.
alter function public.dashboard_operational_summary(date,date,text,text,text,text,text)
  set statement_timeout = '30s';
