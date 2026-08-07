import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  Archive,
  ArrowDownUp,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  Eye,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  TrendingUp,
  Warehouse,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth, type AuthController } from "./hooks/useAuth";
import { useDashboardData } from "./hooks/useDashboardData";
import { ForecastView } from "./ForecastView";
import { SyncHealthView } from "./SyncHealthView";
import { DeadStockView } from "./DeadStockView";
import { BusinessSummaryView, type OrderSelection } from "./BusinessSummaryView";
import {
  buildCsv,
  businessDate,
  defaultFilters,
  downloadCsv,
  formatBusinessDate,
  formatCompactNumber,
  formatCurrency,
  formatDateTime,
  formatNumber,
  retentionCutoffDate,
  stockStatusLabel,
} from "./lib/dashboard";
import type {
  DashboardFilters,
  DataQuery,
  OrderItem,
  OrderRow,
  SortDirection,
  ViewName,
} from "./types";

function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function FullPageLoader() {
  return (
    <div className="full-page-state">
      <LoaderCircle className="spin" size={32} />
      <p>Memeriksa sesi aman…</p>
    </div>
  );
}

function AuthScreen({ auth }: { auth: AuthController }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showRecoveryRequest, setShowRecoveryRequest] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (auth.mode === "recovery") {
      if (password !== confirmPassword) {
        return;
      }
      await auth.updatePassword(password);
      return;
    }
    if (showRecoveryRequest) {
      await auth.sendRecovery(email);
      return;
    }
    await auth.signIn(email, password);
  }

  const passwordMismatch =
    auth.mode === "recovery" && Boolean(confirmPassword) && password !== confirmPassword;

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="brand-mark">BE</div>
        <p className="eyebrow">JUBELIO INTELLIGENCE WORKSPACE</p>
        <h1>Semua sinyal bisnis, dalam satu pandangan.</h1>
        <p className="auth-lead">
          Revenue, order, dan stok dari seluruh channel—diringkas dari data Jubelio yang
          tersimpan aman di Supabase.
        </p>
        <div className="auth-points">
          <span>
            <CheckCircle2 size={18} /> Data asli
          </span>
          <span>
            <CheckCircle2 size={18} /> Akses internal
          </span>
          <span>
            <CheckCircle2 size={18} /> Waktu WITA
          </span>
        </div>
      </section>

      <section className="auth-panel">
        <form className="auth-card" onSubmit={submit}>
          <p className="eyebrow">AKSES INTERNAL</p>
          <h2>
            {auth.mode === "recovery"
              ? "Buat password baru"
              : showRecoveryRequest
                ? "Pulihkan akses"
                : "Masuk ke dashboard"}
          </h2>

          {auth.mode !== "recovery" && (
            <label>
              Email
              <span className="input-with-icon">
                <Mail size={18} />
                <input
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nama@perusahaan.com"
                  required
                />
              </span>
            </label>
          )}

          {!showRecoveryRequest && (
            <label>
              {auth.mode === "recovery" ? "Password baru" : "Password"}
              <span className="input-with-icon">
                <LockKeyhole size={18} />
                <input
                  autoComplete={auth.mode === "recovery" ? "new-password" : "current-password"}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </span>
            </label>
          )}

          {auth.mode === "recovery" && (
            <label>
              Ulangi password baru
              <span className="input-with-icon">
                <LockKeyhole size={18} />
                <input
                  autoComplete="new-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </span>
              {passwordMismatch && <small className="field-error">Password belum sama.</small>}
            </label>
          )}

          {auth.message && (
            <div className={`auth-message ${auth.messageKind}`}>
              {auth.messageKind === "error" ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
              <span>{auth.message}</span>
            </div>
          )}

          <button className="primary-button auth-submit" disabled={auth.busy || passwordMismatch}>
            {auth.busy && <LoaderCircle className="spin" size={18} />}
            {auth.mode === "recovery"
              ? "Simpan password baru"
              : showRecoveryRequest
                ? "Kirim tautan pemulihan"
                : "Masuk dengan aman"}
          </button>

          {auth.mode === "login" && !showRecoveryRequest && (
            <div className="auth-actions">
              <button type="button" onClick={() => void auth.sendMagicLink(email)} disabled={!email || auth.busy}>
                Kirim tautan masuk
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRecoveryRequest(true);
                  auth.clearMessage();
                }}
              >
                Lupa password?
              </button>
            </div>
          )}
          {showRecoveryRequest && (
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setShowRecoveryRequest(false);
                auth.clearMessage();
              }}
            >
              Kembali ke login
            </button>
          )}
          <p className="auth-footnote">Akun dibuat oleh administrator melalui Supabase.</p>
        </form>
      </section>
    </main>
  );
}

