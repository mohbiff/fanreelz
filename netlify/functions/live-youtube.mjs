// Fanreelz: who is live on YouTube right now making AI films?
// Runs on Netlify. Reads YOUTUBE_API_KEY from the site's environment variables.
// A YouTube live search costs 100 of the 10,000 free daily quota units, so this answer is cached
// on Netlify's CDN for 20 minutes (about 72 searches a day, roughly 7,300 units).

const QUERY = "AI film|AI movie|AI cinematic|AI animation";
const AI_WORDS = /\b(ai|a\.i\.|kling|sora|runway|veo|midjourney|hailuo|minimax|pika|seedance|higgsfield|luma)\b/i;

const json = (body, seconds) =>
  new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${seconds}, stale-while-revalidate=300`,
    },
  });

export default async () => {
  const key = Netlify.env.get("YOUTUBE_API_KEY");
  if (!key) return json({ streams: [], error: "YouTube key is not set yet" }, 300);

  try {
    const search = new URL("https://www.googleapis.com/youtube/v3/search");
    search.search = new URLSearchParams({
      part: "snippet", eventType: "live", type: "video", maxResults: "25",
      q: QUERY, safeSearch: "strict", videoEmbeddable: "true", key,
    });
    const r = await fetch(search);
    if (!r.ok) throw new Error("YouTube search failed: " + r.status);
    const items = ((await r.json()).items || []).filter((it) => AI_WORDS.test(it.snippet.title + " " + it.snippet.description));
    if (!items.length) return json({ streams: [], checked: new Date().toISOString() }, 1200);

    // Viewer counts (1 quota unit)
    const ids = items.map((it) => it.id.videoId).join(",");
    const v = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${ids}&key=${key}`);
    const viewers = {};
    if (v.ok) for (const it of (await v.json()).items || []) viewers[it.id] = +(it.liveStreamingDetails?.concurrentViewers || 0);

    const out = items.map((it) => ({
      id: "yt-live-" + it.id.videoId,
      platform: "YouTube",
      video: it.id.videoId,
      ch: it.snippet.channelTitle,
      title: it.snippet.title,
      game: "",
      viewers: viewers[it.id.videoId] || 0,
      thumb: it.snippet.thumbnails?.high?.url || it.snippet.thumbnails?.medium?.url || "",
      url: "https://www.youtube.com/watch?v=" + it.id.videoId,
    })).sort((a, b) => b.viewers - a.viewers);

    return json({ streams: out, checked: new Date().toISOString() }, 1200);
  } catch (e) {
    return json({ streams: [], error: String(e.message || e) }, 300);
  }
};

export const config = { path: "/api/live-youtube" };
