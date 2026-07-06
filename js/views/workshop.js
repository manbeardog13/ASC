// ============================================================================
// views/workshop.js — WORKSHOP MODE. A stripped, oversized UI for greasy
// hands and arm's-length reading: giant buttons, giant results, voice search.
// Employees and administrators only (readonly never reaches the app anyway;
// an unknown role is bounced home).
// ============================================================================
import * as db from "../db.js";
import { getState, setViewRefresh } from "../store.js";
import { matchesQuery, isDueSoon, statusLabel, hasLocation, locationLine } from "../domain.js";
import { icon, esc, toast, go } from "../ui.js";
import { t } from "../i18n.js";
import { voiceSupported, listenOnce, stopListening } from "../voice.js";

export function allowedInWorkshop(profile) {
  if (!profile) return true;            // profile still loading — RLS protects data
  return db.isAdminRole(profile.role) || profile.role === "employee";
}

let allSets = [];

export async function render(main) {
  if (!allowedInWorkshop(getState().profile)) { toast(t("ws.denied"), "err"); go("/"); return; }

  const mic = voiceSupported();
  main.innerHTML = `
    <div class="ws">
      <div class="ws-head">
        <h1 class="ws-title">${icon("box", 26)} ${t("ws.title")}</h1>
        <a class="btn ws-exit" href="#/">${icon("back", 18)} ${t("ws.exit")}</a>
      </div>

      ${mic ? `
      <button id="wsMic" class="ws-mic">
        <span class="ws-mic-orb">${icon("phone", 30)}</span>
        <span class="ws-mic-txt">
          <b>${t("ws.voiceFind")}</b>
          <span id="wsMicSub">${t("ws.sayIt")}</span>
        </span>
      </button>` : ""}

      <div class="search-wrap dash-search ws-search">
        ${icon("search", 22)}
        <input id="wsSearch" type="search" placeholder="${esc(t("dash.search"))}" autocomplete="off" aria-label="${esc(t("dash.search"))}">
      </div>
      <div id="wsResults" class="ws-results"></div>

      <div class="ws-grid">
        <a class="ws-btn is-accent" href="#/scan">${icon("scan", 34)}<span>${t("nav.scan")}</span></a>
        <a class="ws-btn" href="#/checkin">${icon("plus", 34)}<span>${t("nav.checkin")}</span></a>
        <a class="ws-btn" href="#/warehouse">${icon("map", 34)}<span>${t("nav.warehouse")}</span></a>
        <a class="ws-btn" href="#/assistant">${icon("phone", 34)}<span>${t("ag.title")}</span></a>
        <a class="ws-btn is-dark" href="#/reminders">${icon("clock", 34)}<span>${t("ws.due")}</span><b id="wsDue" class="ws-btn-num tnum"></b></a>
      </div>
    </div>`;

  const results = main.querySelector("#wsResults");
  const input = main.querySelector("#wsSearch");
  const paint = (q) => {
    const query = (q || "").trim();
    if (!query) { results.innerHTML = ""; return; }
    const rows = allSets.filter((s) => matchesQuery(s, query)).slice(0, 8);
    results.innerHTML = rows.length
      ? rows.map(bigRow).join("")
      : `<div class="ws-none">${icon("search", 20)} ${t("ws.noResults", { q: esc(query) })}</div>`;
  };
  input.addEventListener("input", () => paint(input.value));

  if (mic) {
    const btn = main.querySelector("#wsMic");
    const sub = main.querySelector("#wsMicSub");
    btn.onclick = async () => {
      if (btn.classList.contains("is-listening")) { stopListening(); return; }
      btn.classList.add("is-listening");
      sub.textContent = t("voice.listening");
      try {
        const heard = await listenOnce({ onInterim: (s) => { if (s) sub.textContent = s; } });
        if (heard) { input.value = heard; paint(heard); sub.textContent = heard; }
        else sub.textContent = t("ws.sayIt");
      } catch (err) {
        sub.textContent = err.message;
      } finally {
        btn.classList.remove("is-listening");
      }
    };
  }

  setViewRefresh(() => load(main));
  await load(main);
  // A voice/typed query entered before data arrived paints now.
  paint(input.value);
}

async function load(main) {
  try {
    allSets = await db.listStorageSets();
    const due = allSets.filter(isDueSoon).length;
    const el = main.querySelector("#wsDue");
    if (el) el.textContent = due || "";
  } catch (err) {
    main.querySelector("#wsResults").innerHTML = `<div class="banner banner-danger">${icon("alert", 18)}${esc(err.message)}</div>`;
  }
}

// One oversized result row: code + owner readable at arm's length, location
// as the big right-hand block (that's what the workshop actually needs).
function bigRow(set) {
  const vehicle = set.vehicle || {};
  const customer = vehicle.customer || {};
  return `
    <a class="ws-row" href="#/set/${esc(set.public_code)}">
      <span class="ws-row-body">
        <b class="tnum">${esc(set.public_code)}</b>
        <span>${esc(customer.name || "—")}${vehicle.plate ? ` · ${esc(vehicle.plate)}` : ""}</span>
        <small>${esc(statusLabel(set.status))}</small>
      </span>
      <span class="ws-row-loc tnum">${hasLocation(set) ? esc(locationLine(set)) : "—"}</span>
    </a>`;
}
