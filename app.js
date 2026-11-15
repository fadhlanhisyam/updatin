/* Updatin — logika situs. Tanpa dependensi; semua data pengguna tersimpan di localStorage browser. */
(() => {
  "use strict";

  /* ---------- Util ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("updatin:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("updatin:" + k, JSON.stringify(v)); return true; } catch { return false; } },
  };
  const int = (v) => { const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10); return Number.isFinite(n) ? n : 0; };
  const dec = (v) => { const n = parseFloat(String(v ?? "").replace(/\s|%/g, "").replace(",", ".")); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const fmtInt = (n) => Math.round(n).toLocaleString("id-ID");
  const fmtRp = (n) => "Rp " + fmtInt(n);
  const short = (x) => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10).toLocaleString("id-ID");
  const fmtC = (n) => (n >= 1e9 ? short(n / 1e9) + " M" : n >= 1e6 ? short(n / 1e6) + " jt" : n >= 1e3 ? short(n / 1e3) + " rb" : String(Math.round(n)));
  const fmtPct = (n) => n.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "%";
  const fmtX = (n) => "×" + n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
  const today = () => new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  let toastTimer;
  function toast(msg) {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); }
    catch {
      const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove(); toast(ok ? okMsg : "Tidak bisa menyalin otomatis. Blok teksnya lalu salin secara manual.");
    }
  }

  /* ---------- Data & rumus ---------- */
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
  // Akun fiktif untuk demonstrasi. [nama, akun, platform, niche, kota, pengikut, rata-rata tayangan, ER%]
  const KOLS = [
    ["Laras Wijaya", "@dapurlaras_demo", "tiktok", "Kuliner", "Bandung", 248000, 96000, 5.4],
    ["Bima Prasetyo", "@bimangulik_demo", "tiktok", "Teknologi", "Jakarta", 1320000, 410000, 4.1],
    ["Sekar Ayu", "@sekarglow_demo", "tiktok", "Kecantikan", "Surabaya", 612000, 188000, 6.2],
    ["Raka Mahendra", "@rakangakak_demo", "tiktok", "Komedi", "Yogyakarta", 2850000, 920000, 7.3],
    ["Nadia Putri", "@bundanadia_demo", "tiktok", "Parenting", "Depok", 86000, 31000, 8.1],
    ["Dimas Saputra", "@dimasngegas_demo", "tiktok", "Otomotif", "Semarang", 174000, 62000, 4.6],
    ["Tiara Lestari", "@tiaracuan_demo", "tiktok", "Keuangan", "Jakarta", 395000, 120000, 3.9],
    ["Yoga Pratama", "@yogamabar_demo", "tiktok", "Gaming", "Medan", 940000, 305000, 5.8],
    ["Citra Maharani", "@citrajalan_demo", "tiktok", "Travel", "Denpasar", 7800, 4200, 11.4],
    ["Anindya Sari", "@anindyastyle_demo", "instagram", "Fashion", "Jakarta", 520000, 140000, 2.8],
    ["Fajar Nugroho", "@fajarlari_demo", "instagram", "Olahraga & Kesehatan", "Malang", 68000, 24000, 4.4],
    ["Maya Kusuma", "@rumahmaya_demo", "instagram", "Rumah & Dekorasi", "Tangerang", 212000, 58000, 3.1],
    ["Putri Anggraini", "@putriskincare_demo", "instagram", "Kecantikan", "Bandung", 1150000, 260000, 2.2],
    ["Arif Hidayat", "@arifkulineran_demo", "instagram", "Kuliner", "Makassar", 143000, 47000, 3.6],
    ["Dewi Rahma", "@ceritaibudewi_demo", "instagram", "Parenting", "Bekasi", 38000, 12500, 5.2],
    ["Galih Permana", "@galihmenjelajah_demo", "instagram", "Travel", "Lombok", 305000, 88000, 3.4],
    ["Salsa Aulia", "@salsabernyanyi_demo", "instagram", "Musik", "Jakarta", 2100000, 480000, 1.9],
    ["Hendra Wijaksono", "@hendrainvestasi_demo", "instagram", "Keuangan", "Surabaya", 9200, 3100, 6.0],
    ["Reza Firmansyah", "@rezabedahgadget_demo", "youtube", "Teknologi", "Jakarta", 870000, 210000, 3.2],
    ["Intan Permata", "@kelasintan_demo", "youtube", "Edukasi", "Yogyakarta", 430000, 95000, 4.0],
    ["Bayu Santoso", "@bayutouring_demo", "youtube", "Otomotif", "Bandung", 1640000, 380000, 2.6],
    ["Kirana Dewanti", "@kiranamasak_demo", "youtube", "Kuliner", "Solo", 96000, 28000, 4.8],
    ["Aldi Ramadhan", "@aldimaingame_demo", "youtube", "Gaming", "Palembang", 3200000, 640000, 3.0],
    ["Wulan Septiani", "@wulanbelajaruang_demo", "youtube", "Keuangan", "Jakarta", 58000, 17000, 5.5],
  ].map(([name, handle, platform, niche, city, followers, views, er]) => ({ name, handle, platform, niche, city, followers, views, er }));

  const tierOf = (f) => (f < 10000 ? "Nano" : f < 100000 ? "Micro" : f < 1000000 ? "Macro" : "Mega");
  const erMult = (er) => Math.min(1.5, Math.max(0.85, 0.85 + er * 0.05));
  const roundPrice = (p) => { const step = p < 1e6 ? 25000 : p < 1e7 ? 50000 : 250000; return Math.max(50000, Math.round(p / step) * step); };
  function estimate({ platform, niche, views, er, cpm }) {
    const P = PLATFORMS[platform] || PLATFORMS.tiktok;
    const base = (views / 1000) * (cpm || P.cpm) * (NICHES[niche] || 1) * erMult(er);
    return P.formats.map((f) => ({ id: f.id, label: f.label, price: roundPrice(base * f.m) }));
  }
  const mainPrice = (k) => estimate(k)[0].price;
  function erRating(er) {
    if (er < 1) return { label: "Rendah", cls: "bad" };
    if (er < 3) return { label: "Cukup", cls: "warn" };
    if (er < 6) return { label: "Baik", cls: "ok" };
    return { label: "Sangat baik", cls: "ok" };
  }

  function ratecardHtml(d, { tag = "Rate card", printable = false, date = today() } = {}) {
    const P = PLATFORMS[d.platform] || PLATFORMS.tiktok;
    const meta = [d.handle, P.label, d.niche, d.city].filter(Boolean).map(esc).join(" · ");
    return `<article class="ratecard${printable ? " print-area" : ""}">
      <header class="ratecard-head"><span class="avatar" aria-hidden="true">${esc(initials(d.name))}</span><div class="who"><strong>${esc(d.name || "Nama kreator")}</strong><span>${meta}</span></div><span class="tag">${esc(tag)}</span></header>
      <div class="ratecard-metrics"><div><span>Pengikut</span><b>${fmtC(d.followers)}</b></div><div><span>Rata-rata tayangan</span><b>${fmtC(d.views)}</b></div><div><span>Engagement rate</span><b>${fmtPct(d.er)}</b></div></div>
      <ul class="ratecard-rows">${d.prices.map((p) => `<li><span>${esc(p.label)}</span><b>${fmtRp(p.price)}</b></li>`).join("")}</ul>
      <footer class="ratecard-foot"><span>${d.contact ? "Kontak: " + esc(d.contact) : "Harga belum termasuk pajak. Berlaku 30 hari."}</span><span>Updatin · ${esc(date)}</span></footer>
    </article>`;
  }

  function seg(el, options, value, onChange) {
    el.innerHTML = options.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${v === value}">${esc(l)}</button>`).join("");
    el.dataset.value = value;
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $$("button", el).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      el.dataset.value = b.dataset.v; onChange(b.dataset.v);
    });
  }
  const platformOptions = Object.entries(PLATFORMS).map(([k, p]) => [k, p.label]);
  const fillSelect = (el, values, keep = true) => { el.insertAdjacentHTML(keep ? "beforeend" : "afterbegin", values.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")); };

  /* ---------- Umum: menu & format angka ---------- */
  const toggle = $(".nav-toggle"), nav = $("#nav");
  if (toggle && nav) toggle.addEventListener("click", () => { const open = nav.classList.toggle("open"); toggle.setAttribute("aria-expanded", String(open)); toggle.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu"); });
  document.addEventListener("focusout", (e) => {
    const el = e.target;
    if (el instanceof HTMLInputElement && el.inputMode === "numeric" && el.value.trim() !== "") el.value = fmtInt(int(el.value));
  });

  const page = document.body.dataset.page || "home";
  const params = new URLSearchParams(location.search);

  /* ---------- Beranda ---------- */
  if (page === "home") {
    const k = KOLS[0];
    $("#hero-card").innerHTML = ratecardHtml({ ...k, prices: estimate(k) }, { tag: "Contoh" });
    $("#niche-chips").innerHTML = Object.keys(NICHES).map((n) => `<a class="chip" href="./ranking?niche=${encodeURIComponent(n)}">${esc(n)}</a>`).join("");
  }

  /* ---------- Ranking ---------- */
  if (page === "ranking") {
    const q = $("#rk-q"), fp = $("#rk-platform"), fn = $("#rk-niche"), ft = $("#rk-tier"), fs = $("#rk-sort"), body = $("#rk-body");
    fillSelect(fp, platformOptions);
    fillSelect(fn, Object.keys(NICHES).map((n) => [n, n]));
    if (params.get("niche") && NICHES[params.get("niche")]) fn.value = params.get("niche");
    let shortlist = store.get("shortlist", []);
    const sorters = { followers: (a, b) => b.followers - a.followers, er: (a, b) => b.er - a.er, views: (a, b) => b.views - a.views, price: (a, b) => mainPrice(a) - mainPrice(b) };
    function render() {
      const term = q.value.trim().toLowerCase();
      const rows = KOLS.filter((k) => (!fp.value || k.platform === fp.value) && (!fn.value || k.niche === fn.value) && (!ft.value || tierOf(k.followers) === ft.value) && (!term || (k.name + " " + k.handle + " " + k.city).toLowerCase().includes(term))).sort(sorters[fs.value]);
      $("#rk-count").textContent = `${rows.length} dari ${KOLS.length} KOL ditampilkan`;
      $("#rk-shortlist-link").textContent = `Shortlist (${shortlist.length})`;
      body.innerHTML = rows.length ? rows.map((k, i) => {
        const on = shortlist.includes(k.handle), r = erRating(k.er);
        return `<tr><td class="num">${i + 1}</td><td><div class="who-cell"><span class="avatar sm" aria-hidden="true">${esc(initials(k.name))}</span><div><strong>${esc(k.name)}</strong><span>${esc(k.handle)} · ${esc(k.city)}</span></div></div></td><td>${PLATFORMS[k.platform].label}</td><td>${esc(k.niche)}</td><td><span class="badge">${tierOf(k.followers)}</span></td><td class="r num">${fmtC(k.followers)}</td><td class="r num">${fmtC(k.views)}</td><td class="r"><span class="badge ${r.cls}">${fmtPct(k.er)}</span></td><td class="r num">${fmtRp(mainPrice(k))}</td><td><button type="button" class="btn sm ${on ? "on" : "ghost"}" data-h="${esc(k.handle)}" aria-pressed="${on}">${on ? "✓ Di shortlist" : "+ Shortlist"}</button></td></tr>`;
      }).join("") : `<tr><td colspan="10" class="empty">Tidak ada KOL yang cocok. Longgarkan saringan atau hapus kata pencarian.</td></tr>`;
    }
    [q, fp, fn, ft, fs].forEach((el) => el.addEventListener("input", render));
    body.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-h]"); if (!b) return;
      const h = b.dataset.h;
      shortlist = shortlist.includes(h) ? shortlist.filter((x) => x !== h) : [...shortlist, h];
      store.set("shortlist", shortlist); render();
      toast(shortlist.includes(h) ? "Ditambahkan ke shortlist" : "Dihapus dari shortlist");
    });
    render();
  }

  /* ---------- Cek ER ---------- */
  if (page === "cek-er") {
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
  }

  /* ---------- Rate card ---------- */
  if (page === "rate-card") {
    const el = (id) => $("#rc-" + id);
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
    function renderPreview() { $("#rc-preview").innerHTML = ratecardHtml(data(), { printable: true }); }

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
    el("save").addEventListener("click", () => {
      const d = data();
      if (!d.name) { toast("Isi nama terlebih dahulu"); el("name").focus(); return; }
      const cards = store.get("ratecards", []);
      cards.unshift({ ...d, id: uid(), date: today() });
      toast(store.set("ratecards", cards.slice(0, 20)) ? "Tersimpan di dashboard" : "Browser menolak menyimpan data. Gunakan cetak atau salin.");
    });
    el("print").addEventListener("click", () => window.print());
    el("copy").addEventListener("click", () => {
      const d = data(), P = PLATFORMS[d.platform];
      const text = [`RATE CARD — ${d.name}${d.handle ? " (" + d.handle + ")" : ""}`, [P.label, d.niche, d.city].filter(Boolean).join(" · "), `Pengikut: ${fmtInt(d.followers)} | Rata-rata tayangan: ${fmtInt(d.views)} | ER: ${fmtPct(d.er)}`, "", ...d.prices.map((p) => `- ${p.label}: ${fmtRp(p.price)}`), "", d.contact ? `Kontak: ${d.contact}` : null, `Harga belum termasuk pajak dan berlaku 30 hari sejak ${today()}.`].filter((x) => x !== null).join("\n");
      copyText(text, "Rate card disalin");
    });
    renderPrices(); renderPreview();
  }

  /* ---------- MoU ---------- */
  if (page === "mou") {
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
  }

  /* ---------- Kamus ---------- */
  if (page === "kamus") {
    const q = $("#km-q"), terms = $$("#km-list .term");
    const run = () => {
      const t = q.value.trim().toLowerCase(); let n = 0;
      terms.forEach((el) => { const show = !t || el.dataset.k.includes(t); el.hidden = !show; if (show) n++; });
      $("#km-count").textContent = `${n} istilah`;
      $("#km-empty").hidden = n > 0;
    };
    q.addEventListener("input", run); run();
  }

  /* ---------- Dashboard ---------- */
  if (page === "dashboard") {
    const roleEl = $("#db-role");
    function setRole(r) {
      $$("button", roleEl).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.role === r)));
      $("#db-kol").hidden = r !== "kol"; $("#db-brand").hidden = r !== "brand"; store.set("role", r);
    }
    roleEl.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setRole(b.dataset.role); });

    // Rate card tersimpan
    const cardsEl = $("#db-cards");
    function renderCards() {
      const cards = store.get("ratecards", []);
      $("#db-cards-empty").hidden = cards.length > 0;
      cardsEl.innerHTML = cards.map((c) => `<div class="stack">${ratecardHtml(c, { date: c.date })}<div><button type="button" class="btn danger sm" data-del="${esc(c.id)}">Hapus rate card ini</button></div></div>`).join("");
    }
    cardsEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-del]"); if (!b) return;
      store.set("ratecards", store.get("ratecards", []).filter((c) => c.id !== b.dataset.del)); renderCards(); toast("Rate card dihapus");
    });

    // Shortlist
    const slEl = $("#db-shortlist");
    function renderShortlist() {
      const list = store.get("shortlist", []).map((h) => KOLS.find((k) => k.handle === h)).filter(Boolean);
      slEl.innerHTML = list.length ? list.map((k) => `<tr><td><div class="who-cell"><span class="avatar sm" aria-hidden="true">${esc(initials(k.name))}</span><div><strong>${esc(k.name)}</strong><span>${esc(k.handle)}</span></div></div></td><td>${PLATFORMS[k.platform].label}</td><td>${esc(k.niche)}</td><td class="r num">${fmtC(k.followers)}</td><td class="r num">${fmtPct(k.er)}</td><td class="r num">${fmtRp(mainPrice(k))}</td><td><button type="button" class="btn danger sm" data-rm="${esc(k.handle)}">Hapus</button></td></tr>`).join("") : `<tr><td colspan="7" class="empty">Shortlist masih kosong. Pilih kandidat di halaman <a href="./ranking">Ranking KOL</a>.</td></tr>`;
      $("#db-shortlist-total").textContent = fmtRp(list.reduce((s, k) => s + mainPrice(k), 0));
    }
    slEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-rm]"); if (!b) return;
      store.set("shortlist", store.get("shortlist", []).filter((h) => h !== b.dataset.rm)); renderShortlist();
    });

    // Laporan kampanye
    const SAMPLE = { budget: 15000000, posts: [
      { id: "c1", link: "Video ulasan produk (contoh)", platform: "TikTok", views: 182000, likes: 9400, comments: 520, shares: 760, saves: 430, contoh: true },
      { id: "c2", link: "Reels tutorial pemakaian (contoh)", platform: "Instagram", views: 74000, likes: 3100, comments: 210, shares: 180, saves: 640, contoh: true },
      { id: "c3", link: "Integrasi 60 detik (contoh)", platform: "YouTube", views: 41000, likes: 1900, comments: 160, shares: 45, saves: 0, contoh: true },
    ] };
    let camp = store.get("campaign", null) || JSON.parse(JSON.stringify(SAMPLE));
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
    const saveCamp = () => { store.set("campaign", camp); renderCamp(); };
    budgetEl.addEventListener("input", () => { camp.budget = int(budgetEl.value); saveCamp(); });
    $("#cp-body").addEventListener("click", (e) => { const b = e.target.closest("[data-post]"); if (!b) return; camp.posts = camp.posts.filter((p) => p.id !== b.dataset.post); saveCamp(); });
    $("#cp-clear").addEventListener("click", () => { camp = { budget: 0, posts: [] }; budgetEl.value = ""; saveCamp(); toast("Laporan dikosongkan"); });
    $("#cp-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const g = (id) => $("#cp-" + id), err = $("#cp-error");
      const post = { id: uid(), link: g("link").value.trim(), platform: g("platform").value, views: int(g("in-views").value), likes: int(g("in-likes").value), comments: int(g("in-comments").value), shares: int(g("in-shares").value), saves: int(g("in-saves").value) };
      const msg = !post.link ? "Isi tautan atau nama posting." : post.views <= 0 ? "Isi jumlah tayangan dengan angka lebih dari 0." : "";
      err.hidden = !msg; err.textContent = msg;
      if (msg) { (post.link ? g("in-views") : g("link")).focus(); return; }
      const pristine = store.get("campaign", null) === null;
      camp = { budget: pristine ? 0 : camp.budget, posts: [...camp.posts.filter((p) => !p.contoh), post] };
      if (pristine) budgetEl.value = "";
      saveCamp(); e.target.reset(); toast("Posting ditambahkan");
    });

    setRole(params.get("peran") === "brand" || store.get("role", "kol") === "brand" ? "brand" : "kol");
    renderCards(); renderShortlist(); renderCamp();
  }
})();
