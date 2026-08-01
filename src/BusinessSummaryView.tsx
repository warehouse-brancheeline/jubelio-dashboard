import {
  AlertCircle, Banknote, Boxes, CheckCircle2, CircleDollarSign, Clock3,
  Info, PackageCheck, ShoppingBag, TrendingDown, TrendingUp, Truck,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import type { DashboardController } from "./hooks/useDashboardData";
import {
  formatBusinessDate, formatCompactCurrency, formatCompactNumber, formatCurrency,
  formatDateTime, formatNumber, percentChange,
} from "./lib/dashboard";

type Props = {
  controller: DashboardController;
  onOrders: (status?: string, search?: string) => void;
  onInventory: (status?: string) => void;
  onLocation: (location: string) => void;
};

function Empty({ text }: { text: string }) {
  return <div className="summary-empty"><Boxes size={28} /><span>{text}</span></div>;
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="kpi-delta neutral">Data pembanding tidak tersedia</span>;
  const positive = value >= 0;
  return (
    <span className={`kpi-delta ${positive ? "up" : "down"}`}>
      {positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {Math.abs(value).toFixed(1)}% dari periode sebelumnya
    </span>
  );
}

function MetricCard({ label, value, fullValue, definition, hint, delta, icon, tone = "green", onClick }: {
  label: string; value: string; fullValue?: string; definition: string; hint: string;
  delta: number | null; icon: React.ReactNode; tone?: "green" | "blue" | "amber" | "red";
  onClick: () => void;
}) {
  return (
    <article className="metric-card">
      <button className="metric-main" type="button" onClick={onClick} title={fullValue ?? value}>
        <span className={`kpi-icon ${tone}`}>{icon}</span>
        <span className="metric-label">{label}<Info size={14} aria-label={definition} /></span>
        <strong>{value}</strong>
        <Delta value={delta} />
      </button>
      <button className="metric-detail" type="button" onClick={onClick}>{hint}</button>
    </article>
  );
}

function SectionTitle({ eyebrow, title, note }: { eyebrow: string; title: string; note?: string }) {
  return <div className="panel-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{note && <span className="panel-meta">{note}</span>}</div>;
}

export function BusinessSummaryView({ controller, onOrders, onInventory, onLocation }: Props) {
  const { operational: summary } = controller.data;
  const k = summary.kpis;
  const c = summary.comparison;
  const comparisonReady = c.available;
  const coverage = k.backfill_total > 0 ? Math.min(100, k.backfill_loaded / k.backfill_total * 100) : 0;
  const statusTotal = summary.status_distribution.reduce((sum, row) => sum + row.order_count, 0);
  const orderDelta = percentChange(k.order_count, c.order_count, comparisonReady);
  const valueDelta = percentChange(k.order_value, c.order_value, comparisonReady);
  const completedDelta = percentChange(k.completed_order_count, c.completed_order_count, comparisonReady);
  const cancelDelta = percentChange(k.cancelled_order_count, c.cancelled_order_count, comparisonReady);

  return (
    <div className="business-summary">
      {!k.backfill_completed && (
        <div className="coverage-banner"><AlertCircle size={20} /><div><strong>Histori order masih dilengkapi</strong><p>{formatNumber(k.backfill_loaded)} dari sekitar {formatNumber(k.backfill_total)} order tersedia ({coverage.toFixed(1)}%).</p></div><div className="coverage-progress"><span style={{ width: `${coverage}%` }} /></div></div>
      )}

      {(!summary.quality.status_reconciled || summary.quality.unknown_status_count > 0) && (
        <div className="quality-alert"><AlertCircle size={18} /><span>Ada {formatNumber(summary.quality.unknown_status_count)} status yang belum dikenali. Angka perlu ditinjau.</span></div>
      )}

      <div className="metric-group-heading"><span>Order dan fulfillment</span><small>{formatBusinessDate(summary.range.date_from)} sampai {formatBusinessDate(summary.range.date_to)}</small></div>
      <section className="metric-grid">
        <MetricCard label="Order masuk" value={formatCompactNumber(k.order_count)} fullValue={formatNumber(k.order_count)} definition="Semua order berdasarkan tanggal order dibuat, termasuk pembatalan." hint={`${formatNumber(k.cancelled_order_count)} dibatalkan, lihat detail`} delta={orderDelta} icon={<ShoppingBag size={20} />} tone="amber" onClick={() => onOrders()} />
        <MetricCard label="Belum diproses" value={formatCompactNumber(k.new_order_count)} fullValue={formatNumber(k.new_order_count)} definition="Order aktif yang masih berada pada tahap baru atau siap diproses." hint={`${k.pending_rate.toFixed(1)}% dari order aktif, lihat detail`} delta={percentChange(k.new_order_count, c.new_order_count, comparisonReady)} icon={<Clock3 size={20} />} tone="red" onClick={() => onOrders("NEW")} />
        <MetricCard label="Sedang diproses" value={formatCompactNumber(k.processing_order_count + k.ready_to_ship_count)} definition="Order pada tahap processing dan siap dikirim." hint={`${formatNumber(k.ready_to_ship_count)} siap dikirim, lihat detail`} delta={null} icon={<PackageCheck size={20} />} tone="blue" onClick={() => onOrders("PROCESSING")} />
        <MetricCard label="Sudah dikirim" value={formatCompactNumber(k.shipped_order_count)} definition="Order sudah diserahkan ke pengiriman tetapi belum completed." hint="Buka order dalam perjalanan" delta={null} icon={<Truck size={20} />} tone="blue" onClick={() => onOrders("SHIPPED")} />
        <MetricCard label="Order selesai" value={formatCompactNumber(k.completed_order_count)} definition="Order dengan kelompok status completed." hint={`${k.completion_rate.toFixed(1)}% completion rate, lihat detail`} delta={completedDelta} icon={<CheckCircle2 size={20} />} onClick={() => onOrders("COMPLETED")} />
        <MetricCard label="Dibatalkan/retur" value={formatCompactNumber(k.cancelled_order_count + k.returned_order_count)} definition="Order cancelled dan returned, tidak dihitung sebagai nilai order valid." hint={`${k.cancellation_rate.toFixed(1)}% cancellation rate, lihat detail`} delta={cancelDelta} icon={<AlertCircle size={20} />} tone="red" onClick={() => onOrders("CANCELLED")} />
      </section>

      <div className="metric-group-heading"><span>Revenue, pencairan, dan stok</span></div>
      <section className="metric-grid compact">
        <MetricCard label="Nilai order valid" value={formatCompactCurrency(k.order_value)} fullValue={formatCurrency(k.order_value)} definition="Total grand total order selain cancelled dan returned." hint={`${formatCompactCurrency(k.average_order_value)} rata-rata per order`} delta={valueDelta} icon={<CircleDollarSign size={20} />} onClick={() => onOrders()} />
        <MetricCard label="Revenue completed" value={formatCompactCurrency(k.completed_revenue)} fullValue={formatCurrency(k.completed_revenue)} definition="Total nilai order completed. Ini bukan nilai pencairan." hint={`${formatCompactCurrency(k.unfinished_value)} belum selesai, lihat detail`} delta={null} icon={<Banknote size={20} />} onClick={() => onOrders("COMPLETED")} />
        <MetricCard label="Nilai sudah cair" value={k.settlement_data_count ? formatCompactCurrency(k.settled_value) : "N/A"} fullValue={k.settlement_data_count ? formatCurrency(k.settled_value) : "Data pencairan belum tersedia"} definition="Nilai settlement/payout yang secara eksplisit ditandai cair oleh sumber." hint={k.settlement_data_count ? `${formatNumber(k.settled_order_count)} order cair, lihat detail` : "Sumber pencairan belum lengkap"} delta={k.settlement_data_count ? percentChange(k.settled_value, c.settled_value, c.settlement_available) : null} icon={<Banknote size={20} />} tone="amber" onClick={() => onOrders(undefined)} />
        <MetricCard label="Stok tersedia" value={formatCompactNumber(k.total_available)} fullValue={formatNumber(k.total_available)} definition="Total stok bebas yang tersedia pada gudang terpilih." hint={`${formatNumber(k.total_allocated)} unit teralokasi, lihat detail`} delta={null} icon={<Boxes size={20} />} tone="blue" onClick={() => onInventory()} />
        <MetricCard label="Stok menipis" value={formatCompactNumber(k.low_stock_rows)} definition="Baris SKU-lokasi dengan stok tersedia 1 sampai 5 unit." hint="Buka produk stok menipis" delta={null} icon={<AlertCircle size={20} />} tone="amber" onClick={() => onInventory("LOW_STOCK")} />
        <MetricCard label="Stok habis" value={formatCompactNumber(k.out_of_stock_rows)} definition="Baris SKU-lokasi dengan stok tersedia nol." hint="Buka produk stok habis" delta={null} icon={<AlertCircle size={20} />} tone="red" onClick={() => onInventory("OUT_OF_STOCK")} />
      </section>

      <section className="summary-chart-grid">
        <article className="panel summary-panel wide"><SectionTitle eyebrow="TREN HARIAN" title="Order dan nilai order" note="WITA" />
          {summary.trend.length ? <div className="summary-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={summary.trend}><CartesianGrid stroke="#dce7e1" strokeDasharray="4 5" vertical={false}/><XAxis dataKey="business_date" tickFormatter={(v) => formatBusinessDate(String(v)).replace(/ \d{4}$/, "")} minTickGap={24}/><YAxis yAxisId="orders" tickFormatter={(v) => formatCompactNumber(Number(v))}/><YAxis yAxisId="value" orientation="right" tickFormatter={(v) => formatCompactCurrency(Number(v))}/><Tooltip labelFormatter={(v) => formatBusinessDate(String(v))} formatter={(v, name) => name === "Jumlah order" ? [formatNumber(Number(v)), name] : [formatCurrency(Number(v)), name]}/><Legend/><Bar yAxisId="orders" dataKey="order_count" name="Jumlah order" fill="#a9dcc8" radius={[5,5,0,0]} onClick={() => onOrders()}/><Line yAxisId="value" dataKey="order_value" name="Nilai order" stroke="#0d7651" strokeWidth={3} dot={false}/></ComposedChart></ResponsiveContainer></div> : <Empty text="Tidak ada order pada periode ini." />}
        </article>
        <article className="panel summary-panel"><SectionTitle eyebrow="STATUS ORDER" title="Distribusi tahapan" />
          {summary.status_distribution.length ? <div className="summary-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={summary.status_distribution} layout="vertical" margin={{ left: 10 }}><CartesianGrid stroke="#e4ece8" strokeDasharray="4 5" horizontal={false}/><XAxis type="number" tickFormatter={(v) => formatCompactNumber(Number(v))}/><YAxis type="category" dataKey="status_label" width={105}/><Tooltip formatter={(v) => [`${formatNumber(Number(v))} (${statusTotal ? (Number(v)/statusTotal*100).toFixed(1) : 0}%)`, "Order"]}/><Bar dataKey="order_count" fill="#1f9467" radius={[0,7,7,0]} onClick={(row) => onOrders(row.status_group)}/></BarChart></ResponsiveContainer></div> : <Empty text="Distribusi status belum tersedia." />}
        </article>
      </section>

      <section className="summary-two-columns">
        <article className="panel summary-panel"><SectionTitle eyebrow="FUNNEL ORDER" title="Pergerakan proses" />
          <div className="funnel-list">{summary.funnel.map((row, index) => { const previous = summary.funnel[index-1]?.order_count; const conversion = previous ? row.order_count / previous * 100 : 100; return <button key={row.stage} type="button" onClick={() => onOrders()}><span>{row.stage}</span><strong>{formatNumber(row.order_count)}</strong><small>{index ? `${conversion.toFixed(1)}% dari tahap sebelumnya` : "Tahap awal"}</small><i style={{ width: `${Math.max(5, summary.funnel[0]?.order_count ? row.order_count/summary.funnel[0].order_count*100 : 0)}%` }}/></button>; })}</div>
        </article>
        <article className="panel summary-panel"><SectionTitle eyebrow="PENCAIRAN" title="Revenue dan settlement" />
          {k.settlement_data_count ? <div className="settlement-summary"><div><span>Revenue completed</span><strong>{formatCurrency(k.completed_revenue)}</strong></div><div><span>Sudah cair</span><strong>{formatCurrency(k.settled_value)}</strong></div><div><span>Outstanding teridentifikasi</span><strong>{formatCurrency(k.unsettled_value)}</strong></div></div> : <Empty text="Data pencairan belum tersedia secara konsisten. Revenue completed tetap ditampilkan terpisah." />}
        </article>
      </section>

      <section className="summary-two-columns tables">
        <article className="panel summary-panel"><SectionTitle eyebrow="PERFORMA CHANNEL" title="Platform penjualan" />
          {summary.channels.length ? <div className="table-scroll"><table className="summary-table"><thead><tr><th>Platform</th><th>Order</th><th>Nilai</th><th>Selesai</th><th>Batal</th><th>AOV</th></tr></thead><tbody>{summary.channels.map((row) => <tr key={row.marketplace} onClick={() => onOrders(undefined, row.marketplace)}><td>{row.marketplace}</td><td>{formatNumber(row.order_count)}</td><td>{formatCompactCurrency(row.order_value)}</td><td>{row.order_count ? (row.completed_count/row.order_count*100).toFixed(1) : 0}%</td><td>{row.order_count ? (row.cancelled_count/row.order_count*100).toFixed(1) : 0}%</td><td>{formatCompactCurrency(row.average_order_value)}</td></tr>)}</tbody></table></div> : <Empty text="Data platform belum tersedia." />}
        </article>
        <article className="panel summary-panel"><SectionTitle eyebrow="PERFORMA GUDANG" title="Operasional lokasi" />
          {summary.warehouses.length ? <div className="table-scroll"><table className="summary-table"><thead><tr><th>Gudang</th><th>Order</th><th>Baru</th><th>Dikirim</th><th>Selesai</th><th>Waktu proses</th></tr></thead><tbody>{summary.warehouses.map((row) => <tr key={row.location_name} onClick={() => onLocation(row.location_name)}><td>{row.location_name}</td><td>{formatNumber(row.order_count)}</td><td>{formatNumber(row.new_count)}</td><td>{formatNumber(row.shipped_count)}</td><td>{formatNumber(row.completed_count)}</td><td>{row.average_process_hours === null ? "Data belum cukup" : `${row.average_process_hours.toFixed(1)} jam`}</td></tr>)}</tbody></table></div> : <Empty text="Data gudang belum tersedia." />}
        </article>
      </section>

      <article className="panel summary-panel attention-panel"><SectionTitle eyebrow="MONITORING SLA" title="Order membutuhkan perhatian" note={`${summary.attention.length} prioritas`} />
        {summary.attention.length ? <div className="table-scroll"><table className="summary-table attention-table"><thead><tr><th>Pesanan</th><th>Masuk</th><th>Menunggu</th><th>Status</th><th>Gudang</th><th>Platform / toko</th><th>Resi</th><th>Nilai</th><th>Pencairan</th><th>Aksi</th></tr></thead><tbody>{summary.attention.slice(0,20).map((row) => <tr key={row.order_id}><td><strong>{row.order_number || row.order_id}</strong><small>{row.attention_reason}</small></td><td>{formatDateTime(row.created_at)}</td><td>{row.waiting_hours.toFixed(0)} jam</td><td><span className={`sla-pill ${row.sla_status.toLowerCase().replaceAll(" ", "-")}`}>{row.sla_status}</span><small>{row.status_label}</small></td><td>{row.location_name || "Tidak tersedia"}</td><td>{row.marketplace}<small>{row.store_name || "-"}</small></td><td>{row.tracking_number || "Belum ada"}</td><td>{formatCurrency(row.grand_total)}</td><td>{row.settlement_label}</td><td><button type="button" onClick={() => onOrders(row.status_group, row.order_number || String(row.order_id))}>Buka</button></td></tr>)}</tbody></table></div> : <Empty text="Tidak ada order yang membutuhkan perhatian pada filter ini." />}
      </article>

      <details className="panel metric-definitions"><summary>Definisi metrik dan kualitas data</summary><div><p><strong>Completion Rate</strong> = completed / order non-cancelled × 100%.</p><p><strong>Cancellation Rate</strong> = cancelled dan returned / seluruh order × 100%.</p><p><strong>Pending Rate</strong> = order baru / seluruh order aktif × 100%.</p><p><strong>Average Order Value</strong> = nilai order valid / jumlah order valid.</p><p>Rata-rata waktu proses memakai {formatNumber(k.process_time_sample)} sampel. Rata-rata waktu kirim memakai {formatNumber(k.ship_time_sample)} sampel. Jika sampel belum cukup, dashboard tidak menampilkan angka perkiraan.</p><p>Terakhir sinkron order: {formatDateTime(k.order_synced_at)}. Stok: {formatDateTime(k.inventory_synced_at)}.</p></div></details>
    </div>
  );
}
