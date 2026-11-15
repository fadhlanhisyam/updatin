// Updatin — Supabase Edge Function "kol-data"
// Mengambil data profil asli dari tautan TikTok, Instagram, atau YouTube lalu menghitung rata-rata dan ER.
//
// Sumber data:
//   YouTube   : YouTube Data API v3 resmi            -> secret YOUTUBE_API_KEY
//   Instagram : Apify, apify/instagram-profile-scraper -> secret APIFY_TOKEN
//   TikTok    : Apify, clockworks/tiktok-profile-scraper -> secret APIFY_TOKEN
//
// Hanya pelanggan dan admin yang bisa memanggil. Hasil disimpan 24 jam (profile_cache)
// dan setiap pengambilan baru dicatat (lookup_log) untuk membatasi pemakaian harian.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const CACHE_HOURS = 24;
const DAILY_LIMIT = { member: 15, admin: 300 };
const LABEL = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };

class Fail extends Error {
  status;
  code;
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

// ---------- Tautan profil ----------
function parseProfile(input) {
  let s = String(input || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");
  let u;
  try { u = new URL(s); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const parts = u.pathname.split("/").filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  if (host === "tiktok.com") {
    const p = parts.find((x) => x.startsWith("@"));
    const h = p ? p.slice(1) : "";
    return /^[\w.]{2,24}$/.test(h) ? { platform: "tiktok", handle: h, url: `https://www.tiktok.com/@${h}` } : null;
  }
  if (host === "instagram.com") {
    const h = parts[0] || "";
    if (["p", "reel", "reels", "explore", "stories", "tv", "accounts", "direct"].includes(h.toLowerCase())) return null;
    return /^[\w.]{1,30}$/.test(h) ? { platform: "instagram", handle: h, url: `https://www.instagram.com/${h}/` } : null;
  }
  if (host === "youtube.com") {
    if (parts[0] && parts[0].startsWith("@") && parts[0].length > 1 && parts[0].length <= 61) {
      const h = parts[0].slice(1);
      return { platform: "youtube", handle: h, url: `https://www.youtube.com/@${h}` };
    }
    if (parts[0] === "channel" && /^UC[\w-]{22}$/.test(parts[1] || "")) {
      return { platform: "youtube", handle: parts[1], channelId: parts[1], url: `https://www.youtube.com/channel/${parts[1]}` };
    }
  }
  return null;
}

// ---------- Hitungan ----------
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; };
const avg = (list) => { const v = list.filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const r0 = (v) => (v === null ? null : Math.round(v));
const r2 = (v) => (v === null ? null : Math.round(v * 100) / 100);

function summarize({ platform, handle, name, verified, followers, totalPosts, posts, url, source }) {
  const a = {
    views: avg(posts.map((p) => num(p.views))),
    likes: avg(posts.map((p) => num(p.likes))),
    comments: avg(posts.map((p) => num(p.comments))),
    shares: avg(posts.map((p) => num(p.shares))),
    saves: avg(posts.map((p) => num(p.saves))),
  };
  const interactions = (a.likes || 0) + (a.comments || 0) + (a.shares || 0) + (a.saves || 0);
  const f = num(followers);
  return {
    platform, handle, name: name || handle, verified: !!verified,
    followers: f, total_posts: num(totalPosts), sample: posts.length,
    avg_views: r0(a.views), avg_likes: r0(a.likes), avg_comments: r0(a.comments), avg_shares: r0(a.shares), avg_saves: r0(a.saves),
    er: f && posts.length ? r2((interactions / f) * 100) : null,
    er_views: a.views ? r2((interactions / a.views) * 100) : null,
    url, source, fetched_at: new Date().toISOString(),
  };
}

// ---------- Sumber data ----------
async function apify(actor, input, token, maxUsd) {
  const qs = `token=${encodeURIComponent(token)}&timeout=120&maxTotalChargeUsd=${maxUsd}`;
  const r = await fetch(`https://api.apify.com/v2/actors/${actor}/run-sync-get-dataset-items?${qs}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  if (r.status === 408) throw new Fail(504, "timeout", "Sumber data terlalu lama merespons. Coba lagi beberapa saat lagi.");
  if (r.status === 401) throw new Fail(503, "provider_auth", "Token Apify ditolak. Admin perlu memeriksa secret APIFY_TOKEN.");
  if (r.status === 402 || r.status === 403) throw new Fail(503, "provider_quota", "Kuota sumber data bulan ini habis atau akses ditolak.");
  if (!r.ok) throw new Fail(502, "provider_error", `Sumber data mengembalikan galat (${r.status}).`);
  const items = await r.json();
  return Array.isArray(items) ? items : [];
}

async function fetchTikTok(ref, token) {
  const items = await apify("clockworks~tiktok-profile-scraper", { profiles: [ref.handle], resultsPerPage: 10, profileSorting: "latest", excludePinnedPosts: true }, token, 0.06);
  const vids = items.filter((i) => i && i.authorMeta && !i.error && !i.errorCode);
  if (!vids.length) {
    const code = (items.find((i) => i && i.errorCode) || {}).errorCode;
    if (code === "PROFILE_PRIVATE") throw new Fail(422, "private", "Akun TikTok ini privat, datanya tidak bisa diambil.");
    if (code === "PROFILE_EMPTY") throw new Fail(422, "empty", "Akun TikTok ini belum memiliki video publik.");
    throw new Fail(404, "not_found", "Akun TikTok tidak ditemukan. Periksa kembali tautannya.");
  }
  const m = vids[0].authorMeta;
  const handle = m.name || ref.handle;
  return summarize({
    platform: "tiktok", handle, name: m.nickName || handle, verified: m.verified, followers: m.fans, totalPosts: m.video,
    posts: vids.map((v) => ({ views: v.playCount, likes: v.diggCount, comments: v.commentCount, shares: v.shareCount, saves: v.collectCount })),
    url: `https://www.tiktok.com/@${handle}`, source: "Apify · TikTok Profile Scraper",
  });
}

async function fetchInstagram(ref, token) {
  const items = await apify("apify~instagram-profile-scraper", { usernames: [ref.handle] }, token, 0.02);
  const p = items.find((i) => i && i.username && !i.error);
  if (!p) throw new Fail(404, "not_found", "Akun Instagram tidak ditemukan. Periksa kembali tautannya.");
  if (p.private) throw new Fail(422, "private", "Akun Instagram ini privat, datanya tidak bisa diambil.");
  const posts = (Array.isArray(p.latestPosts) ? p.latestPosts : []).filter((x) => x && !x.isPinned);
  return summarize({
    platform: "instagram", handle: p.username, name: p.fullName || p.username, verified: p.verified, followers: p.followersCount, totalPosts: p.postsCount,
    // likesCount bernilai negatif bila pemilik akun menyembunyikan jumlah suka
    posts: posts.map((x) => ({ views: x.videoViewCount ?? x.videoPlayCount, likes: x.likesCount, comments: x.commentsCount })),
    url: `https://www.instagram.com/${p.username}/`, source: "Apify · Instagram Profile Scraper",
  });
}

async function fetchYouTube(ref, key) {
  const call = async (path) => {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${encodeURIComponent(key)}`);
    if (r.status === 404) return { items: [] };
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      const reason = (((e.error || {}).errors || [])[0] || {}).reason || "";
      if (r.status === 403 && /quota/i.test(reason)) throw new Fail(503, "provider_quota", "Kuota harian YouTube API habis. Coba lagi besok.");
      if (r.status === 400 || r.status === 403) throw new Fail(503, "provider_auth", "Kunci YouTube API ditolak. Admin perlu memeriksa secret YOUTUBE_API_KEY.");
      throw new Fail(502, "provider_error", `YouTube API mengembalikan galat (${r.status}).`);
    }
    return r.json();
  };
  const sel = ref.channelId ? `id=${encodeURIComponent(ref.channelId)}` : `forHandle=${encodeURIComponent("@" + ref.handle)}`;
  const ch = ((await call(`channels?part=snippet,statistics,contentDetails&${sel}`)).items || [])[0];
  if (!ch) throw new Fail(404, "not_found", "Kanal YouTube tidak ditemukan. Gunakan tautan berbentuk youtube.com/@namakanal.");
  const uploads = ((ch.contentDetails || {}).relatedPlaylists || {}).uploads;
  const list = uploads ? (await call(`playlistItems?part=contentDetails&maxResults=12&playlistId=${encodeURIComponent(uploads)}`)).items || [] : [];
  const ids = list.map((i) => (i.contentDetails || {}).videoId).filter(Boolean);
  const vids = ids.length ? (await call(`videos?part=statistics&id=${ids.join(",")}`)).items || [] : [];
  const st = ch.statistics || {};
  const handle = String((ch.snippet || {}).customUrl || "@" + ref.handle).replace(/^@/, "");
  return summarize({
    platform: "youtube", handle, name: (ch.snippet || {}).title || handle, verified: false,
    followers: st.hiddenSubscriberCount ? null : st.subscriberCount, totalPosts: st.videoCount,
    posts: vids.map((v) => ({ views: (v.statistics || {}).viewCount, likes: (v.statistics || {}).likeCount, comments: (v.statistics || {}).commentCount })),
    url: `https://www.youtube.com/@${handle}`, source: "YouTube Data API",
  });
}

// ---------- Handler ----------
async function handle(req, env) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ code: "method", message: "Gunakan POST." }, 405);
  try {
    const SB = env("SUPABASE_URL"), SERVICE = env("SUPABASE_SERVICE_ROLE_KEY");
    const apikey = req.headers.get("apikey") || env("SUPABASE_ANON_KEY");
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!SB || !SERVICE) throw new Fail(500, "server_config", "Fungsi belum dikonfigurasi (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
    if (!token) throw new Fail(401, "unauthorized", "Masuk terlebih dahulu.");

    // Siapa pemanggilnya, dan apakah punya akses
    const asUser = { apikey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const who = await fetch(`${SB}/auth/v1/user`, { headers: asUser });
    if (!who.ok) throw new Fail(401, "unauthorized", "Sesi tidak berlaku. Masuk kembali.");
    const user = await who.json();
    const rpc = async (fn) => { const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", headers: asUser, body: "{}" }); return r.ok && (await r.json()) === true; };
    const [access, admin] = await Promise.all([rpc("has_access"), rpc("is_admin")]);
    if (!access) throw new Fail(403, "forbidden", "Fitur ini untuk pelanggan dengan langganan aktif.");

    const svc = (path, init = {}) => fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(init.headers || {}) } });
    const rows = async (path) => { const r = await svc(path); if (!r.ok) throw new Fail(500, "db_error", `Database menolak permintaan (${r.status}).`); return r.json(); };

    const body = await req.json().catch(() => ({}));
    const wantSave = !!body.save || !!body.kol_id;
    if (wantSave && !admin) throw new Fail(403, "forbidden", "Hanya admin yang bisa menyimpan KOL.");

    let existing = null, link = body.url;
    if (body.kol_id) {
      existing = (await rows(`kols?id=eq.${encodeURIComponent(body.kol_id)}&select=*`))[0];
      if (!existing) throw new Fail(404, "not_found", "KOL tidak ditemukan.");
      link = existing.source_url || link;
    }
    const ref = parseProfile(link);
    if (!ref) throw new Fail(400, "bad_url", "Tautan tidak dikenali. Contoh: tiktok.com/@namaakun, instagram.com/namaakun, atau youtube.com/@namakanal.");
    const key = ref.handle.toLowerCase();

    // Cache
    let data = null, cached = false;
    const hit = (await rows(`profile_cache?platform=eq.${ref.platform}&handle=eq.${encodeURIComponent(key)}&select=data,fetched_at`))[0];
    const fresh = hit && Date.now() - new Date(hit.fetched_at).getTime() < CACHE_HOURS * 3600 * 1000;
    if (fresh && !(admin && body.force)) { data = hit.data; cached = true; }

    if (!data) {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const used = (await rows(`lookup_log?user_id=eq.${user.id}&created_at=gte.${encodeURIComponent(since)}&select=id&limit=400`)).length;
      const limit = admin ? DAILY_LIMIT.admin : DAILY_LIMIT.member;
      if (used >= limit) throw new Fail(429, "rate_limited", `Batas ${limit} pengambilan data per 24 jam sudah tercapai. Coba lagi besok.`);

      const secret = ref.platform === "youtube" ? env("YOUTUBE_API_KEY") : env("APIFY_TOKEN");
      if (!secret) throw new Fail(503, "not_configured", `Pengambilan data ${LABEL[ref.platform]} otomatis belum diaktifkan admin.`);
      await svc("lookup_log", { method: "POST", body: JSON.stringify({ user_id: user.id, platform: ref.platform, handle: key }) });
      data = ref.platform === "youtube" ? await fetchYouTube(ref, secret) : ref.platform === "instagram" ? await fetchInstagram(ref, secret) : await fetchTikTok(ref, secret);
      await svc("profile_cache?on_conflict=platform,handle", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ platform: ref.platform, handle: key, data, fetched_at: data.fetched_at }),
      });
    }

    let kol = null;
    if (wantSave) {
      if (!existing) {
        const all = await rows(`kols?platform=eq.${ref.platform}&select=id,handle,niche,city`);
        existing = all.find((k) => String(k.handle).replace(/^@/, "").toLowerCase() === String(data.handle).toLowerCase()) || null;
      }
      const row = {
        name: data.name, handle: "@" + data.handle, platform: data.platform,
        niche: String(body.niche || (existing && existing.niche) || "").trim(),
        city: String(body.city ?? (existing && existing.city) ?? "").trim(),
        followers: data.followers || 0, views: data.avg_views || 0, er: Math.min(data.er || 0, 999.99),
        source_url: data.url, fetched_at: data.fetched_at, stats: data,
      };
      if (!row.niche) throw new Fail(400, "bad_input", "Pilih niche untuk KOL ini.");
      const r = existing
        ? await svc(`kols?id=eq.${existing.id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) })
        : await svc("kols", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
      if (!r.ok) throw new Fail(500, "db_error", `Gagal menyimpan KOL (${r.status}).`);
      kol = (await r.json())[0] || null;
    }
    return json({ ...data, cached, kol, updated: !!(wantSave && existing) });
  } catch (e) {
    if (e instanceof Fail) return json({ code: e.code, message: e.message }, e.status);
    console.error(e);
    return json({ code: "error", message: "Terjadi kesalahan di server." }, 500);
  }
}

Deno.serve((req) => handle(req, (k) => Deno.env.get(k) || ""));
