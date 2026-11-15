# Updatin

Situs untuk kerja sama KOL: rate card, cek engagement rate, ranking KOL, draf MoU, kamus istilah, dashboard (shortlist dan laporan kampanye), langganan, dan panel admin.

Halaman statis tanpa proses build. Login, role, langganan, dan data pengguna memakai Supabase.

## Tingkat akses

| Tingkat | Syarat | Yang bisa dipakai |
| --- | --- | --- |
| Tamu | belum login | Beranda, Kamus KOL, Cek ER, pratinjau rate card, halaman Harga |
| User | sudah login | sama seperti tamu, ditambah memesan paket langganan |
| Pelanggan | login + langganan aktif | Ranking KOL dan shortlist, MoU, dashboard, laporan kampanye, simpan/cetak/salin rate card |
| Admin | role admin | semua fitur tanpa berlangganan, ditambah Panel admin |

Pembatasan data dijaga di database (Row Level Security), bukan hanya di tampilan.

## Menghubungkan Supabase

1. Buat proyek di supabase.com.
2. Buka SQL Editor, tempel seluruh isi `supabase-setup.sql`, lalu jalankan.
3. Authentication > URL Configuration: isi Site URL dengan alamat situs (mis. `https://updatin.vercel.app`) dan tambahkan `https://updatin.vercel.app/**` ke Redirect URLs.
4. Isi `supabaseUrl` dan `supabaseKey` di `config.js` (Project URL dan publishable key).
5. Daftar di situs. **Akun pertama yang mendaftar otomatis menjadi admin.**
6. Di Panel admin > Paket: atur harga dan durasi paket, aktifkan, lalu isi instruksi pembayaran.

Login Google (opsional): aktifkan provider Google di Supabase (butuh OAuth Client ID dan Secret dari Google Cloud), lalu ubah `googleEnabled` menjadi `true` di `config.js`.

## Alur langganan

User memilih paket di halaman Harga, membayar sesuai instruksi, lalu admin mengaktifkan pesanannya di Panel admin > Langganan. Masa berlaku dihitung dalam bulan sejak diaktifkan, atau menyambung dari langganan yang masih berjalan.

## Berkas

- `index.html`, `ranking.html`, `rate-card.html`, `cek-er.html`, `mou.html`, `kamus.html`, `dashboard.html`
- `masuk.html` masuk, daftar, dan atur ulang kata sandi
- `langganan.html` paket, pemesanan, dan riwayat langganan
- `admin.html` panel admin
- `styles.css`, `app.js`, `config.js`
- `supabase-setup.sql` skema database, aturan akses, dan data awal
- `vercel.json` alamat tanpa akhiran `.html`

## Batasan

- Pembayaran dikonfirmasi manual oleh admin; belum terhubung ke payment gateway.
- Daftar KOL awal adalah data contoh (akun fiktif berakhiran `_demo`); angka diisi manual, belum diambil dari API platform.
- Cetak dan salin rate card dikunci di tampilan; perhitungannya berjalan di browser.
