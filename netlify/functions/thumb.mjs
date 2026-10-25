// Fanreelz: thumbnails for videos from TikTok, Instagram, Vimeo and Dailymotion.
//   /api/thumb?p=tt&u=<handle>&id=<id>   TikTok (public oEmbed, no key)
//   /api/thumb?p=ig&id=<shortcode>       Instagram (public embed page, no key)
//   /api/thumb?p=vm&id=<id>              Vimeo (public oEmbed)
//   /api/thumb?p=dm&id=<id>              Dailymotion
// The image itself is passed through and kept on Netlify's CDN for 30 days, so the
// short-lived image links TikTok and Instagram hand out don't matter.
// The old path /api/tiktok-thumb?u=&id= still works.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const decode = (s) => s.replace(/\\u0026/g, "&").replace(/&amp;/g, "&").replace(/\\\//g, "/");

async function imageUrl(p, u, id) {
  if (p === "tt") {
    const r = await fetch("https://www.tiktok.com/oembed?url=" + encodeURIComponent(`https://www.tiktok.com/@${u}/video/${id}`));
    return r.ok ? (await r.json()).thumbnail_url : "";
  }
  if (p === "vm") {
    const r = await fetch(`https://vimeo.com/api/oembed.json?width=640&url=${encodeURIComponent("https://vimeo.com/" + id)}`);
    return r.ok ? (await r.json()).thumbnail_url : "";
  }
  if (p === "dm") return `https://www.dailymotion.com/thumbnail/video/${id}`;
  if (p === "ig") {
    const r = await fetch(`https://www.instagram.com/p/${id}/embed/captioned/`, { headers: { "User-Agent": UA, "Accept-Language": "en" } });
    if (!r.ok) return "";
    const html = await r.text();
    const m = html.match(/class="EmbeddedMediaImage"[^>]*?src="([^"]+)"/) || html.match(/"display_url":"([^"]+)"/)
      || html.match(/<img[^>]+src="(https:\/\/[^"]*(?:cdninstagram|fbcdn)[^"]+)"/);
    return m ? decode(m[1]) : "";
  }
  return "";
}

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const p = q.get("p") || "tt";
  const u = (q.get("u") || "").replace(/[^\w.]/g, "");
  const id = (q.get("id") || "").replace(/[^\w-]/g, "");
  if (!id || (p === "tt" && !u)) return new Response("missing id", { status: 400 });
  try {
    const src = await imageUrl(p, u, id);
    if (!src) throw new Error("no thumbnail from " + p);
    const img = await fetch(src, { headers: { "User-Agent": UA, Referer: "https://www.tiktok.com/" } });
    let type = img.headers.get("content-type") || "";
    if (!img.ok || type.startsWith("text/")) throw new Error("bad image " + img.status);
    if (!type.startsWith("image/")) type = "image/jpeg";
    return new Response(img.body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400",
        "Netlify-CDN-Cache-Control": "public, durable, s-maxage=2592000, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    if (q.get("debug")) return new Response("thumb failed: " + String(e.message || e), { status: 404, headers: { "Cache-Control": "no-store" } });
    // The page shows its own platform tile when the image fails to load. Try again in an hour.
    return new Response("not found", { status: 404, headers: { "Netlify-CDN-Cache-Control": "public, durable, s-maxage=3600" } });
  }
};

export const config = { path: ["/api/thumb", "/api/tiktok-thumb"] };
