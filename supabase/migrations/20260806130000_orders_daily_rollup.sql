-- Order archive, phase 1 (additive only, nothing deleted here).
--
-- Two permanent daily rollup tables so revenue/order-count trends and
-- product sales trends stay queryable indefinitely, even after old
-- individual order rows are eventually pruned from the live tables in a
-- later, separately-approved step. Grouped by the same dimensions the
-- dashboard already filters by (marketplace/store/location/status/
-- settlement), so any historical query the app currently supports keeps
-- working against the rollup once raw rows are gone.

create table if not exists public.orders_daily_rollup (
  business_date date not null,
  marketplace text not null default 'UNKNOWN',
  store_name text not null default '',
  location_name text not null default '',
  status_group text not null default 'UNKNOWN',
  settlement_status text not null default 'UNAVAILABLE',
  order_count bigint not null default 0,
  grand_total_sum numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (
    business_date, marketplace, store_name, location_name,
    status_group, settlement_status
  )
);

create index if not exists orders_daily_rollup_date_idx
  on public.orders_daily_rollup (business_date);

create table if not exists public.product_daily_rollup (
  business_date date not null,
  sku text not null,
  units_sold numeric not null default 0,
  revenue numeric not null default 0,
  transaction_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (business_date, sku)
);

create index if not exists product_daily_rollup_date_idx
  on public.product_daily_rollup (business_date);

alter table public.orders_daily_rollup enable row level security;
alter table public.product_daily_rollup enable row level security;

drop policy if exists "Authenticated users can read orders rollup"
  on public.orders_daily_rollup;
create policy "Authenticated users can read orders rollup"
on public.orders_daily_rollup
for select
to authenticated
using (true);

drop policy if exists "Authenticated users can read product rollup"
  on public.product_daily_rollup;
create policy "Authenticated users can read product rollup"
on public.product_daily_rollup
for select
to authenticated
using (true);

revoke all on public.orders_daily_rollup from public, anon;
revoke all on public.product_daily_rollup from public, anon;
grant select on public.orders_daily_rollup to authenticated;
grant select on public.product_daily_rollup to authenticated;

-- refresh_daily_rollups() re-aggregates from a cutoff date forward.
-- Idempotent (upsert), safe to re-run. Intended to be called before any
-- future prune step so the rollup is current for whatever range is about
-- to be removed from the live tables, and periodically so recent days
-- that age past the (future) retention cutoff are already covered.
create or replace function public.refresh_daily_rollups(p_since date default '1970-01-01')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.orders_daily_rollup (
    business_date, marketplace, store_name, location_name,
    status_group, settlement_status, order_count, grand_total_sum, updated_at
  )
  select
    business_date,
    coalesce(marketplace, 'UNKNOWN'),
    coalesce(store_name, ''),
    coalesce(location_name, ''),
    coalesce(status_group, 'UNKNOWN'),
    coalesce(settlement_status, 'UNAVAILABLE'),
    count(*),
    coalesce(sum(grand_total), 0),
    now()
  from public.dashboard_order_facts
  where business_date >= p_since
  group by 1, 2, 3, 4, 5, 6
  on conflict (business_date, marketplace, store_name, location_name, status_group, settlement_status)
  do update set
    order_count = excluded.order_count,
    grand_total_sum = excluded.grand_total_sum,
    updated_at = excluded.updated_at;

  insert into public.product_daily_rollup (business_date, sku, units_sold, revenue, transaction_count, updated_at)
  select
    (o.order_date at time zone 'Asia/Makassar')::date as business_date,
    oi.sku,
    sum(greatest(coalesce(oi.quantity, 0), 0)),
    sum(greatest(coalesce(oi.total, 0), 0)),
    count(distinct oi.order_id),
    now()
  from public.order_items oi
  join public.orders o on o.order_id = oi.order_id
  where (o.order_date at time zone 'Asia/Makassar')::date >= p_since
    and upper(coalesce(o.status, '')) in ('COMPLETED', 'SUCCESS', 'SUCCEEDED')
    and upper(coalesce(o.marketplace, '')) <> 'INTERNAL'
    and upper(coalesce(o.store_name, '')) <> 'INTERNAL'
    and upper(coalesce(o.raw_data ->> 'order_type', '')) <> 'INTERNAL'
    and coalesce((o.raw_data ->> 'is_canceled')::boolean, false) is false
    and coalesce((oi.raw_data ->> 'is_canceled_item')::boolean, false) is false
    and coalesce((oi.raw_data ->> 'is_return_resolved')::boolean, false) is false
    and nullif(btrim(oi.sku), '') is not null
  group by 1, 2
  on conflict (business_date, sku)
  do update set
    units_sold = excluded.units_sold,
    revenue = excluded.revenue,
    transaction_count = excluded.transaction_count,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.refresh_daily_rollups(date) from public, anon, authenticated;
grant execute on function public.refresh_daily_rollups(date) to service_role;

-- One-time backfill covering full existing history.
select public.refresh_daily_rollups('1970-01-01');
