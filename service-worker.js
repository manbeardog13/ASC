/* ASC Tire Hotel — service worker.
   Makes the app installable and loads the shell instantly. Network-first for
   same-origin files (so deploys show up right away), cache fallback when
   offline. Live data always comes from Supabase online. */
const CACHE = "asc-tirehotel-v3";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./js/app.js",
  "./js/config.js",
  "./js/supabaseClient.js",
  "./js/store.js",
  "./js/domain.js",
  "./js/offline.js",
  "./js/images.js",
  "./js/ui.js",
  "./js/db.js",
  "./js/qr.js",
  "./js/qrlabel.js",
  "./js/scanner.js",
  "./js/ocr.js",
  "./js/views/dashboard.js",
  "./js/views/checkin.js",
  "./js/views/set-detail.js",
  "./js/views/scan.js",
  "./js/views/warehouse.js",
  "./js/views/customers.js",
  "./js/views/recycle.js",
];

self.addEventListener("install", (e) => {
  // Best-effort precache — never fail install if one file 404s during a deploy.
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
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
