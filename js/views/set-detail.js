// ============================================================================
// views/set-detail.js — the operational heart. Who owns these, where are they,
// what vehicle, can I pick them now. One-tap status changes (optimistic, offline
// -aware), move-with-old→new preview, progressive disclosure, audit timeline,
// photos, soft delete with undo. Also handles ?/edit mode.
// ============================================================================
import * as db from "../db.js";
import { setViewRefresh } from "../store.js";
import { statusLabel, nextStatusAction, treadTone, hasLocation, locationLine, isDueSoon } from "../domain.js";
import {
  icon, esc, statusChip, seasonChip, paymentChip, locationBlock, toast, busy, confirmSheet, go, skeletonDetail,
} from "../ui.js";
import { t } from "../i18n.js";
import { tireRowsHtml, collectTires, fmtDate, timeAgo } from "./shared.js";

export async function render(main, { params, mode }) {
  const code = decodeURIComponent(params[0]);
  main.innerHTML = `<div class="card">${skeletonDetail()}</div>`;
  let set;
  try {
    set = await db.loadStorageSet(code);
  } catch {
    main.innerHTML = `<div class="card"><h2>${t("common.notFound")}</h2><p class="muted">${t("sd.noSet", { code: esc(code) })}</p><a class="btn" href="#/">${t("sd.backHome")}</a></div>`;
    return;
  }
  setViewRefresh(async () => { try { await render(main, { params, mode }); } catch {} });
  if (mode === "edit") return renderEdit(main, set);
  renderDetail(main, set);
}

// ---------------------------------------------------------------- Detail -----
function renderDetail(main, set) {
  const vehicle = set.vehicle || {};
  const customer = vehicle.customer || {};
  const next = nextStatusAction(set.status);
  const vehicleLine = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "—";
  const rim = set.rim_type === "steel" ? t("ci.steel") : set.rim_type === "alloy" ? t("ci.alloy") : t("sd.rimsWord");

  main.innerHTML = `
    <a class="btn btn-ghost sd-back" href="#/" style="margin-bottom:12px;min-height:38px">${icon("back", 18)} ${t("common.home")}</a>

    <div class="card sd-hero">
      <div class="detail-head">
        <div>
          <div class="code tnum">${esc(set.public_code)}</div>
          <div class="who">${esc(customer.name || "—")}</div>
        </div>
        <a class="btn btn-ghost" href="#/set/${esc(set.public_code)}/edit" aria-label="${esc(t("sd.edit"))}">${icon("pencil", 20)}</a>
      </div>
      <div class="detail-chips">${statusChip(set.status)}${seasonChip(set.season)}${paymentChip(set)}</div>
      ${next
        ? `<button id="statusBtn" class="btn btn-primary btn-lg sd-primary" data-to="${next.to}">${icon("check", 18)} ${esc(next.label)}</button>`
        : `<div class="sd-state-note">${icon("check", 16)} ${esc(statusLabel(set.status))}</div>`}
    </div>

    <div class="u-stats u-rise" style="margin-bottom:14px">${insightCells(set)}</div>

    <section class="card u-module" data-module="location">
      <div class="u-module-head"><h3 class="u-module-title">${t("loc.title")}</h3>
        <button id="moveBtn" class="btn btn-ghost u-module-action">${icon("move", 16)} ${t("sd.move")}</button></div>
      ${locationBlock(set)}
      <div id="moveArea"></div>
    </section>

    <section class="card u-module">
      <div class="u-module-head"><h3 class="u-module-title">${t("ci.details")}</h3></div>
      <div class="kv">
        <div><span class="k">${t("sd.vehicle")}</span><span class="v">${esc(vehicleLine)}</span></div>
        <div><span class="k">${t("sd.plate")}</span><span class="v tnum">${esc(vehicle.plate || "—")}</span></div>
        <div><span class="k">${t("sd.phone")}</span><span class="v">${customer.phone ? `<a href="tel:${esc(customer.phone)}">${esc(customer.phone)}</a>` : "—"}</span></div>
        <div><span class="k">${t("sd.tires")}</span><span class="v">${set.on_rims ? t("sd.qtyOnRims", { qty: set.quantity, rim }) : set.quantity}</span></div>
        <div><span class="k">${t("sd.checkedIn")}</span><span class="v">${fmtDate(set.check_in_date)}</span></div>
        <div><span class="k">${t("sd.expectedOut")}</span><span class="v">${isDueSoon(set) ? `<span class="sd-due">${icon("clock", 14)} ${fmtDate(set.expected_out_date)}</span>` : fmtDate(set.expected_out_date)}</span></div>
      </div>
      ${set.notes ? `<div class="sd-note">${icon("pencil", 15)} ${esc(set.notes)}</div>` : ""}
    </section>

    <div class="card u-module sd-more">
      ${disclosure("tires", t("sd.tiresTread"), tiresHtml(set))}
      ${disclosure("payment", t("sd.payment"), paymentHtml(set))}
      ${disclosure("photos", t("sd.photos"), `<div id="photoBox"><p class="muted" style="font-size:13px">${t("sd.openToLoad")}</p></div>`)}
      ${disclosure("history", t("sd.history"), `<div id="histBox"><p class="muted" style="font-size:13px">${t("sd.openToLoad")}</p></div>`)}
    </div>

    <div class="action-bar">
      <button id="printBtn" class="btn">${icon("printer", 18)} ${t("sd.label")}</button>
      <button id="delBtn" class="btn btn-danger">${icon("trash", 18)} ${t("sd.delete")}</button>
    </div>`;

  wireDetail(main, set);
}

