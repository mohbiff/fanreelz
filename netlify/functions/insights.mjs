// Creator Insights (Fanreelz Plus): what fans look for on Fanreelz, counted together, never who.
// POST /api/insights with the signed-in user's token → {plus, wanted, trending, top, countries, worlds, at}.
// Plus members (import_state "plus": {ids:[…]}) and admins get everything; others get the first rows only, as a preview.
// Admins give or take Plus with {action:"plusset", uid, on} and list members with {action:"plusget"}.
import { whoIs, isAdmin } from "./moderate.mjs";
import CATS from "./lib/catmap.mjs";

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const sb = () => {
  const key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY"), h = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_secret_")) h.Authorization = "Bearer " + key;
  return { url: Netlify.env.get("SUPABASE_URL") + "/rest/v1/", h };
};
export async function plusIds() {
  const { url, h } = sb();
  const r = await fetch(url + "import_state?key=eq.plus&select=value", { headers: h });
  return r.ok ? (await r.json().catch(() => []))?.[0]?.value?.ids || [] : [];
}
async function savePlus(ids) {
  const { url, h } = sb();
  const r = await fetch(url + "import_state", { method: "POST", headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ key: "plus", value: { ids, at: new Date().toISOString() } }]) });
  return r.ok;
}

// which world a search is about ("arthas" → Warcraft III), from the category names and their characters
const WORLD = CATS.flatMap((c) => [c.name, ...(c.chars || [])].filter((k) => k && k.length >= 3).map((k) => [k.toLowerCase(), c]));
const worldOf = (q) => WORLD.find(([k]) => q.includes(k) || (q.length >= 4 && k.includes(q)))?.[1] || null;

