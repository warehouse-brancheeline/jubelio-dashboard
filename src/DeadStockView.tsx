import { AlertTriangle, Archive, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { useDeadStockData } from "./hooks/useDeadStockData";
import { formatBusinessDate, formatNumber } from "./lib/dashboard";
import type { DeadStockParameters } from "./types";

type Props = {
  enabled: boolean;
  locations: string[];
};

function defaultParameters(): DeadStockParameters {
  return { thresholdDays: 60, location: "", page: 1, pageSize: 25, search: "" };
}

export function DeadStockView({ enabled, locations }: Props) {
  const initial = useMemo(() => defaultParameters(), []);
  const [draft, setDraft] = useState<DeadStockParameters>(initial);
  const [applied, setApplied] = useState<DeadStockParameters>(initial);
  const deadStock = useDeadStockData(applied, enabled);
  const { data } = deadStock;

  function setField<K extends keyof DeadStockParameters>(key: K, value: DeadStockParameters[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
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

  const totalPages = Math.max(1, Math.ceil(data.summary.product_count / Math.max(applied.pageSize, 1)));

  return (
    <>
      <section className="forecast-intro panel">
        <div>
          <p className="eyebrow">PRODUK TIDAK BERGERAK</p>
          <h2>Stok yang menumpuk tanpa penjualan</h2>
          <p>
            Produk dengan stok tersedia yang tidak terjual (transaksi selesai) selama ambang batas
            hari yang Anda tentukan. Dihitung dari seluruh histori order, bukan cuma periode
            forecast.
          </p>
        </div>
        <Archive size={34} />
      </section>

      {deadStock.error && (
        <div className="error-banner">
          <AlertTriangle size={19} />
          <span>{deadStock.error}</span>
          <button onClick={() => void deadStock.reload()}>Coba lagi</button>
        </div>
      )}

      <section className="forecast-controls panel">
        <div className="forecast-control-heading">
          <strong>Ambang batas dan filter</strong>
          <button className="primary-button compact" onClick={apply}>Terapkan</button>
        </div>
        <div className="forecast-filter-grid">
          <label>
            Dianggap tidak bergerak setelah (hari)
            <input
              type="number"
              min="1"
              value={draft.thresholdDays}
              onChange={(event) => setField("thresholdDays", Math.max(1, Number(event.target.value) || 60))}
            />
          </label>
          <label>
            Gudang
            <select value={draft.location} onChange={(event) => setField("location", event.target.value)}>
              <option value="">Semua gudang</option>
              {locations.map((location) => <option key={location}>{location}</option>)}
            </select>
          </label>
          <label>
            Cari SKU atau nama produk
            <input
              value={draft.search}
              onChange={(event) => setField("search", event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") apply(); }}
              placeholder="SKU atau nama produk"
            />
          </label>
        </div>
      </section>

      <section className="forecast-stat-grid">
        <article className="critical">
          <span>Produk tidak bergerak</span>
          <strong>{formatNumber(data.summary.product_count)}</strong>
          <small>Ambang batas {data.summary.threshold_days} hari tanpa penjualan</small>
        </article>
        <article>
          <span>Total unit menumpuk</span>
          <strong>{formatNumber(data.summary.stock_units)}</strong>
          <small>Stok tersedia dari produk yang tidak bergerak</small>
        </article>
        <article className="high">
          <span>Belum pernah terjual</span>
          <strong>{formatNumber(data.summary.never_sold_count)}</strong>
          <small>Tidak ada histori transaksi selesai sama sekali</small>
        </article>
      </section>

      <article className="panel table-panel">
        <div className="table-toolbar">
          <strong>Daftar produk tidak bergerak</strong>
          <span className="panel-meta">{formatNumber(data.summary.product_count)} produk sesuai filter</span>
        </div>
        {deadStock.loading ? (
          <div className="forecast-loading"><LoaderCircle className="spin" size={28} /><strong>Menghitung produk tidak bergerak...</strong></div>
        ) : data.rows.length ? (
          <div className="table-scroll">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Nama produk</th>
                  <th>Stok tersedia</th>
                  <th>Terakhir terjual</th>
                  <th>Hari sejak terjual</th>
                  <th>Unit 90 hari terakhir</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.item_id}>
                    <td><strong>{row.sku}</strong></td>
                    <td>{row.product_name}</td>
                    <td>{formatNumber(row.stock_available)}</td>
                    <td>{row.last_sale_date ? formatBusinessDate(row.last_sale_date) : <span className="muted">Belum pernah terjual</span>}</td>
                    <td>{row.days_since_last_sale == null ? "—" : `${formatNumber(row.days_since_last_sale)} hari`}</td>
                    <td>{formatNumber(row.units_last_90_days)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state"><Archive size={28} /><strong>Tidak ada produk tidak bergerak</strong><p>Semua produk dengan stok tersedia sudah terjual dalam {data.summary.threshold_days} hari terakhir, atau ubah filter gudang/pencarian.</p></div>
        )}
        <div className="pagination">
          <span>Halaman {applied.page} dari {totalPages}</span>
          <button disabled={applied.page <= 1} onClick={() => changePage(applied.page - 1)}><ChevronLeft size={18} /></button>
          <button disabled={applied.page >= totalPages} onClick={() => changePage(applied.page + 1)}><ChevronRight size={18} /></button>
        </div>
      </article>
    </>
  );
}