function disclosure(key, title, bodyHtml) {
  return `<details class="disclose" data-key="${key}">
    <summary>${esc(title)}<span class="chev">${icon("back", 16)}</span></summary>
    <div class="disclose-body">${bodyHtml}</div>
  </details>`;
}

function tiresHtml(set) {
  const tires = set.tires || [];
  if (!tires.length) return `<p class="muted" style="font-size:14px">${t("sd.noTireDetails")}</p>`;
  return `<div class="tire-table">
    <div class="tr th"><span>${t("sd.pos")}</span><span>${t("sd.size")}</span><span>${t("sd.brand")}</span><span>${t("sd.tread")}</span><span>DOT</span></div>
    ${tires.map((tire) => `<div class="tr">
      <span class="tnum">${esc(tire.position || "—")}</span>
      <span class="tnum">${esc(tire.size || "—")}</span>
      <span>${esc([tire.brand, tire.model].filter(Boolean).join(" ") || "—")}${tire.studded ? " · " + t("tire.stud").toLowerCase() : ""}</span>
      <span class="tnum tread-${treadTone(tire.tread_mm)}">${tire.tread_mm != null ? esc(tire.tread_mm) + " mm" : "—"}</span>
      <span class="tnum">${esc(tire.dot_code || "—")}</span>
    </div>`).join("")}
  </div>`;
}

function paymentHtml(set) {
  return `<div class="row-between">
    <div><div class="muted" style="font-size:13px">${t("sd.storageFee")}</div><div style="font-size:20px;font-weight:800" class="tnum">${set.fee != null ? esc(set.fee) : "—"}</div></div>
    ${set.fee != null
      ? `<button id="payBtn" class="btn ${set.paid ? "" : "btn-primary"}">${icon(set.paid ? "check" : "alert", 18)} ${set.paid ? t("sd.paidUndo") : t("sd.markPaid")}</button>`
      : `<span class="muted" style="font-size:13px">${t("sd.noFee")}</span>`}
  </div>`;
}

// Read-only insight strip: location, payment status, worst tread. No handlers.
function insightCells(set) {
  const cells = [
    `<div class="u-stat"><span class="u-stat-l">${t("loc.title")}</span><span class="u-stat-v">${icon("map", 14)}${hasLocation(set) ? esc(locationLine(set)) : "—"}</span></div>`,
  ];
  if (set.fee != null) {
    const tone = set.paid ? "is-ok" : "is-warn";
    cells.push(`<div class="u-stat ${tone}"><span class="u-stat-l">${t("sd.payment")}</span><span class="u-stat-v tnum"><span class="u-dot ${tone}"></span>${esc(set.fee)}</span></div>`);
  }
  const treads = (set.tires || []).map((x) => x.tread_mm).filter((x) => x != null);
  if (treads.length) {
    const min = Math.min(...treads);
    const tone = treadTone(min);
    const cls = tone === "danger" ? "is-danger" : tone === "warn" ? "is-warn" : "is-ok";
    cells.push(`<div class="u-stat ${cls}"><span class="u-stat-l">${t("sd.tread")}</span><span class="u-stat-v tnum">${esc(min)} mm</span></div>`);
  }
  return cells.join("");
}

