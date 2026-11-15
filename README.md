# Updatin

Situs statis untuk kerja sama KOL: rate card, cek engagement rate, ranking KOL, draf MoU, kamus istilah, dan dashboard (shortlist serta laporan kampanye).

Tanpa dependensi dan tanpa proses build. Semua berkas berada di satu folder.

## Deploy ke Vercel

1. Unggah semua berkas di folder ini ke sebuah repositori GitHub.
2. Buka vercel.com/new, pilih repositori tersebut.
3. Framework Preset: **Other**. Kosongkan Build Command dan Output Directory.
4. Pilih Deploy.

`vercel.json` mengaktifkan alamat tanpa akhiran `.html` (misalnya `/rate-card`).

## Isi berkas

- `index.html` beranda
- `ranking.html` ranking KOL (data contoh, akun fiktif)
- `rate-card.html` pembuat rate card
- `cek-er.html` kalkulator engagement rate
- `mou.html` pembuat draf MoU
- `kamus.html` kamus istilah
- `dashboard.html` rate card tersimpan, shortlist, laporan kampanye
- `styles.css`, `app.js` tampilan dan logika bersama

## Batasan versi ini

- Belum ada akun atau login. Data pengguna tersimpan di localStorage browser.
- Daftar KOL adalah data contoh di dalam `app.js` (konstanta `KOLS`).
- Angka pengikut dan tayangan diisi manual, belum diambil dari API platform.
