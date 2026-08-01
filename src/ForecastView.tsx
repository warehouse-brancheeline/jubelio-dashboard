import { FormEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Download,
  LoaderCircle,
  Search,
  Settings2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useForecastData } from "./hooks/useForecastData";
import {
  defaultForecastParameters,
  forecastDateRange,
  formatDecimal,
  sortForecastRows,
} from "./lib/forecast";
import type {
  ForecastSortDirection,
  ForecastSortKey,
} from "./lib/forecast";
import {
  buildCsv,
  businessDate,
  downloadCsv,
  formatBusinessDate,
  formatNumber,
} from "./lib/dashboard";
import type {
  ForecastParameters,
  ForecastPeriod,
  ForecastProductSettings,
  ForecastRow,
} from "./types";

type Props = {
  enabled: boolean;
  locations: string[];
};

function numberOr(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function priorityClass(priority: string) {
  if (priority === "Kritis") return "critical";
  if (priority === "Tinggi") return "high";
  if (priority === "Sedang") return "medium";
  if (priority === "Rendah") return "low";
  return "none";
}

function confidenceClass(confidence: string) {
  if (confidence === "Tinggi") return "high";
  if (confidence === "Sedang") return "medium";
  return "low";
}

function ForecastSortHeader({
  label,
  column,
  active,
  direction,
  number,
  onSort,
}: {
  label: string;
  column: ForecastSortKey;
  active: ForecastSortKey;
  direction: ForecastSortDirection;
  number?: boolean;
  onSort: (column: ForecastSortKey) => void;
}) {
  const isActive = active === column;
  return (
    <th
      className={number ? "number-cell" : undefined}
      aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className={isActive ? "sort-button active" : "sort-button"}
        onClick={() => onSort(column)}
        title={`Urutkan berdasarkan ${label}`}
      >
        {label}
        {isActive
          ? direction === "asc"
            ? <ArrowUp size={14} />
            : <ArrowDown size={14} />
          : <ArrowUpDown size={14} />}
      </button>
    </th>
  );
}

function ProductSettingsModal({
  row,
  saving,
  onClose,
  onSave,
}: {
  row: ForecastRow;
  saving: boolean;
  onClose: () => void;
  onSave: (settings: ForecastProductSettings) => Promise<unknown>;
}) {
  const [leadTime, setLeadTime] = useState(String(row.lead_time_days));
  const [moq, setMoq] = useState(String(row.moq));
  const [safetyStock, setSafetyStock] = useState(
    row.has_product_settings ? String(Math.ceil(row.safety_stock)) : "",
  );
  const [incoming, setIncoming] = useState(String(row.incoming_quantity));
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await onSave({
        item_id: row.item_id,
        lead_time_days: Math.max(1, Math.round(numberOr(leadTime, row.lead_time_days))),
        moq: Math.max(1, numberOr(moq, row.moq)),
        safety_stock: safetyStock.trim() ? Math.max(0, numberOr(safetyStock, 0)) : null,
        incoming_quantity: Math.max(0, numberOr(incoming, 0)),
      });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="modal-card forecast-settings-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Tutup">
          <X size={20} />
        </button>
        <p className="eyebrow">PENGATURAN PRODUK</p>
        <h2>{row.product_name}</h2>
        <p className="muted">{row.sku}</p>
        <div className="forecast-settings-grid">
          <label>
            Lead time supplier (hari)
            <input type="number" min="1" max="365" value={leadTime} onChange={(event) => setLeadTime(event.target.value)} />
          </label>
          <label>
            MOQ
            <input type="number" min="1" step="1" value={moq} onChange={(event) => setMoq(event.target.value)} />
          </label>
          <label>
            Safety stock tersimpan
            <input type="number" min="0" step="1" value={safetyStock} onChange={(event) => setSafetyStock(event.target.value)} placeholder="Kosongkan untuk hitung otomatis" />
          </label>
          <label>
            Stok dalam perjalanan
            <input type="number" min="0" step="1" value={incoming} onChange={(event) => setIncoming(event.target.value)} />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" disabled={saving}>
          {saving ? <LoaderCircle className="spin" size={18} /> : <Settings2 size={18} />}
          Simpan dan hitung ulang
        </button>
      </form>
    </div>
  );
}

