/* ASC Tire Hotel — service worker.
   Makes the app installable and loads the shell instantly. Network-first for
   same-origin files (so deploys show up right away), cache fallback when
   offline. Live data always comes from Supabase online. */
const CACHE = "asc-tirehotel-v41";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/apple-touch-icon.png",
  "./assets/asc-logo.png",
  "./assets/asc-mark.png",
  "./js/app.js",
  "./js/motion.js",
  "./js/i18n.js",
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
  "./js/views/users.js",
  "./js/views/recycle.js",
  "./js/views/reminders.js",
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

// Only ever cache clean, complete, same-origin 200s — never opaque, redirected,
// or error responses (any of those, served back later, can wedge the app).
function cacheable(res) {
  return res && res.ok && res.type === "basic" && !res.redirected;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  // Full page loads (incl. pull-to-refresh): network-first; on failure fall back
  // to the cached app shell. The shell is the ONLY thing we ever answer a
  // navigation with.
  if (req.mode === "navigate") {
    e.respondWith(
      // Revalidate with the server (bypass the ~10-min GitHub Pages HTTP cache) so a
      // fresh deploy shows up immediately. Fetch by URL because a navigate-mode
      // Request can't take a cache override.
      fetch(req.url, { cache: "no-cache" })
        .then((res) => {
          if (cacheable(res)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("./index.html", copy)).catch(() => {}); }
          return res;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // Scripts / styles / images / data: network-first, cache clean 200s.
  // CRUCIAL: if it's not cached and the network fails, let it fail — do NOT fall
  // back to index.html. Serving HTML for a .js request makes the browser throw a
  // parse error and white-screens the whole app (this was the reload crash).
  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((res) => {
        if (cacheable(res)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
