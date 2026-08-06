import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  const email = Deno.env.get("JUBELIO_EMAIL");
  const password = Deno.env.get("JUBELIO_PASSWORD");

  if (!email || !password) {
    return new Response(
      JSON.stringify({ ok: false, error: "Jubelio secrets belum dikonfigurasi" }),
      { status: 500, headers: jsonHeaders },
    );
  }

  try {
    const response = await fetch("https://api2.jubelio.com/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload?.token) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Login Jubelio gagal",
          jubelioStatus: response.status,
        }),
        { status: 502, headers: jsonHeaders },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Koneksi Jubelio berhasil",
        userName: payload.userName ?? null,
        packageId: payload.packageId ?? null,
        passwordExpired: payload.passwordExpired ?? false,
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (_error) {
    return new Response(
      JSON.stringify({ ok: false, error: "Jubelio tidak dapat dihubungi" }),
      { status: 502, headers: jsonHeaders },
    );
  }
});
