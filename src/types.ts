export type ViewName = "summary" | "orders" | "inventory" | "forecast" | "locations";
export type SortDirection = "asc" | "desc";

export type DashboardFilters = {
  dateFrom: string;
  dateTo: string;
  marketplace: string;
  store: string;
  location: string;
  status: string;
  settlementStatus: string;
};

export type Kpis = {
  order_count: number;
  order_value: number;
  completed_order_count: number;
  completed_revenue: number;
  open_order_count: number;
  open_order_value: number;
  cancelled_order_count: number;
  revenue: number;
  last_order_at: string | null;
  order_synced_at: string | null;
  inventory_rows: number;
  total_on_hand: number;
  total_available: number;
  total_allocated: number;
  low_stock_rows: number;
  out_of_stock_rows: number;
  location_count: number;
  inventory_synced_at: string | null;
  backfill_loaded: number;
  backfill_total: number;
  backfill_completed: boolean;
  backfill_updated_at: string | null;
};

export type TrendPoint = {
  business_date: string;
  order_count: number;
  order_value: number;
  completed_revenue: number;
  revenue: number;
};

export type ChannelPoint = {
  marketplace: string;
  order_count: number;
  order_value: number;
  completed_revenue: number;
  revenue: number;
};

export type OrderRow = {
  order_id: number;
  order_number: string | null;
  order_date: string;
  business_date: string;
  marketplace: string;
  store_name: string | null;
  customer_name: string | null;
  status: string;
  subtotal: number;
  grand_total: number;
  location_name: string | null;
  synced_at: string | null;
  invoice_number: string | null;
  tracking_number: string | null;
  created_at: string;
  processed_at: string | null;
  shipped_at: string | null;
  completed_at: string | null;
  settlement_at: string | null;
  raw_status: string;
  status_group: string;
  status_label: string;
  settlement_status: string;
  settlement_label: string;
  settlement_amount: number | null;
  fee_amount: number | null;
  location_id: number | null;
  shipper: string | null;
  recipient_name: string | null;
  sync_stage: string;
};

export type OrderItem = {
  order_id: number;
  item_id: number;
  sku: string;
  product_name: string | null;
  quantity: number;
  price: number;
  total: number;
};

export type InventoryRow = {
  item_id: number;
  sku: string | null;
  product_name: string;
  brand: string | null;
  category: string | null;
  location_id: number;
  location_name: string;
  on_hand_quantity: number;
  available_quantity: number;
  allocated_quantity: number;
  incoming_quantity: number | null;
  stock_status: "OUT_OF_STOCK" | "LOW_STOCK" | "HEALTHY";
  synced_at: string | null;
};

export type LocationRow = {
  location_id: number;
  location_name: string;
  sku_count: number;
  on_hand_quantity: number;
  available_quantity: number;
  allocated_quantity: number;
  out_of_stock_count: number;
  low_stock_count: number;
  synced_at: string | null;
};

export type FilterOptions = {
  marketplaces: string[];
  stores: { marketplace: string; store: string }[];
  statuses: string[];
  statusLabels: Record<string, string>;
  settlementStatuses: string[];
  settlementLabels: Record<string, string>;
  locations: string[];
};

export type OperationalKpis = {
  order_count: number;
  valid_order_count: number;
  order_value: number;
  new_order_count: number;
  processing_order_count: number;
  ready_to_ship_count: number;
  shipped_order_count: number;
  completed_order_count: number;
  cancelled_order_count: number;
  returned_order_count: number;
  unknown_order_count: number;
  completed_revenue: number;
  unfinished_value: number;
  settlement_data_count: number;
  settled_order_count: number;
  settled_value: number;
  unsettled_value: number;
  average_order_value: number;
  completion_rate: number;
  cancellation_rate: number;
  pending_rate: number;
  average_process_hours: number | null;
  process_time_sample: number;
  average_ship_hours: number | null;
  ship_time_sample: number;
  order_synced_at: string | null;
  last_order_at: string | null;
  inventory_rows: number;
  total_on_hand: number;
  total_available: number;
  total_allocated: number;
  low_stock_rows: number;
  out_of_stock_rows: number;
  location_count: number;
  inventory_synced_at: string | null;
  backfill_loaded: number;
  backfill_total: number;
  backfill_completed: boolean;
  backfill_updated_at: string | null;
};

export type OperationalComparison = {
  available: boolean;
  order_count: number;
  order_value: number;
  completed_order_count: number;
  cancelled_order_count: number;
  new_order_count: number;
  valid_order_count: number;
  settled_value: number;
  settlement_available: boolean;
  completion_rate: number | null;
  cancellation_rate: number | null;
};

export type StatusDistribution = {
  status_group: string;
  status_label: string;
  order_count: number;
  order_value: number;
};

export type FunnelPoint = {
  stage_order: number;
  stage: string;
  order_count: number;
};

export type ChannelPerformance = {
  marketplace: string;
  order_count: number;
  order_value: number;
  completed_count: number;
  cancelled_count: number;
  average_order_value: number;
};

