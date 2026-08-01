import type { DashboardFilters, Kpis, OperationalSummary } from "../types";

export const BUSINESS_TIME_ZONE = "Asia/Makassar";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function businessDate(date = new Date()): string {
  return dateFormatter.format(date);
}

export function dateDaysAgo(days: number, date = new Date()): string {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() - days);
  return businessDate(copy);
}

export function defaultFilters(date = new Date()): DashboardFilters {
  return {
    dateFrom: dateDaysAgo(29, date),
    dateTo: businessDate(date),
    marketplace: "",
    store: "",
    location: "",
    status: "",
    settlementStatus: "",
  };
}

export function toRpcParams(filters: DashboardFilters) {
  return {
    p_date_from: filters.dateFrom || null,
    p_date_to: filters.dateTo || null,
    p_marketplace: filters.marketplace || null,
    p_store: filters.store || null,
    p_location: filters.location || null,
    p_status_group: filters.status || null,
    p_settlement_status: filters.settlementStatus || null,
  };
}

export const EMPTY_OPERATIONAL: OperationalSummary = {
  range: { date_from: "", date_to: "", previous_from: "", previous_to: "", days: 0 },
  kpis: {
    order_count: 0, valid_order_count: 0, order_value: 0, new_order_count: 0,
    processing_order_count: 0, ready_to_ship_count: 0, shipped_order_count: 0,
    completed_order_count: 0, cancelled_order_count: 0, returned_order_count: 0,
    unknown_order_count: 0, completed_revenue: 0, unfinished_value: 0,
    settlement_data_count: 0, settled_order_count: 0, settled_value: 0,
    unsettled_value: 0, average_order_value: 0, completion_rate: 0,
    cancellation_rate: 0, pending_rate: 0, average_process_hours: null,
    process_time_sample: 0, average_ship_hours: null, ship_time_sample: 0,
    order_synced_at: null, last_order_at: null, inventory_rows: 0,
    total_on_hand: 0, total_available: 0, total_allocated: 0,
    low_stock_rows: 0, out_of_stock_rows: 0, location_count: 0,
    inventory_synced_at: null, backfill_loaded: 0, backfill_total: 0,
    backfill_completed: false, backfill_updated_at: null,
  },
  comparison: {
    available: false, order_count: 0, order_value: 0, completed_order_count: 0,
    cancelled_order_count: 0, new_order_count: 0, valid_order_count: 0,
    settled_value: 0, settlement_available: false, completion_rate: null,
    cancellation_rate: null,
  },
  trend: [], status_distribution: [], funnel: [], channels: [], warehouses: [],
  attention: [],
  quality: { status_reconciled: false, unknown_status_count: 0, missing_location_count: 0,
    settlement_unavailable_count: 0, process_time_sample: 0, ship_time_sample: 0 },
  sla: {},
};

const NUMBER_KEYS = new Set([
  "order_count", "valid_order_count", "order_value", "new_order_count",
  "processing_order_count", "ready_to_ship_count", "shipped_order_count",
  "completed_order_count", "cancelled_order_count", "returned_order_count",
  "unknown_order_count", "completed_revenue", "unfinished_value", "settlement_data_count",
  "settled_order_count", "settled_value", "unsettled_value", "average_order_value",
  "completion_rate", "cancellation_rate", "pending_rate", "average_process_hours",
  "process_time_sample", "average_ship_hours", "ship_time_sample", "inventory_rows",
  "total_on_hand", "total_available", "total_allocated", "low_stock_rows",
  "out_of_stock_rows", "location_count", "backfill_loaded", "backfill_total",
  "completed_count", "cancelled_count", "new_count", "shipped_count", "stage_order",
  "grand_total", "waiting_hours", "days",
]);

function numericJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(numericJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    NUMBER_KEYS.has(key) && item !== null ? Number(item) : numericJson(item),
  ]));
}

export function normalizeOperationalSummary(input: unknown): OperationalSummary {
  if (!input || typeof input !== "object") return EMPTY_OPERATIONAL;
  const normalized = numericJson(input) as Partial<OperationalSummary>;
  return {
    ...EMPTY_OPERATIONAL,
    ...normalized,
    range: { ...EMPTY_OPERATIONAL.range, ...normalized.range },
    kpis: { ...EMPTY_OPERATIONAL.kpis, ...normalized.kpis },
    comparison: { ...EMPTY_OPERATIONAL.comparison, ...normalized.comparison },
    quality: { ...EMPTY_OPERATIONAL.quality, ...normalized.quality },
  };
}

export const EMPTY_KPIS: Kpis = {
  order_count: 0,
  order_value: 0,
  completed_order_count: 0,
  completed_revenue: 0,
  open_order_count: 0,
  open_order_value: 0,
  cancelled_order_count: 0,
  revenue: 0,
  last_order_at: null,
  order_synced_at: null,
  inventory_rows: 0,
  total_on_hand: 0,
  total_available: 0,
  total_allocated: 0,
  low_stock_rows: 0,
  out_of_stock_rows: 0,
  location_count: 0,
  inventory_synced_at: null,
  backfill_loaded: 0,
  backfill_total: 0,
  backfill_completed: false,
  backfill_updated_at: null,
};

