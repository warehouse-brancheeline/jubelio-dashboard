import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const syncType = "forecast_order_items_backfill";
const toNumber = (value: unknown) =>
  Number.isFinite(Number(value ?? 0)) ? Number(value ?? 0) : 0;

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error) {
    const value = error as Record<string, unknown>;
    return [value.message, value.details, value.hint, value.code]
      .filter(Boolean)
      .map(String)
      .join(" | ") || JSON.stringify(value);
  }
  return String(error);
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
    .filter((item) => item.item_id > 0 && item.sku && item.quantity > 0);
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405, headers });
  }

  const email = Deno.env.get("JUBELIO_EMAIL");
  const password = Deno.env.get("JUBELIO_PASSWORD");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!email || !password || !url || !serviceRole) {
    return Response.json(
      { ok: false, error: "Konfigurasi server belum lengkap" },
      { status: 500, headers },
    );
  }

  const body = await request.json().catch(() => ({}));
  const batchSize = Math.min(Math.max(Math.floor(toNumber(body?.batch_size) || 80), 10), 100);
  const months = Math.min(Math.max(Math.floor(toNumber(body?.months) || 3), 1), 12);
  const scanPageSize = 200;
  const maxScanPages = 5;
  const fromDate = new Date();
  fromDate.setUTCMonth(fromDate.getUTCMonth() - months);

  const db = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const logResult = await db
    .from("sync_logs")
    .insert({ sync_type: syncType, status: "running" })
    .select("id")
    .single();
  if (logResult.error) {
    return Response.json({ ok: false, error: logResult.error.message }, { status: 500, headers });
  }

  try {
    const stateResult = await db
      .from("sync_state")
      .select("next_page,total_count,completed")
      .eq("sync_type", syncType)
      .maybeSingle();
    if (stateResult.error) throw stateResult.error;
    let offset = stateResult.data?.completed ? 0 : Math.max(stateResult.data?.next_page ?? 0, 0);
    let totalCount = stateResult.data?.total_count ?? 0;
    const missingOrderIds: number[] = [];
    let pagesScanned = 0;

    while (missingOrderIds.length < batchSize && pagesScanned < maxScanPages) {
      const ordersResult = await db
        .from("orders")
        .select("order_id", { count: "exact" })
        .in("status", ["COMPLETED", "SUCCESS", "SUCCEEDED"])
        .gte("order_date", fromDate.toISOString())
        .order("order_date", { ascending: false })
        .range(offset, offset + scanPageSize - 1);
      if (ordersResult.error) throw ordersResult.error;
      totalCount = ordersResult.count ?? totalCount;
      const ids = (ordersResult.data ?? []).map((row) => Number(row.order_id));
      if (!ids.length) break;

      const itemsResult = await db.from("order_items").select("order_id").in("order_id", ids);
      if (itemsResult.error) throw itemsResult.error;
      const existing = new Set((itemsResult.data ?? []).map((row) => Number(row.order_id)));
      for (const id of ids) {
        if (!existing.has(id)) missingOrderIds.push(id);
        if (missingOrderIds.length >= batchSize) break;
      }
      offset += ids.length;
      pagesScanned++;
      if (ids.length < scanPageSize) break;
    }

    const login = await fetch("https://api2.jubelio.com/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const session = await login.json().catch(() => ({}));
    if (!login.ok || !session?.token) {
      throw new Error(`Login Jubelio gagal (${login.status})`);
    }

    let ordersSaved = 0;
    let itemRowsSaved = 0;
    let failedOrders = 0;
    for (let index = 0; index < missingOrderIds.length; index += 5) {
      const batch = missingOrderIds.slice(index, index + 5);
      const details = await Promise.all(
        batch.map(async (orderId) => {
          const response = await fetch(`https://api2.jubelio.com/sales/orders/${orderId}`, {
            headers: { authorization: String(session.token), Accept: "application/json" },
          });
          if (!response.ok) return { orderId, detail: null };
          const detail = (await response.json().catch(() => null)) as Row | null;
          return { orderId, detail };
        }),
      );

      for (const result of details) {
        if (!result.detail) {
          failedOrders++;
          continue;
        }
        const rows = itemRows(result.orderId, result.detail);
        if (!rows.length) {
          failedOrders++;
          continue;
        }
        const write = await db
          .from("order_items")
          .upsert(rows, { onConflict: "order_id,item_id,sku" });
        if (write.error) {
          failedOrders++;
          continue;
        }
        ordersSaved++;
        itemRowsSaved += rows.length;
      }
    }

    const completed = offset >= totalCount;
    const stateWrite = await db.from("sync_state").upsert(
      {
        sync_type: syncType,
        next_page: completed ? 0 : offset,
        total_count: totalCount,
        completed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "sync_type" },
    );
    if (stateWrite.error) throw stateWrite.error;

    await db
      .from("sync_logs")
      .update({
        status: "success",
        records_processed: ordersSaved,
        message: `${ordersSaved} order, ${itemRowsSaved} item, ${failedOrders} gagal; posisi ${offset}/${totalCount}`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", logResult.data.id);

    return Response.json(
      {
        ok: true,
        message: "Backfill item untuk forecast selesai",
        months,
        pagesScanned,
        ordersSaved,
        itemRowsSaved,
        failedOrders,
        nextOffset: completed ? 0 : offset,
        totalCount,
        completed,
      },
      { headers },
    );
  } catch (error) {
    const errorMessage = errorText(error);
    await db
      .from("sync_logs")
      .update({ status: "failed", message: errorMessage, completed_at: new Date().toISOString() })
      .eq("id", logResult.data.id);
    return Response.json({ ok: false, error: errorMessage }, { status: 502, headers });
  }
});