// Normalize spelling/punctuation and group obvious typo variants so one topic does not appear many times.
const cleanQ = (q) => String(q || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const editDistance = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
};
const sameTopic = (a, b) => {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  if (a.split(" ").length !== b.split(" ").length) return false;
  const longest = Math.max(a.length, b.length), d = editDistance(a, b);
  return d <= Math.max(1, Math.floor(longest * 0.20));
};

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const body = await req.json().catch(() => ({}));
  const u = await whoIs(req), admin = isAdmin(u);
  if (body.action === "plusget" || body.action === "plusset") {
    if (!admin) return json({ error: "admins only" }, 403);
    let ids = await plusIds();
    if (body.action === "plusset") {
      const uid = String(body.uid || "");
      if (!/^[0-9a-f-]{36}$/i.test(uid)) return json({ error: "bad account id" }, 400);
      ids = body.on ? [...new Set([...ids, uid])] : ids.filter((x) => x !== uid);
      if (!(await savePlus(ids))) return json({ error: "save failed" }, 500);
    }
    return json({ ids });
  }
  const plus = admin || (!!u?.id && (await plusIds()).includes(u.id));

  // the last 30 days of searches (one row each: words, country, device, whether anything was found)
  const { url, h } = sb(), since = new Date(Date.now() - 30 * 864e5).toISOString();
  const rows = [];
  for (let from = 0; from < 20000; from += 1000) {
    const r = await fetch(url + `search_events?select=q,cc,zero,at&at=gte.${since}&order=at.desc&offset=${from}&limit=1000`, { headers: h });
    if (!r.ok) return json({ error: "Supabase " + r.status });
    const page = await r.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  const now = Date.now(), wk = 7 * 864e5;
  const rawAgg = {};
  for (const x of rows) {
    const q = cleanQ(x.q);
    if (q.length < 2) continue;
    const a = (rawAgg[q] ||= { q, n: 0, zero: 0, w: 0, pw: 0, cc: {} });
    const age = now - Date.parse(x.at);
    a.n++; if (x.zero) a.zero++;
    if (age < wk) a.w++; else if (age < 2 * wk) a.pw++;
    if (x.cc) a.cc[x.cc] = (a.cc[x.cc] || 0) + 1;
  }

  // Most common spelling wins; for equal counts prefer the fuller spelling ("harry styles" over "hary styls").
  const aliases = {}, merged = [];
  const variants = Object.values(rawAgg).sort((a, b) => b.n - a.n || b.q.length - a.q.length || a.q.localeCompare(b.q));
  for (const a of variants) {
    let m = merged.find((x) => sameTopic(x.q, a.q));
    if (!m) { m = { q: a.q, n: 0, zero: 0, w: 0, pw: 0, cc: {} }; merged.push(m); }
    aliases[a.q] = m.q;
    m.n += a.n; m.zero += a.zero; m.w += a.w; m.pw += a.pw;
    for (const [c, n] of Object.entries(a.cc)) m.cc[c] = (m.cc[c] || 0) + n;
  }
  const all = merged;
  const topCc = (a) => Object.entries(a.cc).sort((p, q) => q[1] - p[1]).slice(0, 3).map(([c]) => c);
  const row = (a) => ({ q: a.q, n: a.n, zero: a.zero, w: a.w, pw: a.pw, cc: topCc(a), world: worldOf(a.q)?.name || null });
  // Keep adult/sexual search terms out of Wanted for regular users; admins can still review the full data.
  const adultTerms = /\b(?:strip(?:ping)?|sex(?:ual|ually)?|porn(?:ography)?|xxx|nude|nudity|naked|hentai|erotic|blow ?job|hand ?job|escort|fetish|bdsm|onlyfans|topless)\b/i;
  const isAdultQuery = (q) => adultTerms.test(String(q || ""));
  // wanted: fans searched, Fanreelz had little or nothing (at least half the searches found nothing)
  const wantedAll = all.filter((a) => a.zero > 0 && a.zero * 2 >= a.n).sort((a, b) => b.zero - a.zero || b.n - a.n).slice(0, 50).map(row);
  const wanted = admin ? wantedAll : wantedAll.filter((a) => !isAdultQuery(a.q));
  // trending: more searches this week than the week before
  const trending = all.filter((a) => a.w >= 2 && a.w > a.pw).sort((a, b) => (b.w - b.pw) - (a.w - a.pw) || b.w - a.w).slice(0, 30).map(row);
  const top = all.sort((a, b) => b.n - a.n).slice(0, 30).map(row);
  // per country: use the same canonical topic names, so typo variants are combined here too
  const byCc = {};
  for (const x of rows) if (x.cc) {
    const raw = cleanQ(x.q); if (raw.length < 2) continue;
    const q = aliases[raw] || raw;
    ((byCc[x.cc] ||= { cc: x.cc, n: 0, q: {} }).q[q] = (byCc[x.cc].q[q] || 0) + 1); byCc[x.cc].n++;
  }
  const countries = Object.values(byCc).sort((a, b) => b.n - a.n).slice(0, 12).map((c) => ({ cc: c.cc, n: c.n, top: Object.entries(c.q).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([q, n]) => ({ q, n })) }));
  // worlds: searches per game/series/anime, this week against last week
  const wd = {};
  for (const a of all) { const c = worldOf(a.q); if (!c) continue; const w = (wd[c.id] ||= { id: c.id, name: c.name, w: 0, pw: 0, n: 0 }); w.w += a.w; w.pw += a.pw; w.n += a.n; }
  const worlds = Object.values(wd).sort((a, b) => b.w - a.w || b.n - a.n).slice(0, 25);
  const total = rows.length;
  // a preview for everyone else: the first rows, the rest are counted but not shown
  const cut = (l, k) => (plus ? l : l.slice(0, k));
  return json({
    plus, total, at: new Date().toISOString(),
    wanted: plus ? wanted : [], trending: plus ? trending : [], top: admin ? top : [], countries: plus ? countries : [], admin, worlds: plus ? worlds : [],
    hidden: plus ? null : { wanted: 0, trending: 0, top: 0, countries: 0, worlds: 0 },
  });
};
export const config = { path: "/api/insights" };
