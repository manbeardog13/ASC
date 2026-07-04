// ============================================================================
// ASC Tire Hotel — app shell, router, and views.
// ============================================================================
import { isConfigured } from "./supabaseClient.js";
import * as db from "./db.js";
import * as scanner from "./scanner.js";
import { printLabel } from "./qrlabel.js";

const app = document.getElementById("app");
const navEl = document.getElementById("nav");

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );

const SEASON_LABEL = { winter: "Winter", summer: "Summer", all_season: "All-season" };
const POSITIONS = ["FL", "FR", "RL", "RR", "spare"];

function locString(s) {
  return [s.zone, s.rack, s.shelf, s.slot].filter(Boolean).join("-") || "—";
}
function setTitle(s) {
  const c = s.vehicle?.customer?.name || "No name";
  const t0 = (s.tires || [])[0] || {};
  const spec = [t0.size, t0.brand].filter(Boolean).join(" ");
  return `${c}${spec ? " · " + spec : ""}`;
}
function toast(msg, kind = "ok") {
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, 2600);
}
function go(hash) {
  location.hash = hash;
}
function fieldVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
// Sort by warehouse location (Zone-Rack-Shelf-Slot), numbers ordered naturally.
function byLocation(a, b) {
  return locString(a).localeCompare(locString(b), undefined, { numeric: true, sensitivity: "base" });
}