function wireDetail(main, set) {
  const $ = (id) => main.querySelector("#" + id);

  $("statusBtn")?.addEventListener("click", async (e) => {
    const to = e.currentTarget.dataset.to;
    busy(e.currentTarget, true);
    try {
      const res = await db.changeStatus(set.id, to);
      if (res?.queued) { set.status = to; toast(t("sd.savedOffline")); renderDetail(main, set); }
      else { toast(t("status.now", { status: statusLabel(to).toLowerCase() })); await render(main, { params: [set.public_code] }); }
    } catch (err) { toast(err.message, "err"); busy(e.currentTarget, false); }
  });

  $("payBtn")?.addEventListener("click", async (e) => {
    busy(e.currentTarget, true);
    try {
      const res = await db.setPaid(set.id, !set.paid);
      if (res?.queued) { set.paid = !set.paid; toast(t("sd.savedOffline")); renderDetail(main, set); }
      else { toast(set.paid ? t("sd.markedUnpaid") : t("sd.markedPaid")); await render(main, { params: [set.public_code] }); }
    } catch (err) { toast(err.message, "err"); busy(e.currentTarget, false); }
  });

  $("printBtn").addEventListener("click", async () => {
    const { printLabel } = await import("../qrlabel.js");
    printLabel(set);
  });

  $("delBtn").addEventListener("click", async (e) => {
    busy(e.currentTarget, true);
    try {
      await db.softDeleteSet(set.id);
      toast(t("sd.movedToBin", { code: set.public_code }), {
        actionLabel: t("sd.undo"),
        onAction: async () => { await db.restoreSet(set.id); toast(t("sd.restored")); },
      });
      go("/");
    } catch (err) { toast(err.message, "err"); busy(e.currentTarget, false); }
  });

  $("moveBtn").addEventListener("click", () => openMove(main, set));

  main.querySelectorAll("details.disclose").forEach((d) => {
    d.addEventListener("toggle", () => {
      if (!d.open) return;
      if (d.dataset.key === "photos" && !d.dataset.loaded) { d.dataset.loaded = "1"; loadPhotos(main, set); }
      if (d.dataset.key === "history" && !d.dataset.loaded) { d.dataset.loaded = "1"; loadHistory(main, set); }
    });
  });
}

// ---------------------------------------------------------------- Move -------
function openMove(main, set) {
  const area = main.querySelector("#moveArea");
  if (area.dataset.open) { area.innerHTML = ""; area.dataset.open = ""; return; }
  area.dataset.open = "1";
  area.innerHTML = `
    <div class="move-preview" style="margin-top:14px">
      <div class="move-col"><div class="caplabel">${t("sd.from")}</div>${miniLoc(set)}</div>
      <div class="arrow">${icon("move", 22)}</div>
      <div class="move-col"><div class="caplabel">${t("sd.to")}</div><div id="toPreview">${miniLoc({})}</div></div>
    </div>
    <div class="grid-4">
      <input id="m_zone" placeholder="${esc(t("loc.zone"))}" value="${esc(set.zone || "")}">
      <input id="m_rack" placeholder="${esc(t("loc.rack"))}" value="${esc(set.rack || "")}">
      <input id="m_shelf" placeholder="${esc(t("loc.shelf"))}" value="${esc(set.shelf || "")}">
      <input id="m_slot" placeholder="${esc(t("loc.slot"))}" value="${esc(set.slot || "")}">
    </div>
    <div id="mWarn"></div>
    <button id="confirmMove" class="btn btn-primary btn-block" style="margin-top:12px">${icon("move", 18)} ${t("sd.moveHere")}</button>`;

  const v = (id) => main.querySelector("#" + id).value.trim();
  const read = () => ({ zone: v("m_zone"), rack: v("m_rack"), shelf: v("m_shelf"), slot: v("m_slot") });
  const refreshPreview = async () => {
    main.querySelector("#toPreview").innerHTML = miniLoc(read());
    const occ = await db.findSetAtLocation(read(), set.id).catch(() => null);
    main.querySelector("#mWarn").innerHTML = occ
      ? `<div class="banner banner-warn" style="margin-top:10px">${icon("alert", 18)} ${t("sd.alreadyThere", { code: esc(occ.public_code) })}</div>` : "";
  };
  ["m_zone", "m_rack", "m_shelf", "m_slot"].forEach((id) => main.querySelector("#" + id).addEventListener("input", refreshPreview));
  main.querySelector("#confirmMove").addEventListener("click", async (e) => {
    busy(e.currentTarget, true);
    const dest = read();
    try {
      const res = await db.moveStorageSet(set, dest);
      if (res?.queued) { Object.assign(set, dest); toast(t("sd.savedOffline")); renderDetail(main, set); }
      else { toast(t("sd.locationUpdated")); await render(main, { params: [set.public_code] }); }
    } catch (err) { toast(err.message, "err"); busy(e.currentTarget, false); }
  });
}

