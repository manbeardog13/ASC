// ============================================================================
// views/set-detail.js — the operational heart. Answers first: who owns these,
// where are they, what vehicle, can I pick them now. One-tap status changes
// (optimistic), move-with-old→new preview, progressive disclosure for the rest,
// audit timeline, photos, soft delete with undo. Also handles ?/edit mode.
// ============================================================================
import * as db from "../db.js";
import { setViewRefresh } from "../store.js";
import {
  statusLabel, seasonLabel, nextStatusAction, hasLocation, locationParts,
  treadTone, paymentLabel,
} from "../domain.js";
import {
  icon, esc, statusChip, seasonChip, paymentChip, locationBlock, toast, busy, confirmSheet, go, skeletonDetail,
} from "../ui.js";
import { tireRowsHtml, collectTires, fmtDate, timeAgo } from "./shared.js";

export async function render(main, { params, mode }) {
  const code = decodeURIComponent(params[0]);
  main.innerHTML = `<div class="card">${skeletonDetail()}</div>`;
  let set;
  try {
    set = await db.loadStorageSet(code);
  } catch {
    main.innerHTML = `<div class="card"><h2>Not found</h2><p class="muted">No set called <b>${esc(code)}</b>.</p><a class="btn" href="#/">Back home</a></div>`;
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

  main.innerHTML = `
    <a class="btn btn-ghost" href="#/" style="margin-bottom:10px;min-height:38px">${icon("back", 18)} Home</a>

    <div class="card">
      <div class="detail-head">
        <div>
          <div class="code tnum">${esc(set.public_code)}</div>
          <div class="who">${esc(customer.name || "—")}</div>
        </div>
        <a class="btn btn-ghost" href="#/set/${esc(set.public_code)}/edit" aria-label="Edit">${icon("pencil", 20)}</a>
      </div>
      <div class="detail-chips">${statusChip(set.status)}${seasonChip(set.season)}${paymentChip(set)}</div>

      <div class="row-between" style="margin:16px 0 8px"><h3 style="font-size:14px;color:var(--muted)">Location</h3>
        <button id="moveBtn" class="btn btn-ghost" style="min-height:34px;font-size:13px">${icon("move", 16)} Move</button></div>
      ${locationBlock(set)}
      <div id="moveArea"></div>
    </div>

    ${next ? `<button id="statusBtn" class="btn btn-primary btn-lg" style="margin-top:14px" data-to="${next.to}">${icon("check", 18)} ${esc(next.label)}</button>` : ""}

    <div class="card" style="margin-top:14px">
      <div class="kv">
        <div><span class="k">Vehicle</span><span class="v">${esc(vehicleLine)}</span></div>
        <div><span class="k">Plate</span><span class="v tnum">${esc(vehicle.plate || "—")}</span></div>
        <div><span class="k">Phone</span><span class="v">${customer.phone ? `<a href="tel:${esc(customer.phone)}">${esc(customer.phone)}</a>` : "—"}</span></div>
        <div><span class="k">Tires</span><span class="v">${set.quantity}${set.on_rims ? ` · on ${esc(set.rim_type || "rims")}` : ""}</span></div>
        <div><span class="k">Checked in</span><span class="v">${fmtDate(set.check_in_date)}</span></div>
        <div><span class="k">Expected out</span><span class="v">${fmtDate(set.expected_out_date)}</span></div>
      </div>
      ${set.notes ? `<div class="banner banner-info" style="margin:14px 0 0">${icon("pencil", 16)} ${esc(set.notes)}</div>` : ""}
    </div>

    <div class="card" style="margin-top:14px;padding-top:4px">
      ${disclosure("tires", "Tires & tread", tiresHtml(set))}
      ${disclosure("payment", "Payment", paymentHtml(set))}
      ${disclosure("photos", "Condition photos", `<div id="photoBox"><p class="muted" style="font-size:13px">Open to load…</p></div>`)}
      ${disclosure("history", "History", `<div id="histBox"><p class="muted" style="font-size:13px">Open to load…</p></div>`)}
    </div>

    <div class="action-bar">
      <button id="printBtn" class="btn">${icon("printer", 18)} Label</button>
      <button id="delBtn" class="btn btn-danger">${icon("trash", 18)} Delete</button>
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
  if (!tires.length) return `<p class="muted" style="font-size:14px">No tire details recorded.</p>`;
  return `<div class="tire-table">
    <div class="tr th"><span>Pos</span><span>Size</span><span>Brand</span><span>Tread</span><span>DOT</span></div>
    ${tires.map((t) => `<div class="tr">
      <span class="tnum">${esc(t.position || "—")}</span>
      <span class="tnum">${esc(t.size || "—")}</span>
      <span>${esc([t.brand, t.model].filter(Boolean).join(" ") || "—")}${t.studded ? " · stud" : ""}</span>
      <span class="tnum tread-${treadTone(t.tread_mm)}">${t.tread_mm != null ? esc(t.tread_mm) + " mm" : "—"}</span>
      <span class="tnum">${esc(t.dot_code || "—")}</span>
    </div>`).join("")}
  </div>`;
}

function paymentHtml(set) {
  const label = paymentLabel(set);
  return `<div class="row-between">
    <div><div class="muted" style="font-size:13px">Storage fee</div><div style="font-size:20px;font-weight:800" class="tnum">${set.fee != null ? esc(set.fee) : "—"}</div></div>
    ${set.fee != null ? `<button id="payBtn" class="btn ${set.paid ? "" : "btn-primary"}">${icon(set.paid ? "check" : "alert", 18)} ${set.paid ? "Paid — undo" : "Mark paid"}</button>` : `<span class="muted" style="font-size:13px">No fee set</span>`}
  </div>`;
}

function wireDetail(main, set) {
  const $ = (id) => main.querySelector("#" + id);

  // One-tap status change (optimistic)
  $("statusBtn")?.addEventListener("click", async (e) => {
    const to = e.currentTarget.dataset.to;
    busy(e.currentTarget, true);
    try {
      const res = await db.changeStatus(set.id, to);
      toast(res.queued ? `Saved offline — will sync` : `Now ${statusLabel(to).toLowerCase()}`);
      await render(main, { params: [set.public_code] });
    } catch (err) { toast(err.message, "err"); busy(e.currentTarget, false); }
  });

  // Payment toggle
  $("payBtn")?.addEventListener("click", async (e) => {
    busy(e.currentTarget, true);
    try { await db.setPaid(set.id, !set.paid); toast(set.paid ? "Marked unpaid" : "Marked paid ✓"); await render(main, { params: [set.public_code] }); }
    catch (err) { toast(err.message, "err"); busy(e.currentTarget, false); }
  });

  // Print label
  $("printBtn").addEventListener("click", async () => {
    const { printLabel } = await import("../qrlabel.js");
    printLabel(set);
  });

  // Soft delete → recycle bin, with undo (fully recoverable)
  $("delBtn").addEventListener("click", async (e) => {
    busy(e.currentTarget, true);
    try {
      await db.softDeleteSet(set.id);
      toast(`${set.public_code} moved to recycle bin`, {
        actionLabel: "Undo",
        onAction: async () => { await db.restoreSet(set.id); toast("Restored"); },
      });
      go("/");
    } catch (err) { toast(err.message, "err"); busy(e.currentTarget, false); }
  });

  // Move with old → new preview
  $("moveBtn").addEventListener("click", () => openMove(main, set));

  // Lazy-load photos + history when their disclosure first opens
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
  const cur = locationParts(set).map((p) => p.value).join("|");
  area.innerHTML = `
    <div class="move-preview" style="margin-top:14px">
      <div class="move-col"><div class="caplabel">From</div>${miniLoc(set)}</div>
      <div class="arrow">${icon("back", 22)}<span style="display:inline-block;transform:rotate(180deg)"></span></div>
      <div class="move-col"><div class="caplabel">To</div><div id="toPreview">${miniLoc({})}</div></div>
    </div>
    <div class="grid-4">
      <input id="m_zone" placeholder="Zone" value="${esc(set.zone || "")}">
      <input id="m_rack" placeholder="Rack" value="${esc(set.rack || "")}">
      <input id="m_shelf" placeholder="Shelf" value="${esc(set.shelf || "")}">
      <input id="m_slot" placeholder="Slot" value="${esc(set.slot || "")}">
    </div>
    <div id="mWarn"></div>
    <button id="confirmMove" class="btn btn-primary btn-block" style="margin-top:12px">${icon("move", 18)} Move here</button>`;

  const read = () => ({ zone: v("m_zone"), rack: v("m_rack"), shelf: v("m_shelf"), slot: v("m_slot") });
  const v = (id) => main.querySelector("#" + id).value.trim();
  const refreshPreview = async () => {
    main.querySelector("#toPreview").innerHTML = miniLoc(read());
    const occ = await db.findSetAtLocation(read(), set.id).catch(() => null);
    main.querySelector("#mWarn").innerHTML = occ
      ? `<div class="banner banner-warn" style="margin-top:10px">${icon("alert", 18)} ${esc(occ.public_code)} is already there.</div>` : "";
  };
  ["m_zone", "m_rack", "m_shelf", "m_slot"].forEach((id) => main.querySelector("#" + id).addEventListener("input", refreshPreview));
  main.querySelector("#confirmMove").addEventListener("click", async (e) => {
    busy(e.currentTarget, true);
    try { await db.moveStorageSet(set, read()); toast("Location updated"); await render(main, { params: [set.public_code] }); }
    catch (err) { toast(err.message, "err"); busy(e.currentTarget, false); }
  });
}

function miniLoc(loc) {
  const parts = [["Zone", loc.zone], ["Rack", loc.rack], ["Shelf", loc.shelf], ["Slot", loc.slot]].filter(([, v]) => v);
  if (!parts.length) return `<div class="loc-empty-mini" style="text-align:center;padding:8px">—</div>`;
  return `<div class="loc-block" style="grid-template-columns:repeat(${parts.length},1fr)">${parts.map(([l, v]) =>
    `<div class="loc-cell"><span class="loc-label">${l}</span><span class="loc-value" style="font-size:16px">${esc(v)}</span></div>`).join("")}</div>`;
}

// ---------------------------------------------------------------- Lazy loads -
async function loadPhotos(main, set) {
  const box = main.querySelector("#photoBox");
  const photos = (set.photos || []).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const uploader = `<label class="btn" for="addPhoto" style="min-height:38px">${icon("camera", 18)} Add photo</label>
    <input id="addPhoto" type="file" accept="image/*" capture="environment" hidden>`;
  if (!photos.length) { box.innerHTML = `<p class="muted" style="font-size:13px;margin-bottom:10px">No photos yet.</p>${uploader}`; wireAddPhoto(main, set); return; }
  box.innerHTML = `<div class="photos" id="photoGrid"><p class="muted" style="font-size:13px">Loading…</p></div><div style="margin-top:12px">${uploader}</div>`;
  let urls = {};
  try { urls = await db.signedPhotoUrls(photos.map((p) => p.path)); } catch {}
  main.querySelector("#photoGrid").innerHTML = photos.map((p) => `
    <figure class="photo">
      <a href="${urls[p.path] || "#"}" target="_blank" rel="noopener"><img src="${urls[p.path] || ""}" alt="condition photo" loading="lazy"></a>
      <button class="del" data-id="${esc(p.id)}" data-path="${esc(p.path)}" aria-label="Delete photo">${icon("trash", 15)}</button>
    </figure>`).join("");
  main.querySelectorAll("#photoGrid .del").forEach((btn) => btn.onclick = async () => {
    if (!(await confirmSheet({ title: "Delete this photo?", confirmLabel: "Delete", danger: true }))) return;
    try { await db.deletePhoto({ id: btn.dataset.id, path: btn.dataset.path }); toast("Photo deleted"); await render(main, { params: [set.public_code] }); }
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
    label.innerHTML = `${icon("clock", 18)} Uploading…`;
    try { await db.addPhoto(set.id, file); toast("Photo added"); await render(main, { params: [set.public_code] }); }
    catch (err) { toast(err.message, "err"); label.innerHTML = `${icon("camera", 18)} Add photo`; }
  };
}

async function loadHistory(main, set) {
  const box = main.querySelector("#histBox");
  try {
    const events = await db.loadAuditTrail(set.id);
    if (!events.length) { box.innerHTML = `<p class="muted" style="font-size:13px">No history yet.</p>`; return; }
    box.innerHTML = `<div class="timeline">${events.map((ev) => `
      <div class="tl-item">
        <div class="tl-top"><span class="tl-action">${esc(ev.summary || ev.action)}</span><span class="tl-time">${timeAgo(ev.at)}</span></div>
        ${ev.actor_email ? `<div class="tl-who">${esc(ev.actor_email)}</div>` : ""}
      </div>`).join("")}</div>`;
  } catch (err) { box.innerHTML = `<p class="inline-err">${esc(err.message)}</p>`; }
}

// ---------------------------------------------------------------- Edit -------
function renderEdit(main, set) {
  const vehicle = set.vehicle || {};
  const customer = vehicle.customer || {};
  const v = (x) => esc(x ?? "");
  main.innerHTML = `
    <a class="btn btn-ghost" href="#/set/${esc(set.public_code)}" style="margin-bottom:10px;min-height:38px">${icon("back", 18)} Cancel</a>
    <form id="ed">
      <div class="card stack">
        <fieldset><legend>Customer</legend>
          <label class="field"><span class="label">Name</span><input id="c_name" value="${v(customer.name)}" required></label>
          <div class="grid-2">
            <label class="field"><span class="label">Phone</span><input id="c_phone" value="${v(customer.phone)}"></label>
            <label class="field"><span class="label">Email</span><input id="c_email" value="${v(customer.email)}"></label>
          </div>
        </fieldset>
        <fieldset><legend>Vehicle</legend>
          <div class="grid-2">
            <label class="field"><span class="label">Make</span><input id="v_make" value="${v(vehicle.make)}"></label>
            <label class="field"><span class="label">Model</span><input id="v_model" value="${v(vehicle.model)}"></label>
            <label class="field"><span class="label">Year</span><input id="v_year" type="number" value="${v(vehicle.year)}"></label>
            <label class="field"><span class="label">Plate</span><input id="v_plate" value="${v(vehicle.plate)}"></label>
          </div>
        </fieldset>
        <fieldset><legend>Details</legend>
          <div class="grid-2">
            <label class="field"><span class="label">Quantity</span><input id="s_qty" type="number" min="1" max="8" value="${set.quantity}"></label>
            <label class="field"><span class="label">Expected pickup</span><input id="s_out" type="date" value="${v(set.expected_out_date)}"></label>
            <label class="field"><span class="label">Storage fee</span><input id="s_fee" type="number" step="0.01" value="${v(set.fee)}"></label>
          </div>
          <label class="field"><span class="label">Notes</span><textarea id="s_notes" rows="2">${v(set.notes)}</textarea></label>
        </fieldset>
        <fieldset><legend>Tires</legend><div id="tires">${tireRowsHtml(set.quantity, set.tires)}</div></fieldset>
      </div>
      <p id="edErr" class="inline-err hidden"></p>
      <div class="action-bar">
        <a class="btn" href="#/set/${esc(set.public_code)}">Cancel</a>
        <button class="btn btn-primary" type="submit">${icon("check", 18)} Save</button>
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
      await db.updateCustomer(customer.id, { name: val("c_name"), phone: val("c_phone") || null, email: val("c_email") || null });
      if (vehicle.id) await db.updateVehicle(vehicle.id, { make: val("v_make") || null, model: val("v_model") || null, year: val("v_year") ? Number(val("v_year")) : null, plate: val("v_plate").toUpperCase() || null });
      await db.updateStorageSet(set.id, {
        quantity: Number(val("s_qty")) || 4, expected_out_date: val("s_out") || null,
        fee: val("s_fee") ? Number(val("s_fee")) : null, notes: val("s_notes") || null,
      });
      await db.replaceTires(set.id, collectTires(main.querySelector("#tires")));
      toast("Saved");
      go(`/set/${set.public_code}`);
    } catch (e2) { err.textContent = e2.message; err.classList.remove("hidden"); busy(btn, false); }
  };
}