export function normalizeKpis(input: Partial<Kpis> | null | undefined): Kpis {
  const row = input ?? {};
  return {
    order_count: Number(row.order_count ?? 0),
    order_value: Number(row.order_value ?? 0),
    completed_order_count: Number(row.completed_order_count ?? 0),
    completed_revenue: Number(row.completed_revenue ?? row.revenue ?? 0),
    open_order_count: Number(row.open_order_count ?? 0),
    open_order_value: Number(row.open_order_value ?? 0),
    cancelled_order_count: Number(row.cancelled_order_count ?? 0),
    revenue: Number(row.revenue ?? 0),
    last_order_at: row.last_order_at ?? null,
    order_synced_at: row.order_synced_at ?? null,
    inventory_rows: Number(row.inventory_rows ?? 0),
    total_on_hand: Number(row.total_on_hand ?? 0),
    total_available: Number(row.total_available ?? 0),
    total_allocated: Number(row.total_allocated ?? 0),
    low_stock_rows: Number(row.low_stock_rows ?? 0),
    out_of_stock_rows: Number(row.out_of_stock_rows ?? 0),
    location_count: Number(row.location_count ?? 0),
    inventory_synced_at: row.inventory_synced_at ?? null,
    backfill_loaded: Number(row.backfill_loaded ?? 0),
    backfill_total: Number(row.backfill_total ?? 0),
    backfill_completed: Boolean(row.backfill_completed),
    backfill_updated_at: row.backfill_updated_at ?? null,
  };
}

export function normalizeNumberFields<T extends Record<string, unknown>>(
  rows: T[] | null,
  fields: (keyof T)[],
): T[] {
  return (rows ?? []).map((row) => {
    const copy = { ...row };
    for (const field of fields) {
      copy[field] = Number(row[field] ?? 0) as T[keyof T];
    }
    return copy;
  });
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatCompactCurrency(value: number): string {
  return `Rp${formatCompactNumber(value)}`;
}

export function percentChange(current: number, previous: number, available = true): number | null {
  if (!available || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function formatBusinessDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: BUSINESS_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+08:00`));
}

export function formatDateTime(value: string | null): string {
  if (!value) return "Belum tersedia";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: BUSINESS_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function authErrorMessage(
  code?: string | null,
  description?: string | null,
): string {
  const combined = `${code ?? ""} ${description ?? ""}`.toLowerCase();
  if (combined.includes("otp_expired") || combined.includes("expired")) {
    return "Tautan masuk sudah kedaluwarsa. Minta tautan baru lalu buka email terbaru.";
  }
  if (combined.includes("access_denied")) {
    return "Akses ditolak. Pastikan Anda memakai akun yang dibuat oleh administrator.";
  }
  if (combined.includes("auth session missing")) {
    return "Sesi masuk tidak ditemukan. Silakan masuk kembali.";
  }
  if (combined.includes("invalid login credentials")) {
    return "Email atau password belum benar.";
  }
  if (description) return description.replaceAll("+", " ");
  return "Autentikasi gagal. Silakan coba kembali.";
}

export function authParamsFromUrl(url: URL) {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  return {
    accessToken: hash.get("access_token"),
    refreshToken: hash.get("refresh_token"),
    type: hash.get("type") ?? url.searchParams.get("type"),
    error: hash.get("error") ?? url.searchParams.get("error"),
    errorCode: hash.get("error_code") ?? url.searchParams.get("error_code"),
    errorDescription:
      hash.get("error_description") ?? url.searchParams.get("error_description"),
  };
}

export function cleanAuthUrl(url: URL): string {
  const clean = new URL(url.toString());
  const authKeys = [
    "access_token",
    "refresh_token",
    "expires_at",
    "expires_in",
    "provider_token",
    "token_type",
    "type",
    "error",
    "error_code",
    "error_description",
    "code",
  ];
  const hash = new URLSearchParams(clean.hash.replace(/^#/, ""));
  authKeys.forEach((key) => {
    hash.delete(key);
    clean.searchParams.delete(key);
  });
  clean.hash = hash.toString() ? `#${hash.toString()}` : "";
  return `${clean.pathname}${clean.search}${clean.hash}`;
}

export function stockStatusLabel(status: string): string {
  if (status === "OUT_OF_STOCK") return "Habis";
  if (status === "LOW_STOCK") return "Menipis";
  return "Sehat";
}

export function escapeCsvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

export function isLatestRequest(requestId: number, latestRequestId: number): boolean {
  return requestId === latestRequestId;
}

export function dataAfterLoad<T>(
  current: T,
  candidate: T | null,
  failure: unknown | null,
): T {
  return failure || candidate === null ? current : candidate;
}
