// ============================================================================
// views/customers.js — "Manage customer history." List (searchable) + detail
// with every vehicle and stored set. Handles #/customers and #/customer/:id.
// ============================================================================
import * as db from "../db.js";
import { setViewRefresh } from "../store.js";
import { icon, esc, statusChip, seasonChip, skeletonRows, emptyState } from "../ui.js";
import { t, noun } from "../i18n.js";

let all = [];
let query = "";

export async function render(main, { params }) {
  if (params && params[0]) return renderDetail(main, params[0]);
  main.innerHTML = `
    <header class="view-stage"><div><span class="vs-k">${t("view.ctx")}</span><h1>${t("cust.title")}</h1></div><span id="custCount" class="u-meta"></span></header>
    <div class="search-wrap dash-search">${icon("search", 20)}
      <input id="search" type="search" placeholder="${esc(t("cust.search"))}" value="${esc(query)}" autocomplete="off" aria-label="${esc(t("cust.search"))}"></div>
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
  const count = main.querySelector("#custCount");
  count.textContent = q ? t("dash.shownOf", { shown: rows.length, total: all.length }) : String(all.length);
  const box = main.querySelector("#clist");
  if (!all.length) { box.innerHTML = emptyState({ iconName: "people", title: t("cust.emptyTitle"), body: t("cust.emptyBody") }); return; }
  if (!rows.length) { box.innerHTML = emptyState({ iconName: "search", title: t("dash.noMatchTitle") }); return; }
  box.innerHTML = `<div class="set-list">${rows.map((c) => {
    const count2 = activeSets(c).length;
    return `<a class="set-row" href="#/customer/${esc(c.id)}">
      <div class="body"><div class="who">${esc(c.name)}</div>
        <div class="spec">${esc(c.phone || t("cust.noPhone"))}${c.email ? " · " + esc(c.email) : ""}</div></div>
      <div class="loc"><div class="loc-mini"><b class="tnum">${count2}</b><span>${noun(count2, "sets")}</span></div></div>
    </a>`;
  }).join("")}</div>`;
}

async function renderDetail(main, id) {
  main.innerHTML = `<div class="card">${skeletonRows(2)}</div>`;
  let customer;
  try { customer = (await db.listCustomers()).find((c) => c.id === id); }
  catch (err) { main.innerHTML = `<div class="card"><p class="inline-err">${esc(err.message)}</p></div>`; return; }
  if (!customer) { main.innerHTML = `<div class="card"><h2>${t("cust.notFound")}</h2><a class="btn" href="#/customers">${t("common.back")}</a></div>`; return; }
  setViewRefresh(() => renderDetail(main, id));

  const sets = (customer.vehicles || [])
    .flatMap((v) => (v.storage_sets || []).map((s) => ({ ...s, plate: v.plate, vehicleLabel: [v.year, v.make, v.model].filter(Boolean).join(" ") })))
    .filter((s) => !s.deleted_at);

  // Hero: name + the bordered contact-row stack (the reference's meta rows).
  const contactRow = (ic, label, value, href) => {
    const inner = `${icon(ic, 17)} <span>${esc(label)}</span><span class="u-row-end">${value}</span>`;
    return href ? `<a class="u-row" href="${href}">${inner}</a>` : `<div class="u-row">${inner}</div>`;
  };
  main.innerHTML = `
    <a class="btn btn-ghost" href="#/customers" style="margin-bottom:10px;min-height:38px">${icon("back", 18)} ${t("cust.title")}</a>
    <div class="card cust-hero">
      <div class="who">${esc(customer.name)}</div>
      <div class="u-rows">
        ${contactRow("phone", t("ci.phone"), customer.phone ? esc(customer.phone) : "—", customer.phone ? `tel:${esc(customer.phone)}` : null)}
        ${contactRow("list", t("ci.email"), customer.email ? esc(customer.email) : "—", customer.email ? `mailto:${esc(customer.email)}` : null)}
      </div>
    </div>
    <div class="u-stats u-rise" style="margin:14px 0">
      <div class="u-stat"><span class="u-stat-l">${t("cust.vehicles")}</span><span class="u-stat-v tnum">${icon("car", 15)}${(customer.vehicles || []).length}</span></div>
      <div class="u-stat"><span class="u-stat-l">${t("cust.storedSets")}</span><span class="u-stat-v tnum">${icon("box", 15)}${sets.length}</span></div>
    </div>
    <section class="card u-module">
      <div class="u-module-head"><h3 class="u-module-title">${t("cust.tireSets")}</h3>${sets.length ? `<span class="u-count-chip">${sets.length}</span>` : ""}</div>
      ${sets.length ? `<div class="set-list">${sets.map((s) => `
        <a class="set-row" href="#/set/${esc(s.public_code)}">
          <div class="body"><div class="toprow"><span class="code tnum">${esc(s.public_code)}</span>${statusChip(s.status)}${seasonChip(s.season)}</div>
            <div class="spec">${esc([s.vehicleLabel, s.plate].filter(Boolean).join(" · ") || "—")}</div></div>
        </a>`).join("")}</div>`
        : `<p class="muted" style="font-size:14px">${t("cust.noActive")}</p>`}
    </section>`;
}
