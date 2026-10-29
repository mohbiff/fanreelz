// Fanreelz for search engines and link previews.
// The site draws its pages in the browser, so without this every address looks the same to Google, Discord and Messenger.
// Here Cloudflare fills in each page's own title, description, preview image, video details (VideoObject)
// and a short readable summary before the page is sent. The browser then draws the full page as usual.
import CATS from "../netlify/functions/lib/catmap.mjs";
import SEEDS from "../netlify/functions/lib/showdowns.mjs";

const SITE = "https://fanreelz.com";
const DEFAULT = {
  title: "Fanreelz – Where AI fan films find their fans",
  description: "The home of AI fan films. Discover, rate and support the best AI-made films about the games, books, anime and series you love.",
  image: SITE + "/og.png",
};
const STATIC = {
  "/top10": ["Top 10 AI fan films this month", "The most-watched AI fan films of the month across YouTube, TikTok and Vimeo, plus the top 5 in fantasy, anime, sci-fi and more."],
  "/shorts": ["AI fan film Shorts", "Swipe through the best short AI fan films from YouTube, TikTok and Instagram, rated by fans."],
  "/showdown": ["Character Showdown: who would win?", "Fans vote and argue which character would win a fight that never happened in canon. Fanreelz weighs the research and the arguments."],
  "/battles": ["Fan Battles: which AI fan film is better?", "Two AI fan films, one vote. Pick the better one and watch the fan ranking change."],
  "/requests": ["Request an AI fan film", "Tell AI creators which fan film you want to see next and vote for the best ideas."],
  "/about": ["About Fanreelz", "Fanreelz collects AI fan films about games, books, anime and series in one place, so fans can find, rate and support them."],
  "/browse": ["Browse all AI fan film worlds", "Every game, book, anime and series on Fanreelz, from Warcraft and Lord of the Rings to Naruto and Minecraft."],
  "/live": ["Live AI film streams", "AI fan film creators streaming right now on YouTube and Twitch."],
  "/discord": ["Fanreelz bot for Discord", "Top lists, random AI fan films and Character Showdowns right in your Discord server."],
  "/playlists": ["AI fan film playlists", "Playlists of AI fan films made by fans."],
};

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n || 0));
const isoDur = (s) => { s = +s || 0; return `PT${Math.floor(s / 60)}M${s % 60}S`; };
const catOf = (id) => CATS.find((c) => c.id === id);

// Database reads, cached at Cloudflare for an hour so pages stay fast and the database stays quiet
async function db(env, path, ctx, ttl = 3600) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const url = env.SUPABASE_URL + "/rest/v1/" + path;
  const key = new Request("https://cache.fanreelz/" + encodeURIComponent(path));
  const hit = await caches.default.match(key); if (hit) return hit.json();
  const r = await fetch(url, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + env.SUPABASE_ANON_KEY } });
  if (!r.ok) return null;
  const data = await r.json();
  ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Cache-Control": `public, s-maxage=${ttl}` } })));
  return data;
}
const filmLink = (r) => `<li><a href="/film/${esc(encodeURIComponent(r.id))}">${esc(r.title)}</a>${r.views ? ` · ${fmt(r.views)} views` : ""}</li>`;

