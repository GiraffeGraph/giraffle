// Giraffle is offline-first: the vault lives in the browser, so the app shell
// has to be reachable with no network at all. Nothing here touches vault data —
// that never leaves origin-private storage, and it is ciphertext there.
const CACHE = "giraffle-shell-v1";
const APP_SHELL = "/";
const PRECACHE = [APP_SHELL, "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

// The bundle and its assets carry a content hash in the filename, so a stale
// entry can never be the wrong version of itself — serving it from the cache
// first is both correct and the fastest cold start.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

// Every route renders from the same shell, and a navigation must survive being
// offline, so the cached shell stands in whenever the network does not answer.
async function shellFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(APP_SHELL, response.clone());
    }
    return response;
  } catch (cause) {
    const cached = await caches.match(APP_SHELL);
    if (cached) return cached;
    throw cause;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(shellFallback(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});
