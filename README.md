# Jubelio Command Center

Dashboard operasional internal untuk memantau revenue, order, persediaan, dan lokasi
Jubelio melalui Supabase. Aplikasi dipublikasikan di GitHub Pages dan hanya dapat
dibuka oleh pengguna Supabase Auth.

## Alur data

1. Edge Function server-side membaca Jubelio memakai secret yang tersimpan di Supabase.
2. Data mentah disimpan ke tabel `orders`, `products`, `inventory`, dan `order_items`.
3. View `security_invoker` dan RPC dashboard menghitung KPI dengan RLS tetap aktif.
4. Browser hanya menerima publishable key dan token pengguna yang sudah login.

Semua filter order memakai tanggal bisnis `Asia/Makassar` (WITA). Stok negatif dari
sumber dijaga minimum nol pada read model tanpa mengubah data mentah.

## Konfigurasi

Salin `.env.example` menjadi `.env.local` untuk pengembangan. Jangan pernah menaruh
`sb_secret_...` atau service-role key di `VITE_*`.

Tambahkan GitHub repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Aktifkan GitHub Pages dengan source **GitHub Actions**. Workflow akan menolak build
yang memakai secret API key di browser.

## Pemeriksaan lokal

```text
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

## Cakupan sumber

- Sinkronisasi membaca order selesai serta tahapan aktif seperti siap diproses,
  picking, packing, siap dikirim, dan dikirim.
- Detail item diambil dari `GET /sales/orders/{id}` saat modal order dibuka dan
  disimpan ke `order_items`.
- Status aktif disegarkan otomatis setiap 30 menit dan juga saat tombol refresh
  dashboard digunakan.
- Incoming stock tidak tersedia dari payload inventory yang tersimpan.
- Backfill histori order berjalan bertahap; progresnya ditampilkan pada Ringkasan.

## Forecast Restock

Menu Persediaan memiliki halaman Forecast Restock dengan periode 1, 2, 3 bulan
atau rentang tanggal khusus. Perhitungan hanya memakai order selesai, bukan
transaksi internal, batal, retur, atau item batal.

```text
avg_daily_sales = unit normal / hari kalender
trend_factor = 1 + clamp(trend, -30%, +50%)
net_stock = stok tersedia + incoming - teralokasi
reorder_point = kebutuhan lead time + safety stock
target_stock = avg_daily_sales x (lead time + coverage days) x trend_factor + safety stock
final_restock = ceil(max(0, target_stock - net_stock) / MOQ) x MOQ
```

Transaksi besar ditandai dengan batas `Q3 + 1,5 x IQR`. Jumlahnya dibatasi pada
forecast normal dan tetap dihitung penuh pada forecast aktual. Lead time, MOQ,
safety stock, dan incoming dapat diatur per produk. Jika belum diisi, dashboard
menampilkan dan memakai nilai default.

Detail item historis diisi bertahap sebanyak maksimal 80 order setiap 10 menit.
Coverage dan confidence ditampilkan agar hasil tidak terlihat lebih pasti daripada
data yang tersedia.