// What a page is about: title, description, image, structured data and a short summary
async function pageInfo(url, env, ctx) {
  const parts = url.pathname.split("/").filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  const [a, b] = parts;
  if ((a === "film" || a === "shorts") && b) {
    const row = (await db(env, `catalog?select=id,title,channel,cat,char,duration,published_at,video_id,views&id=eq.${encodeURIComponent(b)}&hidden=eq.false&limit=1`, ctx))?.[0];
    if (!row) return null;
    const c = catOf(row.cat), world = c ? c.name : "AI fan film";
    const desc = clip(`${row.title}${row.channel ? ` by ${row.channel}` : ""}. An AI fan film${c ? ` about ${world}${row.char && row.char !== world ? " (" + row.char + ")" : ""}` : ""}. Watch it and rate it on Fanreelz${row.views ? ` · ${fmt(row.views)} views on YouTube` : ""}.`, 300);
    const image = `https://i.ytimg.com/vi/${row.video_id}/hqdefault.jpg`;
    const more = c ? await db(env, `catalog?select=id,title,views&cat=eq.${c.id}&hidden=eq.false&age_restricted=eq.false&id=neq.${encodeURIComponent(row.id)}&order=views.desc&limit=8`, ctx) : null;
    return {
      title: clip(`${row.title} – ${world} AI fan film`, 110), description: desc, image, type: "video.other",
      ld: { "@context": "https://schema.org", "@type": "VideoObject", name: row.title, description: desc, thumbnailUrl: [image],
        uploadDate: row.published_at || undefined, duration: row.duration ? isoDur(row.duration) : undefined,
        embedUrl: `https://www.youtube.com/embed/${row.video_id}`, url: `${SITE}/film/${encodeURIComponent(row.id)}`,
        ...(row.channel ? { author: { "@type": "Person", name: row.channel } } : {}),
        ...(row.views ? { interactionStatistic: { "@type": "InteractionCounter", interactionType: { "@type": "WatchAction" }, userInteractionCount: row.views } } : {}) },
      body: `<h1>${esc(row.title)}</h1><p>${esc(desc)}</p>${c ? `<p><a href="/c/${c.id}">More ${esc(world)} AI fan films</a></p>` : ""}${more?.length ? `<h2>More ${esc(world)} AI films</h2><ul>${more.map(filmLink).join("")}</ul>` : ""}`,
    };
  }
  if (a === "c" && b && catOf(b)) {
    const c = catOf(b), ch = url.searchParams.get("char");
    const rows = (await db(env, `catalog?select=id,title,views,char,video_id&cat=eq.${c.id}&hidden=eq.false&age_restricted=eq.false&order=views.desc&limit=200`, ctx)) || [];
    const list = (ch ? rows.filter((r) => r.char === ch) : rows).slice(0, 30);
    const topic = ch ? `${ch} (${c.name})` : c.name;
    const desc = `The best AI fan films about ${topic}, rated by fans: ${rows.length ? rows.length + " films, " : ""}live-action remakes, cinematic trailers and what-if stories made with AI.`;
    return {
      title: `Best ${topic} AI fan films, rated by fans`, description: desc, image: list[0]?.video_id ? `https://i.ytimg.com/vi/${list[0].video_id}/hqdefault.jpg` : null,
      ld: { "@context": "https://schema.org", "@type": "CollectionPage", name: `${topic} AI fan films`, description: desc, url: `${SITE}/c/${c.id}${ch ? "?char=" + encodeURIComponent(ch) : ""}` },
      body: `<h1>${esc(topic)} AI fan films</h1><p>${esc(desc)}</p>${c.chars.length ? `<p>Characters: ${c.chars.map((x) => `<a href="/c/${c.id}?char=${esc(encodeURIComponent(x))}">${esc(x)}</a>`).join(", ")}</p>` : ""}<ol>${list.map(filmLink).join("")}</ol>`,
    };
  }
  if (a === "showdown" && b) {
    const seed = SEEDS.find((s) => s.key === b);
    const v = (await db(env, `showdown_verdicts?select=key,data&key=eq.${encodeURIComponent(b)}&limit=1`, ctx, 600))?.[0]?.data;
    const A = v?.a || seed?.a, B = v?.b || seed?.b;
    if (!A || !B) return null;
    const verdict = v?.verdict ? ` Fanreelz verdict: ${A} ${v.verdict.pa}%, ${B} ${v.verdict.pb}%. ${v.verdict.summary || ""}` : "";
    const desc = clip(`Who would win, ${A} or ${B}? Fans vote and explain why, and Fanreelz weighs canon research and the same number of arguments from each side.${verdict}`, 300);
    return { title: `${A} vs ${B}: who would win?`, description: desc,
      ld: { "@context": "https://schema.org", "@type": "DiscussionForumPosting", headline: `${A} vs ${B}: who would win?`, text: desc, url: `${SITE}/showdown/${encodeURIComponent(b)}` },
      body: `<h1>${esc(A)} vs ${esc(B)}</h1><p>${esc(desc)}</p>${v?.verdict?.why ? `<p>${esc(v.verdict.why)}</p>` : ""}<p><a href="/showdown">More Character Showdowns</a></p>` };
  }
  const st = STATIC["/" + (a || "")];
  if (st) return { title: st[0], description: st[1] };
  if (!a) return {
    title: DEFAULT.title, description: DEFAULT.description,
    ld: { "@context": "https://schema.org", "@type": "WebSite", name: "Fanreelz", url: SITE, potentialAction: { "@type": "SearchAction", target: SITE + "/search?q={q}", "query-input": "required name=q" } },
    body: `<h1>Fanreelz: the home of AI fan films</h1><p>${esc(DEFAULT.description)}</p><ul>${CATS.slice(0, 30).map((c) => `<li><a href="/c/${c.id}">${esc(c.name)} AI fan films</a></li>`).join("")}</ul>`,
  };
  return null;
}

