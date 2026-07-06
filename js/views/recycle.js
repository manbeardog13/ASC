// ============================================================================
// views/recycle.js — the recycle bin. Soft-deleted sets live here for 30 days
// before the nightly purge. Restore anytime; permanent delete is manager-only
// and always confirmed.
// ============================================================================
import * as db from "../db.js";
import { getState, setViewRefresh } from "../store.js";
import { icon, esc, toast, confirmSheet, statusChip, seasonChip, skeletonRows, emptyState } from "../ui.js";
import { t } from "../i18n.js";
import { fmtDate } from "./shared.js";

export async function render(main) {
  main.innerHTML = `
    <a class="btn btn-ghost" href="#/" style="margin-bottom:10px;min-height:38px">${icon("back", 18)} ${t("common.home")}</a>
    <div class="row-between" style="margin-bottom:6px"><h1>${t("rec.title")}</h1></div>
    <p class="muted" style="font-size:13px;margin-bottom:14px">${t("rec.retention")}</p>
    <div id="bin">${skeletonRows(3)}</div>`;
  setViewRefresh(() => load(main));
  await load(main);
}

async function load(main) {
  let rows;
  try { rows = await db.listRecycleBin(); }
  catch (err) { main.querySelector("#bin").innerHTML = `<div class="banner banner-danger">${icon("alert", 18)}${esc(err.message)}</div>`; return; }

  if (!rows.length) {
    main.querySelector("#bin").innerHTML = emptyState({ iconName: "trash", title: t("rec.emptyTitle"), body: t("rec.emptyBody") });
    return;
  }
  const isManager = (getState().profile?.role ?? "manager") === "manager";
  main.querySelector("#bin").innerHTML = `
    <section class="card u-module">
      <div class="u-module-head"><h3 class="u-module-title">${icon("trash", 14)} ${t("rec.title")}<span class="u-count-chip">${rows.length}</span></h3></div>
      <div class="set-list">${rows.map((s) => {
        const c = s.vehicle?.customer || {};
        return `<div class="set-row rec-row" style="cursor:default">
          <div class="body">
            <div class="toprow"><span class="code tnum">${esc(s.public_code)}</span>${statusChip(s.status)}${seasonChip(s.season)}</div>
            <div class="who">${esc(c.name || "—")}</div>
            <div class="spec">${t("rec.deletedOn", { date: fmtDate(s.deleted_at) })}</div>
          </div>
          <div class="rec-actions">
            <button class="btn" data-restore="${esc(s.id)}">${icon("back", 16)} ${t("rec.restore")}</button>
            ${isManager ? `<button class="btn btn-danger" data-purge="${esc(s.id)}" data-code="${esc(s.public_code)}">${icon("trash", 16)} ${t("rec.delete")}</button>` : ""}
          </div>
        </div>`;
      }).join("")}</div>
    </section>`;

  main.querySelectorAll("[data-restore]").forEach((btn) => btn.onclick = async () => {
    try { await db.restoreSet(btn.dataset.restore); toast(t("rec.restored")); await load(main); }
    catch (err) { toast(err.message, "err"); }
  });
  main.querySelectorAll("[data-purge]").forEach((btn) => btn.onclick = async () => {
    const ok = await confirmSheet({ title: t("rec.purgeQ", { code: btn.dataset.code }), body: t("rec.purgeBody"), confirmLabel: t("rec.deleteForever"), danger: true });
    if (!ok) return;
    try { await db.purgeSetPermanently(btn.dataset.purge); toast(t("rec.permDeleted")); await load(main); }
    catch (err) { toast(err.message, "err"); }
  });
}
