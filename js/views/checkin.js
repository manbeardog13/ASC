// ============================================================================
// views/checkin.js — "Store a tire set." One primary action. Reduces typing
// with a season segmented control, recent-location chips, common-size hints and
// sidewall OCR. Warns (never blocks) on likely duplicates and location clashes.
// ============================================================================
import * as db from "../db.js";
import { getState } from "../store.js";
import { SEASON_ORDER, SEASONS, defaultIncomingSeason, locationLine } from "../domain.js";
import { icon, esc, toast, busy, go } from "../ui.js";
import { tireRowsHtml, collectTires, fillNextTireRow } from "./shared.js";

let season = defaultIncomingSeason();
let dupTimer = null;

export async function render(main) {
  const recent = getState().recentLocations || [];
  main.innerHTML = `
    <div class="row-between" style="margin-bottom:14px"><h1>Store tires</h1></div>
    <form id="ci" novalidate>
      <div class="card stack">
        <fieldset>
          <legend>Customer</legend>
          <label class="field"><span class="label">Name</span><input id="c_name" autocomplete="off" required></label>
          <div class="grid-2">
            <label class="field"><span class="label">Phone</span><input id="c_phone" type="tel" inputmode="tel" autocomplete="off"></label>
            <label class="field"><span class="label">Email</span><input id="c_email" type="email" autocomplete="off"></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Vehicle</legend>
          <div class="grid-2">
            <label class="field"><span class="label">Make</span><input id="v_make" autocomplete="off"></label>
            <label class="field"><span class="label">Model</span><input id="v_model" autocomplete="off"></label>
            <label class="field"><span class="label">Year</span><input id="v_year" type="number" inputmode="numeric" min="1950" max="2100"></label>
            <label class="field"><span class="label">License plate</span><input id="v_plate" autocomplete="off" style="text-transform:uppercase"></label>
          </div>
        </fieldset>
        <div id="dupWarn"></div>
      </div>

      <div class="card stack" style="margin-top:14px">
        <fieldset>
          <legend>Season</legend>
          <div class="segmented" role="group" aria-label="Season">
            ${SEASON_ORDER.map((s) => `<button type="button" data-season="${s}" aria-pressed="${s === season}">${icon(SEASONS[s].icon, 16)}${SEASONS[s].label}</button>`).join("")}
          </div>
        </fieldset>
        <fieldset>
          <legend>Location in warehouse</legend>
          <div class="grid-4">
            <label class="field"><span class="label">Zone</span><input id="s_zone" autocomplete="off"></label>
            <label class="field"><span class="label">Rack</span><input id="s_rack" autocomplete="off"></label>
            <label class="field"><span class="label">Shelf</span><input id="s_shelf" autocomplete="off"></label>
            <label class="field"><span class="label">Slot</span><input id="s_slot" autocomplete="off"></label>
          </div>
          ${recent.length ? `<div class="suggestions" id="recentLoc">${recent.map((loc, i) =>
            `<button type="button" data-loc="${i}">${icon("map", 14)}${esc(locationLine({ ...loc }))}</button>`).join("")}</div>` : ""}
          <div id="locWarn"></div>
        </fieldset>
        <fieldset>
          <legend>Details</legend>
          <div class="grid-2">
            <label class="field"><span class="label">Number of tires</span><input id="s_qty" type="number" inputmode="numeric" min="1" max="8" value="4"></label>
            <label class="field"><span class="label">Expected pickup</span><input id="s_out" type="date"></label>
          </div>
          <label class="switch"><input id="s_onrims" type="checkbox"> On rims / wheels</label>
          <div class="grid-2" id="rimWrap" hidden>
            <label class="field"><span class="label">Rim type</span>
              <select id="s_rimtype"><option value="">—</option><option value="steel">Steel</option><option value="alloy">Alloy</option></select></label>
          </div>
          <div class="grid-2">
            <label class="field"><span class="label">Storage fee</span><input id="s_fee" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00"></label>
            <label class="switch" style="align-self:end"><input id="s_paid" type="checkbox"> Paid</label>
          </div>
          <label class="field"><span class="label">Notes</span><textarea id="s_notes" rows="2"></textarea></label>
        </fieldset>
      </div>

      <div class="card stack" style="margin-top:14px">
        <fieldset>
          <legend>Tires</legend>
          <div class="row-between" style="margin-bottom:10px">
            <span class="muted" style="font-size:13px">Fill what you can — blanks are ignored.</span>
            <label class="btn" for="ss_photo" style="min-height:38px">${icon("camera", 18)} Scan sidewall</label>
            <input id="ss_photo" type="file" accept="image/*" capture="environment" hidden>
          </div>
          <p id="ocrStatus" class="banner banner-info hidden"></p>
          <div id="tires">${tireRowsHtml(4)}</div>
        </fieldset>
      </div>

      <p id="ciErr" class="inline-err hidden"></p>
      <div class="action-bar">
        <a class="btn" href="#/">Cancel</a>
        <button class="btn btn-primary" type="submit">${icon("box", 18)} Store tires</button>
      </div>
    </form>`;

  wire(main);
}

