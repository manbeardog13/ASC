// ============================================================================
// views/dashboard.js — "See today's work." Health at a glance, pickups due
// soon, one search bar across everything, and the live inventory list.
// ============================================================================
import * as db from "../db.js";
import { getState, setViewRefresh, on } from "../store.js";
import { matchesQuery, isDueSoon, nudgeCount } from "../domain.js";
import { icon, esc, skeletonRows, emptyState, setThemeColor } from "../ui.js";
import { t, noun, lang } from "../i18n.js";
import { setRow, timeAgo } from "./shared.js";

let allSets = [];
let query = "";
let filter = null;   // active tile filter: checkedInToday | pickedUpToday | inStorage | dueSoon | null

const today = () => new Date().toISOString().slice(0, 10);
const TILE_FILTERS = {
  checkedInToday: (s) => (s.check_in_date || "").slice(0, 10) === today(),
  pickedUpToday:  (s) => (s.picked_up_at || "").slice(0, 10) === today(),
  inStorage:      (s) => s.status === "in_storage",
  dueSoon:        (s) => isDueSoon(s),
};

// Time-of-day greeting key: jutro / dan / večer.
function helloKey() {
  const h = new Date().getHours();
  return h < 12 ? "hello.morning" : h < 18 ? "hello.day" : "hello.evening";
}
function firstName(profile) {
  return (profile?.full_name || "").trim().split(/\s+/)[0] || "";
}

