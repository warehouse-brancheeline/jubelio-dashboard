import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.53.0";

type Row = Record<string, unknown>;
const responseHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const toNumber = (value: unknown) => Number.isFinite(Number(value ?? 0)) ? Number(value ?? 0) : 0;

async function getJubelio(path: string, token: string) {
  const response = await fetch(`https://api2.jubelio.com${path}`, { headers: { authorization: token, Accept: "application/json" } });
  if (!response.ok) throw new Error(`Jubelio ${path} gagal (${response.status})`);
  return await response.json();
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return Response.json({ ok: false, error: "Method not allowed" }, { status: 405, headers: responseHeaders });

  const email = Deno.env.get("JUBELIO_EMAIL");
  const password = Deno.env.get("JUBELIO_PASSWORD");
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!email || !password || !url || !key) return Response.json({ ok: false, error: "Konfigurasi server belum lengkap" }, { status: 500, headers: responseHeaders });

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: log, error: logError } = await db.from("sync_logs").insert({ sync_type: "inventory", status: "running" }).select("id").single();
  if (logError) return Response.json({ ok: false, error: "Gagal membuat catatan sinkronisasi" }, { status: 500, headers: responseHeaders });

  try {
    const login = await fetch("https://api2.jubelio.com/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const session = await login.json().catch(() => ({}));
    if (!login.ok || !session?.token) throw new Error(`Login Jubelio gagal (${login.status})`);

    const locationsResult = await getJubelio("/locations/?page=1&pageSize=200", String(session.token)) as Row;
    const locations: Row[] = Array.isArray(locationsResult?.data) ? locationsResult.data as Row[] : Array.isArray(locationsResult) ? locationsResult as Row[] : [];
    let productsSaved = 0;
    let stockSaved = 0;

    for (const location of locations) {
      const locationId = toNumber(location.location_id);
      if (!locationId) continue;
      const itemsResult = await getJubelio(`/inventory/items/to-stock/${locationId}`, String(session.token)) as Row;
      const items: Row[] = Array.isArray(itemsResult?.data) ? itemsResult.data as Row[] : Array.isArray(itemsResult) ? itemsResult as Row[] : [];
      if (!items.length) continue;
      const syncedAt = new Date().toISOString();
      const products = items.filter((x) => toNumber(x.item_id) > 0).map((x) => ({ item_id: toNumber(x.item_id), sku: x.item_code ? String(x.item_code) : null, name: String(x.item_name ?? x.item_full_name ?? "Produk tanpa nama"), brand: x.brand_name ? String(x.brand_name) : null, category: null, raw_data: x, synced_at: syncedAt }));
      const inventory = items.filter((x) => toNumber(x.item_id) > 0).map((x) => ({ item_id: toNumber(x.item_id), location_id: locationId, location_name: String(location.location_name ?? location.name ?? `Lokasi ${locationId}`), quantity: toNumber(x.end_qty), available_quantity: toNumber(x.available_qty), raw_data: x, synced_at: syncedAt }));
      const productWrite = await db.from("products").upsert(products, { onConflict: "item_id" });
      if (productWrite.error) throw new Error(`Produk gagal disimpan: ${productWrite.error.message}`);
      const stockWrite = await db.from("inventory").upsert(inventory, { onConflict: "item_id,location_id" });
      if (stockWrite.error) throw new Error(`Stok gagal disimpan: ${stockWrite.error.message}`);
      productsSaved += products.length;
      stockSaved += inventory.length;
    }

    await db.from("sync_logs").update({ status: "success", records_processed: stockSaved, message: `${productsSaved} produk, ${stockSaved} baris stok`, completed_at: new Date().toISOString() }).eq("id", log.id);
    return Response.json({ ok: true, message: "Sinkronisasi stok berhasil", locations: locations.length, products: productsSaved, inventoryRows: stockSaved }, { headers: responseHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kesalahan tidak diketahui";
    await db.from("sync_logs").update({ status: "failed", message, completed_at: new Date().toISOString() }).eq("id", log.id);
    return Response.json({ ok: false, error: message }, { status: 502, headers: responseHeaders });
  }
});
