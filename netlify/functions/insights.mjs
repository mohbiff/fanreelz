// Creator Insights (Fanreelz Plus): what fans look for on Fanreelz, counted together, never who.
// POST /api/insights with the signed-in user's token → {plus, wanted, trending, top, countries, worlds, at}.
// Plus members receive ranked topics; counts remain admin-only. Visitors receive no detailed data.
// Admins give or take Plus with {action:"plusset", uid, on} and list members with {action:"plusget"}.
import { whoIs, isAdmin } from "./moderate.mjs";
import { growthAction, growthData } from "./lib/growth.mjs";
import CATS from "./lib/catmap.mjs";
import { categoryForSearch } from "./lib/search-categories.mjs";

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

const worldOf = q => CATS.find(c => c.name === q) || null;
const cleanQ = q => String(q || "");
const sameTopic = (a,b) => a === b;
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
  if (body.action?.startsWith("growth")) {
    if (!plus || !u?.id) return json({error:"Plus membership required"},403);
    return growthAction(body,u,admin,sb());
  }
  if (!plus) return json({plus:false,admin:false});

  const { url, h } = sb(), since = new Date(Date.now() - 30 * 864e5).toISOString();
  const rows = []; let scanned = 0;
  for (let from = 0; from < 20000; from += 1000) {
    const r = await fetch(url + `search_events?select=q,cc,zero,at&at=gte.${since}&order=at.desc&offset=${from}&limit=1000`, { headers: h });
    if (!r.ok) return json({ error: "Supabase " + r.status });
    const page = await r.json(); scanned += page.length;
    rows.push(...page.flatMap(x => { const category = categoryForSearch(x.q); return category ? [{...x, q: category.name}] : []; }));
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

  const aliases = {}, merged = [];
  const variants = Object.values(rawAgg).sort((a, b) => b.n - a.n || b.q.length - a.q.length || a.q.localeCompare(b.q));
  for (const a of variants) {
    let m = merged.find((x) => sameTopic(x.q, a.q));
    if (!m) { m = { q: a.q, n: 0, zero: 0, w: 0, pw: 0, cc: {} }; merged.push(m); }
    aliases[a.q] = m.q;
    m.n += a.n; m.zero += a.zero; m.w += a.w; m.pw += a.pw;
    for (const [c, n] of Object.entries(a.cc)) m.cc[c] = (m.cc[c] || 0) + n;
  }
  // Creator Insights exposes category aggregates to every role. Raw phrases remain in the separate admin moderation tools.
  const all = merged;
  const topCc = (a) => Object.entries(a.cc).sort((p, q) => q[1] - p[1]).slice(0, 3).map(([c]) => c);
  const row = (a) => ({ q: a.q, n: a.n, zero: a.zero, w: a.w, pw: a.pw, cc: topCc(a), world: worldOf(a.q)?.name || null });

  const wanted = all.filter((a) => a.zero > 0 && a.zero * 2 >= a.n).sort((a, b) => b.zero - a.zero || b.n - a.n).slice(0, 50).map(row);
  const trending = all.filter((a) => a.w >= 2 && a.w > a.pw).sort((a, b) => (b.w - b.pw) - (a.w - a.pw) || b.w - a.w).slice(0, 30).map(row);
  const top = all.slice().sort((a, b) => b.n - a.n).slice(0, 30).map(row);

  const byCc = {};
  for (const x of rows) if (x.cc) {
    const raw = cleanQ(x.q); if (raw.length < 2) continue;
    const q = aliases[raw] || raw;
    ((byCc[x.cc] ||= { cc: x.cc, n: 0, q: {} }).q[q] = (byCc[x.cc].q[q] || 0) + 1); byCc[x.cc].n++;
  }
  const countries = Object.values(byCc).sort((a, b) => b.n - a.n).slice(0, 12).map((c) => ({ cc: c.cc, n: c.n, top: Object.entries(c.q).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([q, n]) => ({ q, n })) }));

  const wd = {};
  for (const a of all) { const c = worldOf(a.q); if (!c) continue; const w = (wd[c.id] ||= { id: c.id, name: c.name, w: 0, pw: 0, n: 0 }); w.w += a.w; w.pw += a.pw; w.n += a.n; }
  const worlds = Object.values(wd).sort((a, b) => b.w - a.w || b.n - a.n).slice(0, 25);
  const total = rows.length;
  const growth = await growthData(u, sb());
  const privateRow = ({n,zero,w,pw,...rest}) => rest;
  return json({
    growth, sampled: scanned === 20000, plus, ...(admin ? {total} : {}), at: new Date().toISOString(),
    wanted: admin ? wanted : wanted.map(privateRow), trending: admin ? trending : trending.map(privateRow), top: admin ? top : [], countries: admin ? countries : countries.map(({n,top,...c})=>({...c,top:top.map(({n,...t})=>t)})), admin, worlds: admin ? worlds : worlds.map(({w,pw,n,...r})=>r),
    hidden: plus ? null : { wanted: 0, trending: 0, top: 0, countries: 0, worlds: 0 },
  });
};
export const config = { path: "/api/insights" };
