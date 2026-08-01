import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false }, { status: 405, headers });
  }

  const suppliedKey = request.headers.get("apikey") ?? "";
  const configuredKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const validKeys = Object.values(configuredKeys).filter(
    (value): value is string => typeof value === "string",
  );
  if (!suppliedKey || !validKeys.includes(suppliedKey)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401, headers });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) {
    return Response.json(
      { ok: false, error: "Server configuration missing" },
      { status: 500, headers },
    );
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action ?? "orders");
  const functionName =
    action === "dashboard"
      ? "refresh-jubelio-dashboard"
      : action === "forecast_items"
        ? "sync-jubelio-forecast-items"
        : "sync-jubelio-orders-backfill";
  const payload =
    action === "dashboard"
      ? {}
      : action === "forecast_items"
        ? { months: 3, batch_size: 80 }
        : { pages: 10 };

  const response = await fetch(`${url}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
    },
    body: JSON.stringify(payload),
  });
  const result = await response
    .json()
    .catch(() => ({ ok: false, error: "Invalid worker response" }));
  return Response.json(result, { status: response.status, headers });
});