export type WarehousePerformance = {
  location_name: string;
  order_count: number;
  new_count: number;
  shipped_count: number;
  completed_count: number;
  average_process_hours: number | null;
};

export type AttentionOrder = Pick<OrderRow,
  "order_id" | "order_number" | "invoice_number" | "tracking_number" |
  "order_date" | "created_at" | "raw_status" | "status_group" |
  "status_label" | "settlement_status" | "settlement_label" |
  "marketplace" | "store_name" | "location_name" | "shipper" | "grand_total"
> & {
  waiting_hours: number;
  sla_status: "Normal" | "Perlu perhatian" | "Terlambat" | "Kritis";
  attention_reason: string;
};

export type OperationalSummary = {
  range: {
    date_from: string;
    date_to: string;
    previous_from: string;
    previous_to: string;
    days: number;
  };
  kpis: OperationalKpis;
  comparison: OperationalComparison;
  trend: TrendPoint[];
  status_distribution: StatusDistribution[];
  funnel: FunnelPoint[];
  channels: ChannelPerformance[];
  warehouses: WarehousePerformance[];
  attention: AttentionOrder[];
  quality: {
    status_reconciled: boolean;
    unknown_status_count: number;
    missing_location_count: number;
    settlement_unavailable_count: number;
    process_time_sample: number;
    ship_time_sample: number;
  };
  sla: Record<string, number | string | boolean>;
};

export type DataQuery = {
  filters: DashboardFilters;
  orderPage: number;
  orderPageSize: number;
  orderSort: keyof Pick<OrderRow, "order_date" | "order_number" | "marketplace" | "status" | "grand_total">;
  orderDirection: SortDirection;
  orderSearch: string;
  inventoryPage: number;
  inventoryPageSize: number;
  inventorySort: keyof Pick<InventoryRow, "sku" | "product_name" | "location_name" | "available_quantity" | "allocated_quantity" | "stock_status">;
  inventoryDirection: SortDirection;
  inventorySearch: string;
  inventoryStatus: string;
};

export type DashboardData = {
  kpis: Kpis;
  trend: TrendPoint[];
  channels: ChannelPoint[];
  orders: OrderRow[];
  orderCount: number;
  orderValue: number;
  completedRevenue: number;
  orderRevenue: number;
  inventory: InventoryRow[];
  inventoryCount: number;
  locations: LocationRow[];
  filterOptions: FilterOptions;
  operational: OperationalSummary;
};

export type ForecastPeriod = "1_month" | "2_months" | "3_months" | "custom";

export type ForecastParameters = {
  period: ForecastPeriod;
  dateFrom: string;
  dateTo: string;
  location: string;
  defaultLeadTimeDays: number;
  safetyStockDays: number;
  coverageDays: number;
  serviceLevel: "90" | "95" | "97.5" | "99";
  trendFloorPercent: number;
  trendCapPercent: number;
  defaultMoq: number;
  page: number;
  pageSize: number;
  search: string;
  priority: string;
};

export type ForecastSummary = {
  product_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  no_restock_count: number;
  recommended_units: number;
  low_confidence_count: number;
};

export type ForecastCoverage = {
  date_from: string;
  date_to: string;
  analysis_days: number;
  completed_orders: number;
  orders_with_items: number;
  coverage_percentage: number;
  location: string | null;
};

export type ForecastAssumptions = {
  completed_statuses: string[];
  internal_transactions_excluded: boolean;
  outlier_method: string;
  default_lead_time_days: number;
  safety_stock_days: number;
  coverage_days: number;
  z_score: number;
  trend_floor: number;
  trend_cap: number;
  default_moq: number;
  incoming_source: string;
};

export type ForecastRow = {
  item_id: number;
  sku: string;
  product_name: string;
  stock_available: number;
  incoming_quantity: number;
  allocated_quantity: number;
  net_stock: number;
  total_units_sold: number;
  normal_units_sold: number;
  avg_daily_sales: number;
  avg_weekly_sales: number;
  avg_monthly_sales: number;
  transaction_count: number;
  unique_customers: number;
  active_sales_days: number;
  trend_percentage: number | null;
  trend_status: string;
  trend_factor: number;
  lead_time_days: number;
  safety_stock: number;
  reorder_point: number;
  demand_30_days: number;
  days_until_stockout: number | null;
  estimated_stockout_date: string | null;
  recommended_restock: number;
  actual_restock: number;
  priority: "Kritis" | "Tinggi" | "Sedang" | "Rendah" | "Tidak perlu restock";
  confidence_level: "Tinggi" | "Sedang" | "Rendah";
  recommendation_reason: string;
  largest_customer_percentage: number;
  outlier_transactions: number;
  outlier_units: number;
  daily_stddev: number;
  moq: number;
  has_product_settings: boolean;
  stock_synced_at: string | null;
};

export type ForecastData = {
  summary: ForecastSummary;
  coverage: ForecastCoverage;
  assumptions: ForecastAssumptions;
  rows: ForecastRow[];
};

export type ForecastProductSettings = {
  item_id: number;
  lead_time_days: number | null;
  moq: number | null;
  safety_stock: number | null;
  incoming_quantity: number | null;
};
