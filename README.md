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

## Data KOL asli dari tautan profil

Edge Function `kol-data` (kode: `edge-function-kol-data.ts`) mengambil data profil dari tautan lalu menghitung rata-rata dan ER.

| Platform | Sumber | Secret di Supabase |
| --- | --- | --- |
| YouTube | YouTube Data API v3 (resmi, gratis dalam kuota harian) | `YOUTUBE_API_KEY` |
| Instagram | Apify, `apify/instagram-profile-scraper` | `APIFY_TOKEN` |
| TikTok | Apify, `clockworks/tiktok-profile-scraper` | `APIFY_TOKEN` |

Pasang lewat Supabase > Edge Functions (nama fungsi `kol-data`), lalu isi secret di Edge Functions > Secrets. Hanya pelanggan dan admin yang bisa memanggilnya; hasil disimpan 24 jam dan dibatasi 15 pengambilan baru per pengguna per hari.

Dipakai di: Cek ER (tempel tautan profil) dan Panel admin > Daftar KOL (tambah dari tautan, tombol Perbarui).

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
- Daftar KOL awal adalah data contoh (akun fiktif berakhiran `_demo`). KOL asli ditambahkan admin dari tautan profil.
- Kredit gratis Apify terbatas per bulan; TikTok paling boros karena dihitung per video.
- Cetak dan salin rate card dikunci di tampilan; perhitungannya berjalan di browser.