export async function render(main) {
  const role = getState().profile?.role;
  const canWorkshop = !role || role === "employee" || db.isAdminRole(role);
  // Dashboard spans the full v2 grid width. The router owns the .v2wide chrome
  // class now (set/cleared in the same tick as the #main content swap, see
  // app.js route()), so the legacy topbar can't flash over the dashboard during a
  // slow navigation. Set it here too so the first paint is full-width immediately.
  main.classList.add("v2wide");
  const initials = ((getState().profile?.full_name || "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2) || "·").toUpperCase();
  // v6 "Hanssen" composition — theme preference shared with the login screen.
  let themeDark = false;
  try { themeDark = localStorage.getItem("asc.theme") === "dark"; } catch { /* ignore */ }
  main.innerHTML = `
    <div class="v6${themeDark ? " dark" : ""}" id="v6root">
    <i class="v6canvas" aria-hidden="true"></i>
    <div class="v6shell">
      <nav class="v6nav" aria-label="Primary">
        <a href="#/" class="on">${t("nav.home")}</a>
        <a href="#/checkin">${t("nav.checkin")}</a>
        <a href="#/warehouse">${t("nav.warehouse")}</a>
        <a href="#/customers">${t("nav.customers")}</a>
      </nav>
      <div class="v6grid">
        <section class="v6stage">
          <i class="v6aura" aria-hidden="true"></i>
          <span class="v6k">${esc(t("dash.stageLabel"))}</span>
          <div class="v6hero"><span class="tnum" id="scBig">–</span><em>${esc(t("dash.setsUnit"))}</em></div>
          <div class="v6cap" id="scCap"></div>
          <div class="v6meter"><i id="scMeter"></i></div>
          <div class="v6space"></div>
          <div class="v6spills" id="tiles"></div>
          <a class="v6cta" href="#/assistant"><span class="v6dot"></span>${esc(t("dash.askAgent"))}</a>
          <span class="v6tab br">${esc(t("dash.estTab"))}</span>
        </section>
        <div class="v6mid">
          <section class="v6profile">
            <div class="v6prow">
              <span class="v6avatar" id="v6avatar">${esc(initials)}</span>
              <div><h1 id="helloTitle"></h1><div class="v6sub" id="helloSub"></div></div>
              <button type="button" class="v6mode" id="v6mode" aria-label="Tema / Theme"><i></i></button>
            </div>
            <p class="v6status" id="dashStatus"></p>
          </section>
          <section class="v6panel p1">
            <span class="v6tab tl">${esc(t("dash.occupancy").toLowerCase())}</span>
            <h3>${t("dash.bySeason")}</h3>
            <div id="seasons"></div>
          </section>
          <section class="v6panel p2">
            <span class="v6tab tl" id="dueTab"></span>
            <h3>${t("dash.dueTitle")}</h3>
            <div id="dueMini"></div>
          </section>
        </div>
        <aside class="v6rail">
          <a class="v6row" href="#/checkin">${t("dash.newSet")}<span class="v">→</span></a>
          <a class="v6row" href="#/scan">${t("dash.scanQr")}<span class="v">→</span></a>
          ${canWorkshop ? `<a class="v6row" href="#/workshop">${t("ws.enter")}<span class="v">→</span></a>` : ""}
          <a class="v6row" href="#/reminders">${t("dash.reminders")}<span class="v"><span id="remindBadge" class="rem-badge" hidden></span>→</span></a>
          <a class="v6row hero" href="#/assistant">${t("ag.title")}<span class="v"><span class="v6dot"></span>online</span></a>
        </aside>
      </div>
      <section class="v6list">
        <h2 class="ptitle">${t("dash.inventory")} <span id="listCount" class="u-meta"></span></h2>
        <div class="search-wrap dash-search">
          ${icon("search", 20)}
          <input id="search" type="search" placeholder="${esc(t("dash.search"))}" autocomplete="off" value="${esc(query)}" aria-label="${esc(t("dash.search"))}">
        </div>
        <div id="dueSoon" hidden></div>
        <div id="list">${skeletonRows(5)}</div>
      </section>
    </div>
    </div>`;
  // Body class too: the fixed canvas is trapped by the view-transition
  // transform (containing-block rule), so the page edges are painted here.
  document.body.classList.toggle("v6-dark", themeDark);
  setThemeColor(themeDark);
  window.addEventListener("asc:teardown", () => {
    document.body.classList.remove("v6-dark");
    setThemeColor(false);   // unported views are always light
  }, { once: true });
  main.querySelector("#v6mode").addEventListener("click", () => {
    const rootEl = main.querySelector("#v6root");
    const dark = rootEl.classList.toggle("dark");
    document.body.classList.toggle("v6-dark", dark);
    setThemeColor(dark);
    try { localStorage.setItem("asc.theme", dark ? "dark" : "light"); } catch { /* ignore */ }
  });
  // On phones the dashboard uses the standard app frame (topbar + bottom tabbar
  // with the center scan button) like every other view — one consistent nav, no
  // separate floating pill. The .v6nav pill is desktop-only (CSS). No portal.

  // The personal hello — paints now, and re-paints when the background profile
  // fetch lands (first visit after boot often races it). Unsubscribes on swap.
  const paintHello = () => {
    const title = main.querySelector("#helloTitle");
    if (!title) return;
    const name = firstName(getState().profile);
    const d = new Date();
    let dateLine = d.toLocaleDateString(lang() === "hr" ? "hr-HR" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
    dateLine = dateLine.charAt(0).toUpperCase() + dateLine.slice(1);
    title.innerHTML = `${t(helloKey())}${name ? `, ${esc(name)}` : ""}`;
    main.querySelector("#helloSub").textContent = `${dateLine} · Dubrovnik`;
    const due = allSets.filter((s) => isDueSoon(s)).length;
    main.querySelector("#dashStatus").textContent =
      t("dash.statusLine", { total: allSets.length, sets: noun(allSets.length, "sets"), due });
    // Avatar initials resolve with the same async profile fetch.
    const av = main.querySelector("#v6avatar");
    const ini = ((getState().profile?.full_name || "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2) || "·").toUpperCase();
    if (av) av.textContent = ini;
  };
  paintHello();
  const offHello = on("change", paintHello);
  window.addEventListener("asc:teardown", () => offHello(), { once: true });

  main.querySelector("#search").addEventListener("input", (e) => { query = e.target.value; paintList(main); });
  setViewRefresh(() => load(main));
  await load(main);
}

async function load(main) {
  try {
    const [sets, health, counts] = await Promise.all([
      db.listStorageSets(), db.healthStats(), db.countsByStatus(),
    ]);
    allSets = sets;
    paintTiles(main, health, counts);
    paintDueSoon(main);
    paintList(main);
  } catch (err) {
    main.querySelector("#list").innerHTML = `<div class="banner banner-danger">${icon("alert", 18)}${esc(err.message)}</div>`;
  }
}

function paintTiles(main, health, counts) {
  const { online, syncPending } = getState();
  const dueSoon = allSets.filter((s) => isDueSoon(s)).length;
  // Cache real counts for the login screen's stage chips (never fake numbers).
  try { localStorage.setItem("asc.loginChips", JSON.stringify({ inStorage: counts.in_storage, dueSoon })); } catch { /* ignore */ }
  const backup = health.lastBackup
    ? `${health.lastBackup.status === "success" ? "✓" : "⚠"} ${timeAgo(health.lastBackup.finished_at)}`
    : t("dash.backupNotYet");
  // Stage card: the big number IS storage; the meter shows how much of the
  // hotel is staying (stored sets not due out within 7 days) — real data only.
  const inStorage = counts.in_storage || 0;
  main.querySelector("#scBig").textContent = inStorage;
  main.querySelector("#scCap").textContent =
    `${t("dash.capLine", { n: counts.reserved || 0 })}`;
  const staying = inStorage ? Math.round(((inStorage - dueSoon) / inStorage) * 100) : 0;
  main.querySelector("#scMeter").style.width = `${Math.max(4, staying)}%`;

  // Spills stay interactive: tap to filter the inventory list, tap again to clear.
  const spill = (key, val, label) => `
    <div class="sc-spill${filter === key ? " is-active" : ""}" role="button" tabindex="0"
         data-filter="${key}" aria-pressed="${filter === key}"><b class="tnum">${val}</b><span>${label}</span></div>`;
  main.querySelector("#tiles").innerHTML =
    spill("checkedInToday", health.todayCheckIns, t("dash.checkedInToday")) +
    spill("pickedUpToday", health.todayPickups, t("dash.pickedUpToday")) +
    spill("dueSoon", dueSoon, t("dash.dueSoon"));
  main.querySelectorAll("#tiles [data-filter]").forEach((el) => {
    const toggle = () => {
      filter = filter === el.dataset.filter ? null : el.dataset.filter;
      main.querySelectorAll("#tiles .sc-spill").forEach((t2) => {
        const on = t2.dataset.filter === filter;
        t2.classList.toggle("is-active", on);
        t2.setAttribute("aria-pressed", String(on));
      });
      paintList(main);
    };
    el.addEventListener("click", toggle);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  });
  paintSeasons(main);

  let strip = main.querySelector("#healthStrip");
  if (!strip) {
    strip = document.createElement("div");
    strip.id = "healthStrip";
    strip.className = "dash-health";
    main.querySelector(".v6profile").appendChild(strip);
  }
  strip.innerHTML = `
    <span class="hstat"><span class="u-dot ${online ? "is-ok" : "is-warn"}"></span><span class="hk">${t("dash.connection")}</span><span class="hv">${online ? t("conn.online") : t("conn.offline")}</span></span>
    <span class="hstat">${icon("clock", 14)}<span class="hk">${t("dash.pendingSync")}</span><span class="hv">${syncPending || 0}</span></span>
    <span class="hstat">${icon("download", 14)}<span class="hk">${t("dash.lastBackup")}</span><span class="hv">${esc(backup)}</span></span>`;
}

function paintDueSoon(main) {
  const due = allSets.filter((s) => isDueSoon(s)).sort((a, b) => (a.expected_out_date || "").localeCompare(b.expected_out_date || ""));
  // v6: compact mini-list in the dark "Darkness" panel + count in its corner tab.
  const tab = main.querySelector("#dueTab");
  if (tab) tab.textContent = `${t("dash.next7").toLowerCase()} · ${due.length}`;
  const mini = main.querySelector("#dueMini");
  if (mini) {
    mini.innerHTML = due.length
      ? due.slice(0, 4).map((s) => `
        <a class="v6mini" href="#/set/${esc(s.public_code)}">
          <time class="tnum">${esc((s.expected_out_date || "").slice(8, 10))}.${esc((s.expected_out_date || "").slice(5, 7))}.</time>
          <b>${esc(s.vehicle?.customer?.name || s.public_code || "—")}</b>
          <span>${esc((s.tires || [])[0]?.size || "")}</span>
        </a>`).join("")
      : `<div class="v6mini-empty">${esc(t("dash.noneHere"))}</div>`;
  }
  const box = main.querySelector("#dueSoon");
  if (box) box.innerHTML = "";
  // Morning signal: how many due sets still need a nudge (not reminded recently).
  const badge = main.querySelector("#remindBadge");
  if (badge) {
    const n = nudgeCount(allSets);
    badge.textContent = n;
    badge.hidden = n === 0;
    badge.setAttribute("aria-label", t("rem.summary", { n }));
  }
}

// Occupancy bars — stored sets by season, real proportions.
function paintSeasons(main) {
  const box = main.querySelector("#seasons");
  if (!box) return;
  const stored = allSets.filter((s) => s.status === "in_storage");
  const by = { winter: 0, summer: 0, all_season: 0 };
  stored.forEach((s) => { if (by[s.season] != null) by[s.season]++; });
  const max = Math.max(1, ...Object.values(by));
  box.innerHTML = ["winter", "summer", "all_season"].map((k) => `
    <div class="srow">
      <div class="srow-top"><b>${t("season." + k)}</b><span class="tnum">${by[k]}</span></div>
      <div class="sbar"><i class="${k === "all_season" ? "dim" : ""}" style="width:${Math.round((by[k] / max) * 100)}%"></i></div>
    </div>`).join("");
  const notch = main.querySelector("#listNotch");
  if (notch) notch.textContent = `${t("dash.inStorage").toLowerCase()} · ${stored.length}`;
}

function paintList(main) {
  const pred = TILE_FILTERS[filter];
  const rows = allSets.filter((s) => (!pred || pred(s)) && matchesQuery(s, query));
  const count = main.querySelector("#listCount");
  if (query || filter) {
    count.innerHTML = esc(t("dash.shownOf", { shown: rows.length, total: allSets.length }))
      + (filter ? ` · <button type="button" id="clearFilter" class="link-btn">${esc(t("dash.showAll"))}</button>` : "");
    const clear = main.querySelector("#clearFilter");
    if (clear) clear.onclick = () => {
      filter = null;
      main.querySelectorAll("#tiles .sc-spill.is-active").forEach((t2) => { t2.classList.remove("is-active"); t2.setAttribute("aria-pressed", "false"); });
      paintList(main);
    };
  } else {
    count.textContent = t("dash.setsN", { n: allSets.length, sets: noun(allSets.length, "sets") });
  }
  const list = main.querySelector("#list");
  if (!allSets.length) {
    list.innerHTML = emptyState({
      iconName: "box", title: t("dash.emptyTitle"), body: t("dash.emptyBody"),
      actionHtml: `<a class="btn btn-primary" href="#/checkin">${icon("plus", 18)}${t("dash.storeTires")}</a>`,
    });
    return;
  }
  if (!rows.length) {
    list.innerHTML = (filter && !query)
      ? emptyState({ iconName: "box", title: t("dash.noneHere"), body: t("dash.noneHereBody") })
      : emptyState({ iconName: "search", title: t("dash.noMatchTitle"), body: t("dash.noMatchBody", { q: query }) });
    return;
  }
  list.innerHTML = `<div class="set-list">${rows.map(setRow).join("")}</div>`;
}
