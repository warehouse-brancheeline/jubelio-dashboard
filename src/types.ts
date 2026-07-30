export type ViewName = "summary" | "orders" | "inventory" | "forecast" | "locations";
export type SortDirection = "asc" | "desc";

export type DashboardFilters = {
  dateFrom: string;
  dateTo: string;
  marketplace: string;
  store: string;
  location: string;
  status: string;
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
  locations: string[];
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
