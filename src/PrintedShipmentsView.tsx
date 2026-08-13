import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Clock3, PackageCheck, Printer, RefreshCw, Truck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { businessDate, formatBusinessDate, formatDateTime, formatNumber } from "./lib/dashboard";
import { supabase } from "./supabase";
import type { PrintedShipmentsData } from "./types";

const EMPTY: PrintedShipmentsData = {
  business_date: businessDate(new Date()), timezone: "Asia/Makassar", source_basis: "",
  summary: { resi_count: 0, order_count: 0, courier_count: 0, print_attempts: 0, reprint_count: 0, latest_sync: null },
  couriers: [], details: [],
};

function normalize(input: unknown): PrintedShipmentsData {
  if (!input || typeof input !== "object") return EMPTY;
  const value = input as Partial<PrintedShipmentsData>;
  const number = (item: unknown) => Number(item ?? 0);
  return {
    ...EMPTY, ...value,
    summary: {
      ...EMPTY.summary, ...value.summary,
      resi_count: number(value.summary?.resi_count), order_count: number(value.summary?.order_count),
      courier_count: number(value.summary?.courier_count), print_attempts: number(value.summary?.print_attempts),
      reprint_count: number(value.summary?.reprint_count),
    },
    couriers: (value.couriers ?? []).map((row) => ({ ...row, resi_count: number(row.resi_count), order_count: number(row.order_count), print_attempts: number(row.print_attempts), reprint_count: number(row.reprint_count) })),
    details: (value.details ?? []).map((row) => ({ ...row, order_id: number(row.order_id), print_count: number(row.print_count) })),
  };
}

