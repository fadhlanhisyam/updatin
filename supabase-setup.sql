-- Updatin: skema database, aturan akses (RLS), dan data awal.
-- Jalankan seluruh isi berkas ini satu kali di Supabase > SQL Editor. Aman dijalankan ulang.
--
-- Tingkat akses:
--   tamu      : belum login
--   user      : sudah login, belum punya langganan aktif
--   pelanggan : sudah login dan punya langganan aktif
--   admin     : profiles.role = 'admin' (akun pertama yang mendaftar otomatis menjadi admin)

-- 1. Profil dan role ---------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles where role = 'admin') then 'user' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role hanya boleh diubah oleh admin lain (bukan oleh diri sendiri). Dari SQL Editor selalu boleh.
create or replace function public.protect_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if new.role is distinct from old.role and (not public.is_admin() or auth.uid() = old.id) then
      raise exception 'Role hanya bisa diubah oleh admin lain.';
    end if;
    new.id := old.id;
    new.email := old.email;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile
  before update on public.profiles
  for each row execute function public.protect_profile();

-- 2. Paket dan langganan -----------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price bigint not null check (price >= 0),
  duration_months int not null default 1 check (duration_months between 1 and 36),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid references public.plans (id) on delete set null,
  plan_name text not null,
  price bigint not null,
  duration_months int not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected', 'cancelled')),
  note text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id, status);

create table if not exists public.settings (
  key text primary key,
  value text not null default ''
);

-- Akses fitur penuh: admin, atau user dengan langganan aktif yang belum berakhir.
create or replace function public.has_access()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.subscriptions
    where user_id = auth.uid() and status = 'active' and starts_at <= now() and ends_at > now()
  );
$$;

-- User memesan paket. Harga dan durasi disalin dari paket, tidak bisa diubah dari sisi pengguna.
create or replace function public.request_subscription(p_plan uuid, p_note text default '')
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare
  v_plan public.plans;
  v_row public.subscriptions;
begin
  if auth.uid() is null then
    raise exception 'Masuk terlebih dahulu.';
  end if;
  select * into v_plan from public.plans where id = p_plan and is_active;
  if not found then
    raise exception 'Paket tidak tersedia.';
  end if;
  if exists (select 1 from public.subscriptions where user_id = auth.uid() and status = 'pending') then
    raise exception 'Anda masih memiliki pesanan yang menunggu konfirmasi.';
  end if;
  insert into public.subscriptions (user_id, plan_id, plan_name, price, duration_months, note)
  values (auth.uid(), v_plan.id, v_plan.name, v_plan.price, v_plan.duration_months, left(coalesce(p_note, ''), 500))
  returning * into v_row;
  return v_row;
end;
$$;

-- Admin mengaktifkan, menolak, atau membatalkan langganan.
-- Saat diaktifkan, masa berlaku dimulai sekarang atau menyambung dari langganan aktif sebelumnya.
create or replace function public.decide_subscription(p_id uuid, p_status text)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare
  v_row public.subscriptions;
  v_start timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Khusus admin.';
  end if;
  if p_status not in ('active', 'rejected', 'cancelled') then
    raise exception 'Status tidak dikenal.';
  end if;
  select * into v_row from public.subscriptions where id = p_id for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan.';
  end if;
  if p_status = 'active' then
    if v_row.status <> 'pending' then
      raise exception 'Hanya pesanan yang menunggu konfirmasi yang bisa diaktifkan.';
    end if;
    select greatest(now(), coalesce(max(ends_at), now())) into v_start
    from public.subscriptions
    where user_id = v_row.user_id and status = 'active';
    update public.subscriptions
    set status = 'active', starts_at = v_start, ends_at = v_start + make_interval(months => v_row.duration_months), decided_at = now()
    where id = p_id
    returning * into v_row;
  else
    update public.subscriptions set status = p_status, decided_at = now() where id = p_id returning * into v_row;
  end if;
  return v_row;
end;
$$;

