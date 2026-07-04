// ============================================================================
// views/warehouse.js — "Locate storage." A visual map grouped Zone → Rack →
// Shelf → Slot. Occupied slots are tappable and jump to the set.
// ============================================================================
import * as db from "../db.js";
import { setViewRefresh } from "../store.js";
import { icon, esc, skeletonRows, emptyState } from "../ui.js";
import { t, noun } from "../i18n.js";

export async function render(main) {
  main.innerHTML = `<div class="row-between" style="margin-bottom:14px"><h1>${t("wh.title")}</h1></div>
    <div id="map">${skeletonRows(4)}</div>`;
  setViewRefresh(() => load(main));
  await load(main);
}

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
  main.querySelector("#map").innerHTML = [...zones.keys()].sort(sortKeys).map((z) => {
    const racks = zones.get(z);
    const zoneCount = [...racks.values()].reduce((n, sh) => n + [...sh.values()].reduce((m, arr) => m + arr.length, 0), 0);
    return `<div class="zone-block">
      <div class="zone-head"><span class="ic" style="color:var(--brand-strong)">${icon("map", 18)}</span>
        <span class="zname">${t("wh.zone", { z: esc(z) })}</span><span class="zfill muted">${t("wh.setsN", { n: zoneCount, sets: noun(zoneCount, "sets") })}</span></div>
      ${[...racks.keys()].sort(sortKeys).map((r) => {
        const shelves = racks.get(r);
        return `<div class="rack">
          <div class="rack-head">${t("wh.rack", { r: esc(r) })}<span class="rfill">${t("wh.filledN", { n: [...shelves.values()].reduce((m, arr) => m + arr.length, 0) })}</span></div>
          ${[...shelves.keys()].sort(sortKeys).map((sh) => `
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:7px">
              <span class="muted" style="font-size:12px;min-width:54px">${t("wh.shelf", { s: esc(sh) })}</span>
              <div class="slots">${shelves.get(sh).sort((a, b) => sortKeys(a.slot, b.slot)).map((set) => slotCell(set)).join("")}</div>
            </div>`).join("")}
        </div>`;
      }).join("")}
    </div>`;
  }).join("");

  main.querySelectorAll(".slot.filled, .slot.reserved").forEach((el) =>
    el.addEventListener("click", () => location.hash = `#/set/${el.dataset.code}`));
}

function slotCell(set) {
  const owner = set.vehicle?.customer?.name || set.vehicle?.plate || set.public_code;
  const cls = set.status === "reserved" ? "reserved" : "filled";
  return `<span class="slot ${cls}" data-code="${esc(set.public_code)}" title="${esc(owner)} · ${esc(set.public_code)}">${esc(set.slot || "•")}</span>`;
}
