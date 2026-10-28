// YouTube view counts for films added to Fanreelz by hand (the importer already stores counts for its own films).
// GET /api/yt-views?ids=VIDEO_ID,VIDEO_ID (up to 50) → {"VIDEO_ID": 12345, ...}
// One YouTube API call costs 1 quota unit per 50 videos; answers are cached for 6 hours.
const json = (body, seconds) =>
  new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=600",
      "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${seconds}, stale-while-revalidate=3600`,
    },
  });

export default async (req) => {
  const ids = [...new Set(String(new URL(req.url).searchParams.get("ids") || "").split(",").filter((x) => /^[\w-]{11}$/.test(x)))].slice(0, 50);
  const key = Netlify.env.get("YOUTUBE_API_KEY");
  if (!ids.length || !key) return json({}, 300);
  const u = new URL("https://www.googleapis.com/youtube/v3/videos");
  u.search = new URLSearchParams({ part: "statistics", id: ids.join(","), maxResults: "50", key });
  const r = await fetch(u);
  if (!r.ok) return json({}, 300);
  const d = await r.json();
  const out = {};
  for (const v of d.items || []) out[v.id] = +(v.statistics?.viewCount || 0);
  return json(out, 21600);
};
export const config = { path: "/api/yt-views" };
