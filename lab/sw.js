/* EMBERLINE service worker
   Network first for everything of our own (bypassing the HTTP cache), so an
   online launch always runs the latest build; the cache is only the offline
   fallback. version.json is never cached: the page polls it to spot updates. */
const CACHE = "emberline:" + self.registration.scope;
const CORE = [
  "./", "index.html", "manifest.webmanifest",
  "js/engine.js", "js/art.js", "js/locations.js", "js/audio.js", "js/data.js", "js/logic.js",
  "js/scenarios.js", "js/views.js", "js/mediator.js", "js/main.js", "js/pwa.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/favicon-32.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(CORE.map((u) =>
    fetch(u, { cache: "reload" }).then((r) => r.ok && c.put(u, r)).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.endsWith("/version.json")) return; // straight to the network
    if (!url.href.startsWith(self.registration.scope)) return; // another app's files
    e.respondWith(fresh(req));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }))));
  }
});

async function fresh(req) {
  const c = await caches.open(CACHE);
  const key = req.mode === "navigate" ? new URL("./", self.registration.scope).href : req.url.split("?")[0];
  try {
    const r = await fetch(req, { cache: "no-cache" });
    if (r.ok) c.put(key, r.clone());
    return r;
  } catch (err) {
    const hit = await c.match(key, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}
