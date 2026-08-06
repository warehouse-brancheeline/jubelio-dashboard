-- Performance advisor flagged these 9 indexes as never scanned since
-- creation. Every unused index still costs storage and slows down every
-- upsert during sync (each write has to update every index on the table),
-- which contributes to the statement-timeout pressure seen during sync
-- bursts. Drop the 8 that are genuinely redundant.
--
-- dashboard_order_facts_order_id_idx is intentionally NOT dropped: it is
-- also flagged as unused, but it is the unique index that
-- REFRESH MATERIALIZED VIEW CONCURRENTLY requires to exist on
-- dashboard_order_facts. Dropping it would break every cache refresh.

drop index if exists public.orders_marketplace_idx;
drop index if exists public.orders_status_idx;
drop index if exists public.orders_store_name_idx;
drop index if exists public.orders_location_name_idx;
drop index if exists public.orders_marketplace_store_idx;
drop index if exists public.inventory_quantity_idx;
drop index if exists public.forecast_product_settings_updated_by_idx;
drop index if exists public.dashboard_order_facts_date_idx;
