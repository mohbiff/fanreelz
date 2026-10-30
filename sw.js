// Fanreelz service worker: makes the site installable as an app and shows the last loaded page offline.
// It only handles pages and icons on fanreelz.com itself; sign-in, the API and video players always go straight to the network.
const CACHE = "fanreelz-v3";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/icons/icon-192.png", "/icons/icon-512.png"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (e.request.mode === "navigate") {
    // Always try the network first so the app is never stale; fall back to the saved copy offline.
    e.respondWith(fetch(e.request).then(async (r) => {
      const copy = r.clone(); caches.open(CACHE).then((c) => c.put("/", copy));
      const type = r.headers.get("content-type") || "";
      if (!type.includes("text/html")) return r;
      const html = await r.text();
      const injected = html.replace("</body>", '<script src="/insights-privacy.js?v=1"></script></body>');
      const headers = new Headers(r.headers); headers.delete("content-length"); headers.delete("content-encoding");
      return new Response(injected, { status:r.status, statusText:r.statusText, headers });
    }).catch(() => caches.match("/")));
    return;
  }
  if (url.pathname.startsWith("/icons/")) e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request)));
});
