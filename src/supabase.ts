import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

function decodeJwtRole(token: string | undefined): string | null {
  if (!token?.includes(".")) return null;
  try {
    const segment = token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/");
    const payload = JSON.parse(atob(segment)) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

const invalidUrl = !url || !URL.canParse(url);
const forbiddenKey =
  publishableKey?.startsWith("sb_secret_") || decodeJwtRole(publishableKey) === "service_role";

export const configurationError = invalidUrl
  ? "Alamat proyek Supabase belum benar."
  : !publishableKey
    ? "Publishable key Supabase belum dipasang."
    : forbiddenKey
      ? "Secret API key tidak boleh dipakai di browser. Gunakan publishable key Supabase."
      : null;

export const isConfigured = configurationError === null;

export const supabase = isConfigured
  ? createClient(url!, publishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "implicit",
      },
    })
  : null;
