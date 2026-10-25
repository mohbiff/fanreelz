// Fanreelz: who is live on Twitch right now making AI films?
// Runs on Netlify. Reads TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET from the site's environment variables.
// Optional: TWITCH_WATCHLIST = comma-separated Twitch logins that are always checked (your own creators).
// The response is cached on Netlify's CDN for 2 minutes, so Twitch is asked at most about once every 2 minutes.

const SEARCHES = ["AI film", "AI movie", "AI short film", "AI animation", "AI cinematic", "AI trailer"];
const AI_WORDS = /\b(ai|a\.i\.|kling|sora|runway|veo|midjourney|hailuo|minimax|pika|seedance|higgsfield|comfyui|stable diffusion|luma)\b/i;
const FILM_WORDS = /(film|movie|cinematic|animation|animated|trailer|short|scene|story|music video|episode|series|fan ?made)/i;

// LIVE_BLOCKLIST (Netlify environment variable): channel names that should never be shown, comma-separated.
const blocked = () => new Set((Netlify.env.get("LIVE_BLOCKLIST") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));

let cachedToken = null; // reused while the function instance stays warm

async function appToken(id, secret) {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const r = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials" }),
  });
  if (!r.ok) throw new Error("Twitch token request failed: " + r.status);
  const j = await r.json();
  cachedToken = { value: j.access_token, expires: Date.now() + j.expires_in * 1000 };
  return cachedToken.value;
}

async function helix(path, id, token) {
  const r = await fetch("https://api.twitch.tv/helix/" + path, {
    headers: { "Client-Id": id, Authorization: "Bearer " + token },
  });
  if (r.status === 401) cachedToken = null;
  if (!r.ok) throw new Error("Twitch " + path.split("?")[0] + " failed: " + r.status);
  return (await r.json()).data || [];
}

const json = (body, seconds) =>
  new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=30",
      "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${seconds}, stale-while-revalidate=60`,
    },
  });

export default async (req) => {
  const demo = new URL(req.url).searchParams.get("demo") === "1";
  const id = Netlify.env.get("TWITCH_CLIENT_ID");
  const secret = Netlify.env.get("TWITCH_CLIENT_SECRET");
  if (!id || !secret) return json({ streams: [], error: "Twitch keys are not set yet" }, 60);

  try {
    const token = await appToken(id, secret);
    const block = blocked();
    const allowed = (s) => !block.has((s.user_login || "").toLowerCase()) && !block.has((s.user_name || "").toLowerCase());

    // Test mode (/api/live?demo=1): the most-watched safe streams on Twitch right now, any topic.
    if (demo) {
      const top = await helix("streams?first=20", id, token);
      const out = top.filter((s) => s.type === "live" && !s.is_mature && allowed(s)).slice(0, 4).map((s) => ({
        id: "tw-" + s.user_login, platform: "Twitch", channel: s.user_login, ch: s.user_name,
        title: s.title, game: s.game_name || "", viewers: s.viewer_count || 0,
        thumb: (s.thumbnail_url || "").replace("{width}", "640").replace("{height}", "360"),
        url: "https://www.twitch.tv/" + s.user_login, started: s.started_at, demo: true,
      }));
      return json({ streams: out, demo: true, checked: new Date().toISOString() }, 120);
    }
    const watch = (Netlify.env.get("TWITCH_WATCHLIST") || "")
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

    // 1. Live channels whose title matches an AI-film search
    const found = new Set(watch);
    const results = await Promise.allSettled(
      SEARCHES.map((q) => helix(`search/channels?live_only=true&first=50&query=${encodeURIComponent(q)}`, id, token))
    );
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const c of r.value) {
        const text = `${c.title} ${(c.tags || []).join(" ")}`;
        if (c.is_live && AI_WORDS.test(text) && FILM_WORDS.test(text)) found.add(c.broadcaster_login.toLowerCase());
      }
    }
    if (!found.size) return json({ streams: [], checked: new Date().toISOString() }, 120);

    // 2. Current stream details (viewers, thumbnail) for everything found, 100 logins per request
    const logins = [...found];
    const streams = [];
    for (let i = 0; i < logins.length; i += 100) {
      const qs = logins.slice(i, i + 100).map((l) => "user_login=" + encodeURIComponent(l)).join("&");
      streams.push(...(await helix(`streams?first=100&${qs}`, id, token)));
    }

    const out = streams
      .filter((s) => s.type === "live" && !s.is_mature && allowed(s))
      .map((s) => ({
        id: "tw-" + s.user_login,
        platform: "Twitch",
        channel: s.user_login,
        ch: s.user_name,
        title: s.title,
        game: s.game_name || "",
        viewers: s.viewer_count || 0,
        thumb: (s.thumbnail_url || "").replace("{width}", "640").replace("{height}", "360"),
        url: "https://www.twitch.tv/" + s.user_login,
        started: s.started_at,
        watchlist: watch.includes(s.user_login.toLowerCase()),
      }))
      .sort((a, b) => b.viewers - a.viewers);

    return json({ streams: out, checked: new Date().toISOString() }, 120);
  } catch (e) {
    return json({ streams: [], error: String(e.message || e) }, 60);
  }
};

export const config = { path: "/api/live" };
