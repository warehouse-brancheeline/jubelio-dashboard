import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  ChevronDown,
  CircleDollarSign,
  LayoutDashboard,
  LogOut,
  PackageCheck,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ShoppingBag,
  Sparkles,
  Warehouse,
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
import type { Session } from "@supabase/supabase-js";
import { isConfigured, supabase } from "./supabase";

type Order = {
  order_id: number;
  order_number: string | null;
  order_date: string | null;
  marketplace: string | null;
  store_name: string | null;
  customer_name: string | null;
  status: string | null;
  grand_total: number | null;
};

type Stock = {
  item_id: number;
  location_name: string | null;
  quantity: number | null;
  available_quantity: number | null;
  products: { sku: string | null; name: string } | null;
};

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

const demoOrders: Order[] = [
  { order_id: 1, order_number: "SO-206275", order_date: new Date().toISOString(), marketplace: "SHOPEE", store_name: "Branché Eline", customer_name: "Pelanggan", status: "COMPLETED", grand_total: 849000 },
  { order_id: 2, order_number: "SO-206274", order_date: new Date(Date.now() - 86400000).toISOString(), marketplace: "TOKOPEDIA", store_name: "Branché Eline", customer_name: "Pelanggan", status: "COMPLETED", grand_total: 1275000 },
  { order_id: 3, order_number: "SO-206273", order_date: new Date(Date.now() - 172800000).toISOString(), marketplace: "TIKTOK", store_name: "Branché Eline", customer_name: "Pelanggan", status: "COMPLETED", grand_total: 635000 },
];

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(
    () => window.location.hash.includes("type=recovery"),
  );
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    async function initializeAuth() {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (accessToken && refreshToken) {
        const { data, error } = await supabase!.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          setAuthError("Tautan pemulihan sudah kedaluwarsa. Kirim ulang email recovery.");
        } else {
          setSession(data.session);
          setIsPasswordRecovery(true);
        }
      } else {
        const { data } = await supabase!.auth.getSession();
        setSession(data.session);
      }
      setLoading(false);
    }

    initializeAuth();
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setIsPasswordRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function loadData() {
    if (!supabase || !session) return;
    setRefreshing(true);
    const [ordersResult, stockResult] = await Promise.all([
      supabase.from("orders").select("order_id,order_number,order_date,marketplace,store_name,customer_name,status,grand_total").order("order_date", { ascending: false }).limit(2500),
      supabase.from("inventory").select("item_id,location_name,quantity,available_quantity,products(sku,name)").order("available_quantity", { ascending: true }).limit(500),
    ]);
    if (ordersResult.data) setOrders(ordersResult.data as Order[]);
    if (stockResult.data) setStocks(stockResult.data as unknown as Stock[]);
    setRefreshing(false);
  }

  useEffect(() => {
    loadData();
  }, [session]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setAuthError("");
    setAuthMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError("Email atau password belum benar.");
  }

  async function sendMagicLink() {
    if (!supabase || !email.trim()) {
      setAuthError("Isi email terlebih dahulu.");
      return;
    }
    setAuthError("");
    setAuthMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: "https://warehouse-brancheeline.github.io/jubelio-dashboard/",
        shouldCreateUser: false,
      },
    });
    if (error) {
      setAuthError(
        error.status === 429
          ? "Batas kirim email sedang aktif. Tunggu beberapa saat lalu coba lagi."
          : error.message,
      );
      return;
    }
    setAuthMessage("Link masuk sudah dikirim. Silakan cek inbox atau folder spam.");
  }

  async function updatePassword(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setAuthError("");
    setAuthMessage("");

    if (newPassword.length < 8) {
      setAuthError("Password baru minimal 8 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setAuthError("Konfirmasi password belum sama.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setAuthError(error.message || "Password belum berhasil diperbarui.");
      return;
    }

    await supabase.auth.signOut();
    window.history.replaceState({}, document.title, window.location.pathname);
    setSession(null);
    setIsPasswordRecovery(false);
    setNewPassword("");
    setConfirmPassword("");
    setAuthMessage("Password berhasil dibuat. Silakan masuk dengan password baru.");
  }

  const visibleOrders = orders.length ? orders : demoOrders;
  const warehouseOptions = useMemo(
    () => [...new Set(stocks.map((stock) => stock.location_name).filter(Boolean) as string[])].sort(),
    [stocks],
  );
  const platformOptions = useMemo(
    () => [...new Set(visibleOrders.map((order) => order.marketplace).filter(Boolean) as string[])].sort(),
    [visibleOrders],
  );
  const storeOptions = useMemo(
    () => [...new Set(
      visibleOrders
        .filter((order) => !platformFilter || order.marketplace === platformFilter)
        .map((order) => order.store_name)
        .filter(Boolean) as string[],
    )].sort(),
    [visibleOrders, platformFilter],
  );
  const activeOrders = useMemo(
    () => visibleOrders.filter((order) => {
      if (String(order.status).toUpperCase().includes("CANCEL")) return false;
      if (platformFilter && order.marketplace !== platformFilter) return false;
      if (storeFilter && order.store_name !== storeFilter) return false;
      if (dateFrom && (!order.order_date || new Date(order.order_date) < new Date(`${dateFrom}T00:00:00`))) return false;
      if (dateTo && (!order.order_date || new Date(order.order_date) > new Date(`${dateTo}T23:59:59.999`))) return false;
      return true;
    }),
    [visibleOrders, platformFilter, storeFilter, dateFrom, dateTo],
  );
  const revenue = activeOrders.reduce((sum, order) => sum + Number(order.grand_total ?? 0), 0);
  const channelData = useMemo(() => {
    const grouped = new Map<string, number>();
    activeOrders.forEach((order) => {
      const key = order.marketplace || "LAINNYA";
      grouped.set(key, (grouped.get(key) || 0) + Number(order.grand_total || 0));
    });
    return [...grouped.entries()].map(([channel, value]) => ({ channel, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [activeOrders]);
  const trendData = useMemo(() => {
    const days = new Map<string, number>();
    activeOrders.forEach((order) => {
      if (!order.order_date) return;
      const key = new Date(order.order_date).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
      days.set(key, (days.get(key) || 0) + Number(order.grand_total || 0));
    });
    return [...days.entries()].slice(0, 14).reverse().map(([date, value]) => ({ date, value }));
  }, [activeOrders]);
  const filteredStocks = stocks.filter(
    (stock) => !warehouseFilter || stock.location_name === warehouseFilter,
  );
  const lowStock = filteredStocks.filter((stock) => Number(stock.available_quantity ?? 0) <= 5);
  const activeFilterCount = [warehouseFilter, platformFilter, storeFilter, dateFrom || dateTo].filter(Boolean).length;
  const filteredOrders = activeOrders.filter((order) =>
    `${order.order_number} ${order.marketplace} ${order.store_name}`.toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 8);

  if (loading) return <div className="page-loader"><Sparkles /> Menyiapkan command center…</div>;

  if (isConfigured && isPasswordRecovery) {
    return (
      <main className="auth-shell">
        <section className="auth-story">
          <div className="brand-mark"><span>BE</span></div>
          <p className="eyebrow">Pemulihan akun</p>
          <h1>Buat password baru.</h1>
          <p>Gunakan password yang kuat dan hanya Anda yang mengetahuinya.</p>
        </section>
        <form className="auth-card" onSubmit={updatePassword}>
          <p className="eyebrow">Langkah terakhir</p>
          <h2>Atur password baru</h2>
          <label>Password baru<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} autoComplete="new-password" required /></label>
          <label>Ulangi password<input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} autoComplete="new-password" required /></label>
          {authError && <p className="form-error">{authError}</p>}
          <button type="submit">Simpan password baru</button>
          <small>Setelah tersimpan, Anda akan kembali ke halaman login.</small>
        </form>
      </main>
    );
  }

  if (isConfigured && !session) {
    return (
      <main className="auth-shell">
        <section className="auth-story">
          <div className="brand-mark"><span>BE</span></div>
          <p className="eyebrow">Jubelio intelligence workspace</p>
          <h1>Semua sinyal bisnis, dalam satu pandangan.</h1>
          <p>Revenue, order, dan stok dari seluruh channel—diringkas untuk keputusan yang lebih cepat.</p>
          <div className="auth-proof">
            <div><strong>206K+</strong><span>order siap dianalisis</span></div>
            <div><strong>4</strong><span>lokasi terhubung</span></div>
          </div>
        </section>
        <form className="auth-card" onSubmit={signIn}>
          <p className="eyebrow">Akses internal</p>
          <h2>Masuk ke dashboard</h2>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {authError && <p className="form-error">{authError}</p>}
          {authMessage && <p className="form-success">{authMessage}</p>}
          <button type="submit">Masuk dengan aman</button>
          <button type="button" className="secondary-auth-button" onClick={sendMagicLink}>Kirim link masuk ke email</button>
          <small>Akun dibuat oleh administrator melalui Supabase.</small>
        </form>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside>
        <div className="logo"><div className="brand-mark small"><span>BE</span></div><div><strong>Command</strong><span>Center</span></div></div>
        <nav>
          <button className="active"><LayoutDashboard /> Ringkasan</button>
          <button><ShoppingBag /> Order</button>
          <button><Boxes /> Persediaan</button>
          <button><Warehouse /> Lokasi</button>
        </nav>
        <div className="side-note"><Sparkles /><strong>Data tersinkron</strong><span>Jubelio → Supabase</span></div>
        {session && <button className="logout" onClick={() => supabase?.auth.signOut()}><LogOut /> Keluar</button>}
      </aside>

      <main className="dashboard">
        <header>
          <div><p className="eyebrow">Minggu ini</p><h1>Selamat datang kembali.</h1><p>Berikut denyut operasional bisnis Anda hari ini.</p></div>
          <div className="header-actions">
            <label className="search"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari order atau channel" /></label>
            <button className="icon-button" onClick={loadData} aria-label="Muat ulang data"><RefreshCw className={refreshing ? "spin" : ""} /></button>
          </div>
        </header>

        {!isConfigured && <div className="demo-banner"><AlertTriangle /> Mode pratinjau aktif. Tambahkan konfigurasi Supabase saat deployment untuk menampilkan data asli.</div>}

        <section className="metric-grid">
          <article className="metric hero-metric">
            <div className="metric-icon"><CircleDollarSign /></div>
            <button className={`filter-trigger ${activeFilterCount ? "has-filter" : ""}`} onClick={() => setFiltersOpen((open) => !open)} aria-label="Buka filter dashboard">
              <SlidersHorizontal />
              {activeFilterCount > 0 && <b>{activeFilterCount}</b>}
            </button>
            {filtersOpen && (
              <div className="filter-panel">
                <div className="filter-panel-head">
                  <div><span>Filter dashboard</span><strong>Sesuaikan data</strong></div>
                  <button onClick={() => setFiltersOpen(false)} aria-label="Tutup filter">×</button>
                </div>
                <label>Gudang
                  <select value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)}>
                    <option value="">Semua gudang</option>
                    {warehouseOptions.map((warehouseName) => <option key={warehouseName} value={warehouseName}>{warehouseName}</option>)}
                  </select>
                </label>
                <label>Platform penjualan
                  <select value={platformFilter} onChange={(event) => { setPlatformFilter(event.target.value); setStoreFilter(""); }}>
                    <option value="">Semua platform</option>
                    {platformOptions.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
                  </select>
                </label>
                <label>Toko marketplace
                  <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
                    <option value="">Semua toko</option>
                    {storeOptions.map((store) => <option key={store} value={store}>{store}</option>)}
                  </select>
                </label>
                <div className="date-filter">
                  <label>Dari tanggal<input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} /></label>
                  <label>Sampai tanggal<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></label>
                </div>
                <button className="clear-filters" onClick={() => { setWarehouseFilter(""); setPlatformFilter(""); setStoreFilter(""); setDateFrom(""); setDateTo(""); }}>Reset filter</button>
              </div>
            )}
            <span>Revenue terpantau</span>
            <strong>{rupiah.format(revenue)}</strong>
            <small><ArrowUpRight /> Data order selesai terbaru</small>
          </article>
          <article className="metric"><div className="metric-icon amber"><ShoppingBag /></div><span>Order dianalisis</span><strong>{compact.format(activeOrders.length)}</strong><small><ArrowUpRight /> Tidak termasuk pembatalan</small></article>
          <article className="metric"><div className="metric-icon blue"><PackageCheck /></div><span>Baris stok</span><strong>{compact.format(filteredStocks.length || (stocks.length ? 0 : 10276))}</strong><small><ArrowUpRight /> {warehouseFilter || "Dari 4 lokasi aktif"}</small></article>
          <article className="metric"><div className="metric-icon red"><AlertTriangle /></div><span>Stok perlu perhatian</span><strong>{compact.format(lowStock.length)}</strong><small className="danger"><ArrowDownRight /> Tersedia ≤ 5 unit</small></article>
        </section>

        <section className="chart-grid">
          <article className="panel trend-panel">
            <div className="panel-head"><div><span>Tren revenue</span><h2>Performa harian</h2></div><button>14 hari <ChevronDown /></button></div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs><linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34c887" stopOpacity={0.38}/><stop offset="100%" stopColor="#34c887" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid stroke="#dce7e1" strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#718078", fontSize: 12 }} />
                  <YAxis hide />
                  <Tooltip formatter={(value) => rupiah.format(Number(value))} contentStyle={{ borderRadius: 14, border: "1px solid #dce7e1" }} />
                  <Area type="monotone" dataKey="value" stroke="#17865a" strokeWidth={3} fill="url(#revenueFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>
          <article className="panel channel-panel">
            <div className="panel-head"><div><span>Kontribusi channel</span><h2>Revenue per marketplace</h2></div></div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={channelData} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="channel" width={84} axisLine={false} tickLine={false} tick={{ fill: "#435149", fontSize: 11 }} />
                  <Tooltip formatter={(value) => rupiah.format(Number(value))} cursor={{ fill: "#f2f7f4" }} />
                  <Bar dataKey="value" fill="#1e9365" radius={[0, 7, 7, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>

        <section className="bottom-grid">
          <article className="panel orders-panel">
            <div className="panel-head"><div><span>Aktivitas terbaru</span><h2>Order terakhir</h2></div><button>Lihat semua</button></div>
            <div className="table">
              <div className="tr table-head"><span>Order</span><span>Channel</span><span>Status</span><span>Total</span></div>
              {filteredOrders.map((order) => (
                <div className="tr" key={order.order_id}>
                  <span><strong>{order.order_number}</strong><small>{order.order_date ? new Date(order.order_date).toLocaleDateString("id-ID") : "—"}</small></span>
                  <span>{order.marketplace}</span>
                  <span><em>{order.status}</em></span>
                  <span className="money">{rupiah.format(Number(order.grand_total || 0))}</span>
                </div>
              ))}
            </div>
          </article>
          <article className="panel alert-panel">
            <div className="panel-head"><div><span>Prioritas hari ini</span><h2>Stok kritis</h2></div></div>
            <div className="stock-list">
              {(lowStock.length ? lowStock : [
                { item_id: 1, products: { sku: "SKU-001", name: "Contoh produk" }, location_name: "Gudang Utama", available_quantity: 3 },
                { item_id: 2, products: { sku: "SKU-002", name: "Contoh varian" }, location_name: "Toko", available_quantity: 5 },
              ]).slice(0, 5).map((stock) => (
                <div className="stock-item" key={`${stock.item_id}-${stock.location_name}`}>
                  <div><strong>{stock.products?.name || `Produk #${stock.item_id}`}</strong><span>{stock.products?.sku || "Tanpa SKU"} · {stock.location_name}</span></div>
                  <b>{Number(stock.available_quantity || 0)} unit</b>
                </div>
              ))}
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

export default App;