function miniLoc(loc) {
  const parts = [[t("loc.zone"), loc.zone], [t("loc.rack"), loc.rack], [t("loc.shelf"), loc.shelf], [t("loc.slot"), loc.slot]].filter(([, val]) => val);
  if (!parts.length) return `<div class="loc-empty-mini" style="text-align:center;padding:8px">—</div>`;
  return `<div class="loc-block" style="grid-template-columns:repeat(${parts.length},1fr)">${parts.map(([l, val]) =>
    `<div class="loc-cell"><span class="loc-label">${esc(l)}</span><span class="loc-value" style="font-size:16px">${esc(val)}</span></div>`).join("")}</div>`;
}

// ---------------------------------------------------------------- Lazy loads -
async function loadPhotos(main, set) {
  const box = main.querySelector("#photoBox");
  const photos = (set.photos || []).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const uploader = `<label class="btn" for="addPhoto" style="min-height:38px">${icon("camera", 18)} ${t("sd.addPhoto")}</label>
    <input id="addPhoto" type="file" accept="image/*" capture="environment" hidden>`;
  if (!photos.length) { box.innerHTML = `<p class="muted" style="font-size:13px;margin-bottom:10px">${t("sd.noPhotos")}</p>${uploader}`; wireAddPhoto(main, set); return; }
  box.innerHTML = `<div class="photos" id="photoGrid"><p class="muted" style="font-size:13px">${t("common.loading")}</p></div><div style="margin-top:12px">${uploader}</div>`;
  let urls = {};
  try { urls = await db.signedPhotoUrls(photos.map((p) => p.path)); } catch {}
  main.querySelector("#photoGrid").innerHTML = photos.map((p) => `
    <figure class="photo">
      <a href="${esc(urls[p.path] || "#")}" target="_blank" rel="noopener"><img src="${esc(urls[p.path] || "")}" alt="condition photo" loading="lazy"></a>
      <button class="del" data-id="${esc(p.id)}" data-path="${esc(p.path)}" aria-label="${esc(t("sd.deletePhotoQ"))}">${icon("trash", 15)}</button>
    </figure>`).join("");
  main.querySelectorAll("#photoGrid .del").forEach((btn) => btn.onclick = async () => {
    if (!(await confirmSheet({ title: t("sd.deletePhotoQ"), confirmLabel: t("rec.delete"), danger: true }))) return;
    try { await db.deletePhoto({ id: btn.dataset.id, path: btn.dataset.path }); toast(t("sd.photoDeleted")); await render(main, { params: [set.public_code] }); }
    catch (err) { toast(err.message, "err"); }
  });
  wireAddPhoto(main, set);
}

function wireAddPhoto(main, set) {
  const input = main.querySelector("#addPhoto");
  if (!input) return;
  input.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const label = main.querySelector('label[for="addPhoto"]');
    label.innerHTML = `${icon("clock", 18)} ${t("sd.uploading")}`;
    try { await db.addPhoto(set.id, file); toast(t("sd.photoAdded")); await render(main, { params: [set.public_code] }); }
    catch (err) { toast(err.message, "err"); label.innerHTML = `${icon("camera", 18)} ${t("sd.addPhoto")}`; }
  };
}

async function loadHistory(main, set) {
  const box = main.querySelector("#histBox");
  try {
    const events = await db.loadAuditTrail(set.id);
    if (!events.length) { box.innerHTML = `<p class="muted" style="font-size:13px">${t("sd.noHistory")}</p>`; return; }
    box.innerHTML = `<div class="timeline">${events.map((ev) => {
      const key = "audit." + ev.action;
      const label = t(key);
      const shown = label === key ? (ev.summary || ev.action) : label;
      return `<div class="tl-item">
        <div class="tl-top"><span class="tl-action">${esc(shown)}</span><span class="tl-time">${timeAgo(ev.at)}</span></div>
        ${ev.actor_email ? `<div class="tl-who">${esc(ev.actor_email)}</div>` : ""}
      </div>`;
    }).join("")}</div>`;
  } catch (err) { box.innerHTML = `<p class="inline-err">${esc(err.message)}</p>`; }
}