type FilterBarProps = {
  filters: DashboardFilters;
  appliedFilters: DashboardFilters;
  options: ReturnType<typeof useDashboardData>["data"]["filterOptions"];
  onChange: (key: keyof DashboardFilters, value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

function FilterBar({ filters, appliedFilters, options, onChange, onApply, onReset }: FilterBarProps) {
  const stores = filters.marketplace
    ? options.stores.filter((row) => row.marketplace === filters.marketplace)
    : options.stores;

  return (
    <section className="filter-panel" aria-label="Filter dashboard">
      <label>
        Dari tanggal
        <span className="filter-input">
          <CalendarDays size={16} />
          <input
            type="date"
            value={filters.dateFrom}
            min={retentionCutoffDate()}
            max={filters.dateTo}
            onChange={(event) => onChange("dateFrom", event.target.value)}
          />
        </span>
      </label>
      <label>
        Sampai tanggal
        <span className="filter-input">
          <CalendarDays size={16} />
          <input
            type="date"
            value={filters.dateTo}
            min={filters.dateFrom}
            onChange={(event) => onChange("dateTo", event.target.value)}
          />
        </span>
      </label>
      <label>
        Gudang
        <select value={filters.location} onChange={(event) => onChange("location", event.target.value)}>
          <option value="">Semua gudang</option>
          {options.locations.map((location) => (
            <option key={location} value={location}>
              {location}
            </option>
          ))}
        </select>
      </label>
      <label>
        Platform
        <select
          value={filters.marketplace}
          onChange={(event) => onChange("marketplace", event.target.value)}
        >
          <option value="">Semua platform</option>
          {options.marketplaces.map((marketplace) => (
            <option key={marketplace} value={marketplace}>
              {marketplace}
            </option>
          ))}
        </select>
      </label>
      <label>
        Toko marketplace
        <select value={filters.store} onChange={(event) => onChange("store", event.target.value)}>
          <option value="">Semua toko</option>
          {stores.map((row) => (
            <option key={`${row.marketplace}-${row.store}`} value={row.store}>
              {row.store}
            </option>
          ))}
        </select>
      </label>
      <label>
        Status order
        <select value={filters.status} onChange={(event) => onChange("status", event.target.value)}>
          <option value="">Semua status tersedia</option>
          {filters.status.includes(",") && (
            <option value={filters.status}>{filters.status.split(",").map((status) => options.statusLabels[status] || status).join(" + ")}</option>
          )}
          {options.statuses.map((status) => (
            <option key={status} value={status}>
              {options.statusLabels[status] || status}
            </option>
          ))}
        </select>
      </label>
      <label>
        Status pencairan
        <select value={filters.settlementStatus} onChange={(event) => onChange("settlementStatus", event.target.value)}>
          <option value="">Semua pencairan</option>
          {options.settlementStatuses.map((status) => (
            <option key={status} value={status}>{options.settlementLabels[status] || status}</option>
          ))}
        </select>
      </label>
      <button className="apply-filter-button" onClick={onApply} type="button">Terapkan</button>
      <button className="icon-text-button" onClick={onReset} type="button">
        <RotateCcw size={16} /> Reset
      </button>
      <div className="active-filter-chips">
        <span>{appliedFilters.dateFrom} s.d. {appliedFilters.dateTo}</span>
        {appliedFilters.location && <span>Gudang: {appliedFilters.location}</span>}
        {appliedFilters.marketplace && <span>Platform: {appliedFilters.marketplace}</span>}
        {appliedFilters.store && <span>Toko: {appliedFilters.store}</span>}
        {appliedFilters.status && <span>Status: {options.statusLabels[appliedFilters.status] || appliedFilters.status}</span>}
        {appliedFilters.settlementStatus && <span>Pencairan: {options.settlementLabels[appliedFilters.settlementStatus] || appliedFilters.settlementStatus}</span>}
      </div>
    </section>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone = "green",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: "green" | "blue" | "amber" | "red";
}) {
  return (
    <article className="kpi-card">
      <span className={`kpi-icon ${tone}`}>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>
    </article>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <Boxes size={34} />
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function SummaryView({
  controller,
  modern,
  onOrders,
  onInventory,
}: {
  controller: ReturnType<typeof useDashboardData>;
  modern?: boolean;
  onOrders?: (selection?: OrderSelection) => void;
  onInventory?: (status?: string) => void;
}) {
  if (modern && onOrders && onInventory) {
    return <BusinessSummaryView controller={controller} onOrders={onOrders} onInventory={onInventory} />;
  }
  const { data } = controller;
  const coverage =
    data.kpis.backfill_total > 0
      ? Math.min(100, (data.kpis.backfill_loaded / data.kpis.backfill_total) * 100)
      : 0;

  return (
    <>
      {!data.kpis.backfill_completed && (
        <div className="coverage-banner">
          <AlertCircle size={20} />
          <div>
            <strong>Histori order masih dilengkapi</strong>
            <p>
              {formatNumber(data.kpis.backfill_loaded)} dari sekitar{" "}
              {formatNumber(data.kpis.backfill_total)} order selesai sudah tersedia (
              {coverage.toFixed(1)}%). Angka akan bertambah selama backfill berjalan.
            </p>
          </div>
          <div className="coverage-progress" aria-label={`Progres ${coverage.toFixed(1)} persen`}>
            <span style={{ width: `${coverage}%` }} />
          </div>
        </div>
      )}

      <section className="kpi-grid">
        <KpiCard
          icon={<CircleDollarSign size={22} />}
          label="Nilai order"
          value={formatCurrency(data.kpis.order_value)}
          hint="Order aktif + selesai, tanpa pembatalan"
        />
        <KpiCard
          icon={<ShoppingBag size={22} />}
          label="Semua order"
          value={formatNumber(data.kpis.order_count)}
          hint={`${formatNumber(data.kpis.cancelled_order_count)} dibatalkan pada filter`}
          tone="amber"
        />
        <KpiCard
          icon={<LoaderCircle size={22} />}
          label="Belum selesai"
          value={formatNumber(data.kpis.open_order_count)}
          hint={`${formatCurrency(data.kpis.open_order_value)} masih diproses`}
          tone="blue"
        />
        <KpiCard
          icon={<CheckCircle2 size={22} />}
          label="Revenue selesai"
          value={formatCurrency(data.kpis.completed_revenue)}
          hint={`${formatNumber(data.kpis.completed_order_count)} order berstatus COMPLETED`}
        />
        <KpiCard
          icon={<PackageCheck size={22} />}
          label="Stok tersedia"
          value={formatNumber(data.kpis.total_available)}
          hint={`${formatNumber(data.kpis.total_allocated)} unit teralokasi`}
          tone="blue"
        />
        <KpiCard
          icon={<AlertCircle size={22} />}
          label="Stok perlu perhatian"
          value={formatNumber(data.kpis.low_stock_rows + data.kpis.out_of_stock_rows)}
          hint={`${formatNumber(data.kpis.out_of_stock_rows)} habis · ${formatNumber(data.kpis.low_stock_rows)} menipis`}
          tone="red"
        />
      </section>

      <section className="chart-grid">
        <article className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">TREN NILAI ORDER</p>
              <h2>Performa harian</h2>
            </div>
            <span className="panel-meta">Zona waktu WITA</span>
          </div>
          {data.trend.length ? (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trend}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1f9467" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="#1f9467" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#dce7e1" strokeDasharray="4 5" vertical={false} />
                  <XAxis
                    dataKey="business_date"
                    tickFormatter={(value) => formatBusinessDate(String(value)).replace(" 2026", "")}
                    minTickGap={28}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(value) => formatCompactNumber(Number(value))}
                    axisLine={false}
                    tickLine={false}
                    width={68}
                  />
                  <Tooltip
                    labelFormatter={(value) => formatBusinessDate(String(value))}
                    formatter={(value) => [formatCurrency(Number(value)), "Nilai order"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="order_value"
                    stroke="#14825a"
                    strokeWidth={3}
                    fill="url(#revenueFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="Belum ada tren" body="Tidak ada order pada kombinasi filter ini." />
          )}
        </article>

        <article className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">KONTRIBUSI CHANNEL</p>
              <h2>Nilai order per platform</h2>
            </div>
          </div>
          {data.channels.length ? (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.channels} layout="vertical" margin={{ left: 18 }}>
                  <CartesianGrid stroke="#e4ece8" strokeDasharray="4 5" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(value) => formatCompactNumber(Number(value))}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="marketplace"
                    width={105}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip formatter={(value) => [formatCurrency(Number(value)), "Nilai order"]} />
                  <Bar dataKey="order_value" fill="#1f9467" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="Belum ada kontribusi" body="Tidak ada channel pada filter ini." />
          )}
        </article>
      </section>

      <article className="panel source-note">
        <div>
          <p className="eyebrow">KETERSEDIAAN SUMBER</p>
          <h2>Yang sudah dan belum tersedia</h2>
        </div>
        <ul>
          <li>Order aktif, selesai, dan pembatalan terbaru dibaca dari tahapan proses Jubelio.</li>
          <li>Detail item diambil langsung dari Jubelio saat order dibuka, lalu disimpan untuk akses berikutnya.</li>
          <li>Incoming stock tidak dikirim oleh sumber saat ini; angka tidak direkayasa.</li>
          <li>Nilai stok negatif dari sumber dijaga minimum nol pada tampilan.</li>
        </ul>
      </article>
    </>
  );
}

function SortButton({
  label,
  column,
  active,
  direction,
  onSort,
}: {
  label: string;
  column: string;
  active: string;
  direction: SortDirection;
  onSort: (column: string) => void;
}) {
  return (
    <button className={active === column ? "sort-button active" : "sort-button"} onClick={() => onSort(column)}>
      {label}
      <ArrowDownUp size={13} />
      {active === column && <span className="sr-only">{direction === "asc" ? "menaik" : "menurun"}</span>}
    </button>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="pagination">
      <span>
        {formatNumber(from)}–{formatNumber(to)} dari {formatNumber(total)}
      </span>
      <label>
        Baris
        <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>
          {[25, 50, 100].map((size) => (
            <option key={size}>{size}</option>
          ))}
        </select>
      </label>
      <button disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Halaman sebelumnya">
        <ChevronLeft size={18} />
      </button>
      <strong>
        {page} / {pages}
      </strong>
      <button disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Halaman berikutnya">
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

function OrderDetail({
  order,
  loadItems,
  onClose,
}: {
  order: OrderRow;
  loadItems: (orderId: number) => Promise<OrderItem[]>;
  onClose: () => void;
}) {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadItems(order.order_id)
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadItems, order.order_id]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-label="Detail order" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Tutup detail">
          <X size={20} />
        </button>
        <p className="eyebrow">DETAIL ORDER</p>
        <h2>{order.order_number || `Order ${order.order_id}`}</h2>
        <div className="detail-copy-actions">
          <button type="button" onClick={() => void navigator.clipboard.writeText(order.order_number || String(order.order_id))}>Salin nomor order</button>
          {order.tracking_number && <button type="button" onClick={() => void navigator.clipboard.writeText(order.tracking_number!)}>Salin nomor resi</button>}
        </div>
        <div className="detail-grid">
          <div><span>Nomor invoice</span><strong>{order.invoice_number || "Belum tersedia"}</strong></div>
          <div><span>Nomor resi</span><strong>{order.tracking_number || "Belum tersedia"}</strong></div>
          <div><span>Tanggal order (WITA)</span><strong>{formatDateTime(order.order_date)}</strong></div>
          <div><span>Tanggal diproses</span><strong>{formatDateTime(order.processed_at)}</strong></div>
          <div><span>Tanggal dikirim</span><strong>{formatDateTime(order.shipped_at)}</strong></div>
          <div><span>Tanggal selesai</span><strong>{formatDateTime(order.completed_at)}</strong></div>
          <div><span>Tanggal pencairan</span><strong>{formatDateTime(order.settlement_at)}</strong></div>
          <div><span>Status order</span><strong>{order.status_label} ({order.raw_status})</strong></div>
          <div><span>Status pencairan</span><strong>{order.settlement_label}</strong></div>
          <div><span>Platform</span><strong>{order.marketplace}</strong></div>
          <div><span>Toko</span><strong>{order.store_name || "—"}</strong></div>
          <div><span>Penerima</span><strong>{order.recipient_name || order.customer_name || "—"}</strong></div>
          <div><span>Gudang</span><strong>{order.location_name || "Tidak dikirim sumber"}</strong></div>
          <div><span>Ekspedisi</span><strong>{order.shipper || "Belum tersedia"}</strong></div>
          <div><span>Biaya / potongan</span><strong>{order.fee_amount === null ? "Belum tersedia" : formatCurrency(order.fee_amount)}</strong></div>
          <div><span>Grand total</span><strong>{formatCurrency(order.grand_total)}</strong></div>
          <div><span>Nilai pencairan</span><strong>{order.settlement_amount === null ? "Belum tersedia" : formatCurrency(order.settlement_amount)}</strong></div>
        </div>
        <h3>Item order</h3>
        {loading ? (
          <div className="inline-loader"><LoaderCircle className="spin" size={20} /> Memuat item…</div>
        ) : error ? (
          <div className="error-banner"><AlertCircle size={18} /> {error}</div>
        ) : items.length ? (
          <div className="table-scroll detail-table">
            <table>
              <thead><tr><th>SKU</th><th>Produk</th><th>Qty</th><th>Harga</th><th>Total</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${item.order_id}-${item.item_id}`}>
                    <td>{item.sku}</td><td>{item.product_name || "—"}</td>
                    <td>{formatNumber(item.quantity)}</td><td>{formatCurrency(item.price)}</td>
                    <td>{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Item tidak ditemukan"
            body="Jubelio tidak mengembalikan baris item untuk order ini."
          />
        )}
      </section>
    </div>
  );
}

type OrdersViewProps = {
  controller: ReturnType<typeof useDashboardData>;
  search: string;
  onSearch: (value: string) => void;
  page: number;
  pageSize: number;
  sort: DataQuery["orderSort"];
  direction: SortDirection;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  onSort: (sort: DataQuery["orderSort"]) => void;
};

function OrdersView(props: OrdersViewProps) {
  const { data, loadOrderItems } = props.controller;
  const [selected, setSelected] = useState<OrderRow | null>(null);

  function exportRows() {
    const csv = buildCsv(
      ["Nomor", "Invoice", "Resi", "Tanggal WITA", "Diproses", "Dikirim", "Selesai", "Pencairan", "Platform", "Toko", "Penerima", "Gudang", "Ekspedisi", "Status Order", "Status Pencairan", "Grand Total", "Biaya", "Nilai Pencairan"],
      data.orders.map((order) => [
        order.order_number,
        order.invoice_number,
        order.tracking_number,
        formatDateTime(order.order_date),
        formatDateTime(order.processed_at),
        formatDateTime(order.shipped_at),
        formatDateTime(order.completed_at),
        formatDateTime(order.settlement_at),
        order.marketplace,
        order.store_name,
        order.recipient_name || order.customer_name,
        order.location_name,
        order.shipper,
        order.status_label,
        order.settlement_label,
        order.grand_total,
        order.fee_amount,
        order.settlement_amount,
      ]),
    );
    downloadCsv(`jubelio-orders-${businessDate()}.csv`, csv);
  }

  function sort(column: string) {
    props.onSort(column as DataQuery["orderSort"]);
  }

  return (
    <>
      <section className="module-stat-row">
        <div><span>Order sesuai filter</span><strong>{formatNumber(data.orderCount)}</strong></div>
        <div><span>Nilai order sesuai filter</span><strong>{formatCurrency(data.orderValue)}</strong></div>
        <div><span>Revenue selesai</span><strong>{formatCurrency(data.completedRevenue)}</strong></div>
        <div><span>Baris halaman ini</span><strong>{formatNumber(data.orders.length)}</strong></div>
      </section>
      <article className="panel table-panel">
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={18} />
            <input
              value={props.search}
              onChange={(event) => props.onSearch(event.target.value)}
              placeholder="Cari nomor, customer, toko, atau channel"
            />
          </label>
          <button className="secondary-button" onClick={exportRows} disabled={!data.orders.length}>
            <Download size={17} /> Ekspor halaman CSV
          </button>
        </div>
        {data.orders.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th><SortButton label="Order" column="order_number" active={props.sort} direction={props.direction} onSort={sort} /></th>
                  <th><SortButton label="Tanggal WITA" column="order_date" active={props.sort} direction={props.direction} onSort={sort} /></th>
                  <th><SortButton label="Platform" column="marketplace" active={props.sort} direction={props.direction} onSort={sort} /></th>
                  <th>Toko</th><th>Pelanggan</th><th>Gudang</th>
                  <th><SortButton label="Status" column="status" active={props.sort} direction={props.direction} onSort={sort} /></th>
                  <th className="number-cell"><SortButton label="Nilai" column="grand_total" active={props.sort} direction={props.direction} onSort={sort} /></th>
                  <th aria-label="Aksi" />
                </tr>
              </thead>
              <tbody>
                {data.orders.map((order) => (
                  <tr key={order.order_id}>
                    <td><strong>{order.order_number || order.order_id}</strong></td>
                    <td>{formatDateTime(order.order_date)}</td>
                    <td>{order.marketplace}</td><td>{order.store_name || "—"}</td>
                    <td>{order.customer_name || "—"}</td>
                    <td>{order.location_name || <span className="muted">Tidak tersedia</span>}</td>
                    <td>
                      <span
                        className={`status-pill ${
                          order.status === "COMPLETED"
                            ? "complete"
                            : ["CANCELLED", "CANCELED", "RETURNED"].includes(order.status)
                              ? "cancelled"
                              : "processing"
                        }`}
                      >
                        {order.status_label}
                      </span>
                    </td>
                    <td className="number-cell">{formatCurrency(order.grand_total)}</td>
                    <td><button className="row-action" onClick={() => setSelected(order)} aria-label={`Lihat ${order.order_number}`}><Eye size={17} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Order tidak ditemukan" body="Ubah filter atau kata pencarian untuk melihat order." />
        )}
        <Pagination page={props.page} pageSize={props.pageSize} total={data.orderCount} onPage={props.onPage} onPageSize={props.onPageSize} />
      </article>
      {selected && (
        <OrderDetail
          key={selected.order_id}
          order={selected}
          loadItems={loadOrderItems}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

type InventoryViewProps = {
  controller: ReturnType<typeof useDashboardData>;
  search: string;
  status: string;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  page: number;
  pageSize: number;
  sort: DataQuery["inventorySort"];
  direction: SortDirection;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  onSort: (sort: DataQuery["inventorySort"]) => void;
  onForecast: () => void;
};

function InventoryView(props: InventoryViewProps) {
  const { data } = props.controller;

  function exportRows() {
    const csv = buildCsv(
      ["SKU", "Produk", "Gudang", "On hand", "Tersedia", "Teralokasi", "Incoming", "Status"],
      data.inventory.map((item) => [
        item.sku,
        item.product_name,
        item.location_name,
        item.on_hand_quantity,
        item.available_quantity,
        item.allocated_quantity,
        item.incoming_quantity ?? "Belum tersedia",
        stockStatusLabel(item.stock_status),
      ]),
    );
    downloadCsv(`jubelio-inventory-${businessDate()}.csv`, csv);
  }

  function sort(column: string) {
    props.onSort(column as DataQuery["inventorySort"]);
  }

  return (
    <>
      <section className="module-stat-row">
        <div><span>Baris stok</span><strong>{formatNumber(data.inventoryCount)}</strong></div>
        <div><span>Total tersedia</span><strong>{formatNumber(data.kpis.total_available)}</strong></div>
        <div><span>Total teralokasi</span><strong>{formatNumber(data.kpis.total_allocated)}</strong></div>
      </section>
      <article className="panel table-panel">
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={18} />
            <input value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="Cari SKU, produk, brand, atau kategori" />
          </label>
          <select className="toolbar-select" value={props.status} onChange={(event) => props.onStatus(event.target.value)}>
            <option value="">Semua status stok</option>
            <option value="OUT_OF_STOCK">Habis</option>
            <option value="LOW_STOCK">Menipis (≤ 5)</option>
            <option value="HEALTHY">Sehat</option>
          </select>
          <button className="secondary-button" onClick={exportRows} disabled={!data.inventory.length}>
            <Download size={17} /> Ekspor halaman CSV
          </button>
          <button className="primary-button compact" onClick={props.onForecast}>
            <TrendingUp size={17} /> Forecast Restock
          </button>
        </div>
        {data.inventory.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th><SortButton label="SKU" column="sku" active={props.sort} direction={props.direction} onSort={sort} /></th>
                  <th><SortButton label="Produk" column="product_name" active={props.sort} direction={props.direction} onSort={sort} /></th>
                  <th><SortButton label="Gudang" column="location_name" active={props.sort} direction={props.direction} onSort={sort} /></th>
                  <th className="number-cell">On hand</th>
                  <th className="number-cell"><SortButton label="Tersedia" column="available_quantity" active={props.sort} direction={props.direction} onSort={sort} /></th>
                  <th className="number-cell"><SortButton label="Teralokasi" column="allocated_quantity" active={props.sort} direction={props.direction} onSort={sort} /></th>
                  <th className="number-cell">Incoming</th>
                  <th><SortButton label="Status" column="stock_status" active={props.sort} direction={props.direction} onSort={sort} /></th>
                </tr>
              </thead>
              <tbody>
                {data.inventory.map((item) => (
                  <tr key={`${item.item_id}-${item.location_id}`}>
                    <td><strong>{item.sku || "—"}</strong></td>
                    <td><strong>{item.product_name}</strong><small className="table-subline">{[item.brand, item.category].filter(Boolean).join(" · ")}</small></td>
                    <td>{item.location_name}</td>
                    <td className="number-cell">{formatNumber(item.on_hand_quantity)}</td>
                    <td className="number-cell">{formatNumber(item.available_quantity)}</td>
                    <td className="number-cell">{formatNumber(item.allocated_quantity)}</td>
                    <td className="number-cell"><span className="muted">{item.incoming_quantity == null ? "Belum tersedia" : formatNumber(item.incoming_quantity)}</span></td>
                    <td><span className={`status-pill ${item.stock_status.toLowerCase()}`}>{stockStatusLabel(item.stock_status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Stok tidak ditemukan" body="Ubah gudang, status stok, atau kata pencarian." />
        )}
        <Pagination page={props.page} pageSize={props.pageSize} total={data.inventoryCount} onPage={props.onPage} onPageSize={props.onPageSize} />
      </article>
    </>
  );
}

function LocationsView({
  controller,
  onOpen,
}: {
  controller: ReturnType<typeof useDashboardData>;
  onOpen: (location: string) => void;
}) {
  const { locations } = controller.data;
  if (!locations.length) {
    return <EmptyState title="Lokasi belum tersedia" body="Sinkronkan inventory Jubelio untuk memuat lokasi." />;
  }
  return (
    <section className="location-grid">
      {locations.map((location) => (
        <article className="location-card" key={location.location_id}>
          <div className="location-icon"><Warehouse size={22} /></div>
          <div>
            <p className="eyebrow">LOKASI {location.location_id}</p>
            <h2>{location.location_name}</h2>
          </div>
          <dl>
            <div><dt>SKU</dt><dd>{formatNumber(location.sku_count)}</dd></div>
            <div><dt>On hand</dt><dd>{formatNumber(location.on_hand_quantity)}</dd></div>
            <div><dt>Tersedia</dt><dd>{formatNumber(location.available_quantity)}</dd></div>
            <div><dt>Teralokasi</dt><dd>{formatNumber(location.allocated_quantity)}</dd></div>
            <div><dt>Habis</dt><dd>{formatNumber(location.out_of_stock_count)}</dd></div>
            <div><dt>Menipis</dt><dd>{formatNumber(location.low_stock_count)}</dd></div>
          </dl>
          <p className="location-sync">Terakhir sinkron {formatDateTime(location.synced_at)}</p>
          <button className="secondary-button" onClick={() => onOpen(location.location_name)}>
            Lihat persediaan <ChevronRight size={17} />
          </button>
        </article>
      ))}
    </section>
  );
}

const NAV_ITEMS: { id: ViewName; label: string; icon: React.ReactNode }[] = [
  { id: "summary", label: "Ringkasan", icon: <LayoutDashboard size={20} /> },
  { id: "orders", label: "Order", icon: <ShoppingBag size={20} /> },
  { id: "inventory", label: "Persediaan", icon: <Boxes size={20} /> },
  { id: "forecast", label: "Forecast Restock", icon: <TrendingUp size={20} /> },
  { id: "locations", label: "Lokasi", icon: <Warehouse size={20} /> },
  { id: "deadstock", label: "Produk Tidak Bergerak", icon: <Archive size={20} /> },
  { id: "sync", label: "Kesehatan Sinkron", icon: <Activity size={20} /> },
];

const VIEW_COPY: Record<ViewName, { eyebrow: string; title: string; description: string }> = {
  summary: {
    eyebrow: "PUSAT OPERASIONAL",
    title: "Ringkasan bisnis",
    description: "Revenue, order, dan kesehatan stok berdasarkan filter yang sama.",
  },
  orders: {
    eyebrow: "TRANSAKSI",
    title: "Order",
    description: "Telusuri dan audit order Jubelio yang sudah tersinkron.",
  },
  inventory: {
    eyebrow: "PERSEDIAAN",
    title: "Stok per produk dan gudang",
    description: "On hand, tersedia, dan alokasi tanpa nilai negatif di tampilan.",
  },
  forecast: {
    eyebrow: "PERENCANAAN STOK",
    title: "Forecast Restock",
    description: "Rekomendasi pembelian dari tren unit terjual, posisi stok, dan lead time.",
  },
  locations: {
    eyebrow: "JARINGAN GUDANG",
    title: "Lokasi",
    description: "Ringkasan stok nyata untuk setiap lokasi Jubelio.",
  },
  sync: {
    eyebrow: "OPERASIONAL SINKRONISASI",
    title: "Kesehatan sinkronisasi",
    description: "Waktu sinkron terakhir, status jujur, dan progres backfill per sumber data.",
  },
  deadstock: {
    eyebrow: "PERSEDIAAN",
    title: "Produk tidak bergerak",
    description: "Stok yang tidak terjual melebihi ambang batas hari yang Anda tentukan.",
  },
};

function Dashboard({ auth }: { auth: AuthController }) {
  const [activeView, setActiveView] = useState<ViewName>("summary");
  const [filters, setFilters] = useState<DashboardFilters>(() => defaultFilters());
  const [draftFilters, setDraftFilters] = useState<DashboardFilters>(() => defaultFilters());
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(25);
  const [orderSort, setOrderSort] = useState<DataQuery["orderSort"]>("order_date");
  const [orderDirection, setOrderDirection] = useState<SortDirection>("desc");
  const [orderSearchInput, setOrderSearchInput] = useState("");
  const orderSearch = useDebouncedValue(orderSearchInput);
  const [inventoryPage, setInventoryPage] = useState(1);
  const [inventoryPageSize, setInventoryPageSize] = useState(25);
  const [inventorySort, setInventorySort] = useState<DataQuery["inventorySort"]>("available_quantity");
  const [inventoryDirection, setInventoryDirection] = useState<SortDirection>("asc");
  const [inventorySearchInput, setInventorySearchInput] = useState("");
  const inventorySearch = useDebouncedValue(inventorySearchInput);
  const [inventoryStatus, setInventoryStatus] = useState("");

  const query = useMemo<DataQuery>(
    () => ({
      filters,
      orderPage,
      orderPageSize,
      orderSort,
      orderDirection,
      orderSearch,
      inventoryPage,
      inventoryPageSize,
      inventorySort,
      inventoryDirection,
      inventorySearch,
      inventoryStatus,
    }),
    [
      filters,
      orderPage,
      orderPageSize,
      orderSort,
      orderDirection,
      orderSearch,
      inventoryPage,
      inventoryPageSize,
      inventorySort,
      inventoryDirection,
      inventorySearch,
      inventoryStatus,
    ],
  );
  const controller = useDashboardData(query, Boolean(auth.user));

  function changeFilter(key: keyof DashboardFilters, value: string) {
    setDraftFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === "marketplace") next.store = "";
      return next;
    });
  }

  function applyFilters() {
    setFilters(draftFilters);
    setOrderPage(1);
    setInventoryPage(1);
  }

  function resetFilters() {
    const defaults = defaultFilters();
    setFilters(defaults);
    setDraftFilters(defaults);
    setOrderSearchInput("");
    setInventorySearchInput("");
    setInventoryStatus("");
    setOrderPage(1);
    setInventoryPage(1);
  }

  function toggleOrderSort(next: DataQuery["orderSort"]) {
    if (next === orderSort) setOrderDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    else {
      setOrderSort(next);
      setOrderDirection(next === "order_number" || next === "marketplace" || next === "status" ? "asc" : "desc");
    }
    setOrderPage(1);
  }

  function toggleInventorySort(next: DataQuery["inventorySort"]) {
    if (next === inventorySort) setInventoryDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    else {
      setInventorySort(next);
      setInventoryDirection(next === "available_quantity" || next === "allocated_quantity" ? "desc" : "asc");
    }
    setInventoryPage(1);
  }

  function openLocation(location: string) {
    setFilters((current) => ({ ...current, location }));
    setDraftFilters((current) => ({ ...current, location }));
    setActiveView("inventory");
  }

  function openOrders(selection: OrderSelection = {}) {
    const selected = {
      status: selection.statuses?.join(",") ?? "",
      marketplace: selection.marketplace ?? "",
      location: selection.location ?? "",
      settlementStatus: selection.settlementStatus ?? "",
    };
    setFilters((current) => ({ ...current, ...selected, store: selection.marketplace ? "" : current.store }));
    setDraftFilters((current) => ({ ...current, ...selected, store: selection.marketplace ? "" : current.store }));
    setOrderSearchInput(selection.search ?? "");
    setOrderPage(1);
    setActiveView("orders");
  }

  function openInventory(status = "") {
    setInventoryStatus(status);
    setInventoryPage(1);
    setActiveView("inventory");
  }

  const copy = VIEW_COPY[activeView];
  const syncTime = controller.data.kpis.inventory_synced_at || controller.data.kpis.order_synced_at;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small">BE</div>
          <div><strong>Command</strong><span>Center</span></div>
        </div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => setActiveView(item.id)}>
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-sync">
          <CheckCircle2 size={21} />
          <strong>Data tersinkron</strong>
          <span>Jubelio → Supabase</span>
          <small>{formatDateTime(syncTime)}</small>
        </div>
        <button className="logout-button" onClick={() => void auth.signOut()} disabled={auth.busy}>
          <LogOut size={19} /> Keluar
        </button>
      </aside>

      <main className="dashboard-main">
        {controller.loading && !controller.initialLoading && <div className="top-loading-bar" />}
        <header className="page-header">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p>{copy.description}</p>
          </div>
          <div className="header-actions">
            <div className="freshness">
              <span>Terakhir dimuat</span>
              <strong>{controller.lastUpdated ? formatDateTime(controller.lastUpdated.toISOString()) : "—"}</strong>
            </div>
            <button
              className="refresh-button"
              disabled={controller.refreshing}
              onClick={() => void controller.refreshFromJubelio()}
              title="Tarik data terbaru langsung dari Jubelio"
            >
              <RefreshCw className={controller.refreshing ? "spin" : ""} size={19} />
              {controller.refreshing ? "Menyinkronkan…" : "Refresh Jubelio"}
            </button>
          </div>
        </header>

        {activeView !== "forecast" && activeView !== "sync" && activeView !== "deadstock" && (
          <FilterBar filters={draftFilters} appliedFilters={filters} options={controller.data.filterOptions} onChange={changeFilter} onApply={applyFilters} onReset={resetFilters} />
        )}

        {(controller.error || controller.refreshError) && (
          <div className="error-banner">
            <AlertCircle size={19} />
            <span>{controller.refreshError || controller.error}</span>
            <button onClick={() => void controller.reload()}>Coba lagi</button>
          </div>
        )}

        {controller.initialLoading ? (
          <div className="dashboard-loading"><LoaderCircle className="spin" size={30} /><strong>Memuat data nyata…</strong><p>KPI dan tabel sedang dihitung di Supabase.</p></div>
        ) : (
          <div className="view-content">
            {activeView === "summary" && <SummaryView controller={controller} modern onOrders={openOrders} onInventory={openInventory} />}
            {activeView === "orders" && (
              <OrdersView
                controller={controller}
                search={orderSearchInput}
                onSearch={(value) => {
                  setOrderSearchInput(value);
                  setOrderPage(1);
                }}
                page={orderPage}
                pageSize={orderPageSize}
                sort={orderSort}
                direction={orderDirection}
                onPage={setOrderPage}
                onPageSize={(size) => { setOrderPageSize(size); setOrderPage(1); }}
                onSort={toggleOrderSort}
              />
            )}
            {activeView === "inventory" && (
              <InventoryView
                controller={controller}
                search={inventorySearchInput}
                status={inventoryStatus}
                onSearch={(value) => {
                  setInventorySearchInput(value);
                  setInventoryPage(1);
                }}
                onStatus={(value) => { setInventoryStatus(value); setInventoryPage(1); }}
                page={inventoryPage}
                pageSize={inventoryPageSize}
                sort={inventorySort}
                direction={inventoryDirection}
                onPage={setInventoryPage}
                onPageSize={(size) => { setInventoryPageSize(size); setInventoryPage(1); }}
                onSort={toggleInventorySort}
                onForecast={() => setActiveView("forecast")}
              />
            )}
            {activeView === "forecast" && (
              <ForecastView
                enabled={Boolean(auth.user)}
                locations={controller.data.filterOptions.locations}
              />
            )}
            {activeView === "locations" && <LocationsView controller={controller} onOpen={openLocation} />}
            {activeView === "sync" && (
              <SyncHealthView
                enabled={Boolean(auth.user)}
                onRefreshFromJubelio={controller.refreshFromJubelio}
                refreshing={controller.refreshing}
              />
            )}
            {activeView === "deadstock" && (
              <DeadStockView
                enabled={Boolean(auth.user)}
                locations={controller.data.filterOptions.locations}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  if (auth.loading) return <FullPageLoader />;
  if (!auth.user || auth.mode === "recovery") return <AuthScreen auth={auth} />;
  return <Dashboard auth={auth} />;
}
