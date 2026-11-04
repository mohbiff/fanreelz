// Which YouTube videos are vertical (taller than wide), so the site can play them like Shorts, filling a standing phone.
// GET /api/yt-shape?ids=VIDEO_ID,VIDEO_ID (up to 50) → {"VIDEO_ID": 1 (vertical) | 0 (wide)}
// YouTube's player size (embedWidth/embedHeight with a maximum size) follows the video's real aspect ratio.
// One API call costs 1 quota unit per 50 videos; a video's shape doesn't change, so answers are cached for long.
export default async (req) => {
  const ids = [...new Set(String(new URL(req.url).searchParams.get("ids") || "").split(",").filter((x) => /^[\w-]{11}$/.test(x)))].slice(0, 50);
  const key = Netlify.env.get("YOUTUBE_API_KEY");
  const out = {};
  if (ids.length && key) {
    const u = new URL("https://www.googleapis.com/youtube/v3/videos");
    u.search = new URLSearchParams({ part: "player", id: ids.join(","), maxWidth: "1000", maxHeight: "1000", maxResults: "50", key });
    const r = await fetch(u).catch(() => null);
    if (r?.ok) for (const v of (await r.json()).items || []) {
      const w = +v.player?.embedWidth, h = +v.player?.embedHeight;
      if (w && h) out[v.id] = h > w * 1.1 ? 1 : 0;
    }
  }
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": Object.keys(out).length ? "public, max-age=604800" : "public, max-age=300" } });
};
export const config = { path: "/api/yt-shape" };
