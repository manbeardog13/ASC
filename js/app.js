// ============================================================================
// app.js — routing + UI orchestration. Owns the app frame (top bar, bottom
// tabs), the router (lazy-loaded views = code splitting), auth/setup gates,
// keyboard shortcuts, and the realtime → active-view refresh wiring.
// Business rules live in domain.js; data lives in db.js; primitives in ui.js.
// ============================================================================
import { isConfigured } from "./supabaseClient.js";
import { getState, setState, on, setViewRefresh, refreshActiveView, loadRecentLocations } from "./store.js";
import { initOffline } from "./offline.js";
import * as db from "./db.js";
import { icon, esc, go, toast, busy, setThemeColor } from "./ui.js";
import { t, lang, setLang, LANGS, onLangChange } from "./i18n.js";
import { initMotion } from "./motion.js";

document.documentElement.lang = lang();

// Self-heal a stale/mismatched shell: if a cached OLD index.html (which used a
// different mount element) is served with this NEW app.js, the mount point would
// be missing and the app would silently white-screen. Create it if absent.
let root = document.getElementById("app-root");
if (!root) {
  document.body.innerHTML = "";
  root = document.createElement("div");
  root.id = "app-root";
  document.body.appendChild(root);
}
// The JS bundle parsed and is executing → tell the recovery watchdog we're alive.
// (Its only job is to catch a bundle that failed to load, NOT a slow network.)
window.__ascBooted = true;
initMotion();   // magnetic hover + tactile press (spring physics; delegated once)
let realtimeChannel = null;
let refreshTimer = null;
// Captured before Supabase consumes the URL: an invite/recovery link lands here
// with `type=invite|recovery` in the hash → the user must set a password first.
let mustSetPassword = /type=(invite|recovery)/.test(location.hash);

