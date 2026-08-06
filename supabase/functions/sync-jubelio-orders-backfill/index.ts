import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.53.0";

type Row = Record<string, unknown>;
const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const toNumber = (value: unknown) => Number.isFinite(Number(value ?? 0)) ? Number(value ?? 0) : 0;

// Same conflict key appearing twice in one upsert() call makes Postgres
// reject the whole batch ("ON CONFLICT DO UPDATE command cannot affect row
// a second time"). Keep the last occurrence per key before every upsert.
function dedupeByKey<T>(rows: T[], keyOf: (row: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) byKey.set(keyOf(row), row);
  return [...byKey.values()];
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return Response.json({ ok: false, error: "Method not allowed" }, { status: 405, headers });
  const email = Deno.env.get("JUBELIO_EMAIL");
  const password = Deno.env.get("JUBELIO_PASSWORD");
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!email || !password || !url || !key) return Response.json({ ok: false, error: "Konfigurasi server belum lengkap" }, { status: 500, headers });

  const body = await request.json().catch(() => ({}));
  const batchPages = Math.min(Math.max(Math.floor(toNumber(body?.pages) || 10), 1), 20);
  const pageSize = 200;
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: state, error: stateError } = await db.from("sync_state").select("next_page,total_count,completed").eq("sync_type", "completed_orders_backfill").single();
  if (stateError) return Response.json({ ok: false, error: `Cursor tidak tersedia: ${stateError.message}` }, { status: 500, headers });
  if (state.completed) return Response.json({ ok: true, message: "Seluruh histori order sudah tersinkronisasi", completed: true, totalCount: state.total_count }, { headers });

  const startPage = Number(state.next_page);
  const { data: log, error: logError } = await db.from("sync_logs").insert({ sync_type: "completed_orders_backfill", status: "running", message: `Mulai halaman ${startPage}` }).select("id").single();
  if (logError) return Response.json({ ok: false, error: "Gagal membuat catatan sinkronisasi" }, { status: 500, headers });

  try {
    const login = await fetch("https://api2.jubelio.com/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const session = await login.json().catch(() => ({}));
    if (!login.ok || !session?.token) throw new Error(`Login Jubelio gagal (${login.status})`);

    let totalCount = Number(state.total_count || 0);
    let saved = 0;
    let lastPage = startPage - 1;
    let completed = false;

    for (let page = startPage; page < startPage + batchPages; page++) {
      const endpoint = `/sales/orders/completed/?page=${page}&pageSize=${pageSize}&sortBy=transaction_date&sortDirection=DESC`;
      const response = await fetch(`https://api2.jubelio.com${endpoint}`, { headers: { authorization: String(session.token), Accept: "application/json" } });
      if (!response.ok) throw new Error(`Jubelio halaman ${page} gagal (${response.status})`);
      const payload = await response.json() as Row;
      const rows: Row[] = Array.isArray(payload?.data) ? payload.data as Row[] : [];
      totalCount = toNumber(payload?.totalCount) || totalCount;
      lastPage = page;
      if (!rows.length) { completed = true; break; }

      const syncedAt = new Date().toISOString();
      const orders = rows.filter((x) => toNumber(x.salesorder_id) > 0).map((x) => ({
        order_id: toNumber(x.salesorder_id),
        order_number: x.salesorder_no ? String(x.salesorder_no) : null,
        order_date: x.transaction_date ? String(x.transaction_date) : null,
        marketplace: String(x.channel_name ?? x.source_name ?? x.source ?? "UNKNOWN"),
        store_name: x.store_name ? String(x.store_name) : null,
        customer_name: x.customer_name ? String(x.customer_name) : null,
        status: String(x.internal_status ?? x.action ?? x.channel_status ?? "COMPLETED"),
        subtotal: toNumber(x.sub_total),
        grand_total: toNumber(x.grand_total),
        raw_data: null,
        synced_at: syncedAt,
      }));
      const dedupedOrders = dedupeByKey(orders, (order) => String(order.order_id));
      const write = await db.from("orders").upsert(dedupedOrders, { onConflict: "order_id" });
      if (write.error) throw new Error(`Order halaman ${page} gagal disimpan: ${write.error.message}`);
      saved += dedupedOrders.length;
      if (rows.length < pageSize || page * pageSize >= totalCount) { completed = true; break; }
    }

    const nextPage = lastPage + 1;
    await db.from("sync_state").update({ next_page: nextPage, total_count: totalCount, completed, updated_at: new Date().toISOString() }).eq("sync_type", "completed_orders_backfill");
    await db.from("sync_logs").update({ status: "success", records_processed: saved, message: `Halaman ${startPage}-${lastPage}`, completed_at: new Date().toISOString() }).eq("id", log.id);
    const processedEstimate = Math.min(lastPage * pageSize, totalCount);
    return Response.json({ ok: true, message: completed ? "Seluruh histori order selesai" : "Batch histori order berhasil", startPage, lastPage, nextPage, ordersSaved: saved, totalCount, processedEstimate, remainingEstimate: Math.max(totalCount - processedEstimate, 0), progressPercent: totalCount ? Number(((processedEstimate / totalCount) * 100).toFixed(2)) : 0, completed }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kesalahan tidak diketahui";
    await db.from("sync_logs").update({ status: "failed", message, completed_at: new Date().toISOString() }).eq("id", log.id);
    return Response.json({ ok: false, error: message, resumeFromPage: startPage }, { status: 502, headers });
  }
});
