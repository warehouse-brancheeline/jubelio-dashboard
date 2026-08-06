import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.53.0";

type Row = Record<string, unknown>;

const productionOrigin = "https://warehouse-brancheeline.github.io";
const allowedOrigins = new Set([productionOrigin, "http://localhost:5173"]);
const toNumber = (value: unknown) =>
  Number.isFinite(Number(value ?? 0)) ? Number(value ?? 0) : 0;

// Same conflict key appearing twice in one upsert() call makes Postgres
// reject the whole batch ("ON CONFLICT DO UPDATE command cannot affect row
// a second time"). Keep the last occurrence per key before every upsert.
function dedupeByKey<T>(rows: T[], keyOf: (row: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) byKey.set(keyOf(row), row);
  return [...byKey.values()];
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? productionOrigin;
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : productionOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function orderFromDetail(detail: Row, syncedAt: string) {
  return {
    order_id: toNumber(detail.salesorder_id),
    order_number: detail.salesorder_no ? String(detail.salesorder_no) : null,
    order_date: detail.transaction_date ? String(detail.transaction_date) : null,
    marketplace: String(
      detail.channel_name ?? detail.source_name ?? detail.source ?? "UNKNOWN",
    ),
    store_name: detail.store_name ? String(detail.store_name) : null,
    customer_name: detail.customer_name ? String(detail.customer_name) : null,
    status: String(
      detail.internal_status ?? detail.action ?? detail.channel_status ?? "UNKNOWN",
    ).toUpperCase(),
    subtotal: toNumber(detail.sub_total),
    grand_total: toNumber(detail.grand_total),
    raw_data: detail,
    synced_at: syncedAt,
  };
}

function itemRows(orderId: number, detail: Row) {
  const items = Array.isArray(detail.items) ? (detail.items as Row[]) : [];
  return items
    .map((item) => {
      const itemId = toNumber(item.item_id) || toNumber(item.salesorder_detail_id);
      const sku = String(
        item.item_code ?? `ITEM-${itemId || toNumber(item.salesorder_detail_id)}`,
      ).trim();
      const quantity = toNumber(item.qty_in_base ?? item.qty);
      const price = toNumber(item.price ?? item.sell_price ?? item.original_price);
      return {
        order_id: orderId,
        item_id: itemId,
        sku,
        product_name: item.item_name
          ? String(item.item_name)
          : item.description
            ? String(item.description)
            : null,
        quantity,
        price,
        total: toNumber(item.amount) || quantity * price,
        raw_data: item,
      };
    })
    .filter((item) => item.item_id > 0 && item.sku);
}

Deno.serve(async (request: Request) => {
  const headers = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405, headers });
  }

  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) {
    return Response.json({ ok: false, error: "Origin tidak diizinkan" }, { status: 403, headers });
  }

  const input = await request.json().catch(() => ({}));
  const orderId = Math.floor(toNumber(input?.order_id));
  if (orderId <= 0) {
    return Response.json({ ok: false, error: "order_id tidak valid" }, { status: 400, headers });
  }

  const email = Deno.env.get("JUBELIO_EMAIL");
  const password = Deno.env.get("JUBELIO_PASSWORD");
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!email || !password || !url || !key) {
    return Response.json(
      { ok: false, error: "Konfigurasi server belum lengkap" },
      { status: 500, headers },
    );
  }

  try {
    const login = await fetch("https://api2.jubelio.com/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const session = await login.json().catch(() => ({}));
    if (!login.ok || !session?.token) {
      throw new Error(`Login Jubelio gagal (${login.status})`);
    }

    const response = await fetch(`https://api2.jubelio.com/sales/orders/${orderId}`, {
      headers: { authorization: String(session.token), Accept: "application/json" },
    });
    const detail = (await response.json().catch(() => ({}))) as Row;
    if (!response.ok || toNumber(detail.salesorder_id) <= 0) {
      throw new Error(`Detail order Jubelio gagal (${response.status})`);
    }

    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const syncedAt = new Date().toISOString();
    const orderWrite = await db
      .from("orders")
      .upsert(orderFromDetail(detail, syncedAt), { onConflict: "order_id" });
    if (orderWrite.error) throw new Error(`Order gagal disimpan: ${orderWrite.error.message}`);

    const items = dedupeByKey(
      itemRows(orderId, detail),
      (item) => `${item.order_id}:${item.item_id}:${item.sku}`,
    );
    if (items.length) {
      const deleteExisting = await db.from("order_items").delete().eq("order_id", orderId);
      if (deleteExisting.error) {
        throw new Error(`Item lama gagal diperbarui: ${deleteExisting.error.message}`);
      }
      const itemWrite = await db
        .from("order_items")
        .upsert(items, { onConflict: "order_id,item_id,sku" });
      if (itemWrite.error) throw new Error(`Item gagal disimpan: ${itemWrite.error.message}`);
    }

    return Response.json(
      { ok: true, orderId, itemsSaved: items.length },
      { headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kesalahan tidak diketahui";
    return Response.json({ ok: false, error: message }, { status: 502, headers });
  }
});