// Also captured before Supabase strips the URL: if the OAuth round-trip failed,
// we're bounced back with an error in the hash (implicit: #error=…&error_description=…)
// or query (?error=…). Without this the login screen silently reappears with no
// explanation ("goes all the way, lands back on login"). Surface it instead — it
// both tells the user what happened and reveals the real cause (e.g. a signup-trigger
// error shows here as "Database error saving new user").
let pendingAuthError = (() => {
  try {
    const h = new URLSearchParams(location.hash.replace(/^#\/?/, ""));
    const q = new URLSearchParams(location.search);
    const raw = h.get("error_description") || q.get("error_description")
             || h.get("error") || q.get("error");
    return raw ? decodeURIComponent(raw).replace(/\+/g, " ") : "";
  } catch { return ""; }
})();

// ---- Routes (each view module exports `render(main, ctx)`) --------------------
const ROUTES = [
  { pattern: /^\/?$/,                     load: () => import("./views/dashboard.js") },
  { pattern: /^\/workshop$/,              load: () => import("./views/workshop.js") },
  { pattern: /^\/assistant$/,             load: () => import("./views/assistant.js") },
  { pattern: /^\/checkin$/,               load: () => import("./views/checkin.js") },
  { pattern: /^\/scan$/,                  load: () => import("./views/scan.js") },
  { pattern: /^\/warehouse$/,             load: () => import("./views/warehouse.js") },
  { pattern: /^\/customers$/,             load: () => import("./views/customers.js") },
  { pattern: /^\/customer\/([^/]+)$/,     load: () => import("./views/customers.js") },
  { pattern: /^\/users$/,                 load: () => import("./views/users.js") },
  { pattern: /^\/reminders$/,             load: () => import("./views/reminders.js") },
  { pattern: /^\/recycle$/,               load: () => import("./views/recycle.js") },
  { pattern: /^\/set\/([^/]+)\/edit$/,    load: () => import("./views/set-detail.js"), mode: "edit" },
  { pattern: /^\/set\/([^/]+)$/,          load: () => import("./views/set-detail.js") },
];

const NAV = [
  { route: "/",          key: "nav.home",      iconName: "home" },
  { route: "/checkin",   key: "nav.checkin",   iconName: "plus" },
  { route: "/scan",      key: "nav.scan",      iconName: "scan", center: true },
  { route: "/warehouse", key: "nav.warehouse", iconName: "map" },
  { route: "/customers", key: "nav.customers", iconName: "people" },
];

// Flag language switch (US = English, HR = Croatian). Inline SVGs so the flags
// render identically on iOS and Windows (emoji flags don't render on Windows).
// Clicks are caught by the delegated [data-lang] handler.
const FLAGS = {
  en: '<svg class="flag" viewBox="0 0 24 16" aria-hidden="true"><clipPath id="us-c"><rect width="24" height="16" rx="2.5"/></clipPath><g clip-path="url(#us-c)"><rect width="24" height="16" fill="#fff"/><g fill="#b22234"><rect width="24" height="1.23"/><rect y="2.46" width="24" height="1.23"/><rect y="4.92" width="24" height="1.23"/><rect y="7.39" width="24" height="1.23"/><rect y="9.85" width="24" height="1.23"/><rect y="12.31" width="24" height="1.23"/><rect y="14.77" width="24" height="1.23"/></g><rect width="10.4" height="8.62" fill="#3c3b6e"/><g fill="#fff"><circle cx="1.7" cy="1.5" r=".55"/><circle cx="4.2" cy="1.5" r=".55"/><circle cx="6.7" cy="1.5" r=".55"/><circle cx="9.2" cy="1.5" r=".55"/><circle cx="2.95" cy="3.1" r=".55"/><circle cx="5.45" cy="3.1" r=".55"/><circle cx="7.95" cy="3.1" r=".55"/><circle cx="1.7" cy="4.7" r=".55"/><circle cx="4.2" cy="4.7" r=".55"/><circle cx="6.7" cy="4.7" r=".55"/><circle cx="9.2" cy="4.7" r=".55"/><circle cx="2.95" cy="6.3" r=".55"/><circle cx="5.45" cy="6.3" r=".55"/><circle cx="7.95" cy="6.3" r=".55"/></g></g></svg>',
  hr: '<svg class="flag" viewBox="0 0 24 16" aria-hidden="true"><clipPath id="hr-c"><rect width="24" height="16" rx="2.5"/></clipPath><g clip-path="url(#hr-c)"><rect width="24" height="5.34" fill="#ff0000"/><rect y="5.34" width="24" height="5.32" fill="#fff"/><rect y="10.66" width="24" height="5.34" fill="#171796"/><g transform="translate(9.4,3.2)"><rect width="5.2" height="6.4" rx=".4" fill="#fff" stroke="#0a3aa0" stroke-width=".4"/><g fill="#d80027"><rect width="1.3" height="1.28"/><rect x="2.6" width="1.3" height="1.28"/><rect x="1.3" y="1.28" width="1.3" height="1.28"/><rect x="3.9" y="1.28" width="1.3" height="1.28"/><rect y="2.56" width="1.3" height="1.28"/><rect x="2.6" y="2.56" width="1.3" height="1.28"/><rect x="1.3" y="3.84" width="1.3" height="1.28"/><rect x="3.9" y="3.84" width="1.3" height="1.28"/><rect y="5.12" width="1.3" height="1.28"/><rect x="2.6" y="5.12" width="1.3" height="1.28"/></g></g></g></svg>',
};
// A single flag showing the CURRENT language. Tapping it cross-fades to the other
// language's flag over 1s (handled below), then switches the language.
function langToggle(onGlass) {
  const cur = lang();
  const target = cur === "hr" ? "en" : "hr";
  const targetName = (LANGS.find((l) => l.code === target) || {}).name || target;
  return `<button type="button" class="flag-swap${onGlass ? " on-glass" : ""}" data-lang-swap data-cur="${cur}" data-target="${target}" aria-label="${targetName}" title="${targetName}">
    <span class="flag-stack">
      <span class="flag-face" data-face="hr">${FLAGS.hr}</span>
      <span class="flag-face" data-face="en">${FLAGS.en}</span>
    </span>
  </button>`;
}

// ---- App frame (built once when signed in) -----------------------------------
function mountFrame() {
  if (document.getElementById("main")) return;
  root.innerHTML = `
    <header class="topbar">
      <a class="brand-logo" href="#/" aria-label="ASC"><img src="assets/asc-logo-tight.png" alt="ASC"></a>
      <nav class="topbar-desk-nav" aria-label="Primary">
        ${NAV.filter((n) => !n.center).map((n) => `<a href="#${n.route}" data-route="${n.route}">${icon(n.iconName, 18)}${t(n.key)}</a>`).join("")}
        <a href="#/users" data-route="/users">${icon("people", 18)}${t("nav.users")}<span class="nav-badge users-badge" hidden></span></a>
      </nav>
      <span class="spacer"></span>
      ${langToggle(false)}
      <span id="conn" class="conn"></span>
      <button id="menuBtn" class="btn btn-ghost" style="min-height:40px;padding:0 10px;position:relative" aria-haspopup="menu" aria-label="More">${icon("list", 20)}<span class="menu-dot users-dot" hidden></span></button>
    </header>
    <main id="main"></main>
    <nav class="tabbar" aria-label="Sections">
      ${NAV.map((n) => n.center
        ? `<a href="#${n.route}" data-route="${n.route}" class="scan-tab" aria-label="${t(n.key)}"><span class="scan-orb">${icon(n.iconName, 24)}</span></a>`
        : `<a href="#${n.route}" data-route="${n.route}"><span class="ic">${icon(n.iconName, 22)}</span>${t(n.key)}</a>`
      ).join("")}
    </nav>`;
  document.getElementById("menuBtn").addEventListener("click", openMenu);
  renderConn();
  renderUsersBadge();
}

// Pending-approval badge on the Users nav link + a dot on the ⋮ menu (admins only;
// non-admins always see 0 via RLS, so nothing shows).
function renderUsersBadge() {
  const n = getState().pendingApprovals || 0;
  document.querySelectorAll(".users-badge").forEach((b) => { b.textContent = n; b.hidden = !n; });
  document.querySelectorAll(".users-dot").forEach((d) => { d.hidden = !n; });
}

function setActiveNav(path) {
  const base = "/" + (path.split("/")[1] || "");
  document.querySelectorAll("[data-route]").forEach((a) => {
    a.classList.toggle("active", a.dataset.route === base || (base === "/" && a.dataset.route === "/"));
  });
}

// ---- Connection pill ----------------------------------------------------------
function renderConn() {
  const el = document.getElementById("conn");
  if (!el) return;
  const { online, syncPending } = getState();
  let cls, html, key;
  if (online && !syncPending) {
    cls = "conn conn-online"; key = "on";
    html = `<span class="dot"></span><span class="ctext">${t("conn.online")}</span>`;
  } else if (online && syncPending) {
    cls = "conn conn-offline"; key = "sync:" + syncPending;
    html = `${icon("clock", 14)}${t("conn.syncing", { n: syncPending })}`;
  } else {
    cls = "conn conn-offline"; key = "off:" + (syncPending || 0);
    html = `${icon("wifiOff", 14)}${t("conn.offline")}${syncPending ? t("conn.queued", { n: syncPending }) : ""}`;
  }
  morphConn(el, cls, html, key);
}

// Dynamic-Island-style morph for the connection pill: the current content lifts
// and fades out, the pill width springs to the new size, and the new content
// rises + fades in. Never a hard swap. First paint + reduced-motion are instant.
function morphConn(el, cls, html, key) {
  if (el.dataset.k === key) return;
  const firstPaint = !el.dataset.k;
  el.dataset.k = key;
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (firstPaint || reduce || !el.animate) { el.className = cls; el.innerHTML = html; return; }
  const w0 = el.getBoundingClientRect().width;
  const out = el.animate(
    [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-5px)" }],
    { duration: 150, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
  out.onfinish = () => {
    out.cancel();
    el.className = cls; el.innerHTML = html;
    const w1 = el.getBoundingClientRect().width;
    el.style.width = w0 + "px"; void el.getBoundingClientRect();
    el.style.transition = "width .44s cubic-bezier(.34,1.4,.5,1)";
    el.style.width = w1 + "px";
    el.animate(
      [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 320, easing: "cubic-bezier(.16,1,.3,1)" });
    setTimeout(() => { el.style.width = ""; el.style.transition = ""; }, 520);
  };
}

// ---- Overflow menu ------------------------------------------------------------
// Snappy close: picking any item, navigating, Escape, or an outside click all
// dismiss the menu with a fast scale/fade-out — it never lingers. `menuCleanup`
// tears down the global listeners so nothing leaks between opens.
let menuCleanup = null;
function closeMenu() {
  const pop = document.getElementById("menuPop");
  if (!pop || pop.classList.contains("out")) return;
  if (menuCleanup) { menuCleanup(); menuCleanup = null; }
  pop.classList.add("out");
  const done = () => pop.remove();
  pop.addEventListener("transitionend", done, { once: true });
  setTimeout(done, 180);  // fallback if the transition is skipped (reduced-motion)
}
function openMenu() {
  if (document.getElementById("menuPop")) { closeMenu(); return; }
  const role = getState().profile?.role ?? "manager";
  const pop = document.createElement("div");
  pop.id = "menuPop";
  pop.className = "card menu-pop";
  pop.style.cssText = "position:fixed;top:52px;right:12px;z-index:50;padding:6px;min-width:210px;box-shadow:var(--shadow-pop)";
  pop.setAttribute("role", "menu");
  const item = (route, iconName, label) =>
    `<a href="#${route}" role="menuitem" class="btn btn-ghost" style="justify-content:flex-start;width:100%">${icon(iconName, 18)}${label}</a>`;
  const pending = getState().pendingApprovals || 0;
  const canWorkshop = db.isAdminRole(role) || role === "employee";
  pop.innerHTML = `
    ${canWorkshop ? item("/workshop", "box", t("menu.workshop")) : ""}
    ${item("/assistant", "agent", t("menu.assistant"))}
    <a href="#/users" role="menuitem" class="btn btn-ghost" style="justify-content:flex-start;width:100%">${icon("people", 18)}${t("menu.users")}${pending ? `<span class="nav-badge" style="margin-left:auto">${pending}</span>` : ""}</a>
    ${item("/reminders", "clock", t("menu.reminders"))}
    ${item("/recycle", "trash", t("menu.recycle"))}
    <button id="exportBtn" role="menuitem" class="btn btn-ghost" style="justify-content:flex-start;width:100%">${icon("download", 18)}${t("menu.export")}</button>
    <div style="border-top:1px solid var(--line);margin:6px 4px"></div>
    <div style="padding:6px 10px;font-size:12px;color:var(--muted)">${t("menu.signedInAs", { role: esc(role) })}</div>
    <button id="signOutBtn" role="menuitem" class="btn btn-ghost" style="justify-content:flex-start;width:100%">${icon("logout", 18)}${t("menu.signout")}</button>`;
  document.body.appendChild(pop);
  requestAnimationFrame(() => pop.classList.add("in"));   // trigger the enter transition

  const onDocClick = (e) => { if (!pop.contains(e.target) && e.target.id !== "menuBtn" && !e.target.closest?.("#menuBtn")) closeMenu(); };
  const onHash = () => closeMenu();
  const onKey = (e) => { if (e.key === "Escape") closeMenu(); };
  setTimeout(() => {
    document.addEventListener("click", onDocClick, true);
    window.addEventListener("hashchange", onHash);
    document.addEventListener("keydown", onKey);
  }, 0);
  menuCleanup = () => {
    document.removeEventListener("click", onDocClick, true);
    window.removeEventListener("hashchange", onHash);
    document.removeEventListener("keydown", onKey);
  };

  // Choosing a navigation item closes the menu at once (the link still navigates).
  pop.addEventListener("click", (e) => { if (e.target.closest("a[role=menuitem]")) closeMenu(); });
  pop.querySelector("#signOutBtn").onclick = async () => { closeMenu(); await db.signOut(); };
  pop.querySelector("#exportBtn").onclick = async (e) => {
    const btn = e.currentTarget;         // currentTarget is null after any await
    if (btn.disabled) return;
    busy(btn, true);
    try {
      const { exportInventoryCsv } = await import("./views/export.js");
      await exportInventoryCsv();
    } catch (err) { toast(err.message, "err"); }
    busy(btn, false);
    closeMenu();
  };
}

// ---- Router -------------------------------------------------------------------
// Each navigation gets a sequence number; a route() run that finished after a
// newer one started must not touch the DOM (slow view loads used to clobber
// the screen the user had already navigated to).
let navSeq = 0;
async function route() {
  const seq = ++navSeq;
  const stale = () => seq !== navSeq;
  // A QR deep-link (#/set/CODE?v=2&k=<checksum>) carries a query INSIDE the hash;
  // when opened by a phone's native camera it lands here, so strip the query
  // before route matching — otherwise the code param becomes "CODE?v=2&k=..." and
  // the set lookup fails ("No set called ASC-2026-0005?v=2&k=IK2P"). Auth reads
  // location.hash directly, so this only affects app routing.
  const path = (location.hash.replace(/^#/, "").split("?")[0] || "/");
  setViewRefresh(null);
  // Views with live resources (camera, mic, timers) listen for this and shut
  // them down — it fires on EVERY view swap, including ones with no hashchange
  // (sign-out, access gate, language change).
  window.dispatchEvent(new Event("asc:teardown"));
  setState({ route: path });

  if (!isConfigured()) return renderSetup();
  const session = await db.getSession();
  if (!session) return renderLogin();

  // Finish an emailed invite / password reset before anything else.
  if (mustSetPassword) return renderSetPassword();

  // Gate only a KNOWN-readonly (inert) account. If the profile hasn't loaded yet,
  // render the app now — RLS protects the data, and boot() re-routes to the gate if
  // the profile resolves as readonly. Never block the first paint on the profile
  // fetch: on a slow phone that left a logged-in reload showing nothing at all.
  const profile = getState().profile;
  if (profile && profile.role === "readonly") return renderAccessGate();
  // Everyone must have stated their first + last name before using the app —
  // the greeting, the agent and the user directory all build on it.
  if (profile && !(profile.full_name || "").trim()) return renderNameGate();

  mountFrame();
  setActiveNav(path);
  const main = document.getElementById("main");

  const match = ROUTES.map((r) => ({ r, m: path.match(r.pattern) })).find((x) => x.m);
  if (!match) { main.innerHTML = `<div class="card"><h2>${t("common.notFound")}</h2><p class="muted"><a href="#/">${t("nav.home")}</a></p></div>`; return; }

  main.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
  try {
    const mod = await match.r.load();
    if (stale()) return;                 // user already navigated elsewhere
    await mod.render(main, { params: match.m.slice(1), mode: match.r.mode, go });
    if (stale()) return;
    // Replay the view-enter transition so every navigation glides in.
    main.classList.remove("view-enter"); void main.offsetWidth; main.classList.add("view-enter");
  } catch (err) {
    if (stale()) return;                 // never overwrite the NEWER view with an error card
    console.error(err);
    main.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="muted">${esc(err.message || "Please try again.")}</p>
      <button class="btn" onclick="location.reload()">Reload</button></div>`;
  }
}

// ---- Realtime → refresh the open view ----------------------------------------
function startRealtime() {
  if (realtimeChannel) return;
  realtimeChannel = db.subscribeToChanges(() => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshActiveView(), 250);
  });
}
function stopRealtime() {
  if (realtimeChannel) { db.unsubscribe(realtimeChannel); realtimeChannel = null; }
}

// ---- Setup + login screens ----------------------------------------------------
function renderSetup() {
  stopRealtime();
  root.innerHTML = `<main><div class="card center-narrow stack">
    <div class="empty-icon" style="margin-inline:0">${icon("box", 40)}</div>
    <h1>ASC</h1>
    <p class="muted">${t("setup.body")}</p>
  </div></main>`;
}

// Signed in, but the account has no role yet (fresh signup awaiting an admin, or
// removed). No app data is reachable — show a calm gate with a way out.
function renderAccessGate() {
  stopRealtime();
  root.innerHTML = `
    <div class="login-canvas">
      <div class="login-langs-top">${langToggle(true)}</div>
      <div class="login-stage">
        <img class="login-logo" src="assets/asc-logo.png" alt="ASC">
        <div class="glass-card login-card" style="text-align:center">
          <div class="gate-icon">${icon("clock", 30)}</div>
          <h2 style="margin-bottom:8px">${t("gate.title")}</h2>
          <p class="muted" style="font-size:14px">${t("gate.body")}</p>
          <button id="gateOut" class="btn btn-block" style="margin-top:20px">${icon("logout", 18)} ${t("menu.signout")}</button>
        </div>
      </div>
    </div>`;
  document.getElementById("gateOut").onclick = async () => { setState({ profile: null }); await db.signOut(); };
}

// Signed in but nameless (older account, or a provider that sent no name):
// ask once for first + last name before letting them in.
function renderNameGate() {
  stopRealtime();
  root.innerHTML = `
    <div class="login-canvas">
      <div class="login-langs-top">${langToggle(true)}</div>
      <div class="login-stage">
        <img class="login-logo" src="assets/asc-logo.png" alt="ASC">
        <div class="glass-card login-card">
          <div class="login-tagline">${t("namegate.title")}</div>
          <p class="muted" style="text-align:center;font-size:13.5px;margin:-8px 0 16px">${t("namegate.body")}</p>
          <form id="nameForm" novalidate>
            <label class="field"><span class="label">${t("login.firstName")}</span>
              <input id="ngFirst" type="text" autocomplete="given-name" required></label>
            <label class="field"><span class="label">${t("login.lastName")}</span>
              <input id="ngLast" type="text" autocomplete="family-name" required></label>
            <button class="btn-sunset" type="submit">${t("namegate.submit")}</button>
            <p id="ngErr" class="login-err hidden"></p>
          </form>
        </div>
      </div>
    </div>`;
  const form = document.getElementById("nameForm");
  const err = document.getElementById("ngErr");
  setTimeout(() => document.getElementById("ngFirst")?.focus({ preventScroll: true }), 80);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const first = document.getElementById("ngFirst").value.trim();
    const last = document.getElementById("ngLast").value.trim();
    err.classList.add("hidden");
    if (!first || !last) { err.textContent = t("login.nameRequired"); err.classList.remove("hidden"); return; }
    const btn = form.querySelector("button[type=submit]");
    busy(btn, true);
    try {
      const full = `${first} ${last}`;
      await db.setMyName(full);
      setState({ profile: { ...getState().profile, full_name: full } });
      toast(t("hello.signin", { name: first }));
      route();
    } catch (e2) {
      err.textContent = e2.message; err.classList.remove("hidden");
      busy(btn, false);
    }
  };
}

// After an emailed invite / reset link: the user is signed in but must choose a
// password before using the app.
function renderSetPassword() {
  stopRealtime();
  root.innerHTML = `
    <div class="login-canvas">
      <div class="login-stage">
        <img class="login-logo" src="assets/asc-logo.png" alt="ASC">
        <div class="glass-card login-card">
          <div class="login-tagline">${t("setpw.title")}</div>
          <p class="muted" style="text-align:center;font-size:13.5px;margin:-8px 0 16px">${t("setpw.body")}</p>
          <form id="pwForm" novalidate>
            <label class="field"><span class="label">${t("setpw.new")}</span>
              <input id="pw1" type="password" autocomplete="new-password" required></label>
            <label class="field"><span class="label">${t("setpw.confirm")}</span>
              <input id="pw2" type="password" autocomplete="new-password" required></label>
            <button class="btn-sunset" type="submit">${t("setpw.submit")}</button>
            <p id="pwErr" class="login-err hidden"></p>
          </form>
        </div>
      </div>
    </div>`;
  const form = document.getElementById("pwForm");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = document.getElementById("pwErr");
    const p1 = document.getElementById("pw1").value;
    const p2 = document.getElementById("pw2").value;
    err.classList.add("hidden");
    if (p1.length < 6) { err.textContent = t("login.minPass"); err.classList.remove("hidden"); return; }
    if (p1 !== p2) { err.textContent = t("setpw.mismatch"); err.classList.remove("hidden"); return; }
    const btn = form.querySelector("button");
    busy(btn, true);
    try {
      await db.updatePassword(p1);
      mustSetPassword = false;
      toast(t("setpw.done"));
      location.hash = "#/";
      await boot();
    } catch (e2) {
      err.textContent = e2.message;
      err.classList.remove("hidden");
      busy(btn, false);
    }
  };
  setTimeout(() => document.getElementById("pw1")?.focus({ preventScroll: true }), 80);
}

// Auth-screen icons (login-specific, inline to avoid touching the shared icon set).
const A_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7.5l8.5 5.5 8.5-5.5"/></svg>';
const A_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>';
const A_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>';
const A_EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l16 16"/><path d="M9.6 5.8A10.7 10.7 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17.6 17.6 0 0 1-3.3 4M6.4 7.7A17.3 17.3 0 0 0 2 12s3.6 6.5 10 6.5c1 0 2-.1 2.9-.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
const A_GOOGLE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.28 1.48-1.13 2.73-2.41 3.58v2.97h3.9c2.28-2.1 3.56-5.19 3.56-8.79z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.9-2.97c-1.08.72-2.45 1.15-4.05 1.15-3.12 0-5.76-2.11-6.71-4.94H1.28v3.06C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.29 14.33c-.24-.72-.38-1.49-.38-2.28s.14-1.56.38-2.28V6.71H1.28C.47 8.31 0 10.1 0 12s.47 3.69 1.28 5.29l4.01-3.06z"/><path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.28 6.71l4.01 3.06C6.24 6.86 8.88 4.75 12 4.75z"/></svg>';
const A_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const A_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/></svg>';

// Minimal auth screen (dark, card-less): logo, form, language flag top-right.
// `mode` is "signin" (default) or "signup"; the toggle swaps only the form body.
// Keep in sync with service-worker CACHE version on every ship.
const APP_V = "v74";

// Stage chips: real cached counts from the last dashboard visit (written by
// views/dashboard.js) — never fake numbers. Falls back to feature labels on
// a device that has never signed in.
function loginChips() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem("asc.loginChips") || "null"); } catch { /* ignore */ }
  const c1 = s && Number.isFinite(s.inStorage) ? t("login.chipSets", { n: s.inStorage }) : t("login.chipLive");
  const c2 = s && Number.isFinite(s.dueSoon) ? t("login.chipDue", { n: s.dueSoon }) : t("login.chipQr");
  return `<span class="schip schip-live"><i></i>${esc(c1)}</span>
    <span class="schip">${esc(c2)}</span>
    <span class="schip">${APP_V}</span>`;
}

function renderLogin(mode = "signin") {
  stopRealtime();
  // Redundant auth events (INITIAL_SESSION, token refreshes) re-run boot()/route();
  // don't rebuild if the login is already on screen.
  if (document.getElementById("loginBody")) return;
  let themeDark = false;
  try { themeDark = localStorage.getItem("asc.theme") === "dark"; } catch { /* ignore */ }
  setThemeColor(themeDark);
  const cur = lang();
  root.innerHTML = `
    <div class="login-canvas auth${themeDark ? " theme-dark" : ""}">
      <div class="auth-bg" aria-hidden="true">
        <i class="ab-bloom"></i>
        <i class="ab-sash"></i>
        <i class="ab-arc"></i>
        <i class="ab-ember"></i>
        <i class="ab-cursor"></i>
        <i class="ab-grain"></i>
      </div>
      <div class="auth-shell">
        <section class="auth-stage">
          <img class="auth-logo" src="assets/asc-logo-tight.png" alt="ASC — Auto Servisni Centar d.o.o.">
          <h2 class="stage-title">${t("login.stageTitle1")}<br><span>${t("login.stageTitle2")}</span></h2>
          <p class="stage-lead">${t("login.stageLead")}</p>
          <div class="stage-chips">${loginChips()}</div>
          <span class="stage-notch">${t("login.stageNotch")}</span>
        </section>
        <section class="auth-side">
          <div class="auth-seg" role="group">
            <button type="button" class="seg-opt${cur === "hr" ? " on" : ""}" data-lang-set="hr"><i class="seg-glow"></i>HR</button>
            <button type="button" class="seg-opt${cur === "en" ? " on" : ""}" data-lang-set="en"><i class="seg-glow"></i>EN</button>
            <button type="button" class="seg-mode" id="themeToggle" aria-label="Tema / Theme"><i></i></button>
          </div>
          <div id="loginBody"></div>
        </section>
      </div>
    </div>`;
  // Language segments — same mechanism as the old flag (setLang re-renders everything).
  root.querySelectorAll("[data-lang-set]").forEach((b) => {
    b.addEventListener("click", () => { if (b.dataset.langSet !== lang()) setLang(b.dataset.langSet); });
  });
  // Light/dark — login-scoped for now (class + persisted preference).
  root.querySelector("#themeToggle").addEventListener("click", () => {
    const canvas = root.querySelector(".login-canvas.auth");
    const dark = canvas.classList.toggle("theme-dark");
    setThemeColor(dark);
    try { localStorage.setItem("asc.theme", dark ? "dark" : "light"); } catch { /* ignore */ }
  });
  // Cursor glow — moved with transform only (compositor-frame, zero lag).
  // Pointer devices only; reduced-motion hides it via CSS.
  const glowEl = root.querySelector(".ab-cursor");
  if (window.__ascGlowMove) window.removeEventListener("pointermove", window.__ascGlowMove);
  if (glowEl && window.matchMedia?.("(hover: hover)").matches) {
    window.__ascGlowMove = (e) => {
      if (!glowEl.isConnected) { window.removeEventListener("pointermove", window.__ascGlowMove); window.__ascGlowMove = null; return; }
      glowEl.style.transform = `translate3d(${e.clientX - 320}px, ${e.clientY - 320}px, 0)`;
    };
    window.addEventListener("pointermove", window.__ascGlowMove, { passive: true });
  }
  paintLogin(mode);
  setTimeout(() => document.getElementById("email")?.focus({ preventScroll: true }), 80);
}

function paintLogin(mode) {
  const signup = mode === "signup";
  const body = document.getElementById("loginBody");

  const emailField = `<label class="fieldx"><span class="fx-icon">${A_MAIL}</span>
      <input id="email" type="email" placeholder="${t("login.email")}" autocomplete="${signup ? "email" : "username"}" required></label>`;
  const passField = `<label class="fieldx"><span class="fx-icon">${A_LOCK}</span>
      <input id="password" type="password" placeholder="${t("login.password")}" autocomplete="${signup ? "new-password" : "current-password"}" required>
      <button type="button" class="fx-eye" id="pwToggle" aria-label="${t("login.showPw")}">${A_EYE}</button></label>`;
  const googleBtn = `<button type="button" class="btn-google" id="googleBtn">${A_GOOGLE}<span>${t("login.google")}</span></button>`;
  const status = `<p id="loginErr" class="auth-err hidden"></p><p id="loginOk" class="auth-ok hidden"></p>`;

  // Everyone must state who they are — first and last name, asked up front.
  const nameFields = `<div class="auth-names">
      <label class="fieldx"><span class="fx-icon">${A_USER}</span>
        <input id="firstName" type="text" placeholder="${t("login.firstName")}" autocomplete="given-name" required></label>
      <label class="fieldx"><span class="fx-icon">${A_USER}</span>
        <input id="lastName" type="text" placeholder="${t("login.lastName")}" autocomplete="family-name" required></label>
    </div>`;

  const ctaArrow = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
  body.innerHTML = signup
    ? `<h1 class="auth-title">${t("login.createTitle")}</h1>
      <form id="loginForm" class="auth-form" novalidate>
        ${nameFields}${emailField}${passField}
        <button class="btn-amber" type="submit">${t("login.signupCta")}${ctaArrow}</button>
        ${status}
        <div class="auth-divider"><span>${t("login.or")}</span></div>
        ${googleBtn}
        <p class="auth-create"><button type="button" id="loginSwitch" class="auth-create-link">${t("login.haveAccount")}</button></p>
      </form>`
    : `<h1 class="auth-title">${t("login.welcomeBack")}</h1>
      <p class="auth-sub">${t("login.welcomeSub")}</p>
      <form id="loginForm" class="auth-form" novalidate>
        ${googleBtn}
        <div class="auth-divider"><span>${t("login.orEmail")}</span></div>
        ${emailField}${passField}
        <div class="auth-row auth-row--end">
          <button type="button" id="forgot" class="auth-forgot">${t("login.forgot")}</button>
        </div>
        <button class="btn-amber" type="submit">${t("login.signin")}${ctaArrow}</button>
        ${status}
        <p class="auth-create">${t("login.firstTime")} <button type="button" id="loginSwitch" class="auth-create-link">${t("login.createAccount")}</button></p>
      </form>`;

  const form = body.querySelector("#loginForm");
  const err = body.querySelector("#loginErr");
  const ok = body.querySelector("#loginOk");
  const pwInput = body.querySelector("#password");
  const remember = body.querySelector("#remember");
  const showErr = (m) => { err.textContent = m; err.classList.remove("hidden"); ok.classList.add("hidden"); };
  const showOk = (m) => { ok.textContent = m; ok.classList.remove("hidden"); err.classList.add("hidden"); };
  const clearMsg = () => { err.classList.add("hidden"); ok.classList.add("hidden"); };

  // A failed OAuth return (captured at load, before Supabase stripped the URL) —
  // show it once so the sign-in bounce is explained instead of silent.
  if (pendingAuthError) { showErr(pendingAuthError); pendingAuthError = ""; }

  // Show / hide password
  const pwToggle = body.querySelector("#pwToggle");
  pwToggle.onclick = () => {
    const reveal = pwInput.type === "password";
    pwInput.type = reveal ? "text" : "password";
    pwToggle.innerHTML = reveal ? A_EYE_OFF : A_EYE;
    pwToggle.setAttribute("aria-label", t(reveal ? "login.hidePw" : "login.showPw"));
  };

  // Silent remember — always prefill the last signed-in email (no checkbox, per v2).
  if (!signup) {
    let saved = "";
    try { saved = localStorage.getItem("asc.rememberEmail") || ""; } catch { /* ignore */ }
    if (saved) body.querySelector("#email").value = saved;
  }

  // Forgot password → email a reset link (lands on the set-password screen).
  const forgot = body.querySelector("#forgot");
  if (forgot) forgot.onclick = async () => {
    clearMsg();
    const email = body.querySelector("#email").value.trim();
    if (!email) { body.querySelector("#email").focus(); return showErr(t("login.forgotNeedEmail")); }
    forgot.disabled = true;
    try { await db.sendPasswordReset(email); showOk(t("login.forgotSent")); }
    catch (e2) { showErr(e2.message); }
    finally { forgot.disabled = false; }
  };

  // Continue with Google (OAuth redirect)
  const googleEl = body.querySelector("#googleBtn");
  googleEl.onclick = async () => {
    clearMsg();
    googleEl.disabled = true;
    try { await db.signInWithGoogle(); }        // redirects away on success
    catch (e2) { showErr(e2.message); googleEl.disabled = false; }
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    const email = body.querySelector("#email").value.trim();
    const password = pwInput.value;
    clearMsg();
    const first = body.querySelector("#firstName")?.value.trim() || "";
    const last = body.querySelector("#lastName")?.value.trim() || "";
    if (signup && (!first || !last)) return showErr(t("login.nameRequired"));
    if (signup && password.length < 6) return showErr(t("login.minPass"));
    if (!signup) {
      try { localStorage.setItem("asc.rememberEmail", email); } catch { /* ignore */ }
    }
    busy(btn, true);
    try {
      if (signup) {
        const { needsConfirm } = await db.signUp(email, password, `${first} ${last}`);
        if (needsConfirm) { showOk(t("login.signupDone")); busy(btn, false); }
        // confirmation off → session exists → onAuthChange → boot()
      } else {
        await db.signIn(email, password);       // onAuthChange → boot()
      }
    } catch (e2) { showErr(e2.message); busy(btn, false); }
  };

  body.querySelector("#loginSwitch").onclick = () => paintLogin(signup ? "signin" : "signup");
}

// ---- Keyboard shortcuts (desktop) --------------------------------------------
function onKey(e) {
  const tag = document.activeElement?.tagName;
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  if (e.key === "Escape" && !typing) { if (location.hash && location.hash !== "#/") history.back(); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "/") { const s = document.getElementById("search"); if (s) { e.preventDefault(); s.focus(); } }
  else if (e.key.toLowerCase() === "n") go("/checkin");
  else if (e.key.toLowerCase() === "s") go("/scan");
}

// ---- Boot ---------------------------------------------------------------------
let justSignedIn = false;   // set on a real sign-in; consumed when the profile loads
export function firstName(profile) {
  return (profile?.full_name || "").trim().split(/\s+/)[0] || "";
}
async function boot() {
  if (!isConfigured()) { renderSetup(); return; }
  const session = await db.getSession();
  if (session) {
    startRealtime();
    // Load the profile in the BACKGROUND — don't block the first paint on it.
    // When it resolves, apply it; if the account is readonly (inert), re-route to
    // the access gate.
    if (!getState().profile) {
      db.loadMyProfile()
        .then((profile) => {
          setState({ profile });
          if (profile && profile.role === "readonly") { route(); return; }
          // Nameless account → re-route into the name gate (it says hello after).
          if (profile && !(profile.full_name || "").trim()) { route(); return; }
          // The personal hello — only on a real login, not every reload.
          if (justSignedIn) {
            justSignedIn = false;
            const name = firstName(profile);
            if (name) toast(t("hello.signin", { name }));
          }
          // Admins: fetch the pending-approval count for the Users badge.
          if (profile && db.isAdminRole(profile.role)) {
            db.countPendingApprovals().then((n) => setState({ pendingApprovals: n })).catch(() => {});
          }
          // The open view may have rendered before the profile resolved (a
          // reload straight into #/users showed the non-admin variant) —
          // re-render it now that roles are known.
          refreshActiveView();
        })
        .catch(() => {});
    }
  } else {
    stopRealtime();
    setState({ profile: null });
  }
  await route();
}

on("change", renderConn);
on("change", renderUsersBadge);
on("connection", renderConn);
window.addEventListener("hashchange", route);
window.addEventListener("keydown", onKey);

// Flag switch (delegated). Cross-fade the current flag out (first 0.5s) and the
// target flag in (next 0.5s) — 1s total — then switch the language (which re-renders
// the whole UI, landing on the target flag). Reduced-motion skips straight to the swap.
document.addEventListener("click", (e) => {
  const swap = e.target.closest?.("[data-lang-swap]");
  if (!swap) return;
  e.preventDefault();
  const target = swap.dataset.target;
  if (!target || swap.dataset.animating) return;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { setLang(target); return; }
  const cur = target === "en" ? "hr" : "en";
  const curFace = swap.querySelector(`[data-face="${cur}"]`);
  const tgtFace = swap.querySelector(`[data-face="${target}"]`);
  if (!curFace || !tgtFace || !curFace.animate) { setLang(target); return; }
  swap.dataset.animating = "1";
  const opts = { duration: 1000, easing: "ease", fill: "forwards" };
  curFace.animate([{ opacity: 1, offset: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 0, offset: 1 }], opts);
  tgtFace.animate([{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 1 }], opts);
  setTimeout(() => setLang(target), 1000);
});
onLangChange(() => {
  closeMenu();                 // also tears down the menu's document/window listeners
  window.dispatchEvent(new Event("asc:teardown"));  // views clean portaled nodes/listeners
  root.innerHTML = "";
  boot();
});

if (isConfigured()) {
  loadRecentLocations();
  initOffline(db.executeQueuedMutation);
  // Only reboot the UI on a REAL auth transition. Supabase re-fires events all
  // session long (TOKEN_REFRESHED ~hourly, SIGNED_IN on tab refocus,
  // INITIAL_SESSION…); rebooting on those re-rendered the active view and wiped
  // any form the user was in the middle of.
  let lastAuthUid;   // undefined = no event seen yet
  db.onAuthChange((event, session) => {
    if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
    const uid = session?.user?.id ?? null;
    if (lastAuthUid !== undefined && uid === lastAuthUid) return;  // same signed-in state
    // A REAL login this session (was signed out, now signed in) → greet by name
    // once the profile arrives (boot loads it in the background).
    if (lastAuthUid === null && uid) justSignedIn = true;
    lastAuthUid = uid;
    boot();
  });
}
boot();
