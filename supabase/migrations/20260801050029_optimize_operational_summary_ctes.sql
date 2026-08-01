-- The filtered order sets are small and index-backed. Inlining them is faster
-- than spilling the wide operational view to temporary storage.
do $$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.dashboard_operational_summary(date,date,text,text,text,text,text)'::regprocedure
  ) into definition;

  definition := replace(definition, '), base as (', '), base as not materialized (');
  definition := replace(definition, '), filtered as (', '), filtered as not materialized (');
  definition := replace(definition, '), previous_filtered as (', '), previous_filtered as not materialized (');

  if position('base as not materialized' in lower(definition)) = 0
    or position('filtered as not materialized' in lower(definition)) = 0
    or position('previous_filtered as not materialized' in lower(definition)) = 0 then
    raise exception 'Failed to mark operational summary CTEs as not materialized';
  end if;

  execute definition;
end;
$$;
