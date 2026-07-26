export type ViewName = "summary" | "orders" | "inventory" | "locations";
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
  revenue: number;
};

export type ChannelPoint = {
  marketplace: string;
  order_count: number;
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
  orderRevenue: number;
  inventory: InventoryRow[];
  inventoryCount: number;
  locations: LocationRow[];
  filterOptions: FilterOptions;
};
