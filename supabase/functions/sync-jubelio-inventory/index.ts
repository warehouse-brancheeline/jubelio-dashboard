import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.53.0";

type JsonRecord = Record<string, unknown>;

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function jubelioGet(path: string, token: string): Promise<unknown> {
  const response = await fetch(`https://api2.jubelio.com${path}`, {
    headers: { authorization: token, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Jubelio ${path} gagal (${response.status})`);
  }
  return await response.json();
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }

  const email = Deno.env.get("JUBELIO_EMAIL");
  const password = Deno.env.get("JUBELIO_PASSWORD");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!email || !password || !supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ ok: false, error: "Konfigurasi server belum lengkap" }), {
      status: 500,
      headers,
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: log, error: logError } = await supabase
    .from("sync_logs")
    .insert({ sync_type: "inventory", status: "running" })
    .select("id")
    .single();

  if (logError) {
    return new Response(JSON.stringify({ ok: false, error: "Gagal membuat catatan sinkronisasi" }), {
      status: 500,
      headers,
    });
  }

  try {
    const loginResponse = await fetch("https://api2.jubelio.com/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const loginPayload = await loginResponse.json().catch(() => ({}));
    if (!loginResponse.ok || !loginPayload?.token) {
      throw new Error(`Login Jubelio gagal (${loginResponse.status})`);
    }

    const token = String(loginPayload.token);
    const locationsPayload = await jubelioGet("/locations?page=1&pageSize=200", token) as JsonRecord;
    const locations = Array.isArray(locationsPayload?.data)
      ? locationsPayload.data as JsonRecord[]
      : Array.isArray(locationsPayload)
      ? locationsPayload as JsonRecord[]
      : [];

    let productCount = 0;
    let inventoryCount = 0;

    for (const location of locations) {
      const locationId = numberValue(location.location_id);
      if (!locationId) continue;

      const itemPayload = await jubelioGet(`/inventory/items/to-stock/${locationId}`, token) as JsonRecord;
      const items = Array.isArray(itemPayload?.data)
        ? itemPayload.data as JsonRecord[]
        : Array.isArray(itemPayload)
        ? itemPayload as JsonRecord[]
        : [];

      if (items.length === 0) continue;

      const products = items
        .filter((item) => numberValue(item.item_id) > 0)
        .map((item) => ({
          item_id: numberValue(item.item_id),
          sku: item.item_code ? String(item.item_code) : null,
          name: String(item.item_name ?? item.item_full_name ?? "Produk tanpa nama"),
          brand: item.brand_name ? String(item.brand_name) : null,
          category: null,
          raw_data: item,
          synced_at: new Date().toISOString(),
        }));

      const inventory = items
        .filter((item) => numberValue(item.item_id) > 0)
        .map((item) => ({
          item_id: numberValue(item.item_id),
          location_id: locationId,
          location_name: String(location.location_name ?? location.name ?? `Lokasi ${locationId}`),
          quantity: numberValue(item.end_qty),
          available_quantity: numberValue(item.available_qty),
          raw_data: item,
          synced_at: new Date().toISOString(),
        }));

      const { error: productError } = await supabase.from("products").upsert(products, {
        onConflict: "item_id",
      });
      if (productError) throw new Error(`Produk gagal disimpan: ${productError.message}`);

      const { error: inventoryError } = await supabase.from("inventory").upsert(inventory, {
        onConflict: "item_id,location_id",
      });
      if (inventoryError) throw new Error(`Stok gagal disimpan: ${inventoryError.message}`);

      productCount += products.length;
      inventoryCount += inventory.length;
    }

    await supabase
      .from("sync_logs")
      .update({
        status: "success",
        records_processed: inventoryCount,
        message: `${productCount} produk, ${inventoryCount} baris stok`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", log.id);

    return new Response(JSON.stringify({
      ok: true,
      message: "Sinkronisasi stok berhasil",
      locations: locations.length,
      products: productCount,
      inventoryRows: inventoryCount,
    }), { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kesalahan tidak diketahui";
    await supabase
      .from("sync_logs")
      .update({ status: "failed", message, completed_at: new Date().toISOString() })
      .eq("id", log.id);

    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 502,
      headers,
    });
  }
});
