import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.53.0";

type Row = Record<string, unknown>;
type Stage = {
  name: string;
  path: string;
  fallbackStatus: string;
  pages: number;
};

const responseHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const pageSize = 200;
const toNumber = (value: unknown) =>
  Number.isFinite(Number(value ?? 0)) ? Number(value ?? 0) : 0;

function normalizeStatus(row: Row, fallback: string) {
  const raw = row.internal_status ?? row.action ?? row.channel_status ?? fallback;
  return String(raw || fallback).trim().replaceAll(" ", "_").toUpperCase();
}

function orderRow(row: Row, fallbackStatus: string, syncedAt: string) {
  return {
    order_id: toNumber(row.salesorder_id),
    order_number: row.salesorder_no ? String(row.salesorder_no) : null,
    order_date: row.transaction_date
      ? String(row.transaction_date)
      : row.created_date
        ? String(row.created_date)
        : null,
    marketplace: String(
      row.channel_name ?? row.source_name ?? row.source ?? "UNKNOWN",
    ),
    store_name: row.store_name ? String(row.store_name) : null,
    customer_name: row.customer_name ? String(row.customer_name) : null,
    status: normalizeStatus(row, fallbackStatus),
    subtotal: toNumber(row.sub_total),
    grand_total: toNumber(row.grand_total),
    raw_data: { ...row, dashboard_sync_stage: fallbackStatus },
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

async function readStage(
  token: string,
  stage: Stage,
): Promise<{ rows: Row[]; totalCount: number; pagesRead: number; truncated: boolean }> {
  const rows: Row[] = [];
  let totalCount = 0;
  let pagesRead = 0;

  for (let page = 1; page <= stage.pages; page++) {
    const separator = stage.path.includes("?") ? "&" : "?";
    const endpoint =
      `${stage.path}${separator}page=${page}&pageSize=${pageSize}` +
      "&sortBy=transaction_date&sortDirection=DESC";
    const response = await fetch(`https://api2.jubelio.com${endpoint}`, {
      headers: { authorization: token, Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`${stage.name} halaman ${page} gagal (${response.status})`);
    }
    const payload = (await response.json().catch(() => ({}))) as Row;
    const batch = Array.isArray(payload)
      ? (payload as unknown as Row[])
      : Array.isArray(payload.data)
        ? (payload.data as Row[])
        : [];
    totalCount = toNumber(payload.totalCount) || totalCount || batch.length;
    pagesRead = page;
    rows.push(...batch);
    if (batch.length < pageSize || (totalCount > 0 && rows.length >= totalCount)) break;
  }

  return {
    rows,
    totalCount,
    pagesRead,
    truncated: totalCount > rows.length,
  };
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return Response.json(
      { ok: false, error: "Method not allowed" },
      { status: 405, headers: responseHeaders },
    );
  }

  const email = Deno.env.get("JUBELIO_EMAIL");
  const password = Deno.env.get("JUBELIO_PASSWORD");
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!email || !password || !url || !key) {
    return Response.json(
      { ok: false, error: "Konfigurasi server belum lengkap" },
      { status: 500, headers: responseHeaders },
    );
  }

  const input = await request.json().catch(() => ({}));
  const completedPages = Math.min(
    Math.max(Math.floor(toNumber(input?.pages) || 5), 1),
    20,
  );
  const activePages = Math.min(
    Math.max(Math.floor(toNumber(input?.active_pages) || 250), 1),
    250,
  );
  const detailLimit = Math.min(
    Math.max(Math.floor(toNumber(input?.detail_limit) || 30), 0),
    100,
  );

  const stages: Stage[] = [
    {
      name: "Order selesai",
      path: "/sales/orders/completed/",
      fallbackStatus: "COMPLETED",
      pages: completedPages,
    },
    {
      name: "Siap diproses",
      path: "/wms/sales/orders/ready-to-process/",
      fallbackStatus: "READY_TO_PROCESS",
      pages: activePages,
    },
    {
      name: "Stok kosong",
      path: "/wms/sales/orders/empty-stock/",
      fallbackStatus: "EMPTY_STOCK",
      pages: activePages,
    },
    {
      name: "Gagal picking",
      path: "/wms/sales/orders/failed-pick",
      fallbackStatus: "FAILED_PICK",
      pages: activePages,
    },
    {
      name: "Permintaan pembatalan",
      path: "/wms/sales/orders/request-cancel/",
      fallbackStatus: "REQUEST_CANCEL",
      pages: activePages,
    },
    {
      name: "Siap picking",
      path: "/wms/sales/orders/ready-to-pick/",
      fallbackStatus: "READY_TO_PICK",
      pages: activePages,
    },
    {
      name: "Sedang picking",
      path: "/wms/sales/picklists/confirm-pick/",
      fallbackStatus: "PICKING",
      pages: activePages,
    },
    {
      name: "Selesai picking",
      path: "/wms/sales/orders/finish-pick/",
      fallbackStatus: "FINISH_PICK",
      pages: activePages,
    },
    {
      name: "Sedang packing",
      path: "/wms/sales/packlists/process/",
      fallbackStatus: "PACKING",
      pages: activePages,
    },
    {
      name: "Selesai packing",
      path: "/wms/sales/packlists/finish-pack/",
      fallbackStatus: "FINISH_PACK",
      pages: activePages,
    },
    {
      name: "Siap dikirim",
      path: "/wms/sales/order/ready-to-ship",
      fallbackStatus: "READY_TO_SHIP",
      pages: activePages,
    },
    {
      name: "Dikirim",
      path: "/sales/packlists/shipped/",
      fallbackStatus: "SHIPPED",
      pages: activePages,
    },
    {
      name: "Dibatalkan",
      path: "/sales/orders/cancel/",
      fallbackStatus: "CANCELLED",
      pages: completedPages,
    },
  ];

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: log, error: logError } = await db
    .from("sync_logs")
    .insert({ sync_type: "all_order_statuses", status: "running" })
    .select("id")
    .single();
  if (logError) {
    return Response.json(
      { ok: false, error: "Gagal membuat catatan sinkronisasi" },
      { status: 500, headers: responseHeaders },
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
    const token = String(session.token);
    const stageResults = [];
    const recentOrderIds: number[] = [];
    let ordersSaved = 0;

    const fetchedStages = await Promise.all(
      stages.map(async (stage) => {
        try {
          return { stage, result: await readStage(token, stage) };
        } catch (error) {
          return { stage, error };
        }
      }),
    );

    for (const fetched of fetchedStages) {
      const { stage } = fetched;
      try {
        if ("error" in fetched) throw fetched.error;
        const result = fetched.result;
        const syncedAt = new Date().toISOString();
        const orders = result.rows
          .filter((row) => toNumber(row.salesorder_id) > 0)
          .map((row) => orderRow(row, stage.fallbackStatus, syncedAt));
        if (orders.length) {
          const write = await db.from("orders").upsert(orders, { onConflict: "order_id" });
          if (write.error) throw new Error(write.error.message);
          recentOrderIds.push(...orders.map((order) => order.order_id));
          ordersSaved += orders.length;
        }
        stageResults.push({
          stage: stage.fallbackStatus,
          saved: orders.length,
          totalCount: result.totalCount,
          pagesRead: result.pagesRead,
          truncated: result.truncated,
        });
      } catch (stageError) {
        stageResults.push({
          stage: stage.fallbackStatus,
          saved: 0,
          error: stageError instanceof Error ? stageError.message : String(stageError),
        });
      }
    }

    const uniqueIds = [...new Set(recentOrderIds)].slice(0, detailLimit);
    let detailsSaved = 0;
    let itemRowsSaved = 0;
    for (let offset = 0; offset < uniqueIds.length; offset += 5) {
      const batch = uniqueIds.slice(offset, offset + 5);
      const details = await Promise.all(
        batch.map(async (orderId) => {
          const response = await fetch(
            `https://api2.jubelio.com/sales/orders/${orderId}`,
            { headers: { authorization: token, Accept: "application/json" } },
          );
          if (!response.ok) return null;
          const detail = (await response.json().catch(() => null)) as Row | null;
          return detail && toNumber(detail.salesorder_id) > 0 ? detail : null;
        }),
      );

      for (const detail of details.filter((row): row is Row => Boolean(row))) {
        const orderId = toNumber(detail.salesorder_id);
        const syncedAt = new Date().toISOString();
        const orderWrite = await db
          .from("orders")
          .upsert(orderRow(detail, "UNKNOWN", syncedAt), { onConflict: "order_id" });
        if (orderWrite.error) continue;
        detailsSaved++;
        const items = itemRows(orderId, detail);
        if (!items.length) continue;
        const itemWrite = await db
          .from("order_items")
          .upsert(items, { onConflict: "order_id,item_id,sku" });
        if (!itemWrite.error) itemRowsSaved += items.length;
      }
    }

    const failedStages = stageResults.filter((stage) => "error" in stage);
    const truncatedStages = stageResults.filter(
      (stage) => "truncated" in stage && stage.truncated,
    );
    const stageIssues = stageResults
      .filter((stage) => "error" in stage || ("truncated" in stage && stage.truncated))
      .map((stage) => ({
        stage: stage.stage,
        error: "error" in stage ? stage.error : undefined,
        pagesRead: "pagesRead" in stage ? stage.pagesRead : undefined,
        totalCount: "totalCount" in stage ? stage.totalCount : undefined,
        saved: stage.saved,
        truncated: "truncated" in stage ? stage.truncated : undefined,
      }));
    await db
      .from("sync_logs")
      .update({
        status: failedStages.length === stages.length ? "failed" : "success",
        records_processed: ordersSaved,
        message: JSON.stringify({
          ordersSaved,
          itemRowsSaved,
          failedStages: failedStages.length,
          truncatedStages: truncatedStages.length,
          issues: stageIssues,
        }),
        completed_at: new Date().toISOString(),
      })
      .eq("id", log.id);

    return Response.json(
      {
        ok: failedStages.length < stages.length,
        message: "Sinkronisasi seluruh status order selesai",
        ordersSaved,
        detailsSaved,
        itemRowsSaved,
        paginationComplete: truncatedStages.length === 0,
        failedStageCount: failedStages.length,
        stages: stageResults,
      },
      {
        status: failedStages.length < stages.length ? 200 : 502,
        headers: responseHeaders,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kesalahan tidak diketahui";
    await db
      .from("sync_logs")
      .update({ status: "failed", message, completed_at: new Date().toISOString() })
      .eq("id", log.id);
    return Response.json({ ok: false, error: message }, { status: 502, headers: responseHeaders });
  }
});