// ---- CSV export ------------------------------------------------------------
function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function buildInventoryCsv(sets) {
  const header = [
    "Set Code", "Status", "Season", "On Rims", "Rim Type", "Location", "Check-in",
    "Expected Out", "Fee", "Paid", "Customer", "Phone", "Email", "Vehicle", "Plate",
    "Position", "Size", "Brand", "Model", "Tread (mm)", "DOT", "Studded", "Set Notes",
  ];
  const lines = [header.map(csvEscape).join(",")];
  for (const s of sets) {
    const v = s.vehicle || {};
    const c = v.customer || {};
    const base = [
      s.public_code, s.status, s.season, s.on_rims ? "yes" : "no", s.rim_type || "",
      locString(s) === "—" ? "" : locString(s), s.check_in_date || "", s.expected_out_date || "",
      s.fee == null ? "" : s.fee, s.paid ? "yes" : "no", c.name || "", c.phone || "", c.email || "",
      [v.year, v.make, v.model].filter(Boolean).join(" "), v.plate || "",
    ];
    const tires = s.tires || [];
    if (!tires.length) {
      lines.push([...base, "", "", "", "", "", "", "", s.notes || ""].map(csvEscape).join(","));
    } else {
      for (const t of tires) {
        lines.push(
          [...base, t.position || "", t.size || "", t.brand || "", t.model || "",
           t.tread_mm == null ? "" : t.tread_mm, t.dot_code || "", t.studded ? "yes" : "no",
           s.notes || ""].map(csvEscape).join(",")
        );
      }
    }
  }
  return lines.join("\r\n");
}
function downloadFile(filename, text, mime = "text/csv;charset=utf-8;") {
  const blob = new Blob(["﻿" + text], { type: mime }); // BOM so Excel reads UTF-8
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Realtime: one shared subscription refreshes whatever screen is open, live,
// on every device. Views set `currentRefresh` to opt in to live updates.
// ---------------------------------------------------------------------------
let realtimeChannel = null;
let currentRefresh = null;
let refreshTimer = null;

function ensureRealtime() {
  if (realtimeChannel) return;
  realtimeChannel = db.subscribeToChanges(() => {
    // A single check-in writes to several tables; debounce so we refresh once.
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => currentRefresh && currentRefresh(), 250);
  });
  markLive(true);
}
function teardownRealtime() {
  if (realtimeChannel) {
    db.unsubscribe(realtimeChannel);
    realtimeChannel = null;
  }
  markLive(false);
}
function markLive(on) {
  const dot = document.getElementById("livedot");
  if (dot) dot.classList.toggle("on", on);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const routes = [];
function route(pattern, handler) {
  routes.push({ pattern, handler });
}

async function render() {
  const hash = location.hash.replace(/^#/, "") || "/";
  currentRefresh = null; // each view re-opts-in to live refresh below

  // Setup gate: nothing works until config.js is filled in.
  if (!isConfigured()) return viewSetup();

  // Auth gate.
  const session = await db.getSession();
  if (!session) {
    teardownRealtime();
    navEl.hidden = true;
    return viewLogin();
  }
  ensureRealtime();
  navEl.hidden = false;
  renderNav(hash);

  for (const r of routes) {
    const m = hash.match(r.pattern);
    if (m) return r.handler(...m.slice(1));
  }
  app.innerHTML = `<div class="card">Page not found. <a href="#/">Go to dashboard</a></div>`;
}

// ---------------------------------------------------------------------------
// Navigation bar
// ---------------------------------------------------------------------------
function renderNav(hash) {
  const item = (href, label, icon) =>
    `<a href="${href}" class="${hash.startsWith(href.slice(1)) && href !== "#/" || hash === "/" && href === "#/" ? "active" : ""}">
       <span class="ico">${icon}</span>${label}</a>`;
  navEl.innerHTML = `
    <div class="brand">🛞 ASC <span>Tire Hotel</span></div>
    <div class="navlinks">
      ${item("#/", "Storage", "▦")}
      ${item("#/checkin", "Check-in", "＋")}
      ${item("#/scan", "Scan", "▣")}
    </div>
    <span id="livedot" class="live ${realtimeChannel ? "on" : ""}" title="Live sync across all devices">● Live</span>
    <button id="signout" class="linkbtn">Sign out</button>`;
  $("#signout").onclick = async () => {
    await db.signOut();
    go("/");
  };
}

// ---------------------------------------------------------------------------
// View: not configured
// ---------------------------------------------------------------------------
function viewSetup() {
  navEl.hidden = true;
  app.innerHTML = `
    <div class="card center">
      <h1>🛞 ASC Tire Hotel</h1>
      <p class="muted">Almost there — the app isn't connected to your database yet.</p>
      <ol class="steps">
        <li>Create a free project at <b>supabase.com</b>.</li>
        <li>In Supabase → SQL Editor, run <code>supabase/schema.sql</code>.</li>
        <li>Open <code>js/config.js</code> and paste your <b>Project URL</b>,
            <b>anon key</b>, and this app's web address.</li>
        <li>Save, commit, reload.</li>
      </ol>
      <p class="muted">Full walk-through is in <b>SETUP.md</b>.</p>
    </div>`;
}

// ---------------------------------------------------------------------------
// View: login
// ---------------------------------------------------------------------------
function viewLogin() {
  app.innerHTML = `
    <div class="card center narrow">
      <h1>🛞 ASC Tire Hotel</h1>
      <p class="muted">Sign in to your shop account.</p>
      <form id="loginForm" class="form">
        <label>Email<input id="email" type="email" autocomplete="username" required></label>
        <label>Password<input id="password" type="password" autocomplete="current-password" required></label>
        <button class="primary" type="submit">Sign in</button>
        <p id="loginErr" class="error" hidden></p>
      </form>
    </div>`;
  $("#loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("#loginForm button");
    btn.disabled = true;
    try {
      await db.signIn(fieldVal("email"), fieldVal("password"));
      go("/");
    } catch (err) {
      const p = $("#loginErr");
      p.hidden = false;
      p.textContent = err.message || "Sign in failed.";
    } finally {
      btn.disabled = false;
    }
  };
}

// ---------------------------------------------------------------------------
// View: dashboard / storage list
// ---------------------------------------------------------------------------
let dashState = { q: "", status: "all", season: "all", rows: [] };

async function viewDashboard() {
  app.innerHTML = `
    <div class="pagehead">
      <h2>Storage</h2>
      <div class="pagehead-actions">
        <a class="btn" href="#/worklist">🧾 Worklist</a>
        <button id="exportCsv" class="btn">⬇︎ Export CSV</button>
      </div>
    </div>
    <div class="toolbar">
      <input id="q" class="search" placeholder="Search name, plate, code, size, brand, location…" value="${esc(dashState.q)}">
      <select id="fStatus">
        <option value="all">All statuses</option>
        <option value="in_storage">In storage</option>
        <option value="checked_out">Checked out</option>
      </select>
      <select id="fSeason">
        <option value="all">All seasons</option>
        <option value="winter">Winter</option>
        <option value="summer">Summer</option>
        <option value="all_season">All-season</option>
      </select>
    </div>
    <div id="summary" class="summary"></div>
    <div id="list" class="list"><p class="muted">Loading…</p></div>`;

  $("#fStatus").value = dashState.status;
  $("#fSeason").value = dashState.season;
  $("#q").oninput = (e) => {
    dashState.q = e.target.value;
    paintList();
  };
  $("#fStatus").onchange = (e) => {
    dashState.status = e.target.value;
    loadDashboard();
  };
  $("#fSeason").onchange = (e) => {
    dashState.season = e.target.value;
    loadDashboard();
  };
  $("#exportCsv").onclick = async () => {
    const btn = $("#exportCsv");
    btn.disabled = true;
    try {
      const sets = await db.listAllDetailed();
      downloadFile(`asc-inventory-${todayStr()}.csv`, buildInventoryCsv(sets));
      toast(`Exported ${sets.length} set${sets.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast(e.message || "Export failed", "err");
    } finally {
      btn.disabled = false;
    }
  };
  currentRefresh = loadDashboard; // live-refresh the list on any device's change
  loadDashboard();
}

async function loadDashboard() {
  try {
    const [rows, c] = await Promise.all([
      db.listSets({ status: dashState.status, season: dashState.season }),
      db.counts(),
    ]);
    dashState.rows = rows;
    $("#summary").innerHTML = `
      <div class="stat"><b>${c.in_storage}</b><span>In storage</span></div>
      <div class="stat"><b>${c.checked_out}</b><span>Checked out</span></div>
      <div class="stat"><b>${c.in_storage + c.checked_out}</b><span>Total sets</span></div>`;
    paintList();
  } catch (err) {
    $("#list").innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
}

function matchesQuery(s, q) {
  if (!q) return true;
  const hay = [
    s.public_code,
    s.vehicle?.customer?.name,
    s.vehicle?.customer?.phone,
    s.vehicle?.plate,
    s.vehicle?.make,
    s.vehicle?.model,
    locString(s),
    ...(s.tires || []).flatMap((t) => [t.size, t.brand, t.model]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((term) => hay.includes(term));
}

function paintList() {
  const rows = dashState.rows.filter((s) => matchesQuery(s, dashState.q));
  if (!rows.length) {
    $("#list").innerHTML = `<p class="muted">No sets match. <a href="#/checkin">Check one in →</a></p>`;
    return;
  }
  $("#list").innerHTML = rows.map(rowCard).join("");
}

function rowCard(s) {
  const t0 = (s.tires || [])[0] || {};
  const spec = [t0.size, t0.brand].filter(Boolean).join(" · ");
  const badge =
    s.status === "in_storage"
      ? `<span class="badge in">In storage</span>`
      : `<span class="badge out">Checked out</span>`;
  return `
    <a class="rowcard" href="#/set/${esc(s.public_code)}">
      <div class="rc-main">
        <div class="rc-top">
          <span class="code">${esc(s.public_code)}</span>
          <span class="pill ${s.season}">${SEASON_LABEL[s.season] || s.season}</span>
          ${badge}
        </div>
        <div class="rc-name">${esc(s.vehicle?.customer?.name || "—")}
          ${s.vehicle?.plate ? `<span class="muted"> · ${esc(s.vehicle.plate)}</span>` : ""}</div>
        <div class="rc-spec muted">${esc(spec || "no tire specs")}</div>
      </div>
      <div class="rc-loc">
        <span class="loclabel">Loc</span>
        <span class="locval">${esc(locString(s))}</span>
      </div>
    </a>`;
}

// ---------------------------------------------------------------------------
// View: season-swap worklist (in-storage sets of a season, ordered by location)
// ---------------------------------------------------------------------------
let worklistSeason = "winter";
let worklistRows = [];

async function viewWorklist() {
  app.innerHTML = `
    <div class="card">
      <div class="pagehead">
        <h2>Season-swap worklist</h2>
        <div class="pagehead-actions">
          <select id="wlSeason">
            <option value="winter">Winter</option>
            <option value="summer">Summer</option>
            <option value="all_season">All-season</option>
          </select>
          <button id="wlPrint" class="btn">🖨️ Print</button>
          <a class="btn ghost" href="#/">Back</a>
        </div>
      </div>
      <p class="muted">Every set currently <b>in storage</b> for the chosen season, ordered by
        warehouse location so you can pull them rack by rack.</p>
      <div id="wl"><p class="muted">Loading…</p></div>
    </div>`;
  $("#wlSeason").value = worklistSeason;
  $("#wlSeason").onchange = (e) => {
    worklistSeason = e.target.value;
    loadWorklist();
  };
  $("#wlPrint").onclick = printWorklist;
  currentRefresh = loadWorklist; // live-refresh as sets check in/out
  loadWorklist();
}

async function loadWorklist() {
  try {
    const rows = await db.listSets({ status: "in_storage", season: worklistSeason });
    rows.sort(byLocation);
    worklistRows = rows;
    $("#wl").innerHTML = rows.length
      ? worklistTable(rows)
      : `<p class="muted">No ${SEASON_LABEL[worklistSeason]} sets in storage.</p>`;
  } catch (e) {
    $("#wl").innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
}

function worklistTable(rows) {
  return `<div class="wltable">
    <div class="wlh"><span>✓</span><span>Location</span><span>Code</span><span>Customer</span><span>Plate</span><span>Tires</span></div>
    ${rows
      .map((s) => {
        const t0 = (s.tires || [])[0] || {};
        const spec = [t0.size, t0.brand].filter(Boolean).join(" ");
        return `<div class="wlr">
          <span class="box">☐</span>
          <span class="loc">${esc(locString(s))}</span>
          <span><a href="#/set/${esc(s.public_code)}">${esc(s.public_code)}</a></span>
          <span>${esc(s.vehicle?.customer?.name || "—")}</span>
          <span>${esc(s.vehicle?.plate || "—")}</span>
          <span class="muted">${esc(spec || "—")}</span>
        </div>`;
      })
      .join("")}
  </div>`;
}

function printWorklist() {
  const rows = worklistRows;
  const season = SEASON_LABEL[worklistSeason] || worklistSeason;
  const body = rows
    .map((s) => {
      const t0 = (s.tires || [])[0] || {};
      const spec = [t0.size, t0.brand].filter(Boolean).join(" ");
      return `<tr>
        <td class="b">☐</td>
        <td class="loc">${esc(locString(s))}</td>
        <td>${esc(s.public_code)}</td>
        <td>${esc(s.vehicle?.customer?.name || "")}</td>
        <td>${esc(s.vehicle?.plate || "")}</td>
        <td>${esc(spec)}</td>
      </tr>`;
    })
    .join("");
  const win = window.open("", "_blank", "width=820,height=900");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8">
    <title>Worklist ${season} ${todayStr()}</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color:#111; }
      h1 { margin: 0 0 2px; font-size: 20px; }
      .sub { color:#555; margin: 0 0 16px; font-size: 13px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border-bottom: 1px solid #ccc; padding: 8px 10px; text-align: left; font-size: 13px; }
      th { background:#f2f2f2; text-transform: uppercase; font-size: 11px; letter-spacing:.4px; }
      .b { font-size: 18px; width: 28px; }
      .loc { font-weight: 800; }
      @media print { .noprint { display:none; } }
    </style></head><body>
    <h1>Season-swap worklist — ${season}</h1>
    <p class="sub">In storage · ${rows.length} set${rows.length === 1 ? "" : "s"} · ${todayStr()} · ASC Tire Hotel</p>
    <table>
      <thead><tr><th>✓</th><th>Location</th><th>Code</th><th>Customer</th><th>Plate</th><th>Tires</th></tr></thead>
      <tbody>${body || `<tr><td colspan="6">No sets.</td></tr>`}</tbody>
    </table>
    <p class="noprint" style="margin-top:16px"><button onclick="window.print()" style="padding:8px 16px">Print</button></p>
    <script>window.onload=()=>setTimeout(()=>window.print(),300);<\/script>
    </body></html>`);
  win.document.close();
}

// ---------------------------------------------------------------------------
// Shared: tire rows editor (used by check-in and edit)
// ---------------------------------------------------------------------------
function tireRowsHtml(quantity, existing = []) {
  const n = Math.max(1, Number(quantity) || 4);
  let out = "";
  for (let i = 0; i < n; i++) {
    const t = existing[i] || {};
    const pos = t.position || POSITIONS[i] || "";
    out += `
      <div class="tirerow">
        <select data-t="position">
          ${POSITIONS.map((p) => `<option value="${p}" ${p === pos ? "selected" : ""}>${p}</option>`).join("")}
        </select>
        <input data-t="size"  placeholder="225/45R17 91V" value="${esc(t.size)}">
        <input data-t="brand" placeholder="Brand"  value="${esc(t.brand)}">
        <input data-t="model" placeholder="Model"  value="${esc(t.model)}">
        <input data-t="tread_mm" type="number" step="0.1" min="0" placeholder="mm" value="${esc(t.tread_mm)}">
        <input data-t="dot_code" placeholder="DOT 2524" value="${esc(t.dot_code)}">
        <label class="chk"><input data-t="studded" type="checkbox" ${t.studded ? "checked" : ""}>Studded</label>
      </div>`;
  }
  return out;
}

function collectTires(container) {
  return [...container.querySelectorAll(".tirerow")].map((row) => {
    const get = (k) => row.querySelector(`[data-t="${k}"]`);
    return {
      position: get("position").value,
      size: get("size").value.trim(),
      brand: get("brand").value.trim(),
      model: get("model").value.trim(),
      tread_mm: get("tread_mm").value ? Number(get("tread_mm").value) : null,
      dot_code: get("dot_code").value.trim(),
      studded: get("studded").checked,
      condition_notes: "",
    };
  });
}

// ---------------------------------------------------------------------------
// View: check-in (create)
// ---------------------------------------------------------------------------
function viewCheckin() {
  app.innerHTML = `
    <div class="card">
      <h2>Check in a set</h2>
      <form id="ci" class="form">
        <fieldset><legend>Customer</legend>
          <div class="grid2">
            <label>Name<input id="c_name" required></label>
            <label>Phone<input id="c_phone"></label>
            <label>Email<input id="c_email" type="email"></label>
          </div>
        </fieldset>

        <fieldset><legend>Vehicle</legend>
          <div class="grid2">
            <label>Make<input id="v_make"></label>
            <label>Model<input id="v_model"></label>
            <label>Year<input id="v_year" type="number" min="1950" max="2100"></label>
            <label>License plate<input id="v_plate"></label>
          </div>
        </fieldset>

        <fieldset><legend>Set</legend>
          <div class="grid2">
            <label>Season
              <select id="s_season">
                <option value="winter">Winter</option>
                <option value="summer">Summer</option>
                <option value="all_season">All-season</option>
              </select></label>
            <label>Quantity<input id="s_qty" type="number" min="1" max="8" value="4"></label>
            <label class="chk inline"><input id="s_onrims" type="checkbox">On rims / wheels</label>
            <label>Rim type
              <select id="s_rimtype">
                <option value="">—</option>
                <option value="steel">Steel</option>
                <option value="alloy">Alloy</option>
              </select></label>
          </div>
          <div class="grid4">
            <label>Zone<input id="s_zone" placeholder="A"></label>
            <label>Rack<input id="s_rack" placeholder="03"></label>
            <label>Shelf<input id="s_shelf" placeholder="2"></label>
            <label>Slot<input id="s_slot" placeholder="12"></label>
          </div>
          <div class="grid2">
            <label>Check-in date<input id="s_in" type="date"></label>
            <label>Expected pickup<input id="s_out" type="date"></label>
            <label>Storage fee<input id="s_fee" type="number" step="0.01" min="0" placeholder="0.00"></label>
            <label class="chk inline"><input id="s_paid" type="checkbox">Paid</label>
          </div>
          <label>Notes<textarea id="s_notes" rows="2"></textarea></label>
        </fieldset>

        <fieldset><legend>Tires <span class="muted">(fill what you can — blank rows are ignored)</span></legend>
          <div id="tires">${tireRowsHtml(4)}</div>
        </fieldset>

        <div class="actions">
          <button class="primary" type="submit">Save &amp; make label</button>
          <a class="btn ghost" href="#/">Cancel</a>
          <p id="ciErr" class="error" hidden></p>
        </div>
      </form>
    </div>`;

  // Default today's date.
  $("#s_in").valueAsDate = new Date();

  // Re-render tire rows when quantity changes.
  $("#s_qty").onchange = () => {
    $("#tires").innerHTML = tireRowsHtml($("#s_qty").value, collectTires($("#tires")));
  };

  $("#ci").onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("#ci button.primary");
    btn.disabled = true;
    try {
      const form = {
        customer: { name: fieldVal("c_name"), phone: fieldVal("c_phone"), email: fieldVal("c_email") },
        vehicle: {
          make: fieldVal("v_make"),
          model: fieldVal("v_model"),
          year: fieldVal("v_year") ? Number(fieldVal("v_year")) : null,
          plate: fieldVal("v_plate"),
        },
        set: {
          season: $("#s_season").value,
          quantity: Number(fieldVal("s_qty")) || 4,
          on_rims: $("#s_onrims").checked,
          rim_type: $("#s_rimtype").value,
          zone: fieldVal("s_zone"),
          rack: fieldVal("s_rack"),
          shelf: fieldVal("s_shelf"),
          slot: fieldVal("s_slot"),
          check_in_date: fieldVal("s_in") || null,
          expected_out_date: fieldVal("s_out") || null,
          fee: fieldVal("s_fee") ? Number(fieldVal("s_fee")) : null,
          paid: $("#s_paid").checked,
          notes: fieldVal("s_notes"),
        },
        tires: collectTires($("#tires")),
      };
      const code = await db.createCheckIn(form);
      toast(`Checked in ${code}`);
      go(`/set/${code}`);
    } catch (err) {
      const p = $("#ciErr");
      p.hidden = false;
      p.textContent = err.message || "Could not save.";
      btn.disabled = false;
    }
  };
}

// ---------------------------------------------------------------------------
// View: set detail
// ---------------------------------------------------------------------------
async function viewSet(code, silent = false) {
  if (!silent) app.innerHTML = `<div class="card"><p class="muted">Loading ${esc(code)}…</p></div>`;
  let s;
  try {
    s = await db.getSetByCode(code);
  } catch (err) {
    app.innerHTML = `<div class="card"><p class="error">Couldn't find <b>${esc(code)}</b>.</p>
      <a class="btn ghost" href="#/">Back</a></div>`;
    return;
  }
  // Live-refresh this detail screen when any device changes its data.
  currentRefresh = () => {
    if (location.hash.startsWith(`#/set/${code}`)) viewSet(code, true);
  };
  const c = s.vehicle?.customer || {};
  const v = s.vehicle || {};
  const inStore = s.status === "in_storage";

  app.innerHTML = `
    <div class="card">
      <div class="detailhead">
        <div>
          <div class="code big">${esc(s.public_code)}</div>
          <div class="pill ${s.season}">${SEASON_LABEL[s.season] || s.season}</div>
          ${inStore ? `<span class="badge in">In storage</span>` : `<span class="badge out">Checked out</span>`}
        </div>
        <div class="locbox">
          <span class="loclabel">Location</span>
          <span class="locbig">${esc(locString(s))}</span>
        </div>
      </div>

      <div class="kv">
        <div><span>Customer</span><b>${esc(c.name || "—")}</b></div>
        <div><span>Phone</span><b>${esc(c.phone || "—")}</b></div>
        <div><span>Email</span><b>${esc(c.email || "—")}</b></div>
        <div><span>Vehicle</span><b>${esc([v.year, v.make, v.model].filter(Boolean).join(" ") || "—")}</b></div>
        <div><span>Plate</span><b>${esc(v.plate || "—")}</b></div>
        <div><span>On rims</span><b>${s.on_rims ? "Yes" + (s.rim_type ? " (" + s.rim_type + ")" : "") : "No"}</b></div>
        <div><span>Quantity</span><b>${s.quantity}</b></div>
        <div><span>Checked in</span><b>${esc(s.check_in_date || "—")}</b></div>
        <div><span>Expected out</span><b>${esc(s.expected_out_date || "—")}</b></div>
        <div><span>Fee</span><b>${s.fee != null ? esc(s.fee) : "—"} ${s.fee != null ? (s.paid ? "· paid" : "· unpaid") : ""}</b></div>
      </div>
      ${s.notes ? `<p class="notes">📝 ${esc(s.notes)}</p>` : ""}

      <h3>Tires</h3>
      <div class="tiretable">
        <div class="th"><span>Pos</span><span>Size</span><span>Brand / model</span><span>Tread</span><span>DOT</span><span></span></div>
        ${
          (s.tires || []).length
            ? s.tires
                .map(
                  (t) => `<div class="tr">
                    <span>${esc(t.position || "—")}</span>
                    <span>${esc(t.size || "—")}</span>
                    <span>${esc([t.brand, t.model].filter(Boolean).join(" ") || "—")}</span>
                    <span class="${t.tread_mm != null && t.tread_mm <= 3 ? "warn" : ""}">${t.tread_mm != null ? esc(t.tread_mm) + " mm" : "—"}</span>
                    <span>${esc(t.dot_code || "—")}</span>
                    <span>${t.studded ? "🔩" : ""}</span>
                  </div>`
                )
                .join("")
            : `<div class="tr"><span class="muted" style="grid-column:1/-1">No tire specs recorded.</span></div>`
        }
      </div>

      <h3>Condition photos</h3>
      <div id="photos" class="photos"></div>
      <div class="scanalt">
        <label class="btn" for="addphoto">📷 Add photo</label>
        <input id="addphoto" type="file" accept="image/*" capture="environment" hidden>
      </div>

      <div class="actions wrap">
        <button id="print" class="primary">🏷️ Print label</button>
        <a class="btn" href="#/set/${esc(s.public_code)}/edit">Edit</a>
        <button id="toggle" class="btn">${inStore ? "Mark checked out" : "Bring back in storage"}</button>
        <button id="del" class="btn danger">Delete</button>
        <a class="btn ghost" href="#/">Back</a>
      </div>
    </div>`;

  $("#print").onclick = () => printLabel(s);
  $("#toggle").onclick = async () => {
    await db.setStatus(s.id, inStore ? "checked_out" : "in_storage");
    toast(inStore ? "Marked checked out" : "Back in storage");
    viewSet(code);
  };
  $("#del").onclick = async () => {
    if (!confirm(`Delete ${s.public_code}? This cannot be undone.`)) return;
    await db.deleteSet(s.id);
    toast("Deleted");
    go("/");
  };

  renderPhotos(s);
  $("#addphoto").onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const label = document.querySelector('label[for="addphoto"]');
    if (label) label.textContent = "⏳ Uploading…";
    try {
      await db.addPhoto(s.id, file);
      toast("Photo added");
      viewSet(code, true); // realtime will also refresh other devices
    } catch (err) {
      toast(err.message || "Upload failed", "err");
      if (label) label.textContent = "📷 Add photo";
    }
  };
}

// Load + render the condition photos (signed URLs from private Storage bucket).
async function renderPhotos(s) {
  const box = document.getElementById("photos");
  if (!box) return;
  const photos = (s.photos || []).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  if (!photos.length) {
    box.innerHTML = `<p class="muted tiny">No photos yet — add one as proof of condition at check-in.</p>`;
    return;
  }
  box.innerHTML = `<p class="muted tiny">Loading photos…</p>`;
  let urls = {};
  try {
    urls = await db.signedUrls(photos.map((p) => p.path));
  } catch (_) {
    /* show broken thumbs rather than nothing */
  }
  box.innerHTML = photos
    .map(
      (p) => `<figure class="photo">
        <a href="${urls[p.path] || "#"}" target="_blank" rel="noopener">
          <img src="${urls[p.path] || ""}" alt="condition photo" loading="lazy">
        </a>
        <button class="delphoto" data-id="${esc(p.id)}" data-path="${esc(p.path)}" title="Delete photo">✕</button>
      </figure>`
    )
    .join("");
  box.querySelectorAll(".delphoto").forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm("Delete this photo?")) return;
      try {
        await db.deletePhoto({ id: btn.dataset.id, path: btn.dataset.path });
        toast("Photo deleted");
        if (s.public_code) viewSet(s.public_code, true);
      } catch (err) {
        toast(err.message || "Delete failed", "err");
      }
    };
  });
}