export function ForecastView({ enabled, locations }: Props) {
  const initial = useMemo(() => defaultForecastParameters(), []);
  const [draft, setDraft] = useState<ForecastParameters>(initial);
  const [applied, setApplied] = useState<ForecastParameters>(initial);
  const [selected, setSelected] = useState<ForecastRow | null>(null);
  const [sortKey, setSortKey] = useState<ForecastSortKey>("priority");
  const [sortDirection, setSortDirection] = useState<ForecastSortDirection>("asc");
  const forecast = useForecastData(applied, enabled);
  const { data } = forecast;
  const sortedRows = useMemo(
    () => sortForecastRows(data.rows, sortKey, sortDirection),
    [data.rows, sortKey, sortDirection],
  );

  function setField<K extends keyof ForecastParameters>(
    key: K,
    value: ForecastParameters[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function changePeriod(period: ForecastPeriod) {
    if (period === "custom") {
      setDraft((current) => ({ ...current, period }));
      return;
    }
    const range = forecastDateRange(period);
    setDraft((current) => ({ ...current, period, ...range }));
  }

  function apply() {
    setApplied({ ...draft, page: 1 });
    setDraft((current) => ({ ...current, page: 1 }));
  }

  function changePage(page: number) {
    const next = { ...applied, page };
    setApplied(next);
    setDraft((current) => ({ ...current, page }));
  }

  function changeSort(column: ForecastSortKey) {
    if (sortKey === column) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(column);
    setSortDirection("asc");
  }

  function exportRows() {
    const csv = buildCsv(
      [
        "SKU", "Nama produk", "Stok tersedia", "Stok dalam perjalanan",
        "Stok dialokasikan", "Stok bersih", "Total unit terjual",
        "Rata-rata per hari", "Rata-rata per bulan", "Jumlah transaksi",
        "Customer unik", "Tren persen", "Status tren", "Lead time",
        "Safety stock", "Reorder point", "Kebutuhan 30 hari",
        "Estimasi stok habis", "Restock normal", "Restock aktual",
        "Prioritas", "Confidence", "Alasan",
      ],
      sortedRows.map((row) => [
        row.sku, row.product_name, row.stock_available, row.incoming_quantity,
        row.allocated_quantity, row.net_stock, row.total_units_sold,
        row.avg_daily_sales, row.avg_monthly_sales, row.transaction_count,
        row.unique_customers, row.trend_percentage ?? "Produk baru",
        row.trend_status, row.lead_time_days, row.safety_stock,
        row.reorder_point, row.demand_30_days,
        row.estimated_stockout_date ?? "Tidak dapat dihitung",
        row.recommended_restock, row.actual_restock, row.priority,
        row.confidence_level, row.recommendation_reason,
      ]),
    );
    downloadCsv(`forecast-restock-${businessDate()}.csv`, csv);
  }

  const totalPages = Math.max(
    1,
    Math.ceil(data.summary.product_count / Math.max(applied.pageSize, 1)),
  );
  const coverageLow = data.coverage.completed_orders > 0 && !data.coverage.usable;

  return (
    <>
      <section className="forecast-intro panel">
        <div>
          <p className="eyebrow">FORECAST RESTOCK</p>
          <h2>Rencana pembelian berdasarkan perilaku customer</h2>
          <p>Perhitungan memakai unit terjual dari order selesai, hari tanpa transaksi tetap dihitung, dan pembelian besar yang tidak normal dibatasi pada rekomendasi utama.</p>
        </div>
        <Calculator size={34} />
      </section>

      {coverageLow && (
        <div className="coverage-banner danger-banner" role="alert">
          <AlertTriangle size={21} />
          <div>
            <strong>Forecast belum layak dijadikan dasar pembelian</strong>
            <p>Detail item baru mencakup {formatDecimal(data.coverage.coverage_percentage, 1)}% order selesai. Rekomendasi di bawah masih bersifat sementara sampai cakupan minimal 90%.</p>
          </div>
        </div>
      )}

      <section className="forecast-controls panel">
        <div className="forecast-control-heading">
          <div><SlidersHorizontal size={20} /><strong>Periode dan parameter</strong></div>
          <button className="primary-button compact" onClick={apply}>Hitung forecast</button>
        </div>
        <div className="period-tabs" role="group" aria-label="Periode analisis">
          {([
            ["1_month", "1 bulan"],
            ["2_months", "2 bulan"],
            ["3_months", "3 bulan"],
            ["custom", "Tanggal khusus"],
          ] as const).map(([value, label]) => (
            <button key={value} className={draft.period === value ? "active" : ""} onClick={() => changePeriod(value)}>
              {label}
            </button>
          ))}
        </div>
        <div className="forecast-filter-grid">
          <label>Tanggal mulai<input type="date" value={draft.dateFrom} max={draft.dateTo} onChange={(event) => setField("dateFrom", event.target.value)} disabled={draft.period !== "custom"} /></label>
          <label>Tanggal akhir<input type="date" value={draft.dateTo} min={draft.dateFrom} onChange={(event) => setField("dateTo", event.target.value)} disabled={draft.period !== "custom"} /></label>
          <label>Gudang<select value={draft.location} onChange={(event) => setField("location", event.target.value)}><option value="">Semua gudang</option>{locations.map((location) => <option key={location}>{location}</option>)}</select></label>
          <label>Lead time default<input type="number" min="1" value={draft.defaultLeadTimeDays} onChange={(event) => setField("defaultLeadTimeDays", numberOr(event.target.value, 14))} /></label>
          <label>Safety stock (hari)<input type="number" min="0" value={draft.safetyStockDays} onChange={(event) => setField("safetyStockDays", numberOr(event.target.value, 7))} /></label>
          <label>Coverage setelah tiba<input type="number" min="1" value={draft.coverageDays} onChange={(event) => setField("coverageDays", numberOr(event.target.value, 30))} /></label>
          <label>Tingkat layanan<select value={draft.serviceLevel} onChange={(event) => setField("serviceLevel", event.target.value as ForecastParameters["serviceLevel"])}><option value="90">90% (z 1,28)</option><option value="95">95% (z 1,65)</option><option value="97.5">97,5% (z 1,96)</option><option value="99">99% (z 2,33)</option></select></label>
          <label>Batas tren turun<input type="number" max="0" value={draft.trendFloorPercent} onChange={(event) => setField("trendFloorPercent", numberOr(event.target.value, -30))} /></label>
          <label>Batas tren naik<input type="number" min="0" value={draft.trendCapPercent} onChange={(event) => setField("trendCapPercent", numberOr(event.target.value, 50))} /></label>
          <label>MOQ default<input type="number" min="1" value={draft.defaultMoq} onChange={(event) => setField("defaultMoq", numberOr(event.target.value, 1))} /></label>
        </div>
      </section>

      {forecast.error && <div className="error-banner"><AlertTriangle size={19} /><span>{forecast.error}</span><button onClick={() => void forecast.reload()}>Coba lagi</button></div>}

      <section className="forecast-stat-grid">
        <article><span>Produk dianalisis</span><strong>{formatNumber(data.summary.product_count)}</strong><small>{data.coverage.analysis_days || 0} hari kalender</small></article>
        <article className="critical"><span>Prioritas kritis</span><strong>{formatNumber(data.summary.critical_count)}</strong><small>Berisiko habis sebelum barang tiba</small></article>
        <article className="high"><span>Prioritas tinggi</span><strong>{formatNumber(data.summary.high_count)}</strong><small>Stok bersih di bawah reorder point</small></article>
        <article><span>Rekomendasi unit</span><strong>{formatNumber(data.summary.recommended_units)}</strong><small>Forecast normal setelah MOQ</small></article>
      </section>

      <article className="panel table-panel forecast-table-panel">
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={18} />
            <input value={draft.search} onChange={(event) => setField("search", event.target.value)} placeholder="Cari SKU atau nama produk" onKeyDown={(event) => { if (event.key === "Enter") apply(); }} />
          </label>
          <select className="toolbar-select" value={draft.priority} onChange={(event) => setField("priority", event.target.value)}>
            <option value="">Semua prioritas</option>
            <option>Kritis</option><option>Tinggi</option><option>Sedang</option><option>Rendah</option><option>Tidak perlu restock</option>
          </select>
          <button className="secondary-button" onClick={apply}>Terapkan</button>
          <button className="secondary-button" onClick={exportRows} disabled={!sortedRows.length || coverageLow} title={coverageLow ? "Ekspor rekomendasi dinonaktifkan sampai coverage mencapai 90%" : "Ekspor forecast"}><Download size={17} /> Ekspor CSV</button>
        </div>
        {forecast.loading ? (
          <div className="forecast-loading"><LoaderCircle className="spin" size={28} /><strong>Menghitung forecast...</strong></div>
        ) : sortedRows.length ? (
          <div className="table-scroll forecast-table-scroll">
            <table className="forecast-table">
              <thead><tr>
                <ForecastSortHeader label="SKU" column="sku" active={sortKey} direction={sortDirection} onSort={changeSort} />
                <ForecastSortHeader label="Nama produk" column="product_name" active={sortKey} direction={sortDirection} onSort={changeSort} />
                <ForecastSortHeader label="Stok tersedia" column="stock_available" active={sortKey} direction={sortDirection} number onSort={changeSort} />
                <ForecastSortHeader label="Dalam perjalanan" column="incoming_quantity" active={sortKey} direction={sortDirection} number onSort={changeSort} />
                <ForecastSortHeader label="Dialokasikan" column="allocated_quantity" active={sortKey} direction={sortDirection} number onSort={changeSort} />
                <ForecastSortHeader label="Stok bersih" column="net_stock" active={sortKey} direction={sortDirection} number onSort={changeSort} />
                <ForecastSortHeader label="Unit terjual" column="total_units_sold" active={sortKey} direction={sortDirection} number onSort={changeSort} />
                <ForecastSortHeader label="Rata-rata/hari" column="avg_daily_sales" active={sortKey} direction={sortDirection} number onSort={changeSort} />
                <ForecastSortHeader label="Rata-rata/bulan" column="avg_monthly_sales" active={sortKey} direction={sortDirection} number onSort={changeSort} />
                <ForecastSortHeader label="Transaksi" column="transaction_count" active={sortKey} direction={sortDirection} number onSort={changeSort} />
                <ForecastSortHeader label="Customer unik" column="unique_customers" active={sortKey} direction={sortDirection} number onSort={changeSort} />
                <ForecastSortHeader label="Tren" column="trend_percentage" active={sortKey} direction={sortDirection} number onSort={changeSort} />
                <ForecastSortHeader label="Status tren" column="trend_status" active={sortKey} direction={sortDirection} onSort={changeSort} />
                <ForecastSortHeader label="Lead time" column="lead_time_days" active={sortKey} direction={sortDirection} number onSort={changeSort} />
                <ForecastSortHeader label="Safety stock" column="safety_stock" active={sortKey} direction={sortDirection} number onSort={changeSort} />
                <ForecastSortHeader label="Reorder point" column="reorder_point" active={sortKey} direction={sortDirection} number onSort={changeSort} />
                <ForecastSortHeader label="Kebutuhan 30 hari" column="demand_30_days" active={sortKey} direction={sortDirection} number onSort={changeSort} />
                <ForecastSortHeader label="Estimasi stok habis" column="estimated_stockout_date" active={sortKey} direction={sortDirection} onSort={changeSort} />
                <ForecastSortHeader label="Rekomendasi restock" column="recommended_restock" active={sortKey} direction={sortDirection} number onSort={changeSort} />
                <ForecastSortHeader label="Prioritas" column="priority" active={sortKey} direction={sortDirection} onSort={changeSort} />
                <ForecastSortHeader label="Confidence" column="confidence_level" active={sortKey} direction={sortDirection} onSort={changeSort} />
                <ForecastSortHeader label="Alasan rekomendasi" column="recommendation_reason" active={sortKey} direction={sortDirection} onSort={changeSort} />
              </tr></thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.item_id}>
                    <td><button className="sku-setting-button" onClick={() => setSelected(row)} title="Atur lead time, MOQ, safety stock, dan incoming"><strong>{row.sku}</strong><Settings2 size={14} /></button></td>
                    <td><strong>{row.product_name}</strong>{row.largest_customer_percentage > 50 && <small className="table-warning">Satu customer menyumbang {formatDecimal(row.largest_customer_percentage, 1)}%</small>}</td>
                    <td className="number-cell">{formatDecimal(row.stock_available)}</td>
                    <td className="number-cell">{formatDecimal(row.incoming_quantity)}</td>
                    <td className="number-cell">{formatDecimal(row.allocated_quantity)}</td>
                    <td className="number-cell"><strong>{formatDecimal(row.net_stock)}</strong></td>
                    <td className="number-cell">{formatDecimal(row.total_units_sold)}{row.outlier_transactions > 0 && <small className="table-warning">{row.outlier_transactions} outlier</small>}</td>
                    <td className="number-cell">{formatDecimal(row.avg_daily_sales)}</td>
                    <td className="number-cell">{formatDecimal(row.avg_monthly_sales)}</td>
                    <td className="number-cell">{formatNumber(row.transaction_count)}</td>
                    <td className="number-cell">{formatNumber(row.unique_customers)}</td>
                    <td className="number-cell">{row.trend_percentage == null ? "Baru" : `${formatDecimal(row.trend_percentage, 1)}%`}</td>
                    <td><span className={`trend-pill ${row.trend_status === "Naik" ? "up" : row.trend_status === "Turun" ? "down" : "stable"}`}>{row.trend_status}</span></td>
                    <td className="number-cell">{row.lead_time_days} hari</td>
                    <td className="number-cell">{formatDecimal(row.safety_stock)}</td>
                    <td className="number-cell">{formatDecimal(row.reorder_point)}</td>
                    <td className="number-cell">{formatDecimal(row.demand_30_days)}</td>
                    <td>{row.estimated_stockout_date ? formatBusinessDate(row.estimated_stockout_date) : <span className="muted">Tidak dapat dihitung</span>}</td>
                    <td className="number-cell"><strong>{formatDecimal(row.recommended_restock)}</strong><small className="table-subline">{coverageLow ? "Sementara" : `Aktual ${formatDecimal(row.actual_restock)}`}</small></td>
                    <td><span className={`forecast-pill ${priorityClass(row.priority)}`}>{row.priority}</span></td>
                    <td><span className={`confidence-pill ${confidenceClass(row.confidence_level)}`}>{row.confidence_level}</span></td>
                    <td className="reason-cell">{row.recommendation_reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state"><strong>Tidak ada produk sesuai filter</strong><p>Ubah periode, gudang, pencarian, atau prioritas.</p></div>
        )}
        <div className="pagination">
          <span>Halaman {applied.page} dari {totalPages}</span>
          <select value={applied.pageSize} onChange={(event) => {
            const pageSize = Number(event.target.value);
            setApplied((current) => ({ ...current, pageSize, page: 1 }));
            setDraft((current) => ({ ...current, pageSize, page: 1 }));
          }}><option value="25">25 baris</option><option value="50">50 baris</option><option value="100">100 baris</option></select>
          <button disabled={applied.page <= 1} onClick={() => changePage(applied.page - 1)}><ChevronLeft size={18} /></button>
          <button disabled={applied.page >= totalPages} onClick={() => changePage(applied.page + 1)}><ChevronRight size={18} /></button>
        </div>
      </article>

      <details className="forecast-audit panel">
        <summary>Rumus, asumsi, dan cara membaca hasil</summary>
        <div className="audit-grid">
          <div><strong>Rata-rata harian</strong><code>unit normal / {data.coverage.analysis_days || "jumlah"} hari kalender</code></div>
          <div><strong>Faktor tren</strong><code>1 + batas(tren, {draft.trendFloorPercent}%, +{draft.trendCapPercent}%)</code></div>
          <div><strong>Stok bersih</strong><code>stok tersedia + incoming - teralokasi</code></div>
          <div><strong>Reorder point</strong><code>kebutuhan lead time + safety stock</code></div>
          <div><strong>Target stok</strong><code>avg harian x (lead time + {draft.coverageDays} hari) x faktor tren + safety stock</code></div>
          <div><strong>Restock</strong><code>maks(0, target stok - stok bersih), dibulatkan ke MOQ</code></div>
        </div>
        <p>Forecast normal membatasi jumlah transaksi di atas Q3 + 1,5 x IQR. Forecast aktual tetap ditampilkan di sel rekomendasi agar pembelian besar tidak hilang dari audit. Transaksi internal, batal, retur, dan item batal tidak dipakai.</p>
      </details>

      {selected && (
        <ProductSettingsModal
          row={selected}
          saving={forecast.saving}
          onClose={() => setSelected(null)}
          onSave={forecast.saveProductSettings}
        />
      )}
    </>
  );
}