-- 3. Data situs --------------------------------------------------------------
create table if not exists public.kols (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  handle text not null unique,
  platform text not null check (platform in ('tiktok', 'instagram', 'youtube')),
  niche text not null,
  city text not null default '',
  followers bigint not null default 0 check (followers >= 0),
  views bigint not null default 0 check (views >= 0),
  er numeric(5, 2) not null default 0 check (er >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.glossary (
  id uuid primary key default gen_random_uuid(),
  term text not null unique,
  definition text not null,
  created_at timestamptz not null default now()
);

-- 4. Data milik pengguna -----------------------------------------------------
create table if not exists public.rate_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.shortlist (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kol_id uuid not null references public.kols (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, kol_id)
);

create table if not exists public.campaigns (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  budget bigint not null default 0,
  posts jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Ringkasan untuk panel admin.
create or replace function public.admin_stats()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Khusus admin.';
  end if;
  return json_build_object(
    'users', (select count(*) from public.profiles),
    'active_subs', (select count(distinct user_id) from public.subscriptions where status = 'active' and starts_at <= now() and ends_at > now()),
    'pending_subs', (select count(*) from public.subscriptions where status = 'pending'),
    'revenue', (select coalesce(sum(price), 0) from public.subscriptions where status = 'active'),
    'plans', (select count(*) from public.plans where is_active),
    'kols', (select count(*) from public.kols),
    'rate_cards', (select count(*) from public.rate_cards),
    'campaigns', (select count(*) from public.campaigns)
  );
end;
$$;

-- 5. Aturan akses (Row Level Security) ---------------------------------------
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.settings enable row level security;
alter table public.kols enable row level security;
alter table public.glossary enable row level security;
alter table public.rate_cards enable row level security;
alter table public.shortlist enable row level security;
alter table public.campaigns enable row level security;

-- Profil: lihat dan ubah milik sendiri; admin semua.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- Paket: paket aktif terlihat semua orang; admin mengelola.
drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans for select to anon, authenticated
  using (is_active or public.is_admin());
drop policy if exists plans_admin on public.plans;
create policy plans_admin on public.plans for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Langganan: user melihat miliknya dan boleh membatalkan pesanan yang masih menunggu; admin melihat semua.
-- Membuat pesanan dan mengubah status hanya lewat fungsi request_subscription / decide_subscription.
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists subscriptions_cancel on public.subscriptions;
create policy subscriptions_cancel on public.subscriptions for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

-- Pengaturan (instruksi pembayaran): dibaca user login; admin mengelola.
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select to authenticated using (true);
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Daftar KOL: hanya pelanggan dan admin yang bisa membaca; admin mengelola.
drop policy if exists kols_select on public.kols;
create policy kols_select on public.kols for select to authenticated using (public.has_access());
drop policy if exists kols_admin on public.kols;
create policy kols_admin on public.kols for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Kamus: terbuka untuk semua; admin mengelola.
drop policy if exists glossary_select on public.glossary;
create policy glossary_select on public.glossary for select to anon, authenticated using (true);
drop policy if exists glossary_admin on public.glossary;
create policy glossary_admin on public.glossary for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Rate card, shortlist, laporan kampanye: milik sendiri. Menambah atau mengubah perlu akses aktif.
drop policy if exists rate_cards_select on public.rate_cards;
create policy rate_cards_select on public.rate_cards for select to authenticated using (user_id = auth.uid());
drop policy if exists rate_cards_insert on public.rate_cards;
create policy rate_cards_insert on public.rate_cards for insert to authenticated
  with check (user_id = auth.uid() and public.has_access());
drop policy if exists rate_cards_delete on public.rate_cards;
create policy rate_cards_delete on public.rate_cards for delete to authenticated using (user_id = auth.uid());

drop policy if exists shortlist_select on public.shortlist;
create policy shortlist_select on public.shortlist for select to authenticated using (user_id = auth.uid());
drop policy if exists shortlist_insert on public.shortlist;
create policy shortlist_insert on public.shortlist for insert to authenticated
  with check (user_id = auth.uid() and public.has_access());
drop policy if exists shortlist_delete on public.shortlist;
create policy shortlist_delete on public.shortlist for delete to authenticated using (user_id = auth.uid());

drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns for select to authenticated using (user_id = auth.uid());
drop policy if exists campaigns_insert on public.campaigns;
create policy campaigns_insert on public.campaigns for insert to authenticated
  with check (user_id = auth.uid() and public.has_access());
drop policy if exists campaigns_update on public.campaigns;
create policy campaigns_update on public.campaigns for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.has_access());

-- 6. Hak akses tabel untuk API ------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.plans, public.glossary to anon;
grant select, insert, update, delete on
  public.profiles, public.plans, public.subscriptions, public.settings, public.kols,
  public.glossary, public.rate_cards, public.shortlist, public.campaigns
  to authenticated;
grant execute on function public.is_admin(), public.has_access() to anon, authenticated;
grant execute on function public.request_subscription(uuid, text), public.decide_subscription(uuid, text), public.admin_stats() to authenticated;

-- 7. Data KOL asli dari tautan profil (Edge Function kol-data) ----------------
alter table public.kols add column if not exists source_url text;
alter table public.kols add column if not exists fetched_at timestamptz;
alter table public.kols add column if not exists stats jsonb;
-- Nama akun yang sama boleh ada di platform berbeda.
alter table public.kols drop constraint if exists kols_handle_key;
create unique index if not exists kols_platform_handle_idx on public.kols (platform, lower(handle));

-- Simpanan hasil 24 jam dan catatan pemakaian. Tanpa policy: hanya bisa diakses fungsi server.
create table if not exists public.profile_cache (
  platform text not null,
  handle text not null,
  data jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (platform, handle)
);
create table if not exists public.lookup_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  platform text not null,
  handle text not null,
  created_at timestamptz not null default now()
);
create index if not exists lookup_log_user_idx on public.lookup_log (user_id, created_at);
alter table public.profile_cache enable row level security;
alter table public.lookup_log enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.profile_cache, public.lookup_log, public.kols to service_role;

-- 8. Data awal ---------------------------------------------------------------
insert into public.settings (key, value) values ('payment_instructions', '') on conflict (key) do nothing;

-- Contoh paket (nonaktif). Ubah harga dan aktifkan dari Panel admin > Paket.
insert into public.plans (name, description, price, duration_months, is_active)
select 'Paket Bulanan', 'Akses semua fitur selama 1 bulan.', 49000, 1, false
where not exists (select 1 from public.plans);

-- Daftar KOL contoh (akun fiktif). Hapus atau ganti dari Panel admin > Daftar KOL.
insert into public.kols (name, handle, platform, niche, city, followers, views, er) values
  ('Laras Wijaya', '@dapurlaras_demo', 'tiktok', 'Kuliner', 'Bandung', 248000, 96000, 5.4),
  ('Bima Prasetyo', '@bimangulik_demo', 'tiktok', 'Teknologi', 'Jakarta', 1320000, 410000, 4.1),
  ('Sekar Ayu', '@sekarglow_demo', 'tiktok', 'Kecantikan', 'Surabaya', 612000, 188000, 6.2),
  ('Raka Mahendra', '@rakangakak_demo', 'tiktok', 'Komedi', 'Yogyakarta', 2850000, 920000, 7.3),
  ('Nadia Putri', '@bundanadia_demo', 'tiktok', 'Parenting', 'Depok', 86000, 31000, 8.1),
  ('Dimas Saputra', '@dimasngegas_demo', 'tiktok', 'Otomotif', 'Semarang', 174000, 62000, 4.6),
  ('Tiara Lestari', '@tiaracuan_demo', 'tiktok', 'Keuangan', 'Jakarta', 395000, 120000, 3.9),
  ('Yoga Pratama', '@yogamabar_demo', 'tiktok', 'Gaming', 'Medan', 940000, 305000, 5.8),
  ('Citra Maharani', '@citrajalan_demo', 'tiktok', 'Travel', 'Denpasar', 7800, 4200, 11.4),
  ('Anindya Sari', '@anindyastyle_demo', 'instagram', 'Fashion', 'Jakarta', 520000, 140000, 2.8),
  ('Fajar Nugroho', '@fajarlari_demo', 'instagram', 'Olahraga & Kesehatan', 'Malang', 68000, 24000, 4.4),
  ('Maya Kusuma', '@rumahmaya_demo', 'instagram', 'Rumah & Dekorasi', 'Tangerang', 212000, 58000, 3.1),
  ('Putri Anggraini', '@putriskincare_demo', 'instagram', 'Kecantikan', 'Bandung', 1150000, 260000, 2.2),
  ('Arif Hidayat', '@arifkulineran_demo', 'instagram', 'Kuliner', 'Makassar', 143000, 47000, 3.6),
  ('Dewi Rahma', '@ceritaibudewi_demo', 'instagram', 'Parenting', 'Bekasi', 38000, 12500, 5.2),
  ('Galih Permana', '@galihmenjelajah_demo', 'instagram', 'Travel', 'Lombok', 305000, 88000, 3.4),
  ('Salsa Aulia', '@salsabernyanyi_demo', 'instagram', 'Musik', 'Jakarta', 2100000, 480000, 1.9),
  ('Hendra Wijaksono', '@hendrainvestasi_demo', 'instagram', 'Keuangan', 'Surabaya', 9200, 3100, 6),
  ('Reza Firmansyah', '@rezabedahgadget_demo', 'youtube', 'Teknologi', 'Jakarta', 870000, 210000, 3.2),
  ('Intan Permata', '@kelasintan_demo', 'youtube', 'Edukasi', 'Yogyakarta', 430000, 95000, 4),
  ('Bayu Santoso', '@bayutouring_demo', 'youtube', 'Otomotif', 'Bandung', 1640000, 380000, 2.6),
  ('Kirana Dewanti', '@kiranamasak_demo', 'youtube', 'Kuliner', 'Solo', 96000, 28000, 4.8),
  ('Aldi Ramadhan', '@aldimaingame_demo', 'youtube', 'Gaming', 'Palembang', 3200000, 640000, 3),
  ('Wulan Septiani', '@wulanbelajaruang_demo', 'youtube', 'Keuangan', 'Jakarta', 58000, 17000, 5.5)
on conflict do nothing;

-- Isi awal Kamus KOL.
insert into public.glossary (term, definition) values
  ('KOL (Key Opinion Leader)', 'Orang yang pendapatnya dipercaya oleh audiens tertentu, sehingga rekomendasinya memengaruhi keputusan membeli. Di Indonesia istilah ini sering dipakai bergantian dengan influencer atau kreator.'),
  ('Rate card', 'Daftar tarif resmi seorang kreator untuk tiap jenis konten, misalnya satu video TikTok atau satu Reels. Biasanya memuat data akun, harga, dan ketentuan kerja sama.'),
  ('Engagement rate (ER)', 'Persentase interaksi (suka, komentar, bagikan, simpan) dibanding jumlah pengikut atau tayangan. Dipakai untuk menilai seberapa aktif audiens sebuah akun.'),
  ('Reach (jangkauan)', 'Jumlah akun unik yang melihat sebuah konten. Satu orang yang menonton tiga kali tetap dihitung satu jangkauan.'),
  ('Impressions (impresi)', 'Jumlah total konten ditampilkan, termasuk tayangan berulang oleh orang yang sama.'),
  ('Views (tayangan)', 'Jumlah pemutaran video. Aturan hitungnya berbeda di tiap platform, jadi bandingkan angka pada platform yang sama.'),
  ('CPM (cost per mille)', 'Biaya untuk setiap 1.000 tayangan. Rumusnya: biaya dibagi tayangan, lalu dikali 1.000. Berguna untuk membandingkan harga antar-KOL.'),
  ('CPE (cost per engagement)', 'Biaya untuk setiap satu interaksi. Rumusnya: biaya dibagi total interaksi.'),
  ('CPV (cost per view)', 'Biaya untuk setiap satu tayangan video. Rumusnya: biaya dibagi jumlah tayangan.'),
  ('CTR (click-through rate)', 'Persentase orang yang mengeklik tautan dibanding yang melihat konten.'),
  ('ROAS', 'Return on ad spend, yaitu pendapatan yang dihasilkan dibanding biaya promosi. ROAS 3 berarti setiap Rp 1 biaya menghasilkan Rp 3 penjualan.'),
  ('GMV', 'Gross merchandise value, total nilai transaksi penjualan sebelum dikurangi diskon, retur, dan biaya lain. Sering dipakai untuk mengukur hasil live commerce.'),
  ('Nano, micro, macro, mega', 'Pengelompokan KOL menurut jumlah pengikut. Patokan yang umum: nano di bawah 10 ribu, micro 10 ribu sampai 100 ribu, macro 100 ribu sampai 1 juta, mega di atas 1 juta.'),
  ('Endorse', 'Kerja sama berbayar ketika kreator mempromosikan produk atau jasa di akunnya.'),
  ('Paid promote (PP)', 'Promosi berbayar yang lebih sederhana daripada endorse, biasanya berupa unggahan materi dari brand tanpa ulasan pribadi kreator.'),
  ('Brief', 'Dokumen arahan dari brand untuk kreator: tujuan kampanye, pesan utama, hal yang wajib dan dilarang, serta tenggat.'),
  ('SOW (scope of work)', 'Rincian pekerjaan yang disepakati, seperti jumlah konten, format, jadwal tayang, dan jumlah revisi.'),
  ('MoU', 'Memorandum of understanding, nota kesepahaman tertulis antara brand dan kreator sebelum kerja sama berjalan.'),
  ('Deliverables', 'Hasil kerja yang wajib diserahkan kreator, misalnya 1 video TikTok dan 3 slide Story.'),
  ('Draft approval', 'Tahap ketika kreator mengirim draf konten untuk disetujui brand sebelum tayang.'),
  ('Usage rights (hak pakai konten)', 'Izin bagi brand untuk memakai ulang konten kreator, misalnya di akun brand atau sebagai iklan, dalam jangka waktu tertentu. Umumnya dikenai biaya tambahan.'),
  ('Spark Ads / whitelisting', 'Izin dari kreator agar brand dapat mengiklankan konten langsung dari akun kreator. Di TikTok disebut Spark Ads, di Instagram dikenal sebagai partnership ads.'),
  ('Eksklusivitas', 'Kesepakatan bahwa kreator tidak bekerja sama dengan pesaing brand selama periode tertentu.'),
  ('UGC (user-generated content)', 'Konten buatan pengguna atau kreator yang dipakai brand di kanalnya sendiri. Kreator UGC dibayar untuk membuat konten, bukan untuk menayangkannya di akun pribadi.'),
  ('Affiliate', 'Skema komisi: kreator mendapat persentase dari setiap penjualan yang datang melalui tautan atau keranjangnya.'),
  ('Keranjang kuning', 'Sebutan untuk fitur belanja TikTok Shop yang menautkan produk langsung pada video atau siaran langsung.'),
  ('Live commerce', 'Berjualan melalui siaran langsung, dengan penonton dapat membeli produk saat siaran berjalan.'),
  ('Insight', 'Data performa konten atau akun yang disediakan platform, seperti jangkauan, tayangan, dan demografi audiens. Brand biasanya meminta tangkapan layar insight sebagai bukti.'),
  ('Seeding', 'Mengirim produk gratis kepada kreator dengan harapan diulas, tanpa kewajiban atau bayaran tetap.'),
  ('Niche', 'Topik utama sebuah akun, seperti kuliner, kecantikan, atau keuangan. Menentukan kecocokan kreator dengan brand.')
on conflict (term) do nothing;
