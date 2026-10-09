/* DQCX Radar service worker.
   Shell assets are cache-first. Each build uses a new cache name.
   board.json is network-first so a rebuilt board shows up, with the
   last cached copy used when the network is down.
*/
const CACHE = "dqcx-radar-20261009T040021Z";
const SHELL = [
  "./index.html",
  "./app.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./board.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isBoard(url) {
  return url.pathname.endsWith("/board.json");
}

async function networkFirstBoard(req) {
  const cache = await caches.open(CACHE);
  const stable = new Request(new URL("./board.json", self.registration.scope).toString());
  try {
    const res = await fetch(req, { cache: "no-store" });
    if (res && res.ok) await cache.put(stable, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(stable);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("X-DQCX-Source", "cache");
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }
    return new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) await cache.put(req, res.clone());
    return res;
  } catch (err) {
    if (req.mode === "navigate") {
      const index = await cache.match("./index.html");
      if (index) return index;
    }
    return new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch (err) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (isBoard(url)) {
    event.respondWith(networkFirstBoard(req));
    return;
  }
  event.respondWith(cacheFirst(req));
});
