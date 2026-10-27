// Admin tools: remove anyone's comment, find AI films on YouTube now, or start the importer / showdown judge by hand.
// POST /api/moderate with the signed-in user's token. Body {action:"check"} answers whether this user is an admin;
// {action:"remove", owner:"<user id>", id:"<comment id>"} removes that comment and its replies; {action:"hide", id:"yt-…"} hides a film.
// Needs: ADMIN_EMAILS (comma-separated sign-in emails of the admins), SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (secret).
import importYoutube, { searchNow, addByLinks } from "./import-youtube.mjs";
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
    return json({ users });
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