// ---------------------------------------------------------------------------
// View: edit set
// ---------------------------------------------------------------------------
async function viewEdit(code) {
  app.innerHTML = `<div class="card"><p class="muted">Loading…</p></div>`;
  const s = await db.getSetByCode(code);
  const c = s.vehicle?.customer || {};
  const v = s.vehicle || {};

  app.innerHTML = `
    <div class="card">
      <h2>Edit ${esc(s.public_code)}</h2>
      <form id="ed" class="form">
        <fieldset><legend>Customer</legend>
          <div class="grid2">
            <label>Name<input id="c_name" value="${esc(c.name)}" required></label>
            <label>Phone<input id="c_phone" value="${esc(c.phone)}"></label>
            <label>Email<input id="c_email" type="email" value="${esc(c.email)}"></label>
          </div>
        </fieldset>
        <fieldset><legend>Vehicle</legend>
          <div class="grid2">
            <label>Make<input id="v_make" value="${esc(v.make)}"></label>
            <label>Model<input id="v_model" value="${esc(v.model)}"></label>
            <label>Year<input id="v_year" type="number" value="${esc(v.year)}"></label>
            <label>License plate<input id="v_plate" value="${esc(v.plate)}"></label>
          </div>
        </fieldset>
        <fieldset><legend>Set</legend>
          <div class="grid2">
            <label>Season
              <select id="s_season">
                ${["winter", "summer", "all_season"]
                  .map((x) => `<option value="${x}" ${s.season === x ? "selected" : ""}>${SEASON_LABEL[x]}</option>`)
                  .join("")}
              </select></label>
            <label>Quantity<input id="s_qty" type="number" min="1" max="8" value="${s.quantity}"></label>
            <label class="chk inline"><input id="s_onrims" type="checkbox" ${s.on_rims ? "checked" : ""}>On rims / wheels</label>
            <label>Rim type
              <select id="s_rimtype">
                ${["", "steel", "alloy"]
                  .map((x) => `<option value="${x}" ${s.rim_type === x ? "selected" : ""}>${x || "—"}</option>`)
                  .join("")}
              </select></label>
          </div>
          <div class="grid4">
            <label>Zone<input id="s_zone" value="${esc(s.zone)}"></label>
            <label>Rack<input id="s_rack" value="${esc(s.rack)}"></label>
            <label>Shelf<input id="s_shelf" value="${esc(s.shelf)}"></label>
            <label>Slot<input id="s_slot" value="${esc(s.slot)}"></label>
          </div>
          <div class="grid2">
            <label>Check-in date<input id="s_in" type="date" value="${esc(s.check_in_date)}"></label>
            <label>Expected pickup<input id="s_out" type="date" value="${esc(s.expected_out_date)}"></label>
            <label>Storage fee<input id="s_fee" type="number" step="0.01" value="${esc(s.fee)}"></label>
            <label class="chk inline"><input id="s_paid" type="checkbox" ${s.paid ? "checked" : ""}>Paid</label>
          </div>
          <label>Notes<textarea id="s_notes" rows="2">${esc(s.notes)}</textarea></label>
        </fieldset>
        <fieldset><legend>Tires</legend>
          <div id="tires">${tireRowsHtml(s.quantity, s.tires)}</div>
        </fieldset>
        <div class="actions">
          <button class="primary" type="submit">Save changes</button>
          <a class="btn ghost" href="#/set/${esc(s.public_code)}">Cancel</a>
          <p id="edErr" class="error" hidden></p>
        </div>
      </form>
    </div>`;

  $("#s_qty").onchange = () => {
    $("#tires").innerHTML = tireRowsHtml($("#s_qty").value, collectTires($("#tires")));
  };

  $("#ed").onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("#ed button.primary");
    btn.disabled = true;
    try {
      await db.updateCustomer(c.id, {
        name: fieldVal("c_name"),
        phone: fieldVal("c_phone") || null,
        email: fieldVal("c_email") || null,
      });
      if (v.id)
        await db.updateVehicle(v.id, {
          make: fieldVal("v_make") || null,
          model: fieldVal("v_model") || null,
          year: fieldVal("v_year") ? Number(fieldVal("v_year")) : null,
          plate: fieldVal("v_plate") || null,
        });
      await db.updateSet(s.id, {
        season: $("#s_season").value,
        quantity: Number(fieldVal("s_qty")) || 4,
        on_rims: $("#s_onrims").checked,
        rim_type: $("#s_onrims").checked ? $("#s_rimtype").value || null : null,
        zone: fieldVal("s_zone") || null,
        rack: fieldVal("s_rack") || null,
        shelf: fieldVal("s_shelf") || null,
        slot: fieldVal("s_slot") || null,
        check_in_date: fieldVal("s_in") || null,
        expected_out_date: fieldVal("s_out") || null,
        fee: fieldVal("s_fee") ? Number(fieldVal("s_fee")) : null,
        paid: $("#s_paid").checked,
        notes: fieldVal("s_notes") || null,
      });
      await db.replaceTires(s.id, collectTires($("#tires")));
      toast("Saved");
      go(`/set/${s.public_code}`);
    } catch (err) {
      const p = $("#edErr");
      p.hidden = false;
      p.textContent = err.message || "Could not save.";
      btn.disabled = false;
    }
  };
}

