// ============================================================================
// views/recycle.js — the recycle bin. Soft-deleted sets live here for 30 days
// before the nightly purge removes them. Restore anytime; permanent delete is
// manager-only and always confirmed.
// ============================================================================
import * as db from "../db.js";
import { getState, setViewRefresh } from "../store.js";
import { icon, esc, toast, confirmSheet, statusChip, seasonChip, skeletonRows, emptyState } from "../ui.js";
import { fmtDate } from "./shared.js";

export async function render(main) {
  main.innerHTML = `
    <a class="btn btn-ghost" href="#/" style="margin-bottom:10px;min-height:38px">${icon("back", 18)} Home</a>
    <div class="row-between" style="margin-bottom:6px"><h1>Recycle bin</h1></div>
    <p class="muted" style="font-size:13px;margin-bottom:14px">Deleted sets are kept for 30 days, then removed automatically.</p>
    <div id="bin">${skeletonRows(3)}</div>`;
  setViewRefresh(() => load(main));
  await load(main);
}

async function load(main) {
  let rows;
  try { rows = await db.listRecycleBin(); }
  catch (err) { main.querySelector("#bin").innerHTML = `<div class="banner banner-danger">${icon("alert", 18)}${esc(err.message)}</div>`; return; }

  if (!rows.length) {
    main.querySelector("#bin").innerHTML = emptyState({ iconName: "trash", title: "Recycle bin is empty", body: "Deleted sets show up here so mistakes are easy to undo." });
    return;
  }
  const isManager = (getState().profile?.role ?? "manager") === "manager";
  main.querySelector("#bin").innerHTML = `<div class="set-list">${rows.map((s) => {
    const c = s.vehicle?.customer || {};
    return `<div class="set-row" style="cursor:default">
      <div class="body">
        <div class="toprow"><span class="code tnum">${esc(s.public_code)}</span>${statusChip(s.status)}${seasonChip(s.season)}</div>
        <div class="who">${esc(c.name || "—")}</div>
        <div class="spec">Deleted ${fmtDate(s.deleted_at)}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-self:center">
        <button class="btn" data-restore="${esc(s.id)}" style="min-height:38px">${icon("back", 16)} Restore</button>
        ${isManager ? `<button class="btn btn-danger" data-purge="${esc(s.id)}" data-code="${esc(s.public_code)}" style="min-height:38px">${icon("trash", 16)} Delete</button>` : ""}
      </div>
    </div>`;
  }).join("")}</div>`;

  main.querySelectorAll("[data-restore]").forEach((btn) => btn.onclick = async () => {
    try { await db.restoreSet(btn.dataset.restore); toast("Set restored"); await load(main); }
    catch (err) { toast(err.message, "err"); }
  });
  main.querySelectorAll("[data-purge]").forEach((btn) => btn.onclick = async () => {
    const ok = await confirmSheet({
      title: `Permanently delete ${btn.dataset.code}?`,
      body: "This cannot be undone. The set, its tires and photos are gone for good.",
      confirmLabel: "Delete forever", danger: true,
    });
    if (!ok) return;
    try { await db.purgeSetPermanently(btn.dataset.purge); toast("Permanently deleted"); await load(main); }
    catch (err) { toast(err.message, "err"); }
  });
}
