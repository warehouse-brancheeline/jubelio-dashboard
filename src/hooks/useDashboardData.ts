import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  dataAfterLoad,
  EMPTY_KPIS,
  isLatestRequest,
  normalizeKpis,
  normalizeNumberFields,
  toRpcParams,
} from "../lib/dashboard";
import { supabase } from "../supabase";
import type {
  ChannelPoint,
  DashboardData,
  DataQuery,
  InventoryRow,
  LocationRow,
  OrderItem,
  OrderRow,
  TrendPoint,
} from "../types";

const EMPTY_DATA: DashboardData = {
  kpis: EMPTY_KPIS,
  trend: [],
  channels: [],
  orders: [],
  orderCount: 0,
  orderRevenue: 0,
  inventory: [],
  inventoryCount: 0,
  locations: [],
  filterOptions: {
    marketplaces: [],
    stores: [],
    statuses: [],
    locations: [],
  },
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function throwIfError<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

export type DashboardController = {
  data: DashboardData;
  initialLoading: boolean;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refreshError: string | null;
  lastUpdated: Date | null;
  reload: () => Promise<boolean>;
  refreshFromJubelio: () => Promise<boolean>;
  loadOrderItems: (orderId: number) => Promise<OrderItem[]>;
};

export function useDashboardData(query: DataQuery, enabled: boolean): DashboardController {
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [initialLoading, setInitialLoading] = useState(enabled);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const requestRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const refreshLockRef = useRef(false);

  const load = useCallback(async (): Promise<boolean> => {
    if (!enabled || !supabase) return false;
    const requestId = ++requestRef.current;
    if (!hasLoadedRef.current) setInitialLoading(true);
    setLoading(true);
    setError(null);

    const rpcParams = toRpcParams(query.filters);
    const orderFrom = (query.orderPage - 1) * query.orderPageSize;
    const inventoryFrom = (query.inventoryPage - 1) * query.inventoryPageSize;

    try {
      let ordersRequest = supabase
        .from("dashboard_orders")
        .select(
          "order_id,order_number,order_date,business_date,marketplace,store_name,customer_name,status,subtotal,grand_total,location_name,synced_at",
          { count: "exact" },
        )
        .gte("business_date", query.filters.dateFrom)
        .lte("business_date", query.filters.dateTo)
        .order(query.orderSort, { ascending: query.orderDirection === "asc" })
        .range(orderFrom, orderFrom + query.orderPageSize - 1);
      if (query.filters.marketplace) {
        ordersRequest = ordersRequest.eq("marketplace", query.filters.marketplace);
      }
      if (query.filters.store) ordersRequest = ordersRequest.eq("store_name", query.filters.store);
      if (query.filters.location) {
        ordersRequest = ordersRequest.eq("location_name", query.filters.location);
      }
      if (query.filters.status) ordersRequest = ordersRequest.eq("status", query.filters.status);
      if (query.orderSearch.trim()) {
        ordersRequest = ordersRequest.ilike("search_text", `%${query.orderSearch.trim()}%`);
      }

      let inventoryRequest = supabase
        .from("dashboard_inventory")
        .select(
          "item_id,sku,product_name,brand,category,location_id,location_name,on_hand_quantity,available_quantity,allocated_quantity,incoming_quantity,stock_status,synced_at",
          { count: "exact" },
        )
        .order(query.inventorySort, { ascending: query.inventoryDirection === "asc" })
        .range(inventoryFrom, inventoryFrom + query.inventoryPageSize - 1);
      if (query.filters.location) {
        inventoryRequest = inventoryRequest.eq("location_name", query.filters.location);
      }
      if (query.inventoryStatus) {
        inventoryRequest = inventoryRequest.eq("stock_status", query.inventoryStatus);
      }
      if (query.inventorySearch.trim()) {
        inventoryRequest = inventoryRequest.ilike(
          "search_text",
          `%${query.inventorySearch.trim()}%`,
        );
      }

      let locationRequest = supabase
        .from("dashboard_locations")
        .select(
          "location_id,location_name,sku_count,on_hand_quantity,available_quantity,allocated_quantity,out_of_stock_count,low_stock_count,synced_at",
        )
        .order("location_name");
      if (query.filters.location) {
        locationRequest = locationRequest.eq("location_name", query.filters.location);
      }

      const totalsParams = {
        ...rpcParams,
        p_search: query.orderSearch.trim() || null,
      };

      const [
        kpiResult,
        trendResult,
        channelResult,
        orderResult,
        orderTotalsResult,
        inventoryResult,
        locationResult,
        locationOptionResult,
        orderOptionResult,
      ] = await Promise.all([
        supabase.rpc("dashboard_kpis", rpcParams),
        supabase.rpc("dashboard_order_trend", rpcParams),
        supabase.rpc("dashboard_channel_summary", rpcParams),
        ordersRequest,
        supabase.rpc("dashboard_order_totals", totalsParams),
        inventoryRequest,
        locationRequest,
        supabase.from("dashboard_locations").select("location_name").order("location_name"),
        supabase
          .from("dashboard_order_filter_options")
          .select("marketplace,store_name,status")
          .limit(5000),
      ]);

      [
        kpiResult,
        trendResult,
        channelResult,
        orderResult,
        orderTotalsResult,
        inventoryResult,
        locationResult,
        locationOptionResult,
        orderOptionResult,
      ].forEach(throwIfError);

      if (!isLatestRequest(requestId, requestRef.current)) return false;

      const optionRows = orderOptionResult.data ?? [];
      const marketplaces = Array.from(
        new Set(optionRows.map((row) => row.marketplace).filter(Boolean)),
      ).sort();
      const stores = Array.from(
        new Map(
          optionRows
            .filter((row) => row.marketplace && row.store_name)
            .map((row) => [
              `${row.marketplace}\u0000${row.store_name}`,
              { marketplace: row.marketplace as string, store: row.store_name as string },
            ]),
        ).values(),
      ).sort((a, b) => a.store.localeCompare(b.store));
      const statuses = Array.from(
        new Set(optionRows.map((row) => row.status).filter(Boolean)),
      ).sort();
      const locations = (locationOptionResult.data ?? [])
        .map((row) => row.location_name)
        .filter(Boolean)
        .sort();

      const kpis = normalizeKpis(kpiResult.data?.[0]);
      const totals = orderTotalsResult.data?.[0] as
        | { order_count?: number | string; revenue?: number | string }
        | undefined;

      const nextData: DashboardData = {
        kpis,
        trend: normalizeNumberFields(
          (trendResult.data ?? []) as TrendPoint[],
          ["order_count", "revenue"],
        ),
        channels: normalizeNumberFields(
          (channelResult.data ?? []) as ChannelPoint[],
          ["order_count", "revenue"],
        ),
        orders: normalizeNumberFields((orderResult.data ?? []) as OrderRow[], [
          "order_id",
          "subtotal",
          "grand_total",
        ]),
        orderCount: Number(orderResult.count ?? totals?.order_count ?? 0),
        orderRevenue: Number(totals?.revenue ?? 0),
        inventory: normalizeNumberFields((inventoryResult.data ?? []) as InventoryRow[], [
          "item_id",
          "location_id",
          "on_hand_quantity",
          "available_quantity",
          "allocated_quantity",
        ]),
        inventoryCount: Number(inventoryResult.count ?? 0),
        locations: normalizeNumberFields((locationResult.data ?? []) as LocationRow[], [
          "location_id",
          "sku_count",
          "on_hand_quantity",
          "available_quantity",
          "allocated_quantity",
          "out_of_stock_count",
          "low_stock_count",
        ]),
        filterOptions: { marketplaces, stores, statuses, locations },
      };
      setData((current) => dataAfterLoad(current, nextData, null));
      hasLoadedRef.current = true;
      setLastUpdated(new Date());
      return true;
    } catch (loadError) {
      if (!isLatestRequest(requestId, requestRef.current)) return false;
      setData((current) => dataAfterLoad(current, null, loadError));
      setError(`Data belum dapat dimuat: ${errorMessage(loadError)}`);
      return false;
    } finally {
      if (isLatestRequest(requestId, requestRef.current)) setInitialLoading(false);
      if (isLatestRequest(requestId, requestRef.current)) setLoading(false);
    }
  }, [enabled, query]);

  useEffect(() => {
    if (!enabled) {
      hasLoadedRef.current = false;
      setData(EMPTY_DATA);
      setInitialLoading(false);
      setLoading(false);
      setError(null);
      return;
    }
    void load();
  }, [enabled, load]);

  const refreshFromJubelio = useCallback(async (): Promise<boolean> => {
    if (!supabase || !enabled || refreshLockRef.current) return false;
    refreshLockRef.current = true;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke(
        "refresh-jubelio-dashboard",
        { body: {} },
      );
      if (invokeError) throw invokeError;
      if (!result?.ok) {
        throw new Error(result?.error ?? "Jubelio belum berhasil disinkronkan.");
      }
      return await load();
    } catch (refreshFailure) {
      setRefreshError(`Sinkronisasi gagal: ${errorMessage(refreshFailure)}`);
      return false;
    } finally {
      refreshLockRef.current = false;
      setRefreshing(false);
    }
  }, [enabled, load]);

  const loadOrderItems = useCallback(async (orderId: number): Promise<OrderItem[]> => {
    if (!supabase) throw new Error("Supabase belum siap.");
    const result = await supabase
      .from("order_items")
      .select("order_id,item_id,sku,product_name,quantity,price,total")
      .eq("order_id", orderId)
      .order("product_name");
    if (result.error) throw result.error;
    return normalizeNumberFields((result.data ?? []) as OrderItem[], [
      "order_id",
      "item_id",
      "quantity",
      "price",
      "total",
    ]);
  }, []);

  return useMemo(
    () => ({
      data,
      initialLoading,
      loading,
      refreshing,
      error,
      refreshError,
      lastUpdated,
      reload: load,
      refreshFromJubelio,
      loadOrderItems,
    }),
    [
      data,
      initialLoading,
      loading,
      refreshing,
      error,
      refreshError,
      lastUpdated,
      load,
      refreshFromJubelio,
      loadOrderItems,
    ],
  );
}