// ---------------------------------------------------------------------------
// View: scan
// ---------------------------------------------------------------------------
function viewScan() {
  app.innerHTML = `
    <div class="card center">
      <h2>Scan a tire label</h2>
      <p class="muted">Point the camera at a set's QR sticker.</p>
      <div id="reader" class="reader"></div>
      <p id="scanErr" class="error" hidden></p>

      <div class="scanalt">
        <label class="btn" for="photo">📷 Take a photo instead</label>
        <input id="photo" type="file" accept="image/*" capture="environment" hidden>
      </div>

      <div class="actions">
        <input id="manual" placeholder="…or type a code e.g. ASC-2026-0042" class="search">
        <button id="goManual" class="btn">Open</button>
        <a class="btn ghost" href="#/">Cancel</a>
      </div>
      <p class="muted tiny">Tip: a phone's built-in Camera app can scan the sticker too — it
        opens the record automatically, no need to be in this app.</p>
    </div>`;

  const showErr = (msg) => {
    const p = $("#scanErr");
    p.hidden = false;
    p.textContent = msg;
  };

  // Primary: live camera (Android + iOS Safari).
  scanner.start(
    "reader",
    (code) => {
      if (code) go(`/set/${code}`);
    },
    (err) =>
      showErr(
        "Live camera unavailable: " + (err.message || err) + ". Use “Take a photo” or type the code."
      )
  );

  // Universal fallback: native camera photo → decode the image.
  $("#photo").onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const code = await scanner.scanFile(file);
      if (code) go(`/set/${code}`);
      else showErr("No QR code found in that photo — try again, closer and well-lit.");
    } catch (err) {
      showErr("Couldn't read that photo: " + (err.message || err));
    }
  };

  $("#goManual").onclick = () => {
    const code = scanner.extractCode($("#manual").value);
    if (code) go(`/set/${code}`);
  };
}

// Stop the camera whenever we navigate away from the scan view.
window.addEventListener("hashchange", () => {
  if (!location.hash.startsWith("#/scan")) scanner.stop();
});

// ---------------------------------------------------------------------------
// Routes + boot
// ---------------------------------------------------------------------------
route(/^\/$/, viewDashboard);
route(/^\/checkin$/, viewCheckin);
route(/^\/worklist$/, viewWorklist);
route(/^\/scan$/, viewScan);
route(/^\/set\/([^/]+)\/edit$/, viewEdit);
route(/^\/set\/([^/]+)$/, viewSet);

window.addEventListener("hashchange", render);
if (isConfigured()) {
  db.onAuthChange(() => render());
}
render();
