// ============================================================================
// views/customers.js — "Manage customer history." List (searchable) + detail
// with every vehicle and stored set. Handles #/customers and #/customer/:id.
// ============================================================================
import * as db from "../db.js";
import { setViewRefresh } from "../store.js";
import { icon, esc, statusChip, seasonChip, skeletonRows, emptyState } from "../ui.js";

let all = [];
let query = "";

export async function render(main, { params }) {
  if (params && params[0]) return renderDetail(main, params[0]);
  main.innerHTML = `
    <div class="row-between" style="margin-bottom:14px"><h1>Customers</h1></div>
    <div class="search-wrap" style="margin-bottom:16px">${icon("search", 20)}
      <input id="search" type="search" placeholder="Search name or phone…" value="${esc(query)}" autocomplete="off"></div>
    <div id="clist">${skeletonRows(5)}</div>`;
  main.querySelector("#search").addEventListener("input", (e) => { query = e.target.value; paint(main); });
  setViewRefresh(() => load(main));
  await load(main);
}

async function load(main) {
  try { all = await db.listCustomers(); paint(main); }
  catch (err) { main.querySelector("#clist").innerHTML = `<div class="banner banner-danger">${icon("alert", 18)}${esc(err.message)}</div>`; }
}

function activeSets(customer) {
  return (customer.vehicles || []).flatMap((v) => (v.storage_sets || []).filter((s) => !s.deleted_at));
}

function paint(main) {
  const q = query.toLowerCase().trim();
  const rows = all.filter((c) => !q || `${c.name} ${c.phone || ""}`.toLowerCase().includes(q));
  const box = main.querySelector("#clist");
  if (!all.length) { box.innerHTML = emptyState({ iconName: "people", title: "No customers yet", body: "They're created automatically when you store a set." }); return; }
  if (!rows.length) { box.innerHTML = emptyState({ iconName: "search", title: "No matches" }); return; }
  box.innerHTML = `<div class="set-list">${rows.map((c) => {
    const count = activeSets(c).length;
    return `<a class="set-row" href="#/customer/${esc(c.id)}">
      <div class="body"><div class="who">${esc(c.name)}</div>
        <div class="spec">${esc(c.phone || "No phone")}${c.email ? " · " + esc(c.email) : ""}</div></div>
      <div class="loc"><div class="loc-mini"><b class="tnum">${count}</b><span>set${count === 1 ? "" : "s"}</span></div></div>
    </a>`;
  }).join("")}</div>`;
}

async function renderDetail(main, id) {
  main.innerHTML = `<div class="card">${skeletonRows(2)}</div>`;
  let customer;
  try { customer = (await db.listCustomers()).find((c) => c.id === id); }
  catch (err) { main.innerHTML = `<div class="card"><p class="inline-err">${esc(err.message)}</p></div>`; return; }
  if (!customer) { main.innerHTML = `<div class="card"><h2>Customer not found</h2><a class="btn" href="#/customers">Back</a></div>`; return; }
  setViewRefresh(() => renderDetail(main, id));

  const sets = (customer.vehicles || []).flatMap((v) => (v.storage_sets || []).map((s) => ({ ...s, plate: v.plate, vehicleLabel: [v.year, v.make, v.model].filter(Boolean).join(" ") })))
    .filter((s) => !s.deleted_at);

  main.innerHTML = `
    <a class="btn btn-ghost" href="#/customers" style="margin-bottom:10px;min-height:38px">${icon("back", 18)} Customers</a>
    <div class="card">
      <h1>${esc(customer.name)}</h1>
      <div class="kv" style="margin-top:12px">
        <div><span class="k">Phone</span><span class="v">${customer.phone ? `<a href="tel:${esc(customer.phone)}">${esc(customer.phone)}</a>` : "—"}</span></div>
        <div><span class="k">Email</span><span class="v">${esc(customer.email || "—")}</span></div>
        <div><span class="k">Vehicles</span><span class="v">${(customer.vehicles || []).length}</span></div>
        <div><span class="k">Stored sets</span><span class="v">${sets.length}</span></div>
      </div>
    </div>
    <div class="section-title"><h2>Tire sets</h2></div>
    ${sets.length ? `<div class="set-list">${sets.map((s) => `
      <a class="set-row" href="#/set/${esc(s.public_code)}">
        <div class="body"><div class="toprow"><span class="code tnum">${esc(s.public_code)}</span>${statusChip(s.status)}${seasonChip(s.season)}</div>
          <div class="spec">${esc([s.vehicleLabel, s.plate].filter(Boolean).join(" · ") || "—")}</div></div>
      </a>`).join("")}</div>`
      : `<div class="card"><p class="muted">No active sets.</p></div>`}`;
}
