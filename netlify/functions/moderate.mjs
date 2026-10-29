// Admin tools: remove anyone's comment, find AI films on YouTube now, or start the importer / showdown judge by hand.
// POST /api/moderate with the signed-in user's token. Body {action:"check"} answers whether this user is an admin;
// {action:"remove", owner:"<user id>", id:"<comment id>"} removes that comment and its replies; {action:"hide", id:"yt-…"} hides a film.
// Needs: ADMIN_EMAILS (comma-separated sign-in emails of the admins), SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (secret).
import importYoutube, { searchNow, addByLinks } from "./import-youtube.mjs";
import { BLOCK_RE } from "./lib/classify.mjs";
import { readAffiliates } from "./affiliates.mjs";
import showdown from "./showdown.mjs";
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function whoIs(req) {
  const tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!tok) return null;
  const r = await fetch(Netlify.env.get("SUPABASE_URL") + "/auth/v1/user", { headers: { apikey: Netlify.env.get("SUPABASE_ANON_KEY"), Authorization: "Bearer " + tok } });
  return r.ok ? r.json() : null;
}
const isAdmin = (u) => {
  const list = String(Netlify.env.get("ADMIN_EMAILS") || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return !!(u?.email && list.includes(String(u.email).toLowerCase()));
};

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const body = await req.json().catch(() => ({}));
  const u = await whoIs(req);
  const admin = isAdmin(u);
  if (body.action === "check") return json({ admin });
  if (!admin) return json({ error: "not allowed" }, 403);
  if (body.action === "search") return json(await searchNow(body.q).catch((e) => ({ error: String(e.message || e) })));
  if (body.action === "addurl") return json(await addByLinks(body.q).catch((e) => ({ error: String(e.message || e) })));
  if (body.action === "users") {
    // every sign-up, newest first, read with the secret key on the server (never sent to the page for anyone but admins)
    const key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY"), base = Netlify.env.get("SUPABASE_URL") + "/auth/v1/admin/users?per_page=1000&page=";
    const get = async (page, withAuth) => fetch(base + page, { headers: { apikey: key, ...(withAuth ? { Authorization: "Bearer " + key } : {}) } });
    const users = [];
    for (let page = 1; page <= 10; page++) {
      let r = await get(page, !key.startsWith("sb_secret_"));
      if (r.status === 401 || r.status === 403) r = await get(page, key.startsWith("sb_secret_"));
      if (!r.ok) return json({ error: "Supabase " + r.status }, 500);
      const d = await r.json(), list = d.users || [];
      for (const x of list) users.push({
        id: x.id, email: x.email || "", name: x.user_metadata?.full_name || x.user_metadata?.name || x.user_metadata?.user_name || "",
        avatar: x.user_metadata?.avatar_url || "", provider: x.app_metadata?.provider || "", created: x.created_at, last: x.last_sign_in_at || null,
      });
      if (list.length < 1000) break;
    }
    users.sort((a, b) => String(b.created).localeCompare(String(a.created)));
    // last activity per account: the newest save of anything it owns (each film watched updates its history, so this follows visits too)
    const h = { apikey: key };
    if (!key.startsWith("sb_secret_")) h.Authorization = "Bearer " + key;
    const active = {};
    for (let from = 0; from < 200000; from += 1000) {
      const r = await fetch(Netlify.env.get("SUPABASE_URL") + `/rest/v1/docs?select=owner,updated_at&order=updated_at.desc&offset=${from}&limit=1000`, { headers: h });
      if (!r.ok) break;
      const rows = await r.json();
      for (const x of rows) if (x.owner && (!active[x.owner] || x.updated_at > active[x.owner])) active[x.owner] = x.updated_at;
      if (rows.length < 1000) break;
    }
    for (const u of users) u.active = active[u.id] || null;
    return json({ users });
  }
  if (body.action === "activity") {
    // everything one account has saved, including its private watch history and Watch later (admins only, read with the secret key)
    const uid = String(body.uid || "");
    if (!/^[0-9a-f-]{36}$/i.test(uid)) return json({ error: "bad account id" }, 400);
    const key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY"), h = { apikey: key };
    if (!key.startsWith("sb_secret_")) h.Authorization = "Bearer " + key;
    const r = await fetch(Netlify.env.get("SUPABASE_URL") + `/rest/v1/docs?owner=eq.${uid}&select=col,id,data,updated_at&limit=1000`, { headers: h });
    if (!r.ok) return json({ error: "Supabase " + r.status }, 500);
    return json({ docs: await r.json() });
  }
  if (body.action === "umami") {
    // Umami Cloud statistics for the admin page. The API key stays on the server (setting UMAMI_API_KEY in Cloudflare).
    // Two ways in: an API key (Umami Pro), or the website's share link (free) — the same way Umami's own share page reads the numbers.
    const apiKey = Netlify.env.get("UMAMI_API_KEY");
    let site = Netlify.env.get("UMAMI_WEBSITE_ID") || "d8274143-7ceb-4717-aa02-13bfb95bfbf3", base, headers;
    if (apiKey) {
      base = (Netlify.env.get("UMAMI_API_URL") || "https://api.umami.is/v1") + "/websites/" + site;
      headers = { Accept: "application/json", Authorization: "Bearer " + apiKey, "x-umami-api-key": apiKey };
    } else {
      const share = String(Netlify.env.get("UMAMI_SHARE") || "gbzu2pDfQWfQ6LZ2").replace(/^.*\/share\//, "").split(/[/?#]/)[0];
      // Umami Cloud serves its API from another address than the dashboard: try the known ones and keep the one that answers
      // (EU accounts like Fanreelz's: gateway-eu.umami.is; US accounts: gateway.umami.is)
      const apis = [Netlify.env.get("UMAMI_API_URL"), "https://gateway-eu.umami.is/api", "https://gateway.umami.is/api", "https://api.umami.is/v1"].filter(Boolean);
      let sd = null, api = "", tried = [];
      for (const a of apis) {
        const sr = await fetch(a + "/share/" + encodeURIComponent(share), { headers: { Accept: "application/json" } }).catch(() => null);
        if (!sr || !sr.ok) { const why = sr ? (await sr.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 120) : ""; tried.push(a.replace(/^https:\/\//, "") + " " + (sr ? sr.status : "x") + (why && sr.status !== 404 ? " “" + why + "”" : "")); continue; }
        tried.push(a.replace(/^https:\/\//, "") + " " + sr.status);
        const j = await sr.json().catch(() => null);
        if (j?.token) { sd = j; api = a; break; }
      }
      if (!sd) return json({ error: "Umami share link not found (" + tried.join(", ") + ")" });
      site = sd.websiteId || site;
      base = api + "/websites/" + site;
      headers = { Accept: "application/json", "x-umami-share-token": sd.token, "x-umami-share-context": "1" };
    }
    let days = { "24h": 1, "7d": 7, "30d": 30, "90d": 90, "365d": 365 }[body.range] || 7;
    const endAt = Date.now();
    let startAt = endAt - days * 864e5;
    const get = async (path, q = {}) => {
      const u = new URL(base + path);
      for (const [k, v] of Object.entries(q)) u.searchParams.set(k, String(v));
      const r = await fetch(u, { headers });
      if (!r.ok) throw new Error("Umami " + r.status + " " + path);
      return r.json();
    };
    // All time: from the first visit Umami has ({startDate, endDate} from /daterange)
    if (body.range === "all") {
      const dr = await get("/daterange").catch(() => null);
      const first = Date.parse(dr?.startDate || dr?.mindate || "") || Date.parse("2026-10-01T00:00:00Z");
      startAt = Math.min(first, endAt - 864e5);days = Math.max(1, Math.ceil((endAt - startAt) / 864e5));
    }
    const prevStart = startAt - days * 864e5, tz = "Europe/Stockholm", unit = days <= 1 ? "hour" : days > 180 ? "month" : "day";
    const range = { startAt, endAt };
    // a number from either version of Umami ({value, prev} in v2, plain numbers in v3)
    const num = (x) => (x && typeof x === "object" ? +x.value || 0 : +x || 0);
    // optional filter for one country, device, browser or system ("which pages did visitors from Sweden open?")
    const flt = {};
    for (const [k, v] of Object.entries(body.filter || {})) {
      if (["country", "device", "browser", "os"].includes(k) && /^[\w .()-]{1,40}$/.test(String(v))) flt[k] = String(v);
      if (k === "query" && String(v).length <= 120 && !/[\s<>"]/.test(String(v))) flt.query = String(v);
    }
    const metric = async (types, limit = 10) => {
      for (const type of types) {
        try { const d = await get("/metrics", { ...range, type, limit, timezone: tz, ...flt }); if (Array.isArray(d)) return d.map((x) => ({ x: x.x ?? x.name ?? "", y: +x.y || +x.value || 0 })); } catch (e) {}
      }
      return [];
    };
    // "See all" for one list: just that metric, up to 1,000 rows
    const ONE = { queries: ["query"], pages: ["path", "url"], entries: ["entry"], referrers: ["referrer"], countries: ["country"], devices: ["device"], browsers: ["browser"], os: ["os"], events: ["event"] };
    if (body.metric && ONE[body.metric]) return json({ metric: body.metric, rows: await metric(ONE[body.metric], 1000), from: startAt });
    try {
      const [stats, prev, active, series, pages, referrers, countries, devices, browsers, os, events, entries] = await Promise.all([
        get("/stats", range),
        get("/stats", { startAt: prevStart, endAt: startAt }).catch(() => null),
        get("/active").catch(() => null),
        get("/pageviews", { ...range, unit, timezone: tz }).catch(() => null),
        metric(["path", "url"], 15), metric(["referrer"]), metric(["country"]), metric(["device"]), metric(["browser"]), metric(["os"]), metric(["event"]), metric(["entry"]),
      ]);
      const pick = (o) => ({ pageviews: num(o?.pageviews), visitors: num(o?.visitors), visits: num(o?.visits), bounces: num(o?.bounces), totaltime: num(o?.totaltime) });
      const pts = (a) => (Array.isArray(a) ? a.map((p) => ({ t: p.x ?? p.t, n: +p.y || 0 })) : []);
      return json({
        range: body.range || "7d", unit, site, from: startAt,
        stats: pick(stats), prev: stats?.comparison ? pick(stats.comparison) : prev ? pick(prev) : null,
        active: num(active?.visitors ?? active?.x ?? (Array.isArray(active) ? active[0]?.x : active)),
        series: { pageviews: pts(series?.pageviews), visitors: pts(series?.sessions ?? series?.visitors) },
        pages, referrers, countries, devices, browsers, os, events, entries,
      });
    } catch (e) {
      return json({ error: String(e.message || e) });
    }
  }
  if (body.action === "views") {
    // Fanreelz's own view counts (table film_views), only for admins
    const key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY"), h = { apikey: key };
    if (!key.startsWith("sb_secret_")) h.Authorization = "Bearer " + key;
    const views = {};
    for (let from = 0; from < 500000; from += 1000) {
      const r = await fetch(Netlify.env.get("SUPABASE_URL") + `/rest/v1/film_views?select=id,n&order=id&offset=${from}&limit=1000`, { headers: h });
      if (!r.ok) return json({ error: "Supabase " + r.status }, 500);
      const rows = await r.json();
      for (const x of rows) views[x.id] = +x.n || 0;
      if (rows.length < 1000) break;
    }
    return json({ views });
  }
  if (body.action === "run") {
    const job = { "import-youtube": importYoutube, showdown }[body.job];
    if (!job) return json({ error: "unknown job" }, 400);
    const r = await job(req);
    return new Response(r.body, { status: r.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
  if (body.action === "sdremove") {
    // removes the written reason of one Character Showdown vote (the vote itself stays)
    const key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY"), h = { apikey: key, "Content-Type": "application/json" };
    if (!key.startsWith("sb_secret_")) h.Authorization = "Bearer " + key;
    const url = Netlify.env.get("SUPABASE_URL") + `/rest/v1/docs?col=eq.showdown&id=eq.${encodeURIComponent(body.owner || "")}`;
    const rows = await (await fetch(url + "&select=data", { headers: h })).json();
    const data = rows?.[0]?.data;const v = data?.a?.[body.key];
    if (!v) return json({ ok: true, removed: 0 });
    v.x = "";
    const r = await fetch(url, { method: "PATCH", headers: h, body: JSON.stringify({ data, updated_at: new Date().toISOString() }) });
    return r.ok ? json({ ok: true, removed: 1 }) : json({ error: "save failed " + r.status }, 500);
  }
  if (body.action === "searches") {
    // what visitors search for: most searched, searches with no results, and the latest
    const key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY"), h = { apikey: key };
    if (!key.startsWith("sb_secret_")) h.Authorization = "Bearer " + key;
    const base = Netlify.env.get("SUPABASE_URL") + "/rest/v1/search_log?select=q,n,zero,last_at";
    const get = async (q) => { const r = await fetch(base + q, { headers: h }); if (!r.ok) throw new Error("Supabase " + r.status + (r.status === 404 ? " (run the search_log SQL first)" : "")); return r.json(); };
    try {
      const [top, missing, recent] = await Promise.all([get("&order=n.desc&limit=200"), get("&zero=gt.0&order=zero.desc&limit=100"), get("&order=last_at.desc&limit=50")]);
      // single searches with country, device and time (table added later: missing is fine)
      const ev = await fetch(Netlify.env.get("SUPABASE_URL") + "/rest/v1/search_events?select=q,cc,device,zero,at&order=at.desc&limit=200", { headers: h }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      return json({ top, missing, recent, events: ev });
    } catch (e) { return json({ error: String(e.message || e) }); }
  }
  if (body.action === "affget") return json({ list: await readAffiliates().catch(() => []) });
  if (body.action === "affset") {
    // affiliate links: where each shows (a category, an AI tool named in the title, or any film), its text and its link
    const list = (Array.isArray(body.list) ? body.list : []).slice(0, 200).map((x) => ({
      target: String(x?.target || ""), label: String(x?.label || "").trim().slice(0, 60), url: String(x?.url || "").trim().slice(0, 600),
    })).filter((x) => /^(cat:[\w-]{1,40}|tool:[a-z0-9]{1,20}|all)$/.test(x.target) && x.label && /^https:\/\/[^\s"'<>]+$/.test(x.url));
    const key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY"), h = { apikey: key, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" };
    if (!key.startsWith("sb_secret_")) h.Authorization = "Bearer " + key;
    const r = await fetch(Netlify.env.get("SUPABASE_URL") + "/rest/v1/import_state", { method: "POST", headers: h, body: JSON.stringify([{ key: "affiliates", value: { list, at: new Date().toISOString() } }]) });
    return r.ok ? json({ ok: true, list }) : json({ error: "save failed " + r.status }, 500);
  }
  if (body.action === "hidechannel" || body.action === "cleanup") {
    const key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY"), base = Netlify.env.get("SUPABASE_URL") + "/rest/v1/";
    const h = { apikey: key, "Content-Type": "application/json", Prefer: "return=minimal" };
    if (!key.startsWith("sb_secret_")) h.Authorization = "Bearer " + key;
    if (body.action === "hidechannel") {
      // hide every film from one channel and stop reading that channel
      const ch = String(body.channel || "").slice(0, 200);
      if (!ch) return json({ error: "no channel" }, 400);
      const r = await fetch(base + "catalog?channel=eq." + encodeURIComponent(ch), { method: "PATCH", headers: { ...h, Prefer: "return=representation" }, body: JSON.stringify({ hidden: true }) });
      if (!r.ok) return json({ error: "save failed " + r.status }, 500);
      const n = (await r.json().catch(() => [])).length;
      await fetch(base + "catalog_channels?title=eq." + encodeURIComponent(ch), { method: "PATCH", headers: h, body: JSON.stringify({ status: "skipped", next_page: null }) });
      return json({ ok: true, hidden: n });
    }
    // cleanup: hide catalogue films whose titles the current filters would now reject (gameplay, voice changers, trolling…)
    const bad = [];
    for (let from = 0; from < 300000; from += 1000) {
      const r = await fetch(base + `catalog?select=id,title&hidden=eq.false&order=id&offset=${from}&limit=1000`, { headers: h });
      if (!r.ok) return json({ error: "Supabase " + r.status }, 500);
      const rows = await r.json();
      for (const x of rows) if (BLOCK_RE.test(x.title || "")) bad.push(x.id);
      if (rows.length < 1000) break;
    }
    for (let i = 0; i < bad.length; i += 300) {
      const ids = bad.slice(i, i + 300).map((x) => '"' + x.replace(/"/g, "") + '"').join(",");
      await fetch(base + "catalog?id=in.(" + encodeURIComponent(ids) + ")", { method: "PATCH", headers: h, body: JSON.stringify({ hidden: true }) });
    }
    return json({ ok: true, hidden: bad.length });
  }
  if (body.action === "hide") {
    if (!/^yt-[\w-]{6,20}$/.test(String(body.id || ""))) return json({ error: "bad film id" }, 400);
    const key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY"), h = { apikey: key, "Content-Type": "application/json", Prefer: "return=minimal" };
    if (!key.startsWith("sb_secret_")) h.Authorization = "Bearer " + key;
    const r = await fetch(Netlify.env.get("SUPABASE_URL") + "/rest/v1/catalog?id=eq." + encodeURIComponent(body.id), { method: "PATCH", headers: h, body: JSON.stringify({ hidden: true }) });
    return r.ok ? json({ ok: true }) : json({ error: "save failed " + r.status }, 500);
  }
  if (body.action !== "remove" || !body.owner || !body.id) return json({ error: "bad request" }, 400);

  const url = Netlify.env.get("SUPABASE_URL") + "/rest/v1/docs", key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const h = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_secret_")) h.Authorization = "Bearer " + key;
  const where = `?col=eq.comments&id=eq.${encodeURIComponent(body.owner)}`;
  const rows = await (await fetch(url + where + "&select=data", { headers: h })).json();
  const items = Array.isArray(rows?.[0]?.data?.items) ? rows[0].data.items : [];
  const id = String(body.id);
  const next = items.filter((c) => String(c?.id) !== id && String(c?.parent || "") !== id);
  if (next.length === items.length) return json({ ok: true, removed: 0 });
  const r = await fetch(url + where, { method: "PATCH", headers: h, body: JSON.stringify({ data: { ...rows[0].data, items: next }, updated_at: new Date().toISOString() }) });
  if (!r.ok) return json({ error: "save failed " + r.status }, 500);
  return json({ ok: true, removed: items.length - next.length });
};
export const config = { path: "/api/moderate" };
