/* Updatin — logika situs. Login, role, langganan, dan data pengguna memakai Supabase (lihat config.js).
   Tingkat akses: guest (tamu) < user (login) < member (langganan aktif) < admin. */
(async () => {
  "use strict";

  /* ---------- Util ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pref = {
    get(k, d) { try { const v = localStorage.getItem("updatin:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("updatin:" + k, JSON.stringify(v)); } catch { /* abaikan */ } },
  };
  const int = (v) => { const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10); return Number.isFinite(n) ? n : 0; };
  const dec = (v) => { const n = parseFloat(String(v ?? "").replace(/\s|%/g, "").replace(",", ".")); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const fmtInt = (n) => Math.round(Number(n) || 0).toLocaleString("id-ID");
  const fmtRp = (n) => "Rp " + fmtInt(n);
  const short = (x) => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10).toLocaleString("id-ID");
  const fmtC = (n) => (n >= 1e9 ? short(n / 1e9) + " M" : n >= 1e6 ? short(n / 1e6) + " jt" : n >= 1e3 ? short(n / 1e3) + " rb" : String(Math.round(n)));
  const fmtPct = (n) => Number(n).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "%";
  const fmtX = (n) => "×" + n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "–");
  const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
  const today = () => fmtDate(new Date());
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const months = (n) => `${n} bulan`;

  let toastTimer;
  function toast(msg) {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }
  const oops = (e) => { console.error(e); toast("Gagal: " + (e && e.message ? e.message : "coba lagi sebentar lagi")); };
  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); }
    catch {
      const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove(); toast(ok ? okMsg : "Tidak bisa menyalin otomatis. Blok teksnya lalu salin secara manual.");
    }
  }
  function setMsg(el, text, ok = false) { el.hidden = !text; el.textContent = text || ""; el.className = "msg " + (ok ? "ok" : "err"); }
  // Tombol hapus dua langkah: klik pertama meminta kepastian, klik kedua menjalankan.
  function confirmClick(btn, run) {
    if (btn.dataset.armed) { run(); return; }
    const label = btn.textContent; btn.dataset.armed = "1"; btn.textContent = "Yakin?";
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = label; } }, 3000);
  }

  /* ---------- Rumus ---------- */
  const PLATFORMS = {
    tiktok: { label: "TikTok", cpm: 40000, formats: [
      { id: "video", label: "Video TikTok (1 video)", m: 1 },
      { id: "spark", label: "Video + izin iklan Spark Ads 30 hari", m: 1.3 },
      { id: "live", label: "Siaran langsung 1 jam", m: 1.5 },
      { id: "paket", label: "Paket 3 video", m: 2.6 },
    ] },
    instagram: { label: "Instagram", cpm: 60000, formats: [
      { id: "reels", label: "Reels (1 video)", m: 1 },
      { id: "feed", label: "Feed foto atau carousel", m: 0.7 },
      { id: "story", label: "Story 3 slide", m: 0.4 },
      { id: "combo", label: "Paket Reels + Story 3 slide", m: 1.3 },
    ] },
    youtube: { label: "YouTube", cpm: 90000, formats: [
      { id: "khusus", label: "Video khusus (dedicated)", m: 2.5 },
      { id: "integrasi", label: "Integrasi 60–90 detik", m: 1.2 },
      { id: "shorts", label: "Shorts (1 video)", m: 0.6 },
    ] },
  };
  const NICHES = {
    "Kuliner": 1, "Kecantikan": 1.25, "Fashion": 1.15, "Parenting": 1.2, "Teknologi": 1.35, "Keuangan": 1.5, "Travel": 1.05,
    "Komedi": 0.85, "Gaming": 0.95, "Olahraga & Kesehatan": 1.1, "Musik": 0.9, "Edukasi": 1.05, "Otomotif": 1.2, "Rumah & Dekorasi": 1.1,
  };
  const EXAMPLE = { name: "Laras Wijaya", handle: "@dapurlaras_demo", platform: "tiktok", niche: "Kuliner", city: "Bandung", followers: 248000, views: 96000, er: 5.4 };

  const tierOf = (f) => (f < 10000 ? "Nano" : f < 100000 ? "Micro" : f < 1000000 ? "Macro" : "Mega");
  const erMult = (er) => Math.min(1.5, Math.max(0.85, 0.85 + er * 0.05));
  const roundPrice = (p) => { const step = p < 1e6 ? 25000 : p < 1e7 ? 50000 : 250000; return Math.max(50000, Math.round(p / step) * step); };
  function estimate({ platform, niche, views, er, cpm }) {
    const P = PLATFORMS[platform] || PLATFORMS.tiktok;
    const base = (Number(views) / 1000) * (cpm || P.cpm) * (NICHES[niche] || 1) * erMult(Number(er));
    return P.formats.map((f) => ({ id: f.id, label: f.label, price: roundPrice(base * f.m) }));
  }
  const mainPrice = (k) => estimate(k)[0].price;
  function erRating(er) {
    if (er < 1) return { label: "Rendah", cls: "bad" };
    if (er < 3) return { label: "Cukup", cls: "warn" };
    if (er < 6) return { label: "Baik", cls: "ok" };
    return { label: "Sangat baik", cls: "ok" };
  }
  const platLabel = (p) => (PLATFORMS[p] ? PLATFORMS[p].label : p);

  function ratecardHtml(d, { tag = "Rate card", printable = false, date = today(), watermark = false } = {}) {
    const meta = [d.handle, platLabel(d.platform), d.niche, d.city].filter(Boolean).map(esc).join(" · ");
    return `<article class="ratecard${printable ? " print-area" : ""}${watermark ? " watermarked" : ""}">
      <header class="ratecard-head"><span class="avatar" aria-hidden="true">${esc(initials(d.name))}</span><div class="who"><strong>${esc(d.name || "Nama kreator")}</strong><span>${meta}</span></div><span class="tag">${esc(tag)}</span></header>
      <div class="ratecard-metrics"><div><span>Pengikut</span><b>${fmtC(d.followers)}</b></div><div><span>Rata-rata tayangan</span><b>${fmtC(d.views)}</b></div><div><span>Engagement rate</span><b>${fmtPct(d.er)}</b></div></div>
      <ul class="ratecard-rows">${(d.prices || []).map((p) => `<li><span>${esc(p.label)}</span><b>${fmtRp(p.price)}</b></li>`).join("")}</ul>
      <footer class="ratecard-foot"><span>${d.contact ? "Kontak: " + esc(d.contact) : "Harga belum termasuk pajak. Berlaku 30 hari."}</span><span>Updatin · ${esc(date)}</span></footer>
    </article>`;
  }

  function seg(el, options, value, onChange) {
    el.innerHTML = options.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${v === value}">${esc(l)}</button>`).join("");
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $$("button", el).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      onChange(b.dataset.v);
    });
  }
  const platformOptions = Object.entries(PLATFORMS).map(([k, p]) => [k, p.label]);
  const fillSelect = (el, values) => { el.insertAdjacentHTML("beforeend", values.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")); };

  /* ---------- Supabase, sesi, dan tingkat akses ---------- */
  const CFG = window.UPDATIN_CONFIG || {};
  let sb = null;
  try { if (CFG.supabaseUrl && CFG.supabaseKey && window.supabase) sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey); }
  catch (e) { console.error(e); }
  let recovery = /type=recovery/.test(location.hash);
  if (sb) sb.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") recovery = true; });

  async function db(query) {
    const { data, error } = await query;
    if (error) throw new Error(error.message || "Permintaan ke server gagal");
    return data;
  }

  const RANK = { guest: 0, user: 1, member: 2, admin: 3 };
  const me = { user: null, profile: null, level: "guest", subs: [], until: null, pending: null };
  const can = (level) => RANK[me.level] >= RANK[level];
  const subState = (s) => {
    if (s.status === "active") return new Date(s.ends_at) > new Date() ? { label: "Aktif", cls: "ok" } : { label: "Berakhir", cls: "" };
    return { pending: { label: "Menunggu konfirmasi", cls: "warn" }, rejected: { label: "Ditolak", cls: "bad" }, cancelled: { label: "Dibatalkan", cls: "" } }[s.status] || { label: s.status, cls: "" };
  };
  const activeUntil = (subs) => {
    const now = Date.now();
    const running = subs.filter((s) => s.status === "active" && new Date(s.starts_at) <= now && new Date(s.ends_at) > now);
    if (!running.length) return null;
    // Langganan sambungan (mulai setelah yang sekarang berakhir) ikut dihitung.
    return new Date(Math.max(...subs.filter((s) => s.status === "active" && new Date(s.ends_at) > now).map((s) => +new Date(s.ends_at))));
  };
  async function loadAuth() {
    Object.assign(me, { user: null, profile: null, level: "guest", subs: [], until: null, pending: null });
    if (!sb) return;
    try {
      const { data } = await sb.auth.getSession();
      const user = data && data.session ? data.session.user : null;
      if (!user) return;
      me.user = user;
      const [p, s] = await Promise.all([
        sb.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        sb.from("subscriptions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      ]);
      me.profile = p.data || { id: user.id, email: user.email, full_name: "", role: "user" };
      me.subs = s.data || [];
      me.until = activeUntil(me.subs);
      me.pending = me.subs.find((x) => x.status === "pending") || null;
      me.level = me.profile.role === "admin" ? "admin" : me.until ? "member" : "user";
    } catch (e) { console.error(e); }
  }
  const myName = () => (me.profile && me.profile.full_name) || (me.user && me.user.email) || "";

  const page = document.body.dataset.page || "home";
  const params = new URLSearchParams(location.search);

  /* ---------- Umum: menu, slot akun, format angka ---------- */
  const toggle = $(".nav-toggle"), nav = $("#nav");
  if (toggle && nav) toggle.addEventListener("click", () => { const open = nav.classList.toggle("open"); toggle.setAttribute("aria-expanded", String(open)); toggle.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu"); });
  document.addEventListener("focusout", (e) => {
    const el = e.target;
    if (el instanceof HTMLInputElement && el.inputMode === "numeric" && el.value.trim() !== "") el.value = fmtInt(int(el.value));
  });

  function renderAuthSlot() {
    const slot = $("#auth-slot"); if (!slot) return;
    if (!me.user) { slot.innerHTML = `<a class="btn" href="./masuk">Masuk</a>`; return; }
    const cur = (p) => (page === p ? ' aria-current="page"' : "");
    slot.innerHTML = `<a href="./dashboard"${cur("dashboard")}>Dashboard</a>${me.level === "admin" ? `<a href="./admin"${cur("admin")}>Admin</a>` : ""}<button type="button" class="btn ghost sm" id="logout">Keluar</button>`;
    $("#logout").addEventListener("click", async () => { try { await sb.auth.signOut(); } catch (e) { console.error(e); } location.href = "./"; });
  }

  /* ---------- Gerbang akses ---------- */
  const REQ = { ranking: "member", mou: "member", dashboard: "member", admin: "admin" };
  const FEATURE = { ranking: "Ranking KOL dan shortlist", mou: "pembuat draf MoU", dashboard: "dashboard", admin: "panel admin" };
  const LOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
  function gateCopy(need, feature) {
    const next = encodeURIComponent(page);
    if (!sb) return { h: "Login belum aktif", p: "Fitur ini memerlukan akun, tetapi sistem login situs ini belum dihubungkan. Pemilik situs perlu menyelesaikan pengaturan Supabase terlebih dahulu.", a: `<a class="btn ghost" href="./">Kembali ke beranda</a>` };
    if (!me.user) return { h: `Masuk untuk memakai ${feature}`, p: need === "admin" ? "Halaman ini khusus admin." : "Fitur ini terbuka untuk akun dengan langganan aktif. Masuk, atau daftar lalu pilih paket.", a: `<a class="btn" href="./masuk?next=${next}">Masuk</a><a class="btn ghost" href="./masuk?mode=daftar&next=${next}">Daftar akun</a>` };
    if (need === "admin") return { h: "Halaman ini khusus admin", p: "Akun Anda tidak memiliki akses admin.", a: `<a class="btn ghost" href="./dashboard">Ke dashboard</a>` };
    if (me.pending) return { h: "Pesanan Anda menunggu konfirmasi", p: `Paket ${me.pending.plan_name} sudah dipesan. ${feature[0].toUpperCase() + feature.slice(1)} terbuka setelah admin mengonfirmasi pembayaran.`, a: `<a class="btn" href="./langganan">Lihat status pesanan</a>` };
    return { h: `Berlangganan untuk memakai ${feature}`, p: "Akun Anda belum memiliki langganan aktif. Satu paket membuka semua fitur.", a: `<a class="btn" href="./langganan">Lihat paket langganan</a>` };
  }
  function showGate(need) {
    const g = $("#gate"); if (!g) return;
    const c = gateCopy(need, FEATURE[page] || "fitur ini");
    g.innerHTML = `<div class="container"><div class="panel gate stack"><span class="lock">${LOCK}</span><h2>${esc(c.h)}</h2><p class="muted">${esc(c.p)}</p><div class="row">${c.a}</div></div></div>`;
    g.hidden = false;
  }

  /* ---------- Halaman ---------- */
  const PAGES = {};

  PAGES.home = async () => {
    $("#hero-card").innerHTML = ratecardHtml({ ...EXAMPLE, prices: estimate(EXAMPLE) }, { tag: "Contoh" });
    $("#niche-chips").innerHTML = Object.keys(NICHES).map((n) => `<a class="chip" href="./ranking?niche=${encodeURIComponent(n)}">${esc(n)}</a>`).join("");
  };

  PAGES.ranking = async () => {
    const q = $("#rk-q"), fp = $("#rk-platform"), fn = $("#rk-niche"), ft = $("#rk-tier"), fs = $("#rk-sort"), body = $("#rk-body");
    const [kols, sl] = await Promise.all([db(sb.from("kols").select("*").order("followers", { ascending: false })), db(sb.from("shortlist").select("kol_id"))]);
    let shortlist = sl.map((x) => x.kol_id);
    fillSelect(fp, platformOptions);
    fillSelect(fn, [...new Set([...Object.keys(NICHES), ...kols.map((k) => k.niche)])].map((n) => [n, n]));
    if (params.get("niche") && [...fn.options].some((o) => o.value === params.get("niche"))) fn.value = params.get("niche");
    $("#rk-demo-note").hidden = !kols.some((k) => /_demo$/.test(k.handle));
    const sorters = { followers: (a, b) => b.followers - a.followers, er: (a, b) => b.er - a.er, views: (a, b) => b.views - a.views, price: (a, b) => mainPrice(a) - mainPrice(b) };
    function render() {
      const term = q.value.trim().toLowerCase();
      const rows = kols.filter((k) => (!fp.value || k.platform === fp.value) && (!fn.value || k.niche === fn.value) && (!ft.value || tierOf(k.followers) === ft.value) && (!term || (k.name + " " + k.handle + " " + k.city).toLowerCase().includes(term))).sort(sorters[fs.value]);
      $("#rk-count").textContent = `${rows.length} dari ${kols.length} KOL ditampilkan`;
      $("#rk-shortlist-link").textContent = `Shortlist (${shortlist.length})`;
      body.innerHTML = rows.length ? rows.map((k, i) => {
        const on = shortlist.includes(k.id), r = erRating(k.er);
        return `<tr><td class="num">${i + 1}</td><td><div class="who-cell"><span class="avatar sm" aria-hidden="true">${esc(initials(k.name))}</span><div><strong>${esc(k.name)}</strong><span>${esc(k.handle)}${k.city ? " · " + esc(k.city) : ""}</span></div></div></td><td>${esc(platLabel(k.platform))}</td><td>${esc(k.niche)}</td><td><span class="badge">${tierOf(k.followers)}</span></td><td class="r num">${fmtC(k.followers)}</td><td class="r num">${fmtC(k.views)}</td><td class="r"><span class="badge ${r.cls}">${fmtPct(k.er)}</span></td><td class="r num">${fmtRp(mainPrice(k))}</td><td><button type="button" class="btn sm ${on ? "on" : "ghost"}" data-id="${esc(k.id)}" aria-pressed="${on}">${on ? "✓ Di shortlist" : "+ Shortlist"}</button></td></tr>`;
      }).join("") : `<tr><td colspan="10" class="empty">${kols.length ? "Tidak ada KOL yang cocok. Longgarkan saringan atau hapus kata pencarian." : "Daftar KOL masih kosong."}</td></tr>`;
    }
    [q, fp, fn, ft, fs].forEach((el) => el.addEventListener("input", render));
    body.addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-id]"); if (!b || b.disabled) return;
      const id = b.dataset.id, on = shortlist.includes(id); b.disabled = true;
      try {
        if (on) await db(sb.from("shortlist").delete().eq("kol_id", id).eq("user_id", me.user.id));
        else await db(sb.from("shortlist").insert({ kol_id: id }));
        shortlist = on ? shortlist.filter((x) => x !== id) : [...shortlist, id];
        toast(on ? "Dihapus dari shortlist" : "Ditambahkan ke shortlist");
      } catch (err) { oops(err); }
      render();
    });
    render();
  };

  PAGES["cek-er"] = async () => {
    let platform = "tiktok";
    seg($("#er-platform"), platformOptions, platform, (v) => { platform = v; calc(); });
    function calc() {
      const f = int($("#er-followers").value), views = int($("#er-views").value);
      const total = int($("#er-likes").value) + int($("#er-comments").value) + int($("#er-shares").value) + int($("#er-saves").value);
      const er = f > 0 ? (total / f) * 100 : 0;
      const erV = views > 0 ? (total / views) * 100 : null;
      const r = erRating(er), badge = $("#er-rating");
      $("#er-result").textContent = f > 0 ? fmtPct(er) : "–";
      badge.textContent = f > 0 ? r.label : "Isi jumlah pengikut"; badge.className = "badge " + (f > 0 ? r.cls : "");
      $("#er-meter").style.width = Math.min(100, er * 10) + "%";
      $("#er-byviews").textContent = erV === null ? "–" : fmtPct(erV);
      $("#er-tier").textContent = f > 0 ? `${tierOf(f)} (${fmtC(f)})` : "–";
      $("#er-total").textContent = fmtInt(total);
      $("#er-vf").textContent = f > 0 && views > 0 ? fmtPct((views / f) * 100) : "–";
      const notes = {
        "Rendah": "Interaksi tergolong rendah untuk ukuran akun ini. Periksa apakah banyak pengikut tidak aktif, dan uji format konten yang berbeda.",
        "Cukup": "Interaksi berada di kisaran umum. Konten dengan ajakan berkomentar atau menyimpan biasanya menaikkan angka ini.",
        "Baik": "Audiens aktif menanggapi konten. Angka ini layak dicantumkan di rate card.",
        "Sangat baik": "Audiens sangat aktif. Pastikan angka ini konsisten pada 10 sampai 12 konten terakhir, bukan hasil satu konten viral.",
      };
      $("#er-note").textContent = f > 0 ? notes[r.label] : "";
      const p = new URLSearchParams({ platform, followers: String(f), views: String(views), er: String(Math.round(er * 100) / 100) });
      $("#er-to-rc").href = "./rate-card?" + p.toString();
    }
    $("#er-form").addEventListener("input", calc);
    $("#er-form").addEventListener("submit", (e) => e.preventDefault());
    calc();
  };

  PAGES["rate-card"] = async () => {
    const el = (id) => $("#rc-" + id);
    const full = can("member");
    let platform = PLATFORMS[params.get("platform")] ? params.get("platform") : "tiktok";
    let overrides = {};
    fillSelect(el("niche"), Object.keys(NICHES).map((n) => [n, n]));
    if (params.get("followers")) el("followers").value = fmtInt(int(params.get("followers")));
    if (params.get("views")) el("views").value = fmtInt(int(params.get("views")));
    if (params.get("er")) el("er").value = String(dec(params.get("er"))).replace(".", ",");
    el("cpm").value = fmtInt(PLATFORMS[platform].cpm);
    seg(el("platform"), platformOptions, platform, (v) => { platform = v; overrides = {}; el("cpm").value = fmtInt(PLATFORMS[v].cpm); renderPrices(); renderPreview(); });

    const inputs = () => ({ platform, niche: el("niche").value, views: int(el("views").value), er: dec(el("er").value), cpm: int(el("cpm").value) });
    const prices = () => estimate(inputs()).map((p) => ({ ...p, price: overrides[p.id] ?? p.price, edited: p.id in overrides }));
    const data = () => ({ name: el("name").value.trim(), handle: el("handle").value.trim(), platform, niche: el("niche").value, city: el("city").value.trim(), contact: el("contact").value.trim(), followers: int(el("followers").value), views: int(el("views").value), er: dec(el("er").value), prices: prices().map(({ label, price }) => ({ label, price })) });

    function renderPrices() {
      el("prices").innerHTML = prices().map((p) => `<div class="field"><label for="rc-p-${p.id}">${esc(p.label)}${p.edited ? ' <span class="badge brand">Harga Anda</span>' : ""}</label><input class="num" type="text" inputmode="numeric" id="rc-p-${p.id}" data-id="${p.id}" value="${fmtInt(p.price)}"></div>`).join("");
      const i = inputs(), P = PLATFORMS[platform];
      el("factors").textContent = `Faktor saat ini: niche ${i.niche} ${fmtX(NICHES[i.niche] || 1)}, ER ${fmtPct(i.er)} ${fmtX(erMult(i.er))}. Faktor format ${P.label}: ${P.formats.map((f) => `${f.label} ${fmtX(f.m)}`).join("; ")}.`;
    }
    function renderPreview() { $("#rc-preview").innerHTML = ratecardHtml(data(), { printable: full, watermark: !full, tag: full ? "Rate card" : "Pratinjau" }); }

    $("#rc-form").addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset && t.dataset.id) {
        overrides[t.dataset.id] = int(t.value);
        const lab = t.previousElementSibling;
        if (lab && !lab.querySelector(".badge")) lab.insertAdjacentHTML("beforeend", ' <span class="badge brand">Harga Anda</span>');
        renderPreview(); return;
      }
      if (["rc-niche", "rc-views", "rc-er", "rc-cpm"].includes(t.id)) renderPrices();
      renderPreview();
    });
    $("#rc-form").addEventListener("submit", (e) => e.preventDefault());
    el("reset").addEventListener("click", () => { overrides = {}; renderPrices(); renderPreview(); toast("Harga dikembalikan ke estimasi"); });

    // Simpan, cetak, dan salin hanya untuk pelanggan.
    const locked = () => {
      if (full) return false;
      const c = gateCopy("member", "fitur simpan, cetak, dan salin rate card");
      const lock = el("lock");
      lock.innerHTML = `<span>${LOCK}</span><div class="stack" style="gap: 8px"><span><strong>${esc(c.h)}.</strong> ${esc(c.p)}</span><div class="row">${c.a.replace(/next=[^"&]*/g, "next=rate-card")}</div></div>`;
      lock.hidden = false; lock.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return true;
    };
    el("save").addEventListener("click", async () => {
      if (locked()) return;
      const d = data();
      if (!d.name) { toast("Isi nama terlebih dahulu"); el("name").focus(); return; }
      try { await db(sb.from("rate_cards").insert({ data: { ...d, date: today() } })); toast("Tersimpan di dashboard"); } catch (e) { oops(e); }
    });
    el("print").addEventListener("click", () => { if (!locked()) window.print(); });
    el("copy").addEventListener("click", () => {
      if (locked()) return;
      const d = data();
      const text = [`RATE CARD — ${d.name}${d.handle ? " (" + d.handle + ")" : ""}`, [platLabel(d.platform), d.niche, d.city].filter(Boolean).join(" · "), `Pengikut: ${fmtInt(d.followers)} | Rata-rata tayangan: ${fmtInt(d.views)} | ER: ${fmtPct(d.er)}`, "", ...d.prices.map((p) => `- ${p.label}: ${fmtRp(p.price)}`), "", d.contact ? `Kontak: ${d.contact}` : null, `Harga belum termasuk pajak dan berlaku 30 hari sejak ${today()}.`].filter((x) => x !== null).join("\n");
      copyText(text, "Rate card disalin");
    });
    renderPrices(); renderPreview();
  };

  PAGES.mou = async () => {
    const el = (id) => $("#mou-" + id);
    fillSelect(el("platform"), [...platformOptions.map(([, l]) => [l, l]), ["TikTok dan Instagram", "TikTok dan Instagram"]]);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const now = new Date(); el("signdate").value = iso(now);
    const tayang = new Date(now); tayang.setDate(tayang.getDate() + 14); el("date").value = iso(tayang);
    const W = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
    function terbilang(n) {
      n = Math.floor(n);
      if (n < 12) return W[n];
      if (n < 20) return terbilang(n - 10) + " belas";
      if (n < 100) return terbilang(Math.floor(n / 10)) + " puluh" + (n % 10 ? " " + terbilang(n % 10) : "");
      if (n < 200) return "seratus" + (n - 100 ? " " + terbilang(n - 100) : "");
      if (n < 1000) return terbilang(Math.floor(n / 100)) + " ratus" + (n % 100 ? " " + terbilang(n % 100) : "");
      if (n < 2000) return "seribu" + (n - 1000 ? " " + terbilang(n - 1000) : "");
      if (n < 1e6) return terbilang(Math.floor(n / 1000)) + " ribu" + (n % 1000 ? " " + terbilang(n % 1000) : "");
      if (n < 1e9) return terbilang(Math.floor(n / 1e6)) + " juta" + (n % 1e6 ? " " + terbilang(n % 1e6) : "");
      if (n < 1e12) return terbilang(Math.floor(n / 1e9)) + " miliar" + (n % 1e9 ? " " + terbilang(n % 1e9) : "");
      return terbilang(Math.floor(n / 1e12)) + " triliun" + (n % 1e12 ? " " + terbilang(n % 1e12) : "");
    }
    const v = (val, ph) => (val ? esc(val) : `<span class="blank">[${esc(ph)}]</span>`);
    const longDate = (s, opt) => (s ? new Date(s + "T00:00:00").toLocaleDateString("id-ID", opt) : "");
    function render() {
      const fee = int(el("fee").value), plat = el("platform").value;
      const pay = { dp: "50% (lima puluh persen) dibayarkan sebelum pengerjaan konten dimulai dan 50% (lima puluh persen) dibayarkan paling lambat 7 (tujuh) hari kerja setelah seluruh konten tayang", after: "100% (seratus persen) dibayarkan paling lambat 7 (tujuh) hari kerja setelah seluruh konten tayang", before: "100% (seratus persen) dibayarkan sebelum pengerjaan konten dimulai" }[el("pay").value];
      const usage = el("usage").value === "none"
        ? "PIHAK PERTAMA berhak mengunggah ulang (repost) konten di akun media sosial resminya dengan mencantumkan akun PIHAK KEDUA. Pemakaian konten sebagai materi iklan berbayar memerlukan persetujuan tertulis dan kesepakatan biaya tersendiri."
        : `PIHAK PERTAMA berhak mengunggah ulang konten di akun media sosial resminya dan memakainya sebagai materi iklan berbayar selama ${el("usage").value} hari sejak tanggal tayang. Pemakaian setelah jangka waktu tersebut memerlukan kesepakatan baru.`;
      const excl = el("excl").value === "0"
        ? "Para pihak tidak menyepakati eksklusivitas. PIHAK KEDUA bebas bekerja sama dengan pihak lain."
        : `PIHAK KEDUA tidak menayangkan konten promosi untuk produk pesaing langsung PIHAK PERTAMA selama ${el("excl").value} hari sejak tanggal tayang.`;
      const items = el("deliver").value.split("\n").map((s) => s.trim()).filter(Boolean);
      const brand = v(el("brand").value.trim(), "nama brand"), kol = v(el("kol").value.trim(), "nama KOL");
      el("doc").innerHTML = `
        <h2>NOTA KESEPAHAMAN KERJA SAMA PROMOSI</h2>
        <p style="text-align:center" class="muted small">antara ${brand} dan ${kol}</p>
        <p>Pada hari ini, ${v(longDate(el("signdate").value, { weekday: "long", day: "numeric", month: "long", year: "numeric" }), "tanggal")}, di ${v(el("city").value.trim(), "kota")}, yang bertanda tangan di bawah ini:</p>
        <p>1. ${brand}, dalam hal ini diwakili oleh ${v(el("pic").value.trim(), "nama wakil brand")}, selanjutnya disebut <strong>PIHAK PERTAMA</strong>.</p>
        <p>2. ${kol}, pemilik akun ${esc(plat)} ${v(el("handle").value.trim(), "@namaakun")}, selanjutnya disebut <strong>PIHAK KEDUA</strong>.</p>
        <p>Para pihak sepakat mengadakan kerja sama promosi dengan ketentuan sebagai berikut.</p>
        <h3>Pasal 1 — Ruang Lingkup</h3>
        <p>PIHAK KEDUA membuat dan menayangkan konten berikut:</p>
        ${items.length ? "<ol>" + items.map((i) => `<li>${esc(i)}</li>`).join("") + "</ol>" : `<p><span class="blank">[daftar konten]</span></p>`}
        <h3>Pasal 2 — Jadwal Tayang</h3>
        <p>Konten ditayangkan paling lambat pada ${v(longDate(el("date").value, { day: "numeric", month: "long", year: "numeric" }), "tanggal tayang")}. Konten tetap tayang serta tidak dihapus atau diarsipkan selama sekurang-kurangnya ${el("keep").value} hari sejak tanggal tayang.</p>
        <h3>Pasal 3 — Nilai dan Pembayaran</h3>
        <p>Nilai kerja sama adalah ${fee > 0 ? `<strong>${fmtRp(fee)}</strong> (${esc(terbilang(fee))} rupiah)` : `<span class="blank">[nilai kerja sama]</span>`}. Pembayaran dilakukan PIHAK PERTAMA dengan ketentuan: ${pay}. Nilai tersebut belum termasuk pajak yang berlaku, kecuali disepakati lain secara tertulis.</p>
        <h3>Pasal 4 — Persetujuan Konten dan Revisi</h3>
        <p>PIHAK KEDUA mengirimkan draf konten kepada PIHAK PERTAMA sebelum tayang. PIHAK PERTAMA berhak meminta revisi paling banyak ${el("rev").value} kali selama masih sesuai dengan brief yang disepakati. Revisi di luar brief atau melebihi batas tersebut dapat dikenai biaya tambahan.</p>
        <h3>Pasal 5 — Hak Pakai Konten</h3>
        <p>${usage} Hak cipta atas konten tetap berada pada PIHAK KEDUA.</p>
        <h3>Pasal 6 — Eksklusivitas</h3>
        <p>${excl}</p>
        <h3>Pasal 7 — Penandaan Konten Berbayar</h3>
        <p>PIHAK KEDUA menandai konten sebagai kerja sama berbayar sesuai dengan ketentuan platform yang berlaku.</p>
        <h3>Pasal 8 — Pembatalan</h3>
        <p>Apabila salah satu pihak membatalkan kerja sama setelah nota ini ditandatangani, pihak yang membatalkan mengganti biaya yang secara nyata telah dikeluarkan pihak lainnya.</p>
        <h3>Pasal 9 — Penyelesaian Perselisihan</h3>
        <p>Perselisihan yang timbul dari nota kesepahaman ini diselesaikan secara musyawarah untuk mufakat.</p>
        <div class="sign"><div><strong>PIHAK PERTAMA</strong><br>${v(el("pic").value.trim(), "nama wakil brand")}</div><div><strong>PIHAK KEDUA</strong><br>${kol}</div></div>`;
    }
    $("#mou-form").addEventListener("input", render);
    $("#mou-form").addEventListener("submit", (e) => e.preventDefault());
    el("copy").addEventListener("click", () => copyText(el("doc").innerText, "Teks MoU disalin"));
    el("print").addEventListener("click", () => window.print());
    render();
  };

  PAGES.kamus = async () => {
    const q = $("#km-q"), list = $("#km-list");
    if (sb) {
      try {
        const rows = await db(sb.from("glossary").select("*").order("term", { ascending: true }));
        if (rows.length) list.innerHTML = rows.map((t) => `<div class="term" data-k="${esc((t.term + " " + t.definition).toLowerCase())}"><dt>${esc(t.term)}</dt><dd>${esc(t.definition)}</dd></div>`).join("");
      } catch (e) { console.error(e); }
    }
    const run = () => {
      const t = q.value.trim().toLowerCase(); let n = 0;
      $$(".term", list).forEach((el) => { const show = !t || el.dataset.k.includes(t); el.hidden = !show; if (show) n++; });
      $("#km-count").textContent = `${n} istilah`;
      $("#km-empty").hidden = n > 0;
    };
    q.addEventListener("input", run); run();
  };

  PAGES.masuk = async () => {
    const NEXT_OK = ["dashboard", "ranking", "rate-card", "mou", "langganan", "admin"];
    const next = NEXT_OK.includes(params.get("next")) ? params.get("next") : "";
    const el = (id) => $("#au-" + id), msg = (t, ok) => setMsg(el("msg"), t, ok);
    const goOn = async () => { await loadAuth(); location.replace("./" + (next || (can("member") ? "dashboard" : "langganan"))); };
    if (!sb) {
      msg("Login belum aktif. Pemilik situs perlu menghubungkan Supabase terlebih dahulu.");
      $$("#au-form input, #au-form button, #au-mode button, #au-forgot").forEach((x) => { x.disabled = true; });
      return;
    }
    let mode = recovery ? "baru" : params.get("mode") === "daftar" ? "daftar" : "masuk";
    if (me.user && mode !== "baru") { location.replace("./" + (next || (can("member") ? "dashboard" : "langganan"))); return; }
    const TEXT = {
      masuk: ["Masuk ke Updatin", "Masuk untuk membuka dashboard dan mengelola langganan Anda.", "Masuk"],
      daftar: ["Daftar akun Updatin", "Buat akun, lalu pilih paket langganan untuk membuka semua fitur.", "Daftar"],
      lupa: ["Atur ulang kata sandi", "Masukkan email akun Anda. Kami kirimkan tautan untuk membuat kata sandi baru.", "Kirim tautan"],
      baru: ["Buat kata sandi baru", "Masukkan kata sandi baru untuk akun Anda.", "Simpan kata sandi"],
    };
    function setMode(m) {
      mode = m; msg("");
      el("title").textContent = TEXT[m][0]; el("lead").textContent = TEXT[m][1]; el("submit").textContent = TEXT[m][2];
      el("mode").hidden = m === "lupa" || m === "baru";
      $$("button", el("mode")).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
      el("name-field").hidden = m !== "daftar";
      el("email-field").hidden = m === "baru";
      el("pass-field").hidden = m === "lupa";
      el("pass-hint").hidden = m === "masuk";
      el("pass-label").textContent = m === "baru" ? "Kata sandi baru" : "Kata sandi";
      el("pass").autocomplete = m === "masuk" ? "current-password" : "new-password";
      el("google-wrap").hidden = !CFG.googleEnabled || m === "lupa" || m === "baru";
      el("forgot").textContent = m === "lupa" ? "Kembali ke halaman masuk" : "Lupa kata sandi?";
      el("forgot").hidden = m === "baru" || m === "daftar";
    }
    el("mode").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setMode(b.dataset.mode); });
    el("forgot").addEventListener("click", () => setMode(mode === "lupa" ? "masuk" : "lupa"));
    el("google").addEventListener("click", async () => {
      const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + "/masuk" + (next ? "?next=" + next : "") } });
      if (error) msg(error.message);
    });
    const ERR = { "Invalid login credentials": "Email atau kata sandi salah.", "Email not confirmed": "Email belum dikonfirmasi. Buka tautan konfirmasi yang kami kirim ke email Anda.", "User already registered": "Email ini sudah terdaftar. Silakan masuk." };
    el("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = el("email").value.trim(), pass = el("pass").value, name = el("name").value.trim();
      if (mode !== "baru" && !/^\S+@\S+\.\S+$/.test(email)) { msg("Isi alamat email yang benar."); el("email").focus(); return; }
      if (mode === "daftar" && !name) { msg("Isi nama Anda."); el("name").focus(); return; }
      if ((mode === "daftar" || mode === "baru") && pass.length < 8) { msg("Kata sandi minimal 8 karakter."); el("pass").focus(); return; }
      if (mode === "masuk" && !pass) { msg("Isi kata sandi."); el("pass").focus(); return; }
      const btn = el("submit"); btn.disabled = true; msg("");
      try {
        if (mode === "masuk") {
          const { error } = await sb.auth.signInWithPassword({ email, password: pass });
          if (error) throw error;
          await goOn(); return;
        }
        if (mode === "daftar") {
          const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { full_name: name }, emailRedirectTo: location.origin + "/masuk" } });
          if (error) throw error;
          if (data.session) { await goOn(); return; }
          if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) msg("Email ini sudah terdaftar. Silakan masuk.");
          else msg("Akun dibuat. Buka tautan konfirmasi yang kami kirim ke email Anda, lalu masuk.", true);
        }
        if (mode === "lupa") {
          const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/masuk" });
          if (error) throw error;
          msg("Jika email itu terdaftar, tautan untuk membuat kata sandi baru sudah dikirim.", true);
        }
        if (mode === "baru") {
          const { error } = await sb.auth.updateUser({ password: pass });
          if (error) throw error;
          recovery = false; await goOn(); return;
        }
      } catch (err) { msg(ERR[err.message] || err.message || "Terjadi kesalahan. Coba lagi."); }
      btn.disabled = false;
    });
    setMode(mode);
  };

  PAGES.langganan = async () => {
    const el = (id) => $("#lg-" + id);
    const plansEl = el("plans"), status = el("status");
    if (!sb) { plansEl.innerHTML = `<p class="muted">Paket belum bisa ditampilkan karena sistem login situs ini belum dihubungkan.</p>`; return; }
    let plans = [], payText = "", chosen = null;
    async function load() {
      plans = await db(sb.from("plans").select("*").eq("is_active", true).order("price", { ascending: true }));
      if (me.user) {
        const s = await db(sb.from("settings").select("*").eq("key", "payment_instructions").maybeSingle());
        payText = (s && s.value) || "";
      }
    }
    function render() {
      // Status akun
      if (!me.user) status.hidden = true;
      else {
        status.hidden = false;
        if (me.level === "admin") status.innerHTML = `<div class="row"><h2 style="margin:0">Akun admin</h2><span class="badge brand">Admin</span></div><p class="muted">Admin memiliki akses ke semua fitur tanpa berlangganan. Atur paket dan harga di <a href="./admin">Panel admin</a>.</p>`;
        else if (me.pending) status.innerHTML = `<div class="row"><h2 style="margin:0">Pesanan menunggu konfirmasi</h2><span class="badge warn">Menunggu konfirmasi</span></div><p>Paket <strong>${esc(me.pending.plan_name)}</strong>, ${fmtRp(me.pending.price)} untuk ${months(me.pending.duration_months)}, dipesan ${fmtDate(me.pending.created_at)}.</p><div><h3>Cara pembayaran</h3><p class="pre">${payText ? esc(payText) : "Instruksi pembayaran belum diisi admin. Hubungi admin situs."}</p></div><p class="small muted">Langganan aktif setelah admin mengonfirmasi pembayaran Anda.</p><div><button type="button" class="btn danger sm" id="lg-drop">Batalkan pesanan</button></div>`;
        else if (me.until) status.innerHTML = `<div class="row"><h2 style="margin:0">Langganan aktif</h2><span class="badge ok">Aktif</span></div><p>Berlaku sampai <strong>${fmtDate(me.until)}</strong>. Memesan paket lagi akan menyambung masa berlaku.</p><div><a class="btn" href="./dashboard">Buka dashboard</a></div>`;
        else status.innerHTML = `<div class="row"><h2 style="margin:0">Belum berlangganan</h2><span class="badge">Akun terdaftar</span></div><p class="muted">Masuk sebagai ${esc(myName())}. Pilih paket di bawah untuk membuka semua fitur.</p>`;
      }
      // Paket
      plansEl.innerHTML = plans.length ? plans.map((p) => {
        const action = !me.user ? `<a class="btn" href="./masuk?mode=daftar&next=langganan">Daftar untuk berlangganan</a>`
          : me.level === "admin" ? `<span class="small muted">Admin tidak perlu berlangganan.</span>`
          : me.pending ? `<span class="small muted">Selesaikan pesanan yang menunggu terlebih dahulu.</span>`
          : `<button type="button" class="btn" data-plan="${esc(p.id)}">${me.until ? "Perpanjang dengan paket ini" : "Pilih paket ini"}</button>`;
        return `<div class="panel plan stack"><h3>${esc(p.name)}</h3><div><span class="price">${fmtRp(p.price)}</span><span class="muted"> / ${months(p.duration_months)}</span></div><p class="muted small">${esc(p.description)}</p><div class="plan-act">${action}</div></div>`;
      }).join("") : `<p class="muted">Belum ada paket yang tersedia. Silakan kembali lagi nanti.</p>`;
      // Riwayat
      el("history-wrap").hidden = !me.subs.length;
      el("history").innerHTML = me.subs.map((s) => { const st = subState(s); return `<tr><td>${esc(s.plan_name)}</td><td class="r num">${fmtRp(s.price)}</td><td>${months(s.duration_months)}</td><td>${fmtDate(s.created_at)}</td><td><span class="badge ${st.cls}">${st.label}</span></td><td>${s.status === "active" ? `${fmtDate(s.starts_at)} – ${fmtDate(s.ends_at)}` : "–"}</td></tr>`; }).join("");
    }
    plansEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-plan]"); if (!b) return;
      chosen = plans.find((p) => p.id === b.dataset.plan); if (!chosen) return;
      el("o-name").textContent = `${chosen.name} (${months(chosen.duration_months)})`; el("o-price").textContent = fmtRp(chosen.price);
      el("pay").textContent = payText || "Instruksi pembayaran belum diisi admin. Hubungi admin situs sebelum memesan.";
      setMsg(el("msg"), ""); el("order").hidden = false; el("order").scrollIntoView({ block: "start", behavior: "smooth" });
    });
    el("cancel").addEventListener("click", () => { el("order").hidden = true; });
    el("order").addEventListener("submit", async (e) => {
      e.preventDefault(); if (!chosen) return;
      const btn = $("button[type=submit]", el("order")); btn.disabled = true;
      try {
        await db(sb.rpc("request_subscription", { p_plan: chosen.id, p_note: el("note").value.trim() }));
        el("order").hidden = true; el("note").value = ""; await loadAuth(); render(); toast("Pesanan terkirim"); status.scrollIntoView({ block: "start", behavior: "smooth" });
      } catch (err) { setMsg(el("msg"), err.message); }
      btn.disabled = false;
    });
    status.addEventListener("click", (e) => {
      const b = e.target.closest("#lg-drop"); if (!b) return;
      confirmClick(b, async () => {
        try { await db(sb.from("subscriptions").delete().eq("id", me.pending.id)); await loadAuth(); render(); toast("Pesanan dibatalkan"); } catch (err) { oops(err); }
      });
    });
    await load(); render();
  };

  PAGES.dashboard = async () => {
    $("#db-account").innerHTML = `${esc(myName())} · ${me.level === "admin" ? '<span class="badge brand">Admin</span>' : `<span class="badge ok">Pelanggan</span> langganan aktif sampai ${fmtDate(me.until)} · <a href="./langganan">kelola langganan</a>`}`;
    const roleEl = $("#db-role");
    function setRole(r) {
      $$("button", roleEl).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.role === r)));
      $("#db-kol").hidden = r !== "kol"; $("#db-brand").hidden = r !== "brand"; pref.set("role", r);
    }
    roleEl.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setRole(b.dataset.role); });

    // Rate card tersimpan
    const cardsEl = $("#db-cards");
    let cards = await db(sb.from("rate_cards").select("*").order("created_at", { ascending: false }));
    function renderCards() {
      $("#db-cards-empty").hidden = cards.length > 0;
      cardsEl.innerHTML = cards.map((c) => `<div class="stack">${ratecardHtml(c.data, { date: c.data.date || fmtDate(c.created_at) })}<div><button type="button" class="btn danger sm" data-del="${esc(c.id)}">Hapus rate card ini</button></div></div>`).join("");
    }
    cardsEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-del]"); if (!b) return;
      confirmClick(b, async () => {
        try { await db(sb.from("rate_cards").delete().eq("id", b.dataset.del)); cards = cards.filter((c) => c.id !== b.dataset.del); renderCards(); toast("Rate card dihapus"); } catch (err) { oops(err); }
      });
    });

    // Shortlist
    const slEl = $("#db-shortlist");
    const [sl, kols] = await Promise.all([db(sb.from("shortlist").select("kol_id")), db(sb.from("kols").select("*"))]);
    let list = sl.map((x) => kols.find((k) => k.id === x.kol_id)).filter(Boolean);
    function renderShortlist() {
      slEl.innerHTML = list.length ? list.map((k) => `<tr><td><div class="who-cell"><span class="avatar sm" aria-hidden="true">${esc(initials(k.name))}</span><div><strong>${esc(k.name)}</strong><span>${esc(k.handle)}</span></div></div></td><td>${esc(platLabel(k.platform))}</td><td>${esc(k.niche)}</td><td class="r num">${fmtC(k.followers)}</td><td class="r num">${fmtPct(k.er)}</td><td class="r num">${fmtRp(mainPrice(k))}</td><td><button type="button" class="btn danger sm" data-rm="${esc(k.id)}">Hapus</button></td></tr>`).join("") : `<tr><td colspan="7" class="empty">Shortlist masih kosong. Pilih kandidat di halaman <a href="./ranking">Ranking KOL</a>.</td></tr>`;
      $("#db-shortlist-total").textContent = fmtRp(list.reduce((s, k) => s + mainPrice(k), 0));
    }
    slEl.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-rm]"); if (!b) return;
      try { await db(sb.from("shortlist").delete().eq("kol_id", b.dataset.rm).eq("user_id", me.user.id)); list = list.filter((k) => k.id !== b.dataset.rm); renderShortlist(); } catch (err) { oops(err); }
    });

    // Laporan kampanye
    const SAMPLE = { budget: 15000000, posts: [
      { id: "c1", link: "Video ulasan produk (contoh)", platform: "TikTok", views: 182000, likes: 9400, comments: 520, shares: 760, saves: 430, contoh: true },
      { id: "c2", link: "Reels tutorial pemakaian (contoh)", platform: "Instagram", views: 74000, likes: 3100, comments: 210, shares: 180, saves: 640, contoh: true },
      { id: "c3", link: "Integrasi 60 detik (contoh)", platform: "YouTube", views: 41000, likes: 1900, comments: 160, shares: 45, saves: 0, contoh: true },
    ] };
    const saved = await db(sb.from("campaigns").select("*").eq("user_id", me.user.id).maybeSingle());
    let pristine = !saved;
    let camp = saved ? { budget: Number(saved.budget) || 0, posts: Array.isArray(saved.posts) ? saved.posts : [] } : JSON.parse(JSON.stringify(SAMPLE));
    fillSelect($("#cp-platform"), platformOptions.map(([, l]) => [l, l]));
    const eng = (p) => p.likes + p.comments + p.shares + p.saves;
    const budgetEl = $("#cp-budget");
    budgetEl.value = camp.budget ? fmtInt(camp.budget) : "";
    function renderCamp() {
      const posts = camp.posts, V = posts.reduce((s, p) => s + p.views, 0), E = posts.reduce((s, p) => s + eng(p), 0), B = camp.budget;
      $("#cp-sample-note").hidden = !posts.some((p) => p.contoh);
      $("#cp-views").textContent = posts.length ? fmtInt(V) : "–";
      $("#cp-eng").textContent = posts.length ? fmtInt(E) : "–";
      $("#cp-er").textContent = V > 0 ? fmtPct((E / V) * 100) : "–";
      $("#cp-n").textContent = String(posts.length);
      $("#cp-cpm").textContent = B > 0 && V > 0 ? fmtRp((B / V) * 1000) : "–";
      $("#cp-cpe").textContent = B > 0 && E > 0 ? fmtRp(B / E) : "–";
      $("#cp-cpv").textContent = B > 0 && V > 0 ? fmtRp(B / V) : "–";
      const best = posts.filter((p) => p.views > 0).sort((a, b) => eng(b) / b.views - eng(a) / a.views)[0];
      $("#cp-best").textContent = best ? `${best.link.length > 24 ? best.link.slice(0, 23) + "…" : best.link} (${fmtPct((eng(best) / best.views) * 100)})` : "–";
      $("#cp-body").innerHTML = posts.length ? posts.map((p) => `<tr><td>${esc(p.link)}${p.contoh ? ' <span class="badge warn">Contoh</span>' : ""}</td><td>${esc(p.platform)}</td><td class="r num">${fmtInt(p.views)}</td><td class="r num">${fmtInt(p.likes)}</td><td class="r num">${fmtInt(p.comments)}</td><td class="r num">${fmtInt(p.shares)}</td><td class="r num">${fmtInt(p.saves)}</td><td class="r num">${p.views > 0 ? fmtPct((eng(p) / p.views) * 100) : "–"}</td><td><button type="button" class="btn danger sm" data-post="${esc(p.id)}">Hapus</button></td></tr>`).join("") : `<tr><td colspan="9" class="empty">Belum ada posting. Tambahkan hasil posting pertama lewat formulir di bawah.</td></tr>`;
    }
    let saveTimer;
    function saveCamp() {
      renderCamp(); pristine = false; clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        try { await db(sb.from("campaigns").upsert({ user_id: me.user.id, budget: camp.budget, posts: camp.posts, updated_at: new Date().toISOString() })); } catch (err) { oops(err); }
      }, 500);
    }
    budgetEl.addEventListener("input", () => { camp.budget = int(budgetEl.value); saveCamp(); });
    $("#cp-body").addEventListener("click", (e) => { const b = e.target.closest("[data-post]"); if (!b) return; camp.posts = camp.posts.filter((p) => p.id !== b.dataset.post); saveCamp(); });
    $("#cp-clear").addEventListener("click", () => { camp = { budget: 0, posts: [] }; budgetEl.value = ""; saveCamp(); toast("Laporan dikosongkan"); });
    $("#cp-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const g = (id) => $("#cp-" + id), err = $("#cp-error");
      const post = { id: uid(), link: g("link").value.trim(), platform: g("platform").value, views: int(g("in-views").value), likes: int(g("in-likes").value), comments: int(g("in-comments").value), shares: int(g("in-shares").value), saves: int(g("in-saves").value) };
      const m = !post.link ? "Isi tautan atau nama posting." : post.views <= 0 ? "Isi jumlah tayangan dengan angka lebih dari 0." : "";
      err.hidden = !m; err.textContent = m;
      if (m) { (post.link ? g("in-views") : g("link")).focus(); return; }
      camp = { budget: pristine ? 0 : camp.budget, posts: [...camp.posts.filter((p) => !p.contoh), post] };
      if (pristine) budgetEl.value = "";
      saveCamp(); e.target.reset(); toast("Posting ditambahkan");
    });

    setRole(params.get("peran") === "brand" || (!params.get("peran") && pref.get("role", "kol") === "brand") ? "brand" : "kol");
    renderCards(); renderShortlist(); renderCamp();
  };

  PAGES.admin = async () => {
    const TABS = [["ringkasan", "Ringkasan"], ["langganan", "Langganan"], ["paket", "Paket"], ["kol", "Daftar KOL"], ["pengguna", "Pengguna"], ["kamus", "Kamus"]];
    const start = TABS.some(([k]) => k === location.hash.slice(1)) ? location.hash.slice(1) : "ringkasan";
    const actions = (id, editAttr) => `<div class="row" style="gap: 6px; flex-wrap: nowrap"><button type="button" class="btn ghost sm" ${editAttr}="${esc(id)}">Ubah</button><button type="button" class="btn danger sm" data-del="${esc(id)}">Hapus</button></div>`;
    let profiles = [];
    const loadProfiles = async () => { profiles = await db(sb.from("profiles").select("*").order("created_at", { ascending: true })); };
    const who = (id) => { const p = profiles.find((x) => x.id === id); return p ? `<strong>${esc(p.full_name || "(tanpa nama)")}</strong><span>${esc(p.email)}</span>` : `<strong>Pengguna dihapus</strong>`; };

    const loaders = {
      async ringkasan() {
        const s = await db(sb.rpc("admin_stats"));
        $("#ad-stats").innerHTML = [["Pengguna terdaftar", fmtInt(s.users)], ["Pelanggan aktif", fmtInt(s.active_subs)], ["Pesanan menunggu konfirmasi", fmtInt(s.pending_subs)], ["Nilai langganan yang diaktifkan", fmtRp(s.revenue)], ["Paket aktif", fmtInt(s.plans)], ["KOL di ranking", fmtInt(s.kols)], ["Rate card tersimpan", fmtInt(s.rate_cards)], ["Laporan kampanye", fmtInt(s.campaigns)]].map(([l, v]) => `<div><span>${l}</span><b>${v}</b></div>`).join("");
      },
      async langganan() {
        await loadProfiles();
        const subs = await db(sb.from("subscriptions").select("*").order("created_at", { ascending: false }));
        const order = { pending: 0, active: 1, rejected: 2, cancelled: 2 };
        subs.sort((a, b) => order[a.status] - order[b.status]);
        $("#ad-subs").innerHTML = subs.length ? subs.map((s) => {
          const st = subState(s);
          const act = s.status === "pending" ? `<button type="button" class="btn sm" data-sub="${esc(s.id)}" data-to="active">Aktifkan</button><button type="button" class="btn danger sm" data-sub="${esc(s.id)}" data-to="rejected">Tolak</button>`
            : s.status === "active" && new Date(s.ends_at) > new Date() ? `<button type="button" class="btn danger sm" data-sub="${esc(s.id)}" data-to="cancelled">Batalkan</button>` : "";
          return `<tr><td><div class="who-cell"><div>${who(s.user_id)}</div></div></td><td>${esc(s.plan_name)} · ${months(s.duration_months)}</td><td class="r num">${fmtRp(s.price)}</td><td>${fmtDate(s.created_at)}</td><td class="wrap">${esc(s.note) || "–"}</td><td><span class="badge ${st.cls}">${st.label}</span></td><td>${s.status === "active" ? `${fmtDate(s.starts_at)} – ${fmtDate(s.ends_at)}` : "–"}</td><td><div class="row" style="gap: 6px; flex-wrap: nowrap">${act}</div></td></tr>`;
        }).join("") : `<tr><td colspan="8" class="empty">Belum ada pesanan langganan.</td></tr>`;
      },
      async paket() {
        const [plans, s] = await Promise.all([db(sb.from("plans").select("*").order("price", { ascending: true })), db(sb.from("settings").select("*").eq("key", "payment_instructions").maybeSingle())]);
        loaders.paket.rows = plans;
        $("#ad-pay").value = (s && s.value) || "";
        $("#ad-plans").innerHTML = plans.length ? plans.map((p) => `<tr><td><strong>${esc(p.name)}</strong></td><td class="r num">${fmtRp(p.price)}</td><td>${months(p.duration_months)}</td><td><span class="badge ${p.is_active ? "ok" : ""}">${p.is_active ? "Aktif" : "Nonaktif"}</span></td><td class="wrap">${esc(p.description) || "–"}</td><td>${actions(p.id, "data-edit")}</td></tr>`).join("") : `<tr><td colspan="6" class="empty">Belum ada paket. Tambahkan paket pertama lewat formulir di bawah.</td></tr>`;
      },
      async kol() {
        const kols = await db(sb.from("kols").select("*").order("followers", { ascending: false }));
        loaders.kol.rows = kols;
        $("#ad-kols").innerHTML = kols.length ? kols.map((k) => `<tr><td><div class="who-cell"><div><strong>${esc(k.name)}</strong><span>${esc(k.handle)}${k.city ? " · " + esc(k.city) : ""}</span></div></div></td><td>${esc(platLabel(k.platform))}</td><td>${esc(k.niche)}</td><td class="r num">${fmtInt(k.followers)}</td><td class="r num">${fmtInt(k.views)}</td><td class="r num">${fmtPct(k.er)}</td><td>${actions(k.id, "data-edit")}</td></tr>`).join("") : `<tr><td colspan="7" class="empty">Daftar KOL kosong. Tambahkan KOL lewat formulir di bawah.</td></tr>`;
      },
      async pengguna() {
        await loadProfiles();
        const subs = await db(sb.from("subscriptions").select("*"));
        $("#ad-users").innerHTML = profiles.map((p) => {
          const until = activeUntil(subs.filter((s) => s.user_id === p.id)), self = p.id === me.user.id;
          const act = self ? `<span class="small muted">Akun Anda</span>` : `<button type="button" class="btn ghost sm" data-user="${esc(p.id)}" data-role="${p.role === "admin" ? "user" : "admin"}">${p.role === "admin" ? "Jadikan user biasa" : "Jadikan admin"}</button>`;
          return `<tr><td><div class="who-cell"><span class="avatar sm" aria-hidden="true">${esc(initials(p.full_name || p.email))}</span><div><strong>${esc(p.full_name || "(tanpa nama)")}</strong><span>${esc(p.email)}</span></div></div></td><td><span class="badge ${p.role === "admin" ? "brand" : ""}">${p.role === "admin" ? "Admin" : "User"}</span></td><td>${p.role === "admin" ? "Tidak perlu" : until ? `<span class="badge ok">Aktif</span> sampai ${fmtDate(until)}` : "Belum berlangganan"}</td><td>${fmtDate(p.created_at)}</td><td>${act}</td></tr>`;
        }).join("");
      },
      async kamus() {
        const rows = await db(sb.from("glossary").select("*").order("term", { ascending: true }));
        loaders.kamus.rows = rows;
        $("#ad-terms").innerHTML = rows.length ? rows.map((t) => `<tr><td><strong>${esc(t.term)}</strong></td><td class="wrap">${esc(t.definition)}</td><td>${actions(t.id, "data-edit")}</td></tr>`).join("") : `<tr><td colspan="3" class="empty">Kamus kosong.</td></tr>`;
      },
    };
    async function show(t) {
      TABS.forEach(([k]) => { $("#ad-" + k).hidden = k !== t; });
      try { await loaders[t](); } catch (e) { oops(e); }
    }
    seg($("#ad-tabs"), TABS, start, show);

    // Langganan: aktifkan, tolak, batalkan
    $("#ad-subs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-sub]"); if (!b) return;
      const run = async () => {
        try { await db(sb.rpc("decide_subscription", { p_id: b.dataset.sub, p_status: b.dataset.to })); toast({ active: "Langganan diaktifkan", rejected: "Pesanan ditolak", cancelled: "Langganan dibatalkan" }[b.dataset.to]); await loaders.langganan(); } catch (err) { oops(err); }
      };
      if (b.dataset.to === "active") run(); else confirmClick(b, run);
    });

    // Formulir tambah/ubah generik
    function crud({ key, table, tbody, form, title, labels, read, fill, validate }) {
      const idEl = $(`#${form}-id`.replace("-form", "")), cancel = $(`#${form.replace("-form", "")}-cancel`), msgEl = $(`#${form.replace("-form", "")}-msg`), formEl = $("#" + form);
      const reset = () => { formEl.reset(); idEl.value = ""; $("#" + title).textContent = labels[0]; cancel.hidden = true; setMsg(msgEl, ""); };
      cancel.addEventListener("click", reset);
      $("#" + tbody).addEventListener("click", (e) => {
        const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
        if (ed) {
          const row = (loaders[key].rows || []).find((r) => r.id === ed.dataset.edit); if (!row) return;
          fill(row); idEl.value = row.id; $("#" + title).textContent = labels[1]; cancel.hidden = false; setMsg(msgEl, ""); formEl.scrollIntoView({ block: "start", behavior: "smooth" });
        }
        if (del) confirmClick(del, async () => { try { await db(sb.from(table).delete().eq("id", del.dataset.del)); toast("Dihapus"); if (idEl.value === del.dataset.del) reset(); await loaders[key](); } catch (err) { oops(err); } });
      });
      formEl.addEventListener("submit", async (e) => {
        e.preventDefault();
        const row = read(), problem = validate(row);
        if (problem) { setMsg(msgEl, problem); return; }
        try {
          if (idEl.value) await db(sb.from(table).update(row).eq("id", idEl.value)); else await db(sb.from(table).insert(row));
          toast("Tersimpan"); reset(); await loaders[key]();
        } catch (err) { setMsg(msgEl, /duplicate key/.test(err.message) ? "Data dengan nama yang sama sudah ada." : err.message); }
      });
    }
    const val = (id) => $("#" + id).value.trim();
    crud({
      key: "paket", table: "plans", tbody: "ad-plans", form: "ad-plan-form", title: "ad-plan-title", labels: ["Tambah paket", "Ubah paket"],
      read: () => ({ name: val("ad-plan-name"), description: val("ad-plan-desc"), price: int(val("ad-plan-price")), duration_months: int(val("ad-plan-months")), is_active: $("#ad-plan-active").value === "true" }),
      fill: (p) => { $("#ad-plan-name").value = p.name; $("#ad-plan-desc").value = p.description; $("#ad-plan-price").value = fmtInt(p.price); $("#ad-plan-months").value = p.duration_months; $("#ad-plan-active").value = String(p.is_active); },
      validate: (p) => (!p.name ? "Isi nama paket." : val("ad-plan-price") === "" ? "Isi harga paket." : p.duration_months < 1 || p.duration_months > 36 ? "Durasi harus antara 1 dan 36 bulan." : ""),
    });
    fillSelect($("#ad-kol-platform"), platformOptions);
    fillSelect($("#ad-kol-niche"), Object.keys(NICHES).map((n) => [n, n]));
    crud({
      key: "kol", table: "kols", tbody: "ad-kols", form: "ad-kol-form", title: "ad-kol-title", labels: ["Tambah KOL", "Ubah KOL"],
      read: () => ({ name: val("ad-kol-name"), handle: val("ad-kol-handle"), platform: $("#ad-kol-platform").value, niche: $("#ad-kol-niche").value, city: val("ad-kol-city"), followers: int(val("ad-kol-followers")), views: int(val("ad-kol-views")), er: Math.round(dec(val("ad-kol-er")) * 100) / 100 }),
      fill: (k) => { $("#ad-kol-name").value = k.name; $("#ad-kol-handle").value = k.handle; $("#ad-kol-platform").value = k.platform; if (![...$("#ad-kol-niche").options].some((o) => o.value === k.niche)) fillSelect($("#ad-kol-niche"), [[k.niche, k.niche]]); $("#ad-kol-niche").value = k.niche; $("#ad-kol-city").value = k.city || ""; $("#ad-kol-followers").value = fmtInt(k.followers); $("#ad-kol-views").value = fmtInt(k.views); $("#ad-kol-er").value = String(k.er).replace(".", ","); },
      validate: (k) => (!k.name ? "Isi nama KOL." : !k.handle ? "Isi nama akun." : k.er > 100 ? "Engagement rate tidak boleh lebih dari 100%." : ""),
    });
    crud({
      key: "kamus", table: "glossary", tbody: "ad-terms", form: "ad-term-form", title: "ad-term-title", labels: ["Tambah istilah", "Ubah istilah"],
      read: () => ({ term: val("ad-term"), definition: val("ad-def") }),
      fill: (t) => { $("#ad-term").value = t.term; $("#ad-def").value = t.definition; },
      validate: (t) => (!t.term ? "Isi istilah." : !t.definition ? "Isi penjelasan." : ""),
    });

    // Instruksi pembayaran
    $("#ad-pay-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await db(sb.from("settings").upsert({ key: "payment_instructions", value: $("#ad-pay").value.trim() })); toast("Instruksi pembayaran tersimpan"); } catch (err) { oops(err); }
    });

    // Pengguna: ubah role
    $("#ad-users").addEventListener("click", (e) => {
      const b = e.target.closest("[data-user]"); if (!b) return;
      confirmClick(b, async () => {
        try { await db(sb.from("profiles").update({ role: b.dataset.role }).eq("id", b.dataset.user)); toast("Role diubah"); await loaders.pengguna(); } catch (err) { oops(err); }
      });
    });

    await show(start);
  };

  /* ---------- Jalankan ---------- */
  await loadAuth();
  renderAuthSlot();
  if (REQ[page]) {
    if (!can(REQ[page])) { showGate(REQ[page]); return; }
    $("#app-content").hidden = false;
  }
  if (PAGES[page]) { try { await PAGES[page](); } catch (e) { oops(e); } }
})();
