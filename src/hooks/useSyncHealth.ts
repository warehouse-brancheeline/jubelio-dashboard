import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dataAfterLoad, isLatestRequest, normalizeNumberFields } from "../lib/dashboard";
import { supabase } from "../supabase";
import type { SyncLogRow, SyncStateRow } from "../types";

export type SyncHealthData = {
  logs: SyncLogRow[];
  state: SyncStateRow[];
};

const EMPTY_DATA: SyncHealthData = { logs: [], state: [] };

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export function useSyncHealth(enabled: boolean) {
  const [data, setData] = useState<SyncHealthData>(EMPTY_DATA);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async (): Promise<boolean> => {
    if (!enabled || !supabase) return false;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const [logsResult, stateResult] = await Promise.all([
        supabase
          .from("sync_logs")
          .select("id,sync_type,status,message,records_processed,started_at,completed_at")
          .order("started_at", { ascending: false })
          .limit(50),
        supabase
          .from("sync_state")
          .select("sync_type,next_page,total_count,completed,updated_at"),
      ]);
      if (logsResult.error) throw logsResult.error;
      if (stateResult.error) throw stateResult.error;
      if (!isLatestRequest(requestId, requestRef.current)) return false;

      const nextData: SyncHealthData = {
        logs: normalizeNumberFields((logsResult.data ?? []) as SyncLogRow[], [
          "id",
          "records_processed",
        ]),
        state: normalizeNumberFields((stateResult.data ?? []) as SyncStateRow[], [
          "next_page",
          "total_count",
        ]),
      };
      setData((current) => dataAfterLoad(current, nextData, null));
      setLastUpdated(new Date());
      return true;
    } catch (loadError) {
      if (!isLatestRequest(requestId, requestRef.current)) return false;
      setData((current) => dataAfterLoad(current, null, loadError));
      setError(`Kesehatan sinkronisasi belum dapat dimuat: ${errorMessage(loadError)}`);
      return false;
    } finally {
      if (isLatestRequest(requestId, requestRef.current)) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  return useMemo(
    () => ({ data, loading, error, lastUpdated, reload: load }),
    [data, loading, error, lastUpdated, load],
  );
}
