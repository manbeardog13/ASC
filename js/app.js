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

const root = document.getElementById("app-root");
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
  { pattern: /^\/recycle$/,               load: () => import("./views/recycle.js") },
  { pattern: /^\/set\/([^/]+)\/edit$/,    load: () => import("./views/set-detail.js"), mode: "edit" },
  { pattern: /^\/set\/([^/]+)$/,          load: () => import("./views/set-detail.js") },
];

const NAV = [
  { route: "/",          label: "Home",     iconName: "home" },
  { route: "/checkin",   label: "Check in", iconName: "plus" },
  { route: "/scan",      label: "Scan",     iconName: "scan", center: true },
  { route: "/warehouse", label: "Warehouse", iconName: "map" },
  { route: "/customers", label: "Customers", iconName: "people" },
];

// ---- App frame (built once when signed in) -----------------------------------
function mountFrame() {
  if (document.getElementById("main")) return;
  root.innerHTML = `
    <header class="topbar">
      <a class="wordmark" href="#/" aria-label="ASC Tire Hotel home">
        <span class="mark">ASC</span><span class="sub">Tire Hotel</span>
      </a>
      <nav class="topbar-desk-nav" aria-label="Primary">
        ${NAV.filter((n) => !n.center).map((n) => `<a href="#${n.route}" data-route="${n.route}">${icon(n.iconName, 18)}${n.label}</a>`).join("")}
      </nav>
      <span class="spacer"></span>
      <span id="conn" class="conn"></span>
      <button id="menuBtn" class="btn btn-ghost" style="min-height:40px;padding:0 10px" aria-haspopup="menu" aria-label="More">${icon("list", 20)}</button>
    </header>
    <main id="main"></main>
    <nav class="tabbar" aria-label="Sections">
      ${NAV.map((n) => n.center
        ? `<a href="#${n.route}" data-route="${n.route}" class="scan-tab" aria-label="Scan"><span class="scan-orb">${icon(n.iconName, 24)}</span></a>`
        : `<a href="#${n.route}" data-route="${n.route}"><span class="ic">${icon(n.iconName, 22)}</span>${n.label}</a>`
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
    el.innerHTML = `<span class="dot"></span>Online`;
  } else if (online && syncPending) {
    el.className = "conn conn-offline";
    el.innerHTML = `${icon("clock", 14)}Syncing ${syncPending}`;
  } else {
    el.className = "conn conn-offline";
    el.innerHTML = `${icon("wifiOff", 14)}Offline${syncPending ? ` · ${syncPending} queued` : ""}`;
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
    ${item("/recycle", "trash", "Recycle bin")}
    <button id="exportBtn" role="menuitem" class="btn btn-ghost" style="justify-content:flex-start;width:100%">${icon("download", 18)}Export CSV</button>
    <div style="border-top:1px solid var(--line);margin:6px 4px"></div>
    <div style="padding:6px 10px;font-size:12px;color:var(--muted)">Signed in · ${esc(role)}</div>
    <button id="signOutBtn" role="menuitem" class="btn btn-ghost" style="justify-content:flex-start;width:100%">${icon("logout", 18)}Sign out</button>`;
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
  if (!match) { main.innerHTML = `<div class="card"><h2>Page not found</h2><p class="muted">That screen doesn't exist. <a href="#/">Go home</a>.</p></div>`; return; }

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
    <h1>ASC Tire Hotel</h1>
    <p class="muted">Not connected to a database yet. Add your Supabase details in <code>js/config.js</code>, then reload. Full steps are in <b>SETUP.md</b>.</p>
  </div></main>`;
}

function renderLogin() {
  stopRealtime();
  root.innerHTML = `<main><div class="card center-narrow">
    <div style="text-align:center;margin-bottom:18px">
      <div class="wordmark" style="justify-content:center;font-size:22px"><span class="mark" style="font-size:24px">ASC</span><span class="sub">Tire Hotel</span></div>
    </div>
    <form id="loginForm" class="stack" novalidate>
      <label class="field"><span class="label">Email</span><input id="email" type="email" autocomplete="username" required></label>
      <label class="field"><span class="label">Password</span><input id="password" type="password" autocomplete="current-password" required></label>
      <button class="btn btn-primary btn-lg" type="submit">Sign in</button>
      <p id="loginErr" class="inline-err hidden"></p>
    </form>
  </div></main>`;
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
  document.getElementById("email").focus();
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

if (isConfigured()) {
  loadRecentLocations();
  initOffline(db.executeQueuedMutation);
  db.onAuthChange(() => boot());
}
boot();
