const CACHE = "atlas-app-shell-v5";
const SHELL = ["/app/", "/app/index.html", "/app/manifest.webmanifest", "/app/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/ws") return;
  if (url.pathname === "/app/version.json" || url.pathname.endsWith(".wasm")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const copy = response.clone();
          const cache = await caches.open(CACHE);
          await cache.put(request, copy);
        }
        return response;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate" || request.destination === "document") {
          return (await caches.match("/app/index.html")) || (await caches.match("/app/"));
        }
        throw new Error("offline");
      }
    })(),
  );
});
