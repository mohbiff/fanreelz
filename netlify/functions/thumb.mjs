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

async function imageUrl(p, u, id, tries = []) {
  if (p === "tt") {
    const page = `https://www.tiktok.com/@${u}/video/${id}`;
    const H = { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Accept: "application/json,text/html;q=0.9,*/*;q=0.8" };
    // 1. TikTok's own oEmbed
    try {
      const r = await fetch("https://www.tiktok.com/oembed?url=" + encodeURIComponent(page), { headers: H });
      tries.push("tiktok oembed " + r.status);
      if (r.ok) { const j = await r.json(); if (j.thumbnail_url) return j.thumbnail_url; tries.push("tiktok oembed: no thumbnail_url"); }
    } catch (e) { tries.push("tiktok oembed error " + (e.message || e)); }
    // 2. TikTok's embed page (the cover image is in its data)
    try {
      const r = await fetch(`https://www.tiktok.com/embed/v2/${id}`, { headers: H });
      tries.push("tiktok embed " + r.status);
      if (r.ok) {
        const html = await r.text();
        const m = html.match(/"(?:originCover|cover|dynamicCover)":"(https:[^"]+)"/);
        if (m) return decode(m[1]);
        tries.push("tiktok embed: no cover in page");
      }
    } catch (e) { tries.push("tiktok embed error " + (e.message || e)); }
    // 3. noembed.com, a public oEmbed relay
    try {
      const r = await fetch("https://noembed.com/embed?url=" + encodeURIComponent(page), { headers: H });
      tries.push("noembed " + r.status);
      if (r.ok) { const j = await r.json(); if (j.thumbnail_url) return j.thumbnail_url; tries.push("noembed: " + (j.error || "no thumbnail_url")); }
    } catch (e) { tries.push("noembed error " + (e.message || e)); }
    return "";
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
  const tries = [];
  try {
    const src = await imageUrl(p, u, id, tries);
    if (!src) throw new Error("no thumbnail from " + p);
    tries.push("image " + src.slice(0, 80));
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
    if (q.get("debug")) return new Response("thumb failed: " + String(e.message || e) + "\n" + tries.join("\n"), { status: 404, headers: { "Cache-Control": "no-store" } });
    // The page shows its own platform tile when the image fails to load. Try again in an hour.
    return new Response("not found", { status: 404, headers: { "Netlify-CDN-Cache-Control": "public, durable, s-maxage=3600" } });
  }
};

export const config = { path: ["/api/thumb", "/api/tiktok-thumb"] };