export async function withSeo(req, res, env, ctx) {
  const url = new URL(req.url);
  if (req.method !== "GET" || !(res.headers.get("Content-Type") || "").includes("text/html")) return res;
  if (/\.(html?)$/.test(url.pathname) && url.pathname !== "/index.html") return res; // privacy.html, terms.html keep their own
  try {
    const info = await pageInfo(url, env, ctx);
    if (!info) return res;
    const full = info.title === DEFAULT.title ? info.title : `${info.title} | Fanreelz`;
    const canonical = SITE + url.pathname + (url.pathname.startsWith("/c/") && url.searchParams.get("char") ? "?char=" + encodeURIComponent(url.searchParams.get("char")) : "");
    const image = info.image || DEFAULT.image;
    const head = `<link rel="canonical" href="${esc(canonical)}"><meta property="og:site_name" content="Fanreelz"><meta name="twitter:title" content="${esc(full)}"><meta name="twitter:description" content="${esc(info.description)}"><meta name="twitter:image" content="${esc(image)}">${info.ld ? `<script type="application/ld+json">${JSON.stringify(info.ld).replace(/</g, "\\u003c")}</script>` : ""}`;
    const setAttr = (attr, val) => ({ element(e) { e.setAttribute(attr, val); } });
    return new HTMLRewriter()
      .on("title", { element(e) { e.setInnerContent(full); } })
      .on('meta[name="description"]', setAttr("content", info.description))
      .on('meta[property="og:title"]', setAttr("content", full))
      .on('meta[property="og:description"]', setAttr("content", info.description))
      .on('meta[property="og:url"]', setAttr("content", canonical))
      .on('meta[property="og:image"]', setAttr("content", image))
      .on('meta[property="og:type"]', setAttr("content", info.type || "website"))
      .on('meta[name="twitter:card"]', setAttr("content", "summary_large_image"))
      .on("head", { element(e) { e.append(head, { html: true }); } })
      .on("main#main", { element(e) { if (info.body) e.setInnerContent(`<div class="ssr">${info.body}</div>`, { html: true }); } })
      .transform(res);
  } catch (e) {
    console.error("seo", e);
    return res;
  }
}

// sitemap.xml: every page Google should know about, rebuilt from the database at most once an hour
export async function sitemap(env, ctx) {
  const urls = ["/", "/top10", "/shorts", "/showdown", "/battles", "/browse", "/about", "/requests", "/discord"].map((p) => ({ loc: SITE + p }));
  CATS.forEach((c) => urls.push({ loc: `${SITE}/c/${c.id}` }));
  for (let from = 0; from < 45000; from += 1000) {
    const rows = await db(env, `catalog?select=id,published_at,added_at&hidden=eq.false&order=views.desc&offset=${from}&limit=1000`, ctx);
    if (!rows?.length) break;
    rows.forEach((r) => urls.push({ loc: `${SITE}/film/${encodeURIComponent(r.id)}`, mod: (r.added_at || r.published_at || "").slice(0, 10) }));
    if (rows.length < 1000) break;
  }
  const keys = new Set(SEEDS.map((s) => s.key));
  ((await db(env, "showdown_verdicts?select=key,data&limit=1000", ctx, 600)) || []).forEach((r) => { if (r.data?.status !== "canon") keys.add(r.key); });
  keys.forEach((k) => urls.push({ loc: `${SITE}/showdown/${encodeURIComponent(k)}` }));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u.loc)}</loc>${u.mod ? `<lastmod>${u.mod}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
