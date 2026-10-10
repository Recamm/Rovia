/* Only the public application shell is cached. API calls, images from Storage,
   map tiles and any authenticated requests always use their own network path. */
const CACHE = "rovia-static-__BUILD_ID__";
const ASSETS = __ASSETS__;
const assetPaths = new Set(ASSETS);
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) => name.startsWith("rovia-static-") && name !== CACHE,
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (
    req.method !== "GET" ||
    url.origin !== self.location.origin ||
    req.headers.has("Authorization")
  )
    return;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/index.html")));
    return;
  }
  if (url.search || !assetPaths.has(url.pathname)) return;
  event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
});
