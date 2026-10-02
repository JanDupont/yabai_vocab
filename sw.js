// Offline support. Network first, so new vocabulary and app updates show up
// as soon as you're online; the cached copy is only used without a connection.
const CACHE = "yabai-vocab";
const CORE = [
  "./",
  "index.html",
  "css/style.css",
  "js/registry.js",
  "js/srs.js",
  "js/sync.js",
  "js/draw.js",
  "js/app.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
];
const NETWORK_TIMEOUT = 4000; // on a very slow connection, fall back to the cache

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  // Only this site's files. GitHub API calls for sync go straight to the network.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  // "no-cache" revalidates with the server instead of using a stale HTTP-cached copy
  // (fetch by URL: page navigations can't be re-issued with a RequestInit)
  const network = fetch(req.url, { cache: "no-cache" }).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  const cached = await cache.match(req, { ignoreSearch: true });
  if (!cached) return network;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT));
  return Promise.race([network.catch(() => cached), timeout]);
}
