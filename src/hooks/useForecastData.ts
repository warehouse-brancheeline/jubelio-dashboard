import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { forecastRpcParams, normalizeForecast } from "../lib/forecast";
import { supabase } from "../supabase";
import type {
  ForecastData,
  ForecastParameters,
  ForecastProductSettings,
} from "../types";

const EMPTY_FORECAST = normalizeForecast(null);

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export function useForecastData(parameters: ForecastParameters, enabled: boolean) {
  const [data, setData] = useState<ForecastData>(EMPTY_FORECAST);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!supabase || !enabled) return false;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await supabase.rpc("forecast_restock", forecastRpcParams(parameters));
      if (result.error) throw result.error;
      if (requestId !== requestRef.current) return false;
      setData(normalizeForecast(result.data));
      return true;
    } catch (loadError) {
      if (requestId !== requestRef.current) return false;
      setError(`Forecast belum dapat dihitung: ${message(loadError)}`);
      return false;
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [enabled, parameters]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [enabled, load]);

  const saveProductSettings = useCallback(
    async (settings: ForecastProductSettings) => {
      if (!supabase) throw new Error("Supabase belum siap.");
      setSaving(true);
      try {
        const userResult = await supabase.auth.getUser();
        if (userResult.error || !userResult.data.user) {
          throw userResult.error ?? new Error("Sesi pengguna tidak ditemukan.");
        }
        const result = await supabase.from("forecast_product_settings").upsert(
          {
            ...settings,
            updated_by: userResult.data.user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "item_id" },
        );
        if (result.error) throw result.error;
        return await load();
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  return useMemo(
    () => ({ data, loading, error, saving, reload: load, saveProductSettings }),
    [data, loading, error, saving, load, saveProductSettings],
  );
}
