/* ASC Tire Hotel — service worker.
   Makes the app installable and loads the shell instantly. Network-first for
   same-origin files (so deploys show up right away), cache fallback when
   offline. Live data always comes from Supabase online. */
const CACHE = "asc-tirehotel-v84";   // v84 = offline nav ignoreSearch (deep ?code= links) + index loop-breaker
// Cross-origin dependencies the app cannot boot (or scan) without. Same-origin
// files are precached below; these are runtime-cached network-first so an
// offline cold boot doesn't die on the supabase-js ESM import.
const CDN_HOSTS = ["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];
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
  // Delivered app shell (app/ is the product after the cutover):
  "./app/login.html",
  "./app/dashboard.html",
  "./app/checkin.html",
  "./app/set-detail.html",
  "./app/scan.html",
  "./app/warehouse.html",
  "./app/customers.html",
  "./app/reminders.html",
  "./app/workshop.html",
  "./app/recycle.html",
  "./app/users.html",
  "./app/app.css",
  "./app/app.js",
  "./app/qr.js",
  "./app/layout-edit.js",
  "./app/agent-config.js",
  "./app/agent-gemini.js",
  "./app/live-dashboard.js",
  "./app/live-checkin.js",
  "./app/live-set-detail.js",
  "./app/live-scan.js",
  "./app/live-warehouse.js",
  "./app/live-customers.js",
  "./app/live-reminders.js",
  "./app/live-workshop.js",
  "./app/live-recycle.js",
  "./app/live-users.js",
  "./app/manifest.webmanifest",
  "./app/assets/logo.png",
  "./app/assets/icon.svg",
  "./app/assets/icon-192.png",
  "./app/assets/icon-512.png",
  "./app/assets/apple-touch-icon.png",
  "./app/assets/favicon-32.png",
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
  "./js/views/workshop.js",
  "./js/views/assistant.js",
  "./js/views/shared.js",
  "./js/views/export.js",
  "./js/voice.js",
  "./js/agent.js",
];

self.addEventListener("install", (e) => {
  // Best-effort precache — never fail install if one file 404s during a deploy.
  // cache:"no-cache" revalidates past GitHub Pages' ~10-min HTTP cache so a
  // fresh SW never precaches a stale (version-skewed) shell.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: "no-cache" })))))
      .then(() => self.skipWaiting())
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
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Boot-critical CDN modules (supabase-js ESM graph, QR libs, fonts):
  // network-first, cache clean 200s so an offline cold boot still works.
  // Never touch other cross-origin traffic (Supabase API stays live-only).
  if (url.origin !== self.location.origin) {
    if (!CDN_HOSTS.includes(url.hostname)) return;
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && !res.redirected) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Full page loads (incl. pull-to-refresh): network-first; on failure fall back
  // to the cached app shell. The shell is the ONLY thing we ever answer a
  // navigation with.
  if (req.mode === "navigate") {
    // Only a navigation to the app shell itself may overwrite the cached shell —
    // a 200 for any other same-origin URL (a stray asset opened in the address
    // bar) must never replace index.html for offline users.
    const isShell = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
    e.respondWith(
      // Revalidate with the server (bypass the ~10-min GitHub Pages HTTP cache) so a
      // fresh deploy shows up immediately. Fetch by URL because a navigate-mode
      // Request can't take a cache override.
      fetch(req.url, { cache: "no-cache" })
        .then((res) => {
          if (cacheable(res) && isShell) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("./index.html", copy)).catch(() => {}); }
          return res;
        })
        // Offline: serve the cached copy of the PAGE THE USER ASKED FOR first.
        // ignoreSearch so a deep link (set-detail.html?code=…, checkin.html?
        // prefill=1) matches its precached bare page instead of falling through
        // to the dashboard. Answering every navigation with index.html re-ran its
        // relative redirect against /app/ URLs and looped forever (…/app/app/…).
        .catch(() => caches.match(req, { ignoreSearch: true })
          .then((r) => r || caches.match("./app/dashboard.html"))
          .then((r) => r || caches.match("./index.html"))
          .then((r) => r || caches.match("./")))
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
