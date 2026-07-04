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
import { icon, esc, go, toast, busy } from "./ui.js";
import { t, lang, setLang, LANGS, onLangChange } from "./i18n.js";

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
let realtimeChannel = null;
let refreshTimer = null;

// ---- Routes (each view module exports `render(main, ctx)`) --------------------
const ROUTES = [
  { pattern: /^\/?$/,                     load: () => import("./views/dashboard.js") },
  { pattern: /^\/checkin$/,               load: () => import("./views/checkin.js") },
  { pattern: /^\/scan$/,                  load: () => import("./views/scan.js") },
  { pattern: /^\/warehouse$/,             load: () => import("./views/warehouse.js") },
  { pattern: /^\/customers$/,             load: () => import("./views/customers.js") },
  { pattern: /^\/customer\/([^/]+)$/,     load: () => import("./views/customers.js") },
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

// EN | HR pill. Clicks are caught by a delegated [data-lang] handler.
function langToggle(onGlass) {
  return `<div class="lang-toggle${onGlass ? " on-glass" : ""}" role="group" aria-label="Language">
    ${LANGS.map((l) => `<button type="button" data-lang="${l.code}" aria-pressed="${lang() === l.code}">${l.label}</button>`).join("")}
  </div>`;
}

// ---- App frame (built once when signed in) -----------------------------------
function mountFrame() {
  if (document.getElementById("main")) return;
  root.innerHTML = `
    <header class="topbar">
      <a class="brand-logo" href="#/" aria-label="ASC"><img src="assets/asc-mark.png" alt="ASC"></a>
      <nav class="topbar-desk-nav" aria-label="Primary">
        ${NAV.filter((n) => !n.center).map((n) => `<a href="#${n.route}" data-route="${n.route}">${icon(n.iconName, 18)}${t(n.key)}</a>`).join("")}
      </nav>
      <span class="spacer"></span>
      ${langToggle(false)}
      <span id="conn" class="conn"></span>
      <button id="menuBtn" class="btn btn-ghost" style="min-height:40px;padding:0 10px" aria-haspopup="menu" aria-label="More">${icon("list", 20)}</button>
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
  if (online && !syncPending) {
    el.className = "conn conn-online";
    el.innerHTML = `<span class="dot"></span><span class="ctext">${t("conn.online")}</span>`;
  } else if (online && syncPending) {
    el.className = "conn conn-offline";
    el.innerHTML = `${icon("clock", 14)}${t("conn.syncing", { n: syncPending })}`;
  } else {
    el.className = "conn conn-offline";
    el.innerHTML = `${icon("wifiOff", 14)}${t("conn.offline")}${syncPending ? t("conn.queued", { n: syncPending }) : ""}`;
  }
}

// ---- Overflow menu ------------------------------------------------------------
function openMenu() {
  const existing = document.getElementById("menuPop");
  if (existing) { existing.remove(); return; }
  const role = getState().profile?.role ?? "manager";
  const pop = document.createElement("div");
  pop.id = "menuPop";
  pop.className = "card";
  pop.style.cssText = "position:fixed;top:52px;right:12px;z-index:50;padding:6px;min-width:210px;box-shadow:var(--shadow-pop)";
  pop.setAttribute("role", "menu");
  const item = (route, iconName, label) =>
    `<a href="#${route}" role="menuitem" class="btn btn-ghost" style="justify-content:flex-start;width:100%">${icon(iconName, 18)}${label}</a>`;
  pop.innerHTML = `
    ${item("/reminders", "clock", t("menu.reminders"))}
    ${item("/recycle", "trash", t("menu.recycle"))}
    <button id="exportBtn" role="menuitem" class="btn btn-ghost" style="justify-content:flex-start;width:100%">${icon("download", 18)}${t("menu.export")}</button>
    <div style="border-top:1px solid var(--line);margin:6px 4px"></div>
    <div style="padding:6px 10px;font-size:12px;color:var(--muted)">${t("menu.signedInAs", { role: esc(role) })}</div>
    <button id="signOutBtn" role="menuitem" class="btn btn-ghost" style="justify-content:flex-start;width:100%">${icon("logout", 18)}${t("menu.signout")}</button>`;
  document.body.appendChild(pop);
  const close = (e) => {
    if (!pop.contains(e.target) && e.target.id !== "menuBtn") { pop.remove(); document.removeEventListener("click", close, true); }
  };
  setTimeout(() => document.addEventListener("click", close, true), 0);
  pop.querySelector("#signOutBtn").onclick = async () => { pop.remove(); await db.signOut(); };
  pop.querySelector("#exportBtn").onclick = async (e) => {
    const { exportInventoryCsv } = await import("./views/export.js");
    busy(e.currentTarget, true);
    try { await exportInventoryCsv(); } catch (err) { toast(err.message, "err"); }
    pop.remove();
  };
}

// ---- Router -------------------------------------------------------------------
async function route() {
  const path = (location.hash.replace(/^#/, "") || "/");
  setViewRefresh(null);
  setState({ route: path });

  if (!isConfigured()) return renderSetup();
  const session = await db.getSession();
  if (!session) return renderLogin();

  mountFrame();
  setActiveNav(path);
  const main = document.getElementById("main");

  const match = ROUTES.map((r) => ({ r, m: path.match(r.pattern) })).find((x) => x.m);
  if (!match) { main.innerHTML = `<div class="card"><h2>${t("common.notFound")}</h2><p class="muted"><a href="#/">${t("nav.home")}</a></p></div>`; return; }

  main.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
  try {
    const mod = await match.r.load();
    await mod.render(main, { params: match.m.slice(1), mode: match.r.mode, go });
  } catch (err) {
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
    <h1>ASC · Tire Hotel</h1>
    <p class="muted">${t("setup.body")}</p>
  </div></main>`;
}

// Splash + glass login: canvas + logo fade in, then the card blurs in and
// drifts up ~2mm, easing to a stop (CSS: appFadeIn / splashFade / loginEmerge).
function renderLogin() {
  stopRealtime();
  root.innerHTML = `
    <div class="login-canvas">
      <div class="login-stage">
        <img class="login-logo" src="assets/asc-logo.png" alt="ASC — Auto Servisni Centar d.o.o.">
        <div class="glass-card login-card">
          <div class="login-tagline">${t("tagline")}</div>
          <form id="loginForm" novalidate>
            <label class="field"><span class="label">${t("login.email")}</span>
              <input id="email" type="email" autocomplete="username" required></label>
            <label class="field"><span class="label">${t("login.password")}</span>
              <input id="password" type="password" autocomplete="current-password" required></label>
            <button class="btn-sunset" type="submit">${t("login.signin")}</button>
            <p id="loginErr" class="login-err hidden"></p>
          </form>
          <div class="login-langs">${langToggle(true)}</div>
        </div>
      </div>
    </div>`;
  const form = document.getElementById("loginForm");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button");
    const err = document.getElementById("loginErr");
    err.classList.add("hidden");
    busy(btn, true);
    try {
      await db.signIn(document.getElementById("email").value.trim(), document.getElementById("password").value);
      // onAuthChange fires → boot() re-runs.
    } catch (e2) {
      err.textContent = e2.message;
      err.classList.remove("hidden");
      busy(btn, false);
    }
  };
  // Focus after the entrance settles, without scroll-jerking the animation.
  setTimeout(() => document.getElementById("email")?.focus({ preventScroll: true }), 80);
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
async function boot() {
  if (!isConfigured()) { renderSetup(); return; }
  const session = await db.getSession();
  if (session) {
    startRealtime();
    db.loadMyProfile().then((profile) => setState({ profile })).catch(() => {});
  } else {
    stopRealtime();
  }
  await route();
}

on("change", renderConn);
on("connection", renderConn);
window.addEventListener("hashchange", route);
window.addEventListener("keydown", onKey);

// Language toggle (delegated) → switch + re-render the whole UI in the new language.
document.addEventListener("click", (e) => {
  const btn = e.target.closest?.("[data-lang]");
  if (btn) { e.preventDefault(); setLang(btn.dataset.lang); }
});
onLangChange(() => {
  document.getElementById("menuPop")?.remove();
  root.innerHTML = "";
  boot();
});

if (isConfigured()) {
  loadRecentLocations();
  initOffline(db.executeQueuedMutation);
  db.onAuthChange(() => boot());
}
boot();