export function PrintedShipmentsView() {
  const [date, setDate] = useState(() => businessDate(new Date()));
  const [data, setData] = useState<PrintedShipmentsData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<"resi" | "shipper" | "time">("resi");

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true); setError(null);
    const result = await supabase.rpc("dashboard_printed_shipments", { p_business_date: date, p_location: null, p_marketplace: null, p_store: null });
    if (result.error) setError(result.error.message);
    else setData(normalize(result.data));
    setLoading(false);
  }, [date]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.rpc("dashboard_printed_shipments", { p_business_date: date, p_location: null, p_marketplace: null, p_store: null }).then((result) => {
      if (!active) return;
      if (result.error) setError(result.error.message);
      else setData(normalize(result.data));
      setLoading(false);
    });
    return () => { active = false; };
  }, [date]);

  const couriers = useMemo(() => [...data.couriers].sort((a, b) => {
    if (sort === "shipper") return a.shipper.localeCompare(b.shipper);
    if (sort === "time") return String(b.last_print_at).localeCompare(String(a.last_print_at));
    return b.resi_count - a.resi_count;
  }), [data.couriers, sort]);

  return (
    <div className="printed-shipments-view">
      <section className="print-toolbar panel">
        <div><Printer size={22}/><div><strong>Monitoring print resi</strong><span>Hari operasional mengikuti WITA</span></div></div>
        <label>Tanggal<input type="date" value={date} max={businessDate(new Date())} onChange={(event) => setDate(event.target.value)} /></label>
        <button className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={17}/>Muat ulang</button>
      </section>

      {error && <div className="error-banner"><AlertCircle size={18}/><span>Data print resi belum dapat dimuat: {error}</span><button onClick={() => void load()}>Coba lagi</button></div>}

      <section className="print-kpi-grid">
        <article><span className="print-kpi-icon green"><Printer size={20}/></span><small>Total resi tercetak</small><strong>{formatNumber(data.summary.resi_count)}</strong><p>{formatBusinessDate(date)}</p></article>
        <article><span className="print-kpi-icon blue"><Truck size={20}/></span><small>Ekspedisi aktif</small><strong>{formatNumber(data.summary.courier_count)}</strong><p>Layanan ekspedisi terdeteksi</p></article>
        <article><span className="print-kpi-icon amber"><PackageCheck size={20}/></span><small>Order diproses</small><strong>{formatNumber(data.summary.order_count)}</strong><p>Memiliki nomor resi unik</p></article>
        <article><span className="print-kpi-icon red"><RefreshCw size={20}/></span><small>Counter print &gt; 1</small><strong>{formatNumber(data.summary.reprint_count)}</strong><p>{formatNumber(data.summary.print_attempts)} total counter dari Jubelio</p></article>
      </section>

      <div className="print-source-note"><AlertCircle size={17}/><span><strong>Dasar hitung:</strong> {data.source_basis}. Jubelio belum menyediakan timestamp klik printer, sehingga waktu yang ditampilkan adalah waktu AWB dibuat.</span></div>

      <section className="print-layout">
        <article className="panel print-chart-panel"><div className="panel-heading"><div><p className="eyebrow">DISTRIBUSI EKSPEDISI</p><h2>Jumlah resi tercetak</h2></div><span className="panel-meta">{formatNumber(data.summary.resi_count)} resi</span></div>
          {couriers.length ? <div className="print-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={couriers.slice(0,12)} layout="vertical" margin={{left: 15,right: 25}}><CartesianGrid stroke="#dce7e1" strokeDasharray="4 5" horizontal={false}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="shipper" width={145}/><Tooltip formatter={(value) => [formatNumber(Number(value)), "Resi"]}/><Bar dataKey="resi_count" fill="#16855f" radius={[0,7,7,0]}/></BarChart></ResponsiveContainer></div> : <div className="print-empty"><Printer size={30}/><strong>Belum ada resi tercetak</strong><span>Tidak ada AWB tercetak pada tanggal ini.</span></div>}
        </article>

        <article className="panel print-courier-panel"><div className="panel-heading"><div><p className="eyebrow">RINGKASAN</p><h2>Per ekspedisi</h2></div><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="resi">Resi terbanyak</option><option value="shipper">Nama ekspedisi</option><option value="time">Print terakhir</option></select></div>
          <div className="table-scroll"><table className="summary-table"><thead><tr><th>Ekspedisi</th><th>Resi</th><th>Order</th><th>Counter &gt; 1</th><th>AWB terakhir</th></tr></thead><tbody>{couriers.map((row) => <tr key={row.shipper}><td><strong>{row.shipper}</strong></td><td><strong>{formatNumber(row.resi_count)}</strong></td><td>{formatNumber(row.order_count)}</td><td>{formatNumber(row.reprint_count)}</td><td>{formatDateTime(row.last_print_at)}</td></tr>)}</tbody></table></div>
        </article>
      </section>

      <article className="panel table-panel print-detail-panel"><div className="panel-heading"><div><p className="eyebrow">DETAIL PROSES</p><h2>Daftar resi tercetak</h2></div><span className="panel-meta"><Clock3 size={14}/> Sinkron {formatDateTime(data.summary.latest_sync)}</span></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Waktu AWB</th><th>Order</th><th>Nomor resi</th><th>Ekspedisi</th><th>Platform / toko</th><th>Gudang</th><th>Jumlah print</th></tr></thead><tbody>{data.details.map((row) => <tr key={`${row.order_id}-${row.tracking_number}`}><td>{formatDateTime(row.awb_created_at)}</td><td><strong>{row.order_number}</strong></td><td className="mono-cell">{row.tracking_number}</td><td>{row.shipper}</td><td>{row.marketplace}<small className="table-subline">{row.store_name}</small></td><td>{row.location_name}</td><td><span className={row.print_count > 1 ? "print-count reprint" : "print-count"}>{row.print_count}×</span></td></tr>)}</tbody></table>{!data.details.length && !loading && <div className="print-empty"><Printer size={30}/><strong>Belum ada detail resi</strong><span>Pilih tanggal lain atau tunggu sinkronisasi Jubelio berikutnya.</span></div>}</div>
      </article>
    </div>
  );
}
