// Fanreelz's affiliate links (set by admins on the admin page), read by every page.
// GET /api/affiliates → {"list":[{"target":"cat:eldenring"|"tool:kling"|"all","label":"Get Elden Ring","url":"https://…"}]}
// Stored in import_state (key "affiliates"), which only the server can read; answers are cached for 5 minutes.
const json = (body) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=120", "Netlify-CDN-Cache-Control": "public, durable, s-maxage=300, stale-while-revalidate=600" },
  });

export async function readAffiliates() {
  const key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY"), h = { apikey: key };
  if (!key.startsWith("sb_secret_")) h.Authorization = "Bearer " + key;
  const r = await fetch(Netlify.env.get("SUPABASE_URL") + "/rest/v1/import_state?key=eq.affiliates&select=value", { headers: h });
  if (!r.ok) return [];
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows?.[0]?.value?.list) ? rows[0].value.list : [];
}

export default async () => json({ list: await readAffiliates().catch(() => []) });
export const config = { path: "/api/affiliates" };
