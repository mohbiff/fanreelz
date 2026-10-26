// Moderation: lets Fanreelz admins remove anyone's comment.
// POST /api/moderate with the signed-in user's token. Body {action:"check"} answers whether this user is an admin;
// {action:"remove", owner:"<user id>", id:"<comment id>"} removes that comment and its replies.
// Needs: ADMIN_EMAILS (comma-separated sign-in emails of the admins), SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (secret).
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
  if (body.action !== "remove" || !body.owner || !body.id) return json({ error: "bad request" }, 400);

  const url = Netlify.env.get("SUPABASE_URL") + "/rest/v1/docs", key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const h = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };
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
