// ============================================================================
// views/dashboard.js — "See today's work." Health at a glance, pickups due
// soon, one search bar across everything, and the live inventory list.
// ============================================================================
import * as db from "../db.js";
import { getState, setViewRefresh, on } from "../store.js";
import { matchesQuery, isDueSoon } from "../domain.js";
import { icon, esc, skeletonRows, emptyState } from "../ui.js";
import { t, noun } from "../i18n.js";
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
  main.innerHTML = `
    <div class="dash-hello" id="dashHello"></div>
    <div class="search-wrap dash-search">
      ${icon("search", 20)}
      <input id="search" type="search" placeholder="${esc(t("dash.search"))}" autocomplete="off" value="${esc(query)}" aria-label="${esc(t("dash.search"))}">
    </div>
    <div class="dash-launch">
      <a class="ws-enter is-agent" href="#/assistant">
        <span class="ws-enter-orb">${icon("agent", 22)}</span>
        <span class="ws-enter-txt"><b>${t("ag.title")}</b><span>${t("ag.enterSub")}</span></span>
        <span class="ws-enter-go">${icon("back", 20)}</span>
      </a>
      ${canWorkshop ? `<a class="ws-enter" href="#/workshop">
        <span class="ws-enter-orb">${icon("box", 22)}</span>
        <span class="ws-enter-txt"><b>${t("ws.enter")}</b><span>${t("ws.enterSub")}</span></span>
        <span class="ws-enter-go">${icon("back", 20)}</span>
      </a>` : ""}
    </div>
    <section class="card u-module dash-pulse">
      <div id="tiles" class="tiles u-rise"></div>
    </section>
    <div id="dueSoon"></div>
    <div class="section-title"><h2>${t("dash.inventory")}</h2><span id="listCount" class="u-meta"></span></div>
    <div id="list">${skeletonRows(5)}</div>`;

  // The personal hello — paints now, and re-paints when the background profile
  // fetch lands (first visit after boot often races it). Unsubscribes on swap.
  const paintHello = () => {
    const el = main.querySelector("#dashHello");
    if (!el) return;
    const name = firstName(getState().profile);
    el.innerHTML = `${t(helloKey())}${name ? `, <b>${esc(name)}</b>` : ""}`;
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
  const backup = health.lastBackup
    ? `${health.lastBackup.status === "success" ? "✓" : "⚠"} ${timeAgo(health.lastBackup.finished_at)}`
    : t("dash.backupNotYet");
  const tile = (key, extra, cls = "") => `
    <div class="tile${cls ? " " + cls : ""}${filter === key ? " is-active" : ""}" role="button" tabindex="0"
         data-filter="${key}" aria-pressed="${filter === key}">${extra}</div>`;
  main.querySelector("#tiles").innerHTML =
    tile("checkedInToday", `<div class="tlabel">${icon("plus", 15)}${t("dash.checkedInToday")}</div><div class="tval tnum">${health.todayCheckIns}</div>`, "tile-accent") +
    tile("pickedUpToday", `<div class="tlabel">${icon("check", 15)}${t("dash.pickedUpToday")}</div><div class="tval tnum">${health.todayPickups}</div>`) +
    tile("inStorage", `<div class="tlabel">${icon("box", 15)}${t("dash.inStorage")}</div><div class="tval tnum">${counts.in_storage}</div><div class="tsub">${t("dash.reservedN", { n: counts.reserved })}</div>`) +
    tile("dueSoon", `<div class="tlabel">${icon("clock", 15)}${t("dash.dueSoon")}</div><div class="tval tnum">${dueSoon}</div><div class="tsub">${t("dash.next7")}</div>`);

  // Tap a tile to filter the inventory list below; tap the active one again to clear.
  main.querySelectorAll("#tiles [data-filter]").forEach((el) => {
    const toggle = () => {
      filter = filter === el.dataset.filter ? null : el.dataset.filter;
      main.querySelectorAll("#tiles .tile").forEach((t2) => {
        const on = t2.dataset.filter === filter;
        t2.classList.toggle("is-active", on);
        t2.setAttribute("aria-pressed", String(on));
      });
      paintList(main);
    };
    el.addEventListener("click", toggle);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  });

  let strip = main.querySelector("#healthStrip");
  if (!strip) {
    strip = document.createElement("div");
    strip.id = "healthStrip";
    strip.className = "dash-health";
    main.querySelector(".dash-pulse").appendChild(strip);
  }
  strip.innerHTML = `
    <span class="hstat"><span class="u-dot ${online ? "is-ok" : "is-warn"}"></span><span class="hk">${t("dash.connection")}</span><span class="hv">${online ? t("conn.online") : t("conn.offline")}</span></span>
    <span class="hstat">${icon("clock", 14)}<span class="hk">${t("dash.pendingSync")}</span><span class="hv">${syncPending || 0}</span></span>
    <span class="hstat">${icon("download", 14)}<span class="hk">${t("dash.lastBackup")}</span><span class="hv">${esc(backup)}</span></span>`;
}

function paintDueSoon(main) {
  const due = allSets.filter((s) => isDueSoon(s)).sort((a, b) => (a.expected_out_date || "").localeCompare(b.expected_out_date || ""));
  const box = main.querySelector("#dueSoon");
  if (!due.length) { box.innerHTML = ""; return; }
  box.innerHTML = `
    <div class="section-title"><h2>${t("dash.dueForPickup")}<span class="u-count-chip">${due.length}</span></h2><a class="link" href="#/reminders">${t("dash.remind")}</a></div>
    <div class="set-list dash-due">${due.slice(0, 5).map(setRow).join("")}</div>`;
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
      main.querySelectorAll("#tiles .tile.is-active").forEach((t2) => { t2.classList.remove("is-active"); t2.setAttribute("aria-pressed", "false"); });
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
