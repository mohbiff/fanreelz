// Fanreelz on Cloudflare: one Worker serves the site (static files) and runs the same functions that run on Netlify.
// The functions in netlify/functions are shared: they read settings through Netlify.env.get(), which this file provides,
// so the site can move back to Netlify at any time without code changes.
import config from "../netlify/functions/config.mjs";
import discord from "../netlify/functions/discord.mjs";
import discordRegister from "../netlify/functions/discord-register.mjs";
import importYoutube from "../netlify/functions/import-youtube.mjs";
import liveYoutube from "../netlify/functions/live-youtube.mjs";
import live from "../netlify/functions/live.mjs";
import showdown from "../netlify/functions/showdown.mjs";
import thumb from "../netlify/functions/thumb.mjs";

const ROUTES = {
  "/api/config": config,
  "/api/discord": discord,
  "/api/discord-register": discordRegister,
  "/api/live-youtube": liveYoutube,
  "/api/live": live,
  "/api/thumb": thumb,
  "/api/tiktok-thumb": thumb,
};
// Schedules (see wrangler.jsonc): the importer every hour at :17, the showdown judge every hour at :41
const CRONS = { "17 * * * *": importYoutube, "41 * * * *": showdown };

const useEnv = (env) => { globalThis.Netlify = { env: { get: (k) => (env[k] == null ? undefined : String(env[k])) } }; };

// How long Cloudflare may keep a function's answer, read from the same headers Netlify's CDN uses
function edgeSeconds(res) {
  const h = res.headers.get("Netlify-CDN-Cache-Control") || res.headers.get("CDN-Cache-Control") || res.headers.get("Cache-Control") || "";
  if (/no-store|private/.test(h)) return 0;
  const m = h.match(/s-maxage=(\d+)/) || h.match(/max-age=(\d+)/);
  return m ? +m[1] : 0;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    // Scheduled jobs can also be started by hand: /api/run/showdown?key=RUN_KEY (like Netlify's "Run now")
    if (url.pathname.startsWith("/api/run/")) {
      if (!env.RUN_KEY || url.searchParams.get("key") !== env.RUN_KEY) return new Response("not allowed", { status: 403 });
      const job = { showdown, "import-youtube": importYoutube }[url.pathname.slice(9)];
      if (!job) return new Response("unknown job", { status: 404 });
      useEnv(env); return job(req);
    }
    const fn = ROUTES[url.pathname];
    if (!fn) return env.ASSETS.fetch(req);
    useEnv(env);
    const cacheable = req.method === "GET" && !url.searchParams.has("debug");
    const cache = caches.default;
    if (cacheable) { const hit = await cache.match(req); if (hit) return hit; }
    const res = await fn(req);
    const secs = cacheable && res.ok ? edgeSeconds(res) : 0;
    if (secs > 0) {
      const copy = new Response(res.clone().body, res);
      copy.headers.set("Cache-Control", `public, s-maxage=${secs}`);
      ctx.waitUntil(cache.put(req, copy));
    }
    return res;
  },
  async scheduled(event, env, ctx) {
    useEnv(env);
    const job = CRONS[event.cron];
    if (job) ctx.waitUntil(job(new Request("https://fanreelz.com/scheduled")).then((r) => r.text()).then((t) => console.log(event.cron, t)));
  },
};
