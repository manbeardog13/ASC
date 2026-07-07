// ============================================================================
// views/checkin.js — "Store a tire set." One primary action. Reduces typing
// with a season segmented control, recent-location chips, common-size hints and
// sidewall OCR. Warns (never blocks) on likely duplicates and location clashes.
// ============================================================================
import * as db from "../db.js";
import { getState } from "../store.js";
import { SEASON_ORDER, SEASONS, seasonLabel, defaultIncomingSeason, locationLine } from "../domain.js";
import { icon, esc, toast, busy, go } from "../ui.js";
import { t } from "../i18n.js";
import { tireRowsHtml, collectTires, fillNextTireRow } from "./shared.js";
import { voiceSupported, voiceFillForm } from "../voice.js";

let season = defaultIncomingSeason();
let dupTimer = null;

export async function render(main) {
  clearTimeout(dupTimer);   // a pending duplicate-check from a previous mount
  const recent = getState().recentLocations || [];
  main.innerHTML = `
    <header class="view-stage">
      <div><span class="vs-k">${t("view.ctx")}</span><h1>${t("ci.title")}</h1></div>
      ${voiceSupported() ? `<button type="button" id="voiceFill" class="btn voice-cta">${icon("mic", 18)} ${t("voice.fill")}</button>` : ""}
    </header>
    <form id="ci" novalidate>
      <div class="card stack">
        <span class="u-corner is-num" aria-hidden="true">01</span>
        <fieldset>
          <legend>${t("ci.customer")}</legend>
          <label class="field"><span class="label">${t("ci.name")}</span><input id="c_name" autocomplete="off" required></label>
          <div class="grid-2">
            <label class="field"><span class="label">${t("ci.phone")}</span><input id="c_phone" type="tel" inputmode="tel" autocomplete="off"></label>
            <label class="field"><span class="label">${t("ci.email")}</span><input id="c_email" type="email" autocomplete="off"></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>${t("ci.vehicle")}</legend>
          <div class="grid-2">
            <label class="field"><span class="label">${t("ci.make")}</span><input id="v_make" autocomplete="off"></label>
            <label class="field"><span class="label">${t("ci.model")}</span><input id="v_model" autocomplete="off"></label>
            <label class="field"><span class="label">${t("ci.year")}</span><input id="v_year" type="number" inputmode="numeric" min="1950" max="2100"></label>
            <label class="field"><span class="label">${t("ci.plate")}</span><input id="v_plate" autocomplete="off" style="text-transform:uppercase"></label>
          </div>
        </fieldset>
        <div id="dupWarn"></div>
      </div>

      <div class="card stack" style="margin-top:14px">
        <span class="u-corner is-num" aria-hidden="true">02</span>
        <fieldset>
          <legend>${t("ci.season")}</legend>
          <div class="segmented" role="group" aria-label="${esc(t("ci.season"))}">
            ${SEASON_ORDER.map((s) => `<button type="button" data-season="${s}" aria-pressed="${s === season}">${icon(SEASONS[s].icon, 16)}${seasonLabel(s)}</button>`).join("")}
          </div>
        </fieldset>
        <fieldset>
          <legend>${t("ci.location")}</legend>
          <div class="grid-4">
            <label class="field"><span class="label">${t("loc.zone")}</span><input id="s_zone" autocomplete="off"></label>
            <label class="field"><span class="label">${t("loc.rack")}</span><input id="s_rack" autocomplete="off"></label>
            <label class="field"><span class="label">${t("loc.shelf")}</span><input id="s_shelf" autocomplete="off"></label>
            <label class="field"><span class="label">${t("loc.slot")}</span><input id="s_slot" autocomplete="off"></label>
          </div>
          ${recent.length ? `<div class="suggestions" id="recentLoc">${recent.map((loc, i) =>
            `<button type="button" data-loc="${i}">${icon("map", 14)}${esc(locationLine({ ...loc }))}</button>`).join("")}</div>` : ""}
          <div id="locWarn"></div>
        </fieldset>
        <fieldset>
          <legend>${t("ci.details")}</legend>
          <div class="grid-2">
            <label class="field"><span class="label">${t("ci.qty")}</span><input id="s_qty" type="number" inputmode="numeric" min="1" max="8" value="4"></label>
            <label class="field"><span class="label">${t("ci.expectedPickup")}</span><input id="s_out" type="date"></label>
          </div>
          <label class="switch"><input id="s_onrims" type="checkbox"> ${t("ci.onRims")}</label>
          <div class="grid-2" id="rimWrap" hidden>
            <label class="field"><span class="label">${t("ci.rimType")}</span>
              <select id="s_rimtype"><option value="">—</option><option value="steel">${t("ci.steel")}</option><option value="alloy">${t("ci.alloy")}</option></select></label>
          </div>
          <div class="grid-2">
            <label class="field"><span class="label">${t("ci.fee")}</span><input id="s_fee" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00"></label>
            <label class="switch" style="align-self:end"><input id="s_paid" type="checkbox"> ${t("ci.paid")}</label>
          </div>
          <label class="field"><span class="label">${t("ci.notes")}</span><textarea id="s_notes" rows="2"></textarea></label>
        </fieldset>
      </div>

      <div class="card stack" style="margin-top:14px">
        <span class="u-corner is-num" aria-hidden="true">03</span>
        <fieldset>
          <legend>${t("ci.tires")}</legend>
          <div class="row-between" style="margin-bottom:10px">
            <span class="muted" style="font-size:13px">${t("ci.tiresHint")}</span>
            <button type="button" id="ss_photoBtn" class="btn" style="min-height:38px">${icon("camera", 18)} ${t("ci.scanSidewall")}</button>
            <input id="ss_photo" type="file" accept="image/*" capture="environment" hidden>
          </div>
          <p id="ocrStatus" class="banner banner-info hidden"></p>
          <div id="tires">${tireRowsHtml(4)}</div>
        </fieldset>
      </div>

      <p id="ciErr" class="inline-err hidden"></p>
      <div class="action-bar">
        <a class="btn" href="#/">${t("ci.cancel")}</a>
        <button class="btn btn-primary" type="submit">${icon("box", 18)} ${t("ci.submit")}</button>
      </div>
    </form>`;

  wire(main);
}

