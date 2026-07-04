// ============================================================================
// views/dashboard.js — "See today's work." Health at a glance, pickups due
// soon, one search bar across everything, and the live inventory list.
// ============================================================================
import * as db from "../db.js";
import { getState, setViewRefresh } from "../store.js";
import { matchesQuery, isDueSoon } from "../domain.js";
import { icon, esc, skeletonRows, emptyState } from "../ui.js";
import { setRow, timeAgo } from "./shared.js";

let allSets = [];
let query = "";

export async function render(main, { go }) {
  main.innerHTML = `
    <div class="search-wrap" style="margin-bottom:16px">
      ${icon("search", 20)}
      <input id="search" type="search" placeholder="Search name, plate, size, DOT, location…" autocomplete="off" value="${esc(query)}" aria-label="Search everything">
    </div>
    <div id="tiles" class="tiles"></div>
    <div id="dueSoon"></div>
    <div class="section-title"><h2>Inventory</h2><span id="listCount" class="muted" style="font-size:13px"></span></div>
    <div id="list">${skeletonRows(5)}</div>`;

  const search = main.querySelector("#search");
  search.addEventListener("input", (e) => { query = e.target.value; paintList(main); });

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
    : "Not yet";
  main.querySelector("#tiles").innerHTML = `
    <div class="tile tile-accent">
      <div class="tlabel">${icon("plus", 15)}Checked in today</div>
      <div class="tval tnum">${health.todayCheckIns}</div>
    </div>
    <div class="tile">
      <div class="tlabel">${icon("check", 15)}Picked up today</div>
      <div class="tval tnum">${health.todayPickups}</div>
    </div>
    <div class="tile">
      <div class="tlabel">${icon("box", 15)}In storage</div>
      <div class="tval tnum">${counts.in_storage}</div>
      <div class="tsub">${counts.reserved} reserved</div>
    </div>
    <div class="tile">
      <div class="tlabel">${icon("clock", 15)}Due soon</div>
      <div class="tval tnum">${dueSoon}</div>
      <div class="tsub">next 7 days</div>
    </div>`;

  // Compact system-health strip (item #10) folded into the tiles' sibling.
  let health2 = main.querySelector("#healthStrip");
  if (!health2) {
    health2 = document.createElement("div");
    health2.id = "healthStrip";
    health2.className = "card";
    health2.style.marginTop = "12px";
    main.querySelector("#tiles").after(health2);
  }
  health2.innerHTML = `
    <div class="health-row"><span class="k">${icon("wifiOff", 16)}Connection</span>
      <span class="v" style="color:${online ? "var(--ok)" : "var(--warn)"}">${online ? "Online" : "Offline"}</span></div>
    <div class="health-row"><span class="k">${icon("clock", 16)}Pending sync</span>
      <span class="v">${syncPending || 0}</span></div>
    <div class="health-row"><span class="k">${icon("download", 16)}Last backup</span>
      <span class="v">${esc(backup)}</span></div>`;
}

function paintDueSoon(main) {
  const due = allSets.filter((s) => isDueSoon(s)).sort((a, b) => (a.expected_out_date || "").localeCompare(b.expected_out_date || ""));
  const box = main.querySelector("#dueSoon");
  if (!due.length) { box.innerHTML = ""; return; }
  box.innerHTML = `
    <div class="section-title"><h2>Due for pickup soon</h2></div>
    <div class="set-list">${due.slice(0, 5).map(setRow).join("")}</div>`;
}

function paintList(main) {
  const rows = allSets.filter((s) => matchesQuery(s, query));
  main.querySelector("#listCount").textContent = query ? `${rows.length} of ${allSets.length}` : `${allSets.length} sets`;
  const list = main.querySelector("#list");
  if (!allSets.length) {
    list.innerHTML = emptyState({
      iconName: "box", title: "No tires stored yet",
      body: "Check in a customer's set to get started.",
      actionHtml: `<a class="btn btn-primary" href="#/checkin">${icon("plus", 18)}Store tires</a>`,
    });
    return;
  }
  if (!rows.length) {
    list.innerHTML = emptyState({ iconName: "search", title: "No matches", body: `Nothing matches “${esc(query)}”. Try a plate, name, or DOT.` });
    return;
  }
  list.innerHTML = `<div class="set-list">${rows.map(setRow).join("")}</div>`;
}
