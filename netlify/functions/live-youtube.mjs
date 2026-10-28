// Fanreelz: who is live on YouTube right now making AI films?
// Runs on Netlify. Reads YOUTUBE_API_KEY from the site's environment variables.
// A YouTube live search costs 100 of the 10,000 free daily quota units, so this answer is cached
// for 60 minutes (about 24 searches a day, roughly 2,400 units), leaving quota for the importer's searches.

// Tested: "AI film" with safe search off returns live AI streams; strict safe search returns none.
const QUERY = "AI film";
const AI_WORDS = /\b(ai|a\.i\.|kling|sora|runway|veo|midjourney|hailuo|minimax|pika|seedance|higgsfield|luma)\b/i;
// The TITLE must name both AI and something film-like, so cat videos and music loops stay out.
const FILM_WORDS = /(film|movie|cinema|cinematic|animation|animated|anime|trailer|short|story|episode|series|parody|fan ?made)/i;

// LIVE_BLOCKLIST (Netlify environment variable): channel names that should never be shown, comma-separated.
const blocked = () => new Set((Netlify.env.get("LIVE_BLOCKLIST") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));

const json = (body, seconds) =>
  new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${seconds}, stale-while-revalidate=300`,
    },
  });

export default async (req) => {
  const params = new URL(req.url).searchParams;
  const demo = params.get("demo") === "1";
  // Test mode only: try another search text with &q=..., or turn off safe search with &safe=none
  const query = demo && params.get("q") ? params.get("q").slice(0, 100) : QUERY;
  const safe = demo && ["strict", "moderate"].includes(params.get("safe")) ? params.get("safe") : "none";
  const key = Netlify.env.get("YOUTUBE_API_KEY");
  if (!key) return json({ streams: [], error: "YouTube key is not set yet" }, 300);

  try {
    const search = new URL("https://www.googleapis.com/youtube/v3/search");
    search.search = new URLSearchParams({
      part: "snippet", eventType: "live", type: "video", maxResults: "25",
      q: query, safeSearch: safe, key,
    });
    const r = await fetch(search);
    if (!r.ok) throw new Error("YouTube search failed: " + r.status);
    const block = blocked();
    const raw = ((await r.json()).items || []).filter((it) =>
      !block.has((it.snippet.channelTitle || "").toLowerCase()) && !block.has((it.snippet.channelId || "").toLowerCase()));
    // Test mode (/api/live-youtube?demo=1): everything YouTube returned, unfiltered
    const items = demo ? raw : raw.filter((it) => AI_WORDS.test(it.snippet.title) && FILM_WORDS.test(it.snippet.title));
    if (!items.length) return json({ streams: [], found: raw.length, demo, query, checked: new Date().toISOString() }, 3600);

    // Viewer counts (1 quota unit)
    const ids = items.map((it) => it.id.videoId).join(",");
    const v = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,status&id=${ids}&key=${key}`);
    const viewers = {}, embeddable = {};
    if (v.ok) for (const it of (await v.json()).items || []) {
      viewers[it.id] = +(it.liveStreamingDetails?.concurrentViewers || 0);
      embeddable[it.id] = it.status?.embeddable !== false;
    }

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
      embeddable: embeddable[it.id.videoId] !== false,
      ...(demo ? { demo: true } : {}),
    })).sort((a, b) => b.viewers - a.viewers);

    return json({ streams: out, found: raw.length, demo, query, checked: new Date().toISOString() }, 3600);
  } catch (e) {
    return json({ streams: [], error: String(e.message || e) }, 300);
  }
};

export const config = { path: "/api/live-youtube" };
