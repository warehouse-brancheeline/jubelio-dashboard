import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import type { DeadStockData, DeadStockParameters, DeadStockRow } from "../types";

const EMPTY_DEAD_STOCK: DeadStockData = {
  summary: { product_count: 0, stock_units: 0, never_sold_count: 0, threshold_days: 60 },
  rows: [],
};

function normalizeDeadStock(input: unknown): DeadStockData {
  const raw = (input ?? {}) as Partial<DeadStockData>;
  const summary = raw.summary ?? ({} as DeadStockData["summary"]);
  const rows = (raw.rows ?? []).map((row) => {
    const normalized = { ...row } as DeadStockRow;
    normalized.item_id = Number(row.item_id ?? 0);
    normalized.stock_available = Number(row.stock_available ?? 0);
    normalized.days_since_last_sale =
      row.days_since_last_sale == null ? null : Number(row.days_since_last_sale);
    normalized.units_last_90_days = Number(row.units_last_90_days ?? 0);
    return normalized;
  });

  return {
    summary: {
      product_count: Number(summary.product_count ?? 0),
      stock_units: Number(summary.stock_units ?? 0),
      never_sold_count: Number(summary.never_sold_count ?? 0),
      threshold_days: Number(summary.threshold_days ?? 60),
    },
    rows,
  };
}

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export function useDeadStockData(parameters: DeadStockParameters, enabled: boolean) {
  const [data, setData] = useState<DeadStockData>(EMPTY_DEAD_STOCK);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async (): Promise<boolean> => {
    if (!supabase || !enabled) return false;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await supabase.rpc("dead_stock_products", {
        p_threshold_days: Math.max(1, parameters.thresholdDays),
        p_location: parameters.location || null,
        p_page: Math.max(1, parameters.page),
        p_page_size: Math.min(100, Math.max(10, parameters.pageSize)),
        p_search: parameters.search.trim() || null,
      });
      if (result.error) throw result.error;
      if (requestId !== requestRef.current) return false;
      setData(normalizeDeadStock(result.data));
      return true;
    } catch (loadError) {
      if (requestId !== requestRef.current) return false;
      setError(`Data produk tidak bergerak belum dapat dimuat: ${message(loadError)}`);
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

  return useMemo(() => ({ data, loading, error, reload: load }), [data, loading, error, load]);
}
