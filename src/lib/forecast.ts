import { businessDate, dateDaysAgo } from "./dashboard";
import type {
  ForecastData,
  ForecastParameters,
  ForecastPeriod,
  ForecastRow,
} from "../types";

export const SERVICE_Z_SCORE: Record<ForecastParameters["serviceLevel"], number> = {
  "90": 1.28,
  "95": 1.65,
  "97.5": 1.96,
  "99": 2.33,
};

export type ForecastSortDirection = "asc" | "desc";

export type ForecastSortKey =
  | "sku"
  | "product_name"
  | "stock_available"
  | "incoming_quantity"
  | "allocated_quantity"
  | "net_stock"
  | "total_units_sold"
  | "avg_daily_sales"
  | "avg_monthly_sales"
  | "transaction_count"
  | "unique_customers"
  | "trend_percentage"
  | "trend_status"
  | "lead_time_days"
  | "safety_stock"
  | "reorder_point"
  | "demand_30_days"
  | "estimated_stockout_date"
  | "recommended_restock"
  | "priority"
  | "confidence_level"
  | "recommendation_reason";

const PRIORITY_ORDER: Record<ForecastRow["priority"], number> = {
  Kritis: 1,
  Tinggi: 2,
  Sedang: 3,
  Rendah: 4,
  "Tidak perlu restock": 5,
};

const CONFIDENCE_ORDER: Record<ForecastRow["confidence_level"], number> = {
  Tinggi: 1,
  Sedang: 2,
  Rendah: 3,
};

const TREND_ORDER: Record<string, number> = {
  Naik: 1,
  Stabil: 2,
  Turun: 3,
  "Produk baru atau mulai diminati": 4,
};

function forecastSortValue(row: ForecastRow, key: ForecastSortKey): number | string | null {
  if (key === "priority") return PRIORITY_ORDER[row.priority];
  if (key === "confidence_level") return CONFIDENCE_ORDER[row.confidence_level];
  if (key === "trend_status") return TREND_ORDER[row.trend_status] ?? row.trend_status;
  return row[key];
}

export function sortForecastRows(
  rows: ForecastRow[],
  key: ForecastSortKey,
  direction: ForecastSortDirection,
): ForecastRow[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftValue = forecastSortValue(left, key);
    const rightValue = forecastSortValue(right, key);

    if (leftValue == null && rightValue == null) return 0;
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;

    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return (leftValue - rightValue) * multiplier;
    }

    return String(leftValue).localeCompare(String(rightValue), "id-ID", {
      numeric: true,
      sensitivity: "base",
    }) * multiplier;
  });
}

export function forecastDateRange(
  period: Exclude<ForecastPeriod, "custom">,
  date = new Date(),
): { dateFrom: string; dateTo: string } {
  const days = period === "1_month" ? 29 : period === "2_months" ? 59 : 89;
  return { dateFrom: dateDaysAgo(days, date), dateTo: businessDate(date) };
}

export function defaultForecastParameters(date = new Date()): ForecastParameters {
  return {
    period: "3_months",
    ...forecastDateRange("3_months", date),
    location: "",
    defaultLeadTimeDays: 14,
    safetyStockDays: 7,
    coverageDays: 30,
    serviceLevel: "95",
    trendFloorPercent: -30,
    trendCapPercent: 50,
    defaultMoq: 1,
    page: 1,
    pageSize: 25,
    search: "",
    priority: "",
  };
}

export function forecastRpcParams(parameters: ForecastParameters) {
  return {
    p_date_from: parameters.dateFrom,
    p_date_to: parameters.dateTo,
    p_location: parameters.location || null,
    p_default_lead_time_days: Math.max(1, parameters.defaultLeadTimeDays),
    p_safety_stock_days: Math.max(0, parameters.safetyStockDays),
    p_coverage_days: Math.max(1, parameters.coverageDays),
    p_z_score: SERVICE_Z_SCORE[parameters.serviceLevel],
    p_trend_floor: Math.min(0, parameters.trendFloorPercent / 100),
    p_trend_cap: Math.max(0, parameters.trendCapPercent / 100),
    p_default_moq: Math.max(1, parameters.defaultMoq),
    p_page: Math.max(1, parameters.page),
    p_page_size: Math.min(100, Math.max(10, parameters.pageSize)),
    p_search: parameters.search.trim() || null,
    p_priority: parameters.priority || null,
  };
}

const numberFields: (keyof ForecastRow)[] = [
  "item_id",
  "stock_available",
  "incoming_quantity",
  "allocated_quantity",
  "net_stock",
  "total_units_sold",
  "normal_units_sold",
  "avg_daily_sales",
  "avg_weekly_sales",
  "avg_monthly_sales",
  "transaction_count",
  "unique_customers",
  "active_sales_days",
  "trend_factor",
  "lead_time_days",
  "safety_stock",
  "reorder_point",
  "demand_30_days",
  "recommended_restock",
  "actual_restock",
  "largest_customer_percentage",
  "outlier_transactions",
  "outlier_units",
  "daily_stddev",
  "moq",
];

export function normalizeForecast(input: unknown): ForecastData {
  const raw = (input ?? {}) as Partial<ForecastData>;
  const summary = raw.summary ?? ({} as ForecastData["summary"]);
  const coverage = raw.coverage ?? ({} as ForecastData["coverage"]);
  const assumptions = raw.assumptions ?? ({} as ForecastData["assumptions"]);
  const rows = (raw.rows ?? []).map((row) => {
    const normalized = { ...row } as ForecastRow;
    numberFields.forEach((field) => {
      normalized[field] = Number(row[field] ?? 0) as never;
    });
    normalized.trend_percentage =
      row.trend_percentage == null ? null : Number(row.trend_percentage);
    normalized.days_until_stockout =
      row.days_until_stockout == null ? null : Number(row.days_until_stockout);
    return normalized;
  });

  return {
    summary: {
      product_count: Number(summary.product_count ?? 0),
      critical_count: Number(summary.critical_count ?? 0),
      high_count: Number(summary.high_count ?? 0),
      medium_count: Number(summary.medium_count ?? 0),
      low_count: Number(summary.low_count ?? 0),
      no_restock_count: Number(summary.no_restock_count ?? 0),
      recommended_units: Number(summary.recommended_units ?? 0),
      low_confidence_count: Number(summary.low_confidence_count ?? 0),
    },
    coverage: {
      date_from: String(coverage.date_from ?? ""),
      date_to: String(coverage.date_to ?? ""),
      analysis_days: Number(coverage.analysis_days ?? 0),
      completed_orders: Number(coverage.completed_orders ?? 0),
      orders_with_items: Number(coverage.orders_with_items ?? 0),
      coverage_percentage: Number(coverage.coverage_percentage ?? 0),
      location: coverage.location ?? null,
    },
    assumptions: {
      completed_statuses: assumptions.completed_statuses ?? [],
      internal_transactions_excluded: Boolean(
        assumptions.internal_transactions_excluded,
      ),
      outlier_method: String(assumptions.outlier_method ?? ""),
      default_lead_time_days: Number(assumptions.default_lead_time_days ?? 14),
      safety_stock_days: Number(assumptions.safety_stock_days ?? 7),
      coverage_days: Number(assumptions.coverage_days ?? 30),
      z_score: Number(assumptions.z_score ?? 1.65),
      trend_floor: Number(assumptions.trend_floor ?? -0.3),
      trend_cap: Number(assumptions.trend_cap ?? 0.5),
      default_moq: Number(assumptions.default_moq ?? 1),
      incoming_source: String(assumptions.incoming_source ?? ""),
    },
    rows,
  };
}

export function formatDecimal(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}
