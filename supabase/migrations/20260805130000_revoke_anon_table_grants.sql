-- Security audit 2026-08-05: the anon role held full table-level grants
-- (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) on the raw business tables even
-- though RLS policies on these tables only ever targeted `authenticated`.
-- RLS made SELECT/INSERT/UPDATE/DELETE return no rows for anon, but
-- TRUNCATE is not covered by RLS at all in Postgres, so the anon role
-- could truncate `orders`, `order_items`, `inventory`, `products`,
-- `sync_logs`, and `sync_state` if it ever obtained a direct Postgres
-- connection. These grants were leftover Supabase defaults from table
-- creation and were never explicitly revoked (unlike the newer tables in
-- this schema, which already revoke anon access). Close that gap.
--
-- New tables in `public` keep getting default anon/authenticated grants
-- from Supabase's project-level default privileges: always add an
-- explicit `revoke all ... from anon;` in the migration that creates a
-- table meant to be authenticated-only.

revoke all on public.orders from anon;
revoke all on public.order_items from anon;
revoke all on public.inventory from anon;
revoke all on public.products from anon;
revoke all on public.sync_logs from anon;
revoke all on public.sync_state from anon;
