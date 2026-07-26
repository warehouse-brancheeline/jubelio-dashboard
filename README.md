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

## Sumber yang belum tersedia

- `order_items` masih kosong pada sumber saat implementasi, sehingga detail item dan
  unit terjual belum dapat dihitung secara jujur.
- Sinkronisasi order saat ini hanya mengisi status `COMPLETED`.
- Incoming stock tidak tersedia dari payload inventory yang tersimpan.
- Backfill histori order berjalan bertahap; progresnya ditampilkan pada Ringkasan.
