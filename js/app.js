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
// Captured before Supabase consumes the URL: an invite/recovery link lands here
// with `type=invite|recovery` in the hash → the user must set a password first.
let mustSetPassword = /type=(invite|recovery)/.test(location.hash);

// ---- Routes (each view module exports `render(main, ctx)`) --------------------
const ROUTES = [
  { pattern: /^\/?$/,                     load: () => import("./views/dashboard.js") },
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
        <a href="#/users" data-route="/users">${icon("people", 18)}${t("nav.users")}</a>
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
    ${item("/users", "people", t("menu.users"))}
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

  // Finish an emailed invite / password reset before anything else.
  if (mustSetPassword) return renderSetPassword();

  // Know the caller's role before rendering. 'readonly' = no access yet (just
  // signed up, or removed by an admin) → show the access-pending gate.
  let profile = getState().profile;
  if (!profile) { profile = await db.loadMyProfile().catch(() => null); if (profile) setState({ profile }); }
  if (profile && profile.role === "readonly") return renderAccessGate();

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
      <div class="login-stage">
        <img class="login-logo" src="assets/asc-logo.png" alt="ASC">
        <div class="glass-card login-card" style="text-align:center">
          <div class="gate-icon">${icon("clock", 30)}</div>
          <h2 style="margin-bottom:8px">${t("gate.title")}</h2>
          <p class="muted" style="font-size:14px">${t("gate.body")}</p>
          <button id="gateOut" class="btn btn-block" style="margin-top:20px">${icon("logout", 18)} ${t("menu.signout")}</button>
          <div class="login-langs">${langToggle(true)}</div>
        </div>
      </div>
    </div>`;
  document.getElementById("gateOut").onclick = async () => { setState({ profile: null }); await db.signOut(); };
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

// Splash + glass login: canvas + logo fade in, then the card blurs in and
// drifts up ~2mm, easing to a stop (CSS: appFadeIn / splashFade / loginEmerge).
// `mode` is "signin" (default) or "signup"; the toggle swaps only the form body
// so the card doesn't re-animate.
function renderLogin(mode = "signin") {
  stopRealtime();
  // Redundant auth events (INITIAL_SESSION, token refreshes) re-run boot()/route().
  // If the login is already on screen, don't rebuild it — rebuilding restarts the
  // entrance animation every time and can leave the card stuck hidden.
  if (document.getElementById("loginBody")) return;
  root.innerHTML = `
    <div class="login-canvas">
      <div class="login-stage">
        <img class="login-logo" src="assets/asc-logo.png" alt="ASC — Auto Servisni Centar d.o.o.">
        <div class="glass-card login-card">
          <div id="loginBody"></div>
          <div class="login-langs">${langToggle(true)}</div>
        </div>
      </div>
    </div>`;
  paintLogin(mode);
  setTimeout(() => document.getElementById("email")?.focus({ preventScroll: true }), 80);
}

function paintLogin(mode) {
  const signup = mode === "signup";
  const body = document.getElementById("loginBody");
  body.innerHTML = `
    <form id="loginForm" novalidate>
      <label class="field"><span class="label">${t("login.email")}</span>
        <input id="email" type="email" autocomplete="${signup ? "email" : "username"}" required></label>
      <label class="field"><span class="label">${t("login.password")}</span>
        <input id="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" required></label>
      <button class="btn-sunset" type="submit">${signup ? t("login.signupCta") : t("login.signin")}</button>
      <p id="loginErr" class="login-err hidden"></p>
      <p id="loginOk" class="login-ok hidden"></p>
    </form>
    <button type="button" id="loginSwitch" class="login-switch">${signup ? t("login.haveAccount") : t("login.newHere")}</button>`;

  const form = body.querySelector("#loginForm");
  const err = body.querySelector("#loginErr");
  const ok = body.querySelector("#loginOk");
  const hide = () => { err.classList.add("hidden"); ok.classList.add("hidden"); };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    hide();
    if (signup && password.length < 6) { err.textContent = t("login.minPass"); err.classList.remove("hidden"); return; }
    busy(btn, true);
    try {
      if (signup) {
        const { needsConfirm } = await db.signUp(email, password);
        if (needsConfirm) {
          ok.textContent = t("login.signupDone"); ok.classList.remove("hidden");
          busy(btn, false);
        }
        // If confirmation is off, a session exists → onAuthChange → boot().
      } else {
        await db.signIn(email, password); // onAuthChange fires → boot() re-runs.
      }
    } catch (e2) {
      err.textContent = e2.message;
      err.classList.remove("hidden");
      busy(btn, false);
    }
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
async function boot() {
  if (!isConfigured()) { renderSetup(); return; }
  const session = await db.getSession();
  if (session) {
    startRealtime();
    const profile = await db.loadMyProfile().catch(() => null);
    setState({ profile });
  } else {
    stopRealtime();
    setState({ profile: null });
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
