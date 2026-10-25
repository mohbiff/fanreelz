// Fanreelz: thumbnail for a TikTok video, via TikTok's public oEmbed endpoint (no key needed).
// /api/tiktok-thumb?u=<handle>&id=<video id>  ->  redirects to the current thumbnail image.
// TikTok's image links expire after a while, so the redirect is cached on Netlify's CDN for 6 hours.

export default async (req) => {
  const p = new URL(req.url).searchParams;
  const u = (p.get("u") || "").replace(/[^\w.]/g, "");
  const id = (p.get("id") || "").replace(/\D/g, "");
  if (!u || !id) return new Response("missing u or id", { status: 400 });
  try {
    const r = await fetch("https://www.tiktok.com/oembed?url=" + encodeURIComponent(`https://www.tiktok.com/@${u}/video/${id}`));
    const thumb = r.ok ? (await r.json()).thumbnail_url : "";
    if (!thumb) throw new Error("no thumbnail");
    return new Response(null, {
      status: 302,
      headers: {
        Location: thumb,
        "Cache-Control": "public, max-age=3600",
        "Netlify-CDN-Cache-Control": "public, durable, s-maxage=21600, stale-while-revalidate=3600",
      },
    });
  } catch {
    // The page shows its own TikTok tile when the image fails to load.
    return new Response("not found", { status: 404, headers: { "Netlify-CDN-Cache-Control": "public, s-maxage=600" } });
  }
};

export const config = { path: "/api/tiktok-thumb" };
