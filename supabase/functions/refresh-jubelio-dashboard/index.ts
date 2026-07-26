import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const productionOrigin = "https://warehouse-brancheeline.github.io";
const allowedOrigins = new Set([productionOrigin, "http://localhost:5173"]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? productionOrigin;
  const allowedOrigin = allowedOrigins.has(origin) ? origin : productionOrigin;
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

async function readJson(response: Response) {
  return await response.json().catch(() => ({
    ok: false,
    error: `Respons sinkronisasi tidak valid (${response.status})`,
  }));
}

Deno.serve(async (request: Request) => {
  const headers = corsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405, headers });
  }

  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) {
    return Response.json({ ok: false, error: "Origin tidak diizinkan" }, { status: 403, headers });
  }

  const authorization = request.headers.get("authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!authorization || !supabaseUrl) {
    return Response.json({ ok: false, error: "Sesi atau konfigurasi server tidak tersedia" }, { status: 401, headers });
  }

  const functionHeaders = {
    Authorization: authorization,
    "Content-Type": "application/json",
  };

  const [ordersResponse, inventoryResponse] = await Promise.all([
    fetch(`${supabaseUrl}/functions/v1/sync-jubelio-orders`, {
      method: "POST",
      headers: functionHeaders,
      body: JSON.stringify({ pages: 5 }),
    }),
    fetch(`${supabaseUrl}/functions/v1/sync-jubelio-inventory-v2`, {
      method: "POST",
      headers: functionHeaders,
      body: JSON.stringify({}),
    }),
  ]);

  const [orders, inventory] = await Promise.all([
    readJson(ordersResponse),
    readJson(inventoryResponse),
  ]);
  const ok = ordersResponse.ok && inventoryResponse.ok && orders?.ok !== false && inventory?.ok !== false;

  return Response.json(
    {
      ok,
      message: ok
        ? "Order terbaru dan persediaan berhasil disinkronkan dari Jubelio"
        : "Sebagian sinkronisasi gagal. Data lama tetap tersedia.",
      orders,
      inventory,
    },
    { status: ok ? 200 : 502, headers },
  );
});