function wire(main) {
  const $ = (id) => main.querySelector("#" + id);
  if ($("s_out")) $("s_out").min = new Date().toISOString().slice(0, 10);

  main.querySelectorAll("[data-season]").forEach((btn) => {
    btn.onclick = () => {
      season = btn.dataset.season;
      main.querySelectorAll("[data-season]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    };
  });
  $("s_onrims").onchange = (e) => { $("rimWrap").hidden = !e.target.checked; };
  $("s_qty").onchange = () => { $("tires").innerHTML = tireRowsHtml($("s_qty").value, collectTires($("tires"))); };

  const recent = getState().recentLocations || [];
  main.querySelectorAll("#recentLoc [data-loc]")?.forEach((btn) => {
    btn.onclick = () => {
      const loc = recent[Number(btn.dataset.loc)];
      $("s_zone").value = loc.zone; $("s_rack").value = loc.rack; $("s_shelf").value = loc.shelf; $("s_slot").value = loc.slot;
      checkLocation(main);
    };
  });

  ["v_plate", "c_phone"].forEach((id) => $(id).addEventListener("input", () => {
    clearTimeout(dupTimer); dupTimer = setTimeout(() => checkDuplicates(main), 500);
  }));
  ["s_zone", "s_rack", "s_shelf", "s_slot"].forEach((id) => $(id).addEventListener("change", () => checkLocation(main)));

  $("ss_photoBtn").onclick = () => $("ss_photo").click();   // real button = keyboard-reachable
  $("ss_photo").onchange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";   // so re-picking the SAME photo still fires change (retry path)
    runOcr(main, file);
  };
  main.querySelector("#ci").onsubmit = (e) => { e.preventDefault(); submit(main); };

  // Guided voice fill (hr-HR/en-US): listens per field, fills, auto-advances.
  const vf = main.querySelector("#voiceFill");
  if (vf) vf.onclick = () => {
    const fields = [
      { el: $("c_name"),  label: t("ci.name"),  norm: "name" },
      { el: $("c_phone"), label: t("ci.phone"), norm: "phone" },
      { el: $("v_plate"), label: t("ci.plate"), norm: "plate" },
      { el: $("v_make"),  label: t("ci.make"),  norm: "name" },
      { el: $("v_model"), label: t("ci.model"), norm: "text" },
      {
        el: main.querySelector('#tires [data-t="size"]'),
        label: t("tire.size"), norm: "size",
        // One spoken size fills every tire row — sets are almost always uniform.
        apply: (value) => main.querySelectorAll('#tires [data-t="size"]').forEach((inp) => {
          inp.value = value;
          inp.dispatchEvent(new Event("input", { bubbles: true }));
        }),
      },
    ].filter((f) => f.el);
    voiceFillForm(fields, { onDone: () => toast(t("voice.done")) });
  };
}

async function checkDuplicates(main) {
  const plateEl = main.querySelector("#v_plate");
  if (!plateEl) return;   // debounce fired after the view was swapped out
  const plate = plateEl.value.trim();
  const phone = main.querySelector("#c_phone").value.trim();
  const box = main.querySelector("#dupWarn");
  if (!plate && !phone) { box.innerHTML = ""; return; }
  const dups = await db.findPossibleDuplicates({ plate, phone }).catch(() => []);
  box.innerHTML = dups.length
    ? `<div class="banner banner-warn">${icon("alert", 18)}<div>${t("ci.dupWarn")}${dups.map((d) =>
        `<a href="#/set/${esc(d.public_code)}" style="text-decoration:underline">${esc(d.public_code)}</a> (${esc(d.reasons.map((r) => t("ci.reason." + r)).join(", "))})`).join(", ")}</div></div>`
    : "";
}

async function checkLocation(main) {
  if (!main.querySelector("#s_zone")) return;   // view already swapped out
  const loc = readLocation(main);
  const box = main.querySelector("#locWarn");
  if (!loc.zone && !loc.rack && !loc.shelf && !loc.slot) { box.innerHTML = ""; return; }
  const occupant = await db.findSetAtLocation(loc).catch(() => null);
  box.innerHTML = occupant
    ? `<div class="banner banner-warn" style="margin-top:10px">${icon("alert", 18)}<div><a href="#/set/${esc(occupant.public_code)}" style="text-decoration:underline">${esc(occupant.public_code)}</a> ${t("ci.occupied")}</div></div>`
    : "";
}

function readLocation(main) {
  const $ = (id) => main.querySelector("#" + id).value.trim();
  return { zone: $("s_zone"), rack: $("s_rack"), shelf: $("s_shelf"), slot: $("s_slot") };
}

async function runOcr(main, file) {
  if (!file) return;
  const status = main.querySelector("#ocrStatus");
  status.classList.remove("hidden");
  status.textContent = t("ci.reading");
  try {
    const { scanSidewall } = await import("../ocr.js");
    const res = await scanSidewall(file, (m) => {
      if (m.status === "recognizing text") status.textContent = t("ci.readingPct", { pct: Math.round((m.progress || 0) * 100) });
    });
    if (!res.size && !res.dot) { status.textContent = t("ci.ocrFail"); return; }
    const rowN = fillNextTireRow(main.querySelector("#tires"), res.size, res.dot);
    const parts = [res.size && t("part.size", { v: res.size }), res.dot && t("part.dot", { v: res.dot })].filter(Boolean).join(", ");
    status.textContent = t("ci.ocrFilled", { n: rowN, parts });
  } catch (err) {
    status.textContent = err.message || t("ci.ocrFail");
  }
}

async function submit(main) {
  const $ = (id) => main.querySelector("#" + id);
  const val = (id) => $(id).value.trim();
  const btn = main.querySelector('button[type="submit"]');
  const err = $("ciErr");
  err.classList.add("hidden");
  if (!val("c_name")) { err.textContent = t("ci.nameRequired"); err.classList.remove("hidden"); $("c_name").focus(); return; }
  busy(btn, true);
  try {
    const form = {
      customer: { name: val("c_name"), phone: val("c_phone"), email: val("c_email") },
      vehicle: { make: val("v_make"), model: val("v_model"), year: val("v_year") ? Number(val("v_year")) : null, plate: val("v_plate").toUpperCase() },
      set: {
        season, quantity: Number(val("s_qty")) || 4, on_rims: $("s_onrims").checked, rim_type: $("s_rimtype").value,
        ...readLocation(main),
        check_in_date: new Date().toISOString().slice(0, 10),
        expected_out_date: val("s_out") || null,
        fee: val("s_fee") ? Number(val("s_fee")) : null, paid: $("s_paid").checked, notes: val("s_notes"),
      },
      tires: collectTires($("tires")),
    };
    const code = await db.createStorageSet(form);
    toast(t("ci.stored", { code }), { actionLabel: t("ci.printLabel"), onAction: async () => {
      const { printLabel } = await import("../qrlabel.js");
      printLabel(await db.loadStorageSet(code));
    }});
    go(`/set/${code}`);
  } catch (e2) {
    err.textContent = e2.message; err.classList.remove("hidden");
    busy(btn, false);
  }
}
