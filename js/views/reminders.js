// ============================================================================
// views/reminders.js — "Remind customers whose tires are due for pickup."
// Zero external service: one tap opens the phone's own dialer / SMS / email with
// a prefilled message. "Mark reminded" records reminded_at so the set shows it's
// been contacted. (An automated email/SMS job can be layered on later — see
// docs/DISASTER_RECOVERY.md's sibling ideas — but this works today on any phone.)
// ============================================================================
import * as db from "../db.js";
import { setViewRefresh } from "../store.js";
import { isDueSoon, reminderMessage } from "../domain.js";
import { icon, esc, toast, seasonChip, skeletonRows, emptyState } from "../ui.js";
import { fmtDate, timeAgo } from "./shared.js";

export async function render(main) {
  main.innerHTML = `
    <a class="btn btn-ghost" href="#/" style="margin-bottom:10px;min-height:38px">${icon("back", 18)} Home</a>
    <div class="row-between" style="margin-bottom:4px"><h1>Pickup reminders</h1></div>
    <p class="muted" style="font-size:13px;margin-bottom:14px">Sets due for pickup within 7 days. One tap to call, text, or email the customer.</p>
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
    main.querySelector("#rem").innerHTML = emptyState({ iconName: "check", title: "All caught up", body: "No pickups are due in the next 7 days." });
    return;
  }
  main.querySelector("#rem").innerHTML = due.map(card).join("");
  main.querySelectorAll("[data-remind]").forEach((btn) => btn.onclick = async () => {
    btn.disabled = true;
    try { await db.markReminded(btn.dataset.remind); toast("Marked as reminded"); await load(main); }
    catch (err) { toast(err.message, "err"); btn.disabled = false; }
  });
}

function card(set) {
  const vehicle = set.vehicle || {};
  const customer = vehicle.customer || {};
  const phone = (customer.phone || "").trim();
  const email = (customer.email || "").trim();
  const body = encodeURIComponent(reminderMessage(set));
  const subject = encodeURIComponent(`ASC Tire Hotel — pickup for ${set.public_code}`);
  const action = (href, enabled, iconName, label) => enabled
    ? `<a class="btn" href="${href}" style="flex:1;min-height:44px">${icon(iconName, 18)} ${label}</a>`
    : `<span class="btn" style="flex:1;min-height:44px;opacity:.4;pointer-events:none">${icon(iconName, 18)} ${label}</span>`;

  return `
    <div class="card" style="margin-bottom:12px">
      <div class="row-between">
        <div>
          <a href="#/set/${esc(set.public_code)}" class="code tnum" style="font-weight:700">${esc(set.public_code)}</a>
          <div class="who" style="font-size:17px;font-weight:800;margin-top:2px">${esc(customer.name || "—")}</div>
        </div>
        ${seasonChip(set.season)}
      </div>
      <div class="muted" style="font-size:13px;margin:8px 0 12px">
        ${icon("clock", 14)} Due ${fmtDate(set.expected_out_date)}${vehicle.plate ? ` · ${esc(vehicle.plate)}` : ""}
        ${set.reminded_at ? ` · <span style="color:var(--ok)">reminded ${timeAgo(set.reminded_at)}</span>` : ""}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${action(`tel:${encodeURIComponent(phone)}`, !!phone, "phone", "Call")}
        ${action(`sms:${encodeURIComponent(phone)}?&body=${body}`, !!phone, "phone", "Text")}
        ${action(`mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`, !!email, "list", "Email")}
      </div>
      <button class="btn ${set.reminded_at ? "" : "btn-primary"}" data-remind="${esc(set.id)}" style="width:100%;margin-top:8px">
        ${icon("check", 18)} ${set.reminded_at ? "Reminded — mark again" : "Mark reminded"}
      </button>
    </div>`;
}
