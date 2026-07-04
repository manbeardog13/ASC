/* ASC Tire Hotel — minimal service worker.
   Goal: make the app installable on a phone and load the shell instantly.
   Strategy: network-first for same-origin files (so deploys show up right away),
   falling back to cache when offline. Live data always comes from Supabase online. */
const CACHE = "asc-tirehotel-v2";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/config.js",
  "./js/db.js",
  "./js/supabaseClient.js",
  "./js/scanner.js",
  "./js/qrlabel.js",
  "./js/ocr.js",
  "./manifest.webmanifest",
  "./assets/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  // Only handle GET requests from our own origin; let Supabase/CDN calls pass through.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});
