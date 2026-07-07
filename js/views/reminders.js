// ============================================================================
// views/reminders.js — "Remind customers whose tires are due for pickup."
// Zero external service: one tap opens the phone's own dialer / SMS / email
// with a prefilled message (localized). "Mark reminded" records reminded_at.
// ============================================================================
import * as db from "../db.js";
import { setViewRefresh } from "../store.js";
import { isDueSoon, reminderMessage } from "../domain.js";
import { icon, esc, toast, seasonChip, skeletonRows, emptyState } from "../ui.js";
import { t } from "../i18n.js";
import { fmtDate, timeAgo } from "./shared.js";

export async function render(main) {
  main.innerHTML = `
    <a class="btn btn-ghost" href="#/" style="margin-bottom:10px;min-height:38px">${icon("back", 18)} ${t("common.home")}</a>
    <header class="view-stage"><div><span class="vs-k">${t("view.ctx")}</span><h1>${t("rem.title")}</h1></div></header>
    <p class="muted" style="font-size:13px;margin-bottom:14px">${t("rem.sub")}</p>
    <div id="rem">${skeletonRows(3)}</div>`;
  setViewRefresh(() => load(main));
  await load(main);
}

async function load(main) {
  let sets;
  try { sets = await db.listStorageSets(); }
  catch (err) { main.querySelector("#rem").innerHTML = `<div class="banner banner-danger">${icon("alert", 18)}${esc(err.message)}</div>`; return; }

  const due = sets.filter(isDueSoon)
    .sort((a, b) => (a.expected_out_date || "").localeCompare(b.expected_out_date || ""));
  if (!due.length) {
    main.querySelector("#rem").innerHTML = emptyState({ iconName: "check", title: t("rem.allCaught"), body: t("rem.allCaughtBody") });
    return;
  }
  main.querySelector("#rem").innerHTML = due.map(card).join("");
  main.querySelectorAll("[data-remind]").forEach((btn) => btn.onclick = async () => {
    btn.disabled = true;
    try { await db.markReminded(btn.dataset.remind); toast(t("rem.marked")); await load(main); }
    catch (err) { toast(err.message, "err"); btn.disabled = false; }
  });
}

function card(set) {
  const vehicle = set.vehicle || {};
  const customer = vehicle.customer || {};
  const phone = (customer.phone || "").trim();
  const email = (customer.email || "").trim();
  const body = encodeURIComponent(reminderMessage(set));
  const subject = encodeURIComponent(`ASC — ${set.public_code}`);
  // The reference's row stack: light bordered action rows, then one dark
  // filled row (Black Core) for the primary "mark reminded" action.
  const row = (href, enabled, iconName, label) => enabled
    ? `<a class="u-row" href="${href}">${icon(iconName, 17)} <span>${label}</span><span class="u-row-end">${icon("back", 15)}</span></a>`
    : `<div class="u-row is-disabled">${icon(iconName, 17)} <span>${label}</span></div>`;

  return `
    <div class="card rem-card">
      <span class="u-corner is-accent">${icon("clock", 13)} ${t("rem.due", { date: fmtDate(set.expected_out_date) })}</span>
      <a href="#/set/${esc(set.public_code)}" class="rem-code tnum">${esc(set.public_code)}</a>
      <div class="rem-who">${esc(customer.name || "—")}</div>
      <div class="rem-meta">
        ${seasonChip(set.season)}
        ${vehicle.plate ? `<span>${esc(vehicle.plate)}</span>` : ""}
        ${set.reminded_at ? `<span class="ok">${icon("check", 13)} ${t("rem.remindedAgo", { ago: timeAgo(set.reminded_at) })}</span>` : ""}
      </div>
      <div class="u-rows">
        ${row(`tel:${encodeURIComponent(phone)}`, !!phone, "phone", t("rem.call"))}
        ${row(`sms:${encodeURIComponent(phone)}?&body=${body}`, !!phone, "phone", t("rem.text"))}
        ${row(`mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`, !!email, "list", t("rem.email"))}
        <button class="u-row ${set.reminded_at ? "" : "is-dark"}" data-remind="${esc(set.id)}">
          ${icon("check", 17)} <span>${set.reminded_at ? t("rem.markAgain") : t("rem.mark")}</span>
        </button>
      </div>
    </div>`;
}