function wire(main) {
  const $ = (id) => main.querySelector("#" + id);
  $("s_out") && ( $("s_out").min = new Date().toISOString().slice(0, 10) );

  // Season segmented control
  main.querySelectorAll("[data-season]").forEach((btn) => {
    btn.onclick = () => {
      season = btn.dataset.season;
      main.querySelectorAll("[data-season]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    };
  });

  // On rims → reveal rim type
  $("s_onrims").onchange = (e) => { $("rimWrap").hidden = !e.target.checked; };

  // Quantity → re-render tire rows (keep what's typed)
  $("s_qty").onchange = () => { $("tires").innerHTML = tireRowsHtml($("s_qty").value, collectTires($("tires"))); };

  // Recent-location chips
  const recent = getState().recentLocations || [];
  main.querySelectorAll("#recentLoc [data-loc]")?.forEach((btn) => {
    btn.onclick = () => {
      const loc = recent[Number(btn.dataset.loc)];
      $("s_zone").value = loc.zone; $("s_rack").value = loc.rack; $("s_shelf").value = loc.shelf; $("s_slot").value = loc.slot;
      checkLocation(main);
    };
  });

  // Live duplicate detection (debounced) on plate / phone
  ["v_plate", "c_phone"].forEach((id) => $(id).addEventListener("input", () => {
    clearTimeout(dupTimer); dupTimer = setTimeout(() => checkDuplicates(main), 500);
  }));
  // Location conflict on any location field
  ["s_zone", "s_rack", "s_shelf", "s_slot"].forEach((id) => $(id).addEventListener("change", () => checkLocation(main)));

  // Sidewall OCR
  $("ss_photo").onchange = (e) => runOcr(main, e.target.files?.[0]);

  // Submit
  main.querySelector("#ci").onsubmit = (e) => { e.preventDefault(); submit(main); };
}

async function checkDuplicates(main) {
  const plate = main.querySelector("#v_plate").value.trim();
  const phone = main.querySelector("#c_phone").value.trim();
  const box = main.querySelector("#dupWarn");
  if (!plate && !phone) { box.innerHTML = ""; return; }
  const dups = await db.findPossibleDuplicates({ plate, phone }).catch(() => []);
  box.innerHTML = dups.length
    ? `<div class="banner banner-warn">${icon("alert", 18)}<div>Possible duplicate — ${dups.map((d) =>
        `<a href="#/set/${esc(d.public_code)}" style="text-decoration:underline">${esc(d.public_code)}</a> (${esc(d.reason)})`).join(", ")}</div></div>`
    : "";
}

async function checkLocation(main) {
  const loc = readLocation(main);
  const box = main.querySelector("#locWarn");
  if (!loc.zone && !loc.rack && !loc.shelf && !loc.slot) { box.innerHTML = ""; return; }
  const occupant = await db.findSetAtLocation(loc).catch(() => null);
  box.innerHTML = occupant
    ? `<div class="banner banner-warn" style="margin-top:10px">${icon("alert", 18)}<div><a href="#/set/${esc(occupant.public_code)}" style="text-decoration:underline">${esc(occupant.public_code)}</a> is already at this location.</div></div>`
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
  status.textContent = "Reading sidewall…";
  try {
    const { scanSidewall } = await import("../ocr.js");
    const res = await scanSidewall(file, (m) => {
      if (m.status === "recognizing text") status.textContent = `Reading sidewall… ${Math.round((m.progress || 0) * 100)}%`;
    });
    if (!res.size && !res.dot) { status.textContent = "Couldn't read it clearly — type it in, or retry in good light."; return; }
    const rowN = fillNextTireRow(main.querySelector("#tires"), res.size, res.dot);
    status.textContent = `Filled tire ${rowN}: ${[res.size && "size " + res.size, res.dot && "DOT " + res.dot].filter(Boolean).join(", ")}. Please check it.`;
  } catch (err) {
    status.textContent = err.message || "OCR failed.";
  }
}

async function submit(main) {
  const $ = (id) => main.querySelector("#" + id);
  const val = (id) => $(id).value.trim();
  const btn = main.querySelector('button[type="submit"]');
  const err = $("ciErr");
  err.classList.add("hidden");
  if (!val("c_name")) { err.textContent = "Customer name is required."; err.classList.remove("hidden"); $("c_name").focus(); return; }
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
    toast(`Stored ${code}`, { actionLabel: "Print label", onAction: async () => {
      const { printLabel } = await import("../qrlabel.js");
      printLabel(await db.loadStorageSet(code));
    }});
    go(`/set/${code}`);
  } catch (e2) {
    err.textContent = e2.message; err.classList.remove("hidden");
    busy(btn, false);
  }
}
