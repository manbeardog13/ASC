// ============================================================================
// views/warehouse.js — "Locate storage." A visual map grouped Zone → Rack →
// Shelf → Slot. Occupied slots are tappable and jump to the set.
// ============================================================================
import * as db from "../db.js";
import { setViewRefresh } from "../store.js";
import { statusLabel } from "../domain.js";
import { icon, esc, skeletonRows, emptyState } from "../ui.js";
import { t, noun } from "../i18n.js";

export async function render(main) {
  main.innerHTML = `<header class="view-stage wh-topbar"><div><span class="vs-k">${t("view.ctx")}</span><h1>${t("wh.title")}</h1></div><span class="u-meta" id="whMeta"></span></header>
    <div id="map">${skeletonRows(4)}</div>`;
  setViewRefresh(() => load(main));
  await load(main);
}

const zoneTotal = (racks) => [...racks.values()].reduce((n, sh) => n + [...sh.values()].reduce((m, arr) => m + arr.length, 0), 0);
const rackTotal = (shelves) => [...shelves.values()].reduce((m, arr) => m + arr.length, 0);

async function load(main) {
  let sets;
  try { sets = await db.warehouseOccupancy(); }
  catch (err) { main.querySelector("#map").innerHTML = `<div class="banner banner-danger">${icon("alert", 18)}${esc(err.message)}</div>`; return; }

  if (!sets.length) {
    main.querySelector("#map").innerHTML = emptyState({
      iconName: "map", title: t("wh.emptyTitle"), body: t("wh.emptyBody"),
      actionHtml: `<a class="btn btn-primary" href="#/checkin">${icon("plus", 18)}${t("dash.storeTires")}</a>`,
    });
    return;
  }

  const zones = new Map();
  for (const set of sets) {
    const z = set.zone || "—", r = set.rack || "—", sh = set.shelf || "—";
    if (!zones.has(z)) zones.set(z, new Map());
    const racks = zones.get(z);
    if (!racks.has(r)) racks.set(r, new Map());
    const shelves = racks.get(r);
    if (!shelves.has(sh)) shelves.set(sh, []);
    shelves.get(sh).push(set);
  }

  const sortKeys = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
  const zoneKeys = [...zones.keys()].sort(sortKeys);

  let stored = 0, reserved = 0;
  for (const s of sets) { if (s.status === "reserved") reserved++; else stored++; }
  const total = sets.length;
  const meta = main.querySelector("#whMeta");
  if (meta) meta.textContent = t("wh.setsN", { n: total, sets: noun(total, "sets") });

  const overview = `
    <div class="card u-module wh-overview">
      <div class="wh-stats u-rise">
        <div class="u-stat"><span class="wh-stat-num tnum">${stored}</span><span class="u-stat-l">${esc(statusLabel("in_storage"))}</span></div>
        <div class="u-stat"><span class="wh-stat-num tnum">${reserved}</span><span class="u-stat-l">${esc(statusLabel("reserved"))}</span></div>
        <div class="u-stat"><span class="wh-stat-num tnum">${zones.size}</span><span class="u-stat-l">${t("wh.zones")}</span></div>
      </div>
      <div class="wh-meter" aria-hidden="true"><i style="width:${total ? Math.round(stored / total * 100) : 0}%"></i></div>
    </div>`;

  const navbar = zoneKeys.length > 1 ? `<div class="wh-zonebar">${zoneKeys.map((z, i) =>
    `<span class="chip wh-zonepill" data-z="zone-${i}" role="button" tabindex="0">${t("wh.zone", { z: esc(z) })}<span class="u-count-chip">${zoneTotal(zones.get(z))}</span></span>`).join("")}</div>` : "";

  const zonesHtml = zoneKeys.map((z, i) => {
    const racks = zones.get(z);
    const zc = zoneTotal(racks);
    return `<details class="card u-module wh-zone" id="zone-${i}" open>
      <summary><span class="wh-zone-badge">${icon("map", 16)}</span><span class="wh-zone-name">${esc(z)}</span>
        <span class="wh-zone-fill">${t("wh.setsN", { n: zc, sets: noun(zc, "sets") })}</span><span class="wh-chev">${icon("back", 16)}</span></summary>
      <div class="wh-zone-body">
        ${[...racks.keys()].sort(sortKeys).map((r) => {
          const shelves = racks.get(r);
          return `<div class="wh-rack">
            <div class="wh-rack-head">${t("wh.rack", { r: esc(r) })}<span class="rfill">${t("wh.filledN", { n: rackTotal(shelves) })}</span></div>
            ${[...shelves.keys()].sort(sortKeys).map((sh) => `
              <div class="wh-shelf">
                <span class="wh-shelf-lab">${t("wh.shelf", { s: esc(sh) })}</span>
                <div class="slots">${shelves.get(sh).sort((a, b) => sortKeys(a.slot, b.slot)).map((set) => slotCell(set)).join("")}</div>
              </div>`).join("")}
          </div>`;
        }).join("")}
      </div>
    </details>`;
  }).join("");

  main.querySelector("#map").innerHTML = overview + navbar + zonesHtml;

  // Slots are real <a> links now — no click wiring needed (keyboard/SR reachable).

  main.querySelectorAll(".wh-zonepill").forEach((p) => {
    const open = () => { const el = main.querySelector("#" + p.dataset.z); if (el) { el.open = true; el.scrollIntoView({ behavior: "smooth", block: "start" }); } };
    p.addEventListener("click", open);
    p.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
}

function slotCell(set) {
  const owner = set.vehicle?.customer?.name || set.vehicle?.plate || set.public_code;
  const cls = set.status === "reserved" ? "reserved" : "filled";
  return `<a class="slot ${cls}" href="#/set/${esc(set.public_code)}" aria-label="${esc(owner)} · ${esc(set.public_code)}" title="${esc(owner)} · ${esc(set.public_code)}">${esc(set.slot || "•")}</a>`;
}
