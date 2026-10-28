// Fanreelz on Cloudflare: one Worker serves the site (static files) and runs the same functions that run on Netlify.
// The functions in netlify/functions are shared: they read settings through Netlify.env.get(), which this file provides,
// so the site can move back to Netlify at any time without code changes.
import config from "../netlify/functions/config.mjs";
import discord from "../netlify/functions/discord.mjs";
import discordRegister from "../netlify/functions/discord-register.mjs";
import importYoutube from "../netlify/functions/import-youtube.mjs";
import liveYoutube from "../netlify/functions/live-youtube.mjs";
import live from "../netlify/functions/live.mjs";
import moderate from "../netlify/functions/moderate.mjs";
import showdown from "../netlify/functions/showdown.mjs";
import thumb from "../netlify/functions/thumb.mjs";
import { withSeo, sitemap } from "./seo.mjs";

const ROUTES = {
  "/api/config": config,
  "/api/discord": discord,
  "/api/discord-register": discordRegister,
  "/api/live-youtube": liveYoutube,
  "/api/live": live,
  "/api/moderate": moderate,
  "/api/thumb": thumb,
  "/api/tiktok-thumb": thumb,
};
// Schedules (see wrangler.jsonc): the importer every 10 minutes (it searches YouTube about once an hour), the showdown judge every hour at :41
const CRONS = { "*/10 * * * *": importYoutube, "41 * * * *": showdown };

// Digital Asset Links: proves that the Android app (Google Play) and fanreelz.com belong together, so the app shows no browser bar.
// The first fingerprint is the upload key; add Google Play's "App signing key" SHA-256 from Play Console → Test and release → App integrity,
// here or as ASSETLINKS_SHA256 in the Cloudflare dashboard (several can be given, separated by commas).
const ANDROID_FINGERPRINTS = ["36:8C:F0:16:D1:F0:1E:25:15:FB:C2:F5:2D:5D:EB:25:2A:6A:52:17:0A:FD:83:FC:EB:6C:48:B5:F4:EA:D2:B9"];
function assetLinks(env) {
  const fps = [...ANDROID_FINGERPRINTS, ...String(env.ASSETLINKS_SHA256 || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)];
  const body = [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "com.fanreelz.app", sha256_cert_fingerprints: [...new Set(fps)] } }];
  return new Response(JSON.stringify(body, null, 2), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" } });
}

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
    if (url.pathname === "/.well-known/assetlinks.json") return assetLinks(env);
    if (url.pathname === "/sitemap.xml") {
      const hit = await caches.default.match(req); if (hit) return hit;
      const res = await sitemap(env, ctx); ctx.waitUntil(caches.default.put(req, res.clone())); return res;
    }
    const fn = ROUTES[url.pathname];
    if (!fn) {
      // pages get their own title, description and preview; browsers must always check for a newer version of a page
      const page = await withSeo(req, await env.ASSETS.fetch(req), env, ctx);
      if (!(page.headers.get("Content-Type") || "").includes("text/html")) return page;
      const out = new Response(page.body, page); out.headers.set("Cache-Control", "no-cache");
      // the visitor's country (two letters, no other details), so the page can put films in the local language first
      const cc = String(req.cf?.country || "").toUpperCase();
      if (!/^[A-Z]{2}$/.test(cc)) return out;
      return new HTMLRewriter().on("head", { element(e) { e.prepend(`<meta name="fr-cc" content="${cc}">`, { html: true }); } }).transform(out);
    }
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
