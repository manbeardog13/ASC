// ============================================================================
// views/dashboard.js — "See today's work." Health at a glance, pickups due
// soon, one search bar across everything, and the live inventory list.
// ============================================================================
import * as db from "../db.js";
import { getState, setViewRefresh } from "../store.js";
import { matchesQuery, isDueSoon } from "../domain.js";
import { icon, esc, skeletonRows, emptyState } from "../ui.js";
import { t, noun } from "../i18n.js";
import { setRow, timeAgo } from "./shared.js";

let allSets = [];
let query = "";

export async function render(main) {
  main.innerHTML = `
    <div class="search-wrap" style="margin-bottom:16px">
      ${icon("search", 20)}
      <input id="search" type="search" placeholder="${esc(t("dash.search"))}" autocomplete="off" value="${esc(query)}" aria-label="${esc(t("dash.search"))}">
    </div>
    <div id="tiles" class="tiles"></div>
    <div id="dueSoon"></div>
    <div class="section-title"><h2>${t("dash.inventory")}</h2><span id="listCount" class="muted" style="font-size:13px"></span></div>
    <div id="list">${skeletonRows(5)}</div>`;

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
  main.querySelector("#tiles").innerHTML = `
    <div class="tile tile-accent">
      <div class="tlabel">${icon("plus", 15)}${t("dash.checkedInToday")}</div>
      <div class="tval tnum">${health.todayCheckIns}</div>
    </div>
    <div class="tile">
      <div class="tlabel">${icon("check", 15)}${t("dash.pickedUpToday")}</div>
      <div class="tval tnum">${health.todayPickups}</div>
    </div>
    <div class="tile">
      <div class="tlabel">${icon("box", 15)}${t("dash.inStorage")}</div>
      <div class="tval tnum">${counts.in_storage}</div>
      <div class="tsub">${t("dash.reservedN", { n: counts.reserved })}</div>
    </div>
    <div class="tile">
      <div class="tlabel">${icon("clock", 15)}${t("dash.dueSoon")}</div>
      <div class="tval tnum">${dueSoon}</div>
      <div class="tsub">${t("dash.next7")}</div>
    </div>`;

  let strip = main.querySelector("#healthStrip");
  if (!strip) {
    strip = document.createElement("div");
    strip.id = "healthStrip";
    strip.className = "card";
    strip.style.marginTop = "12px";
    main.querySelector("#tiles").after(strip);
  }
  strip.innerHTML = `
    <div class="health-row"><span class="k">${icon("wifiOff", 16)}${t("dash.connection")}</span>
      <span class="v" style="color:${online ? "var(--ok)" : "var(--warn)"}">${online ? t("conn.online") : t("conn.offline")}</span></div>
    <div class="health-row"><span class="k">${icon("clock", 16)}${t("dash.pendingSync")}</span>
      <span class="v">${syncPending || 0}</span></div>
    <div class="health-row"><span class="k">${icon("download", 16)}${t("dash.lastBackup")}</span>
      <span class="v">${esc(backup)}</span></div>`;
}

function paintDueSoon(main) {
  const due = allSets.filter((s) => isDueSoon(s)).sort((a, b) => (a.expected_out_date || "").localeCompare(b.expected_out_date || ""));
  const box = main.querySelector("#dueSoon");
  if (!due.length) { box.innerHTML = ""; return; }
  box.innerHTML = `
    <div class="section-title"><h2>${t("dash.dueForPickup")}</h2><a class="link" href="#/reminders">${t("dash.remind")}</a></div>
    <div class="set-list">${due.slice(0, 5).map(setRow).join("")}</div>`;
}

function paintList(main) {
  const rows = allSets.filter((s) => matchesQuery(s, query));
  main.querySelector("#listCount").textContent = query
    ? t("dash.shownOf", { shown: rows.length, total: allSets.length })
    : t("dash.setsN", { n: allSets.length, sets: noun(allSets.length, "sets") });
  const list = main.querySelector("#list");
  if (!allSets.length) {
    list.innerHTML = emptyState({
      iconName: "box", title: t("dash.emptyTitle"), body: t("dash.emptyBody"),
      actionHtml: `<a class="btn btn-primary" href="#/checkin">${icon("plus", 18)}${t("dash.storeTires")}</a>`,
    });
    return;
  }
  if (!rows.length) {
    list.innerHTML = emptyState({ iconName: "search", title: t("dash.noMatchTitle"), body: t("dash.noMatchBody", { q: esc(query) }) });
    return;
  }
  list.innerHTML = `<div class="set-list">${rows.map(setRow).join("")}</div>`;
}