// ---------------------------------------------------------------- Edit -------
function renderEdit(main, set) {
  const vehicle = set.vehicle || {};
  const customer = vehicle.customer || {};
  const v = (x) => esc(x ?? "");
  main.innerHTML = `
    <a class="btn btn-ghost" href="#/set/${esc(set.public_code)}" style="margin-bottom:10px;min-height:38px">${icon("back", 18)} ${t("common.cancel")}</a>
    <form id="ed">
      <section class="card u-module">
        <span class="u-corner tnum">${esc(set.public_code)}</span>
        <div class="u-module-head"><h3 class="u-module-title">${t("ci.customer")}</h3></div>
        <label class="field"><span class="label">${t("ci.name")}</span><input id="c_name" value="${v(customer.name)}" required></label>
        <div class="grid-2">
          <label class="field"><span class="label">${t("ci.phone")}</span><input id="c_phone" value="${v(customer.phone)}"></label>
          <label class="field"><span class="label">${t("ci.email")}</span><input id="c_email" value="${v(customer.email)}"></label>
        </div>
      </section>
      <section class="card u-module">
        <div class="u-module-head"><h3 class="u-module-title">${t("ci.vehicle")}</h3></div>
        <div class="grid-2">
          <label class="field"><span class="label">${t("ci.make")}</span><input id="v_make" value="${v(vehicle.make)}"></label>
          <label class="field"><span class="label">${t("ci.model")}</span><input id="v_model" value="${v(vehicle.model)}"></label>
          <label class="field"><span class="label">${t("ci.year")}</span><input id="v_year" type="number" value="${v(vehicle.year)}"></label>
          <label class="field"><span class="label">${t("ci.plate")}</span><input id="v_plate" value="${v(vehicle.plate)}"></label>
        </div>
      </section>
      <section class="card u-module">
        <div class="u-module-head"><h3 class="u-module-title">${t("ci.details")}</h3></div>
        <div class="grid-2">
          <label class="field"><span class="label">${t("ci.qty")}</span><input id="s_qty" type="number" min="1" max="8" value="${set.quantity}"></label>
          <label class="field"><span class="label">${t("ci.expectedPickup")}</span><input id="s_out" type="date" value="${v(set.expected_out_date)}"></label>
          <label class="field"><span class="label">${t("ci.fee")}</span><input id="s_fee" type="number" step="0.01" value="${v(set.fee)}"></label>
        </div>
        <label class="field"><span class="label">${t("ci.notes")}</span><textarea id="s_notes" rows="2">${v(set.notes)}</textarea></label>
      </section>
      <section class="card u-module">
        <div class="u-module-head"><h3 class="u-module-title">${t("ci.tires")}</h3></div>
        <div id="tires">${tireRowsHtml(set.quantity, set.tires)}</div>
      </section>
      <p id="edErr" class="inline-err hidden"></p>
      <div class="action-bar">
        <a class="btn" href="#/set/${esc(set.public_code)}">${t("common.cancel")}</a>
        <button class="btn btn-primary" type="submit">${icon("check", 18)} ${t("common.save")}</button>
      </div>
    </form>`;

  main.querySelector("#s_qty").onchange = () => {
    main.querySelector("#tires").innerHTML = tireRowsHtml(main.querySelector("#s_qty").value, collectTires(main.querySelector("#tires")));
  };
  main.querySelector("#ed").onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const val = (id) => main.querySelector("#" + id).value.trim();
    const err = main.querySelector("#edErr");
    err.classList.add("hidden");
    busy(btn, true);
    try {
      if (customer.id) await db.updateCustomer(customer.id, { name: val("c_name"), phone: val("c_phone") || null, email: val("c_email") || null });
      if (vehicle.id) await db.updateVehicle(vehicle.id, { make: val("v_make") || null, model: val("v_model") || null, year: val("v_year") ? Number(val("v_year")) : null, plate: val("v_plate").toUpperCase() || null });
      await db.updateStorageSet(set.id, { quantity: Number(val("s_qty")) || 4, expected_out_date: val("s_out") || null, fee: val("s_fee") ? Number(val("s_fee")) : null, notes: val("s_notes") || null });
      await db.replaceTires(set.id, collectTires(main.querySelector("#tires")));
      toast(t("edit.saved"));
      go(`/set/${set.public_code}`);
    } catch (e2) { err.textContent = e2.message; err.classList.remove("hidden"); busy(btn, false); }
  };
}
