// ============================================================================
// views/users.js — the user directory + access management.
// Everyone signed in sees the list (full names, Admin/User, masked emails).
// Admins can add users, assign roles, grant admin, and remove users. The owner
// account is locked: it can never be removed or demoted (enforced in the DB too).
// ============================================================================
import * as db from "../db.js";
import { getState, setState, setViewRefresh } from "../store.js";
import { icon, esc, toast, confirmSheet, skeletonRows, emptyState } from "../ui.js";
import { t } from "../i18n.js";

export async function render(main) {
  main.innerHTML = `
    <a class="btn btn-ghost" href="#/" style="margin-bottom:10px;min-height:38px">${icon("back", 18)} ${t("common.home")}</a>
    <div class="row-between" style="margin-bottom:4px"><h1>${t("users.title")}</h1></div>
    <p class="muted" style="font-size:13px;margin-bottom:14px">${t("users.sub")}</p>
    <div id="addSlot"></div>
    <div id="userList">${skeletonRows(3)}</div>`;
  setViewRefresh(() => load(main));
  await load(main);
}

function roleChip(role) {
  return db.isAdminRole(role)
    ? `<span class="chip role-admin">${icon("check", 13)}${t("users.roleAdmin")}</span>`
    : `<span class="chip role-user">${t("users.roleUser")}</span>`;
}

async function load(main) {
  const me = getState().profile || {};
  const isAdmin = db.isAdminRole(me.role);

  let users, pending;
  try {
    [users, pending] = await Promise.all([
      db.listUsers(),
      isAdmin ? db.listPendingUsers() : Promise.resolve([]),
    ]);
  } catch (err) {
    main.querySelector("#userList").innerHTML = `<div class="banner banner-danger">${icon("alert", 18)}${esc(err.message)}</div>`;
    return;
  }

  // Signed-up accounts with no role yet (readonly) = awaiting approval.
  const awaiting = users.filter((u) => !u.is_owner && u.role === "readonly");
  // Everyone else + not-yet-signed-up invites; owner first, then admins, then rest.
  const team = [...users.filter((u) => u.is_owner || u.role !== "readonly"), ...pending].sort((a, b) => {
    if (a.is_owner !== b.is_owner) return a.is_owner ? -1 : 1;
    if (a.pending !== b.pending) return a.pending ? 1 : -1;
    const ar = db.isAdminRole(a.role), br = db.isAdminRole(b.role);
    if (ar !== br) return ar ? -1 : 1;
    return (a.full_name || "").localeCompare(b.full_name || "");
  });

  // Keep the app-wide "pending approvals" badge in sync.
  setState({ pendingApprovals: isAdmin ? awaiting.length : 0 });

  main.querySelector("#addSlot").innerHTML = isAdmin ? addFormHtml() : "";
  if (isAdmin) wireAddForm(main);

  const listEl = main.querySelector("#userList");
  if (!team.length && !awaiting.length) {
    listEl.innerHTML = emptyState({ iconName: "people", title: t("users.emptyTitle"), body: isAdmin ? t("users.emptyBody") : "" });
    return;
  }

  const awaitingHtml = (isAdmin && awaiting.length) ? awaitingSectionHtml(awaiting) : "";
  listEl.innerHTML = awaitingHtml + `<div class="set-list">${team.map((u) => rowHtml(u, me, isAdmin)).join("")}</div>`;
  if (isAdmin) { wireApproveActions(main); wireRowActions(main); }
  else {
    listEl.insertAdjacentHTML("beforeend",
      `<p class="muted" style="font-size:12.5px;margin-top:12px">${t("users.readOnlyNote")}</p>`);
  }
}

// Approval queue: people who signed in but have no role yet.
function awaitingSectionHtml(awaiting) {
  return `<div class="approve-card">
    <div class="approve-head">${icon("clock", 16)} <b>${t("users.awaitingTitle")}</b> <span class="approve-count">${awaiting.length}</span></div>
    <p class="muted" style="font-size:12.5px;margin:2px 0 12px">${t("users.awaitingSub")}</p>
    ${awaiting.map(approveRowHtml).join("")}
  </div>`;
}
function approveRowHtml(u) {
  const name = esc(u.full_name || t("users.noName"));
  return `<div class="approve-row" data-row="${esc(u.id)}">
    <div class="body"><div class="who">${name}</div><div class="user-mail tnum">${esc(u.email_masked || "")}</div></div>
    <div class="approve-actions">
      <button class="btn btn-primary" data-approve="${esc(u.id)}" data-role="employee" data-name="${name}">${t("users.approveUser")}</button>
      <button class="btn" data-approve="${esc(u.id)}" data-role="admin" data-name="${name}">${t("users.approveAdmin")}</button>
      <button class="btn btn-ghost btn-reject" data-reject="${esc(u.id)}" data-name="${name}">${t("users.reject")}</button>
    </div>
  </div>`;
}

function wireApproveActions(main) {
  main.querySelectorAll("[data-approve]").forEach((btn) => btn.onclick = async () => {
    const row = btn.closest(".approve-row");
    row?.querySelectorAll("button").forEach((b) => b.disabled = true);
    try {
      await db.setUserRole({ id: btn.dataset.approve, pending: false }, btn.dataset.role);
      toast(t("users.approved", { name: btn.dataset.name }));
      await load(main);
    } catch (err) { toast(err.message, "err"); row?.querySelectorAll("button").forEach((b) => b.disabled = false); }
  });
  main.querySelectorAll("[data-reject]").forEach((btn) => btn.onclick = async () => {
    const ok = await confirmSheet({ title: t("users.rejectQ", { name: btn.dataset.name }), body: t("users.rejectBody"), confirmLabel: t("users.reject"), danger: true });
    if (!ok) return;
    try {
      await db.removeUser({ id: btn.dataset.reject, pending: false });
      toast(t("users.removed", { name: btn.dataset.name }));
      await load(main);
    } catch (err) { toast(err.message, "err"); }
  });
}

function rowHtml(u, me, isAdmin) {
  const isSelf = !u.pending && u.id === me.id;
  const name = esc(u.full_name || t("users.noName"));
  const badges = [
    u.is_owner ? `<span class="user-badge badge-owner">${t("users.owner")}</span>` : "",
    isSelf ? `<span class="user-badge badge-you">${t("users.you")}</span>` : "",
    u.pending ? `<span class="user-badge badge-pending">${t("users.pending")}</span>` : "",
  ].join("");
  // Owner and your own row are not editable here (prevents self-lockout).
  const locked = u.is_owner || isSelf;
  const controls = (isAdmin && !locked) ? `
    <div class="user-actions">
      <div class="segmented user-role" role="group" aria-label="${t("users.role")}">
        <button type="button" data-role="admin" data-id="${esc(u.id)}" aria-pressed="${db.isAdminRole(u.role)}">${t("users.roleAdmin")}</button>
        <button type="button" data-role="employee" data-id="${esc(u.id)}" aria-pressed="${!db.isAdminRole(u.role)}">${t("users.roleUser")}</button>
      </div>
      <button class="btn btn-danger" data-remove="${esc(u.id)}" data-name="${name}" style="min-height:38px">${icon("trash", 16)} ${t("users.remove")}</button>
    </div>` : "";

  return `<div class="set-row user-row" style="cursor:default" data-row="${esc(u.id)}">
    <div class="body">
      <div class="toprow"><span class="who">${name}</span>${roleChip(u.role)}${badges}</div>
      <div class="user-mail tnum">${esc(u.email_masked || "")}</div>
      ${(isAdmin && locked && u.is_owner) ? `<div class="user-locked">${icon("check", 13)} ${t("users.ownerLocked")}</div>` : ""}
    </div>
    ${controls}
  </div>`;
}

function addFormHtml() {
  return `<div class="card" style="margin-bottom:16px">
    <h3 style="margin-bottom:12px">${icon("plus", 18)} ${t("users.add")}</h3>
    <form id="addUserForm" novalidate>
      <label class="field"><span class="label">${t("users.fullName")}</span>
        <input id="uName" type="text" autocomplete="name" required></label>
      <label class="field"><span class="label">${t("users.email")}</span>
        <input id="uEmail" type="email" autocomplete="off" required></label>
      <div class="field">
        <span class="label">${t("users.role")}</span>
        <div class="segmented" id="uRole" role="group" aria-label="${t("users.role")}">
          <button type="button" data-set="employee" aria-pressed="true">${t("users.roleUser")}</button>
          <button type="button" data-set="admin" aria-pressed="false">${t("users.roleAdmin")}</button>
        </div>
        <p class="hint">${t("users.roleHint")}</p>
      </div>
      <p id="addErr" class="inline-err hidden"></p>
      <button class="btn btn-primary btn-block" type="submit">${icon("plus", 18)} ${t("users.addSubmit")}</button>
    </form>
  </div>`;
}

function wireAddForm(main) {
  const form = main.querySelector("#addUserForm");
  if (!form) return;
  const roleSeg = form.querySelector("#uRole");
  let role = "employee";
  roleSeg.querySelectorAll("[data-set]").forEach((b) => b.onclick = () => {
    role = b.dataset.set;
    roleSeg.querySelectorAll("[data-set]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = form.querySelector("#addErr");
    const name = form.querySelector("#uName").value.trim();
    const email = form.querySelector("#uEmail").value.trim();
    const showErr = (msg) => { err.textContent = msg; err.classList.remove("hidden"); };
    err.classList.add("hidden");

    if (!name) return showErr(t("users.nameRequired"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showErr(t("users.emailInvalid"));

    const btn = form.querySelector('button[type="submit"]');
    btn.classList.add("is-busy"); btn.disabled = true;
    try {
      const res = await db.inviteUser({ full_name: name, email, role });
      toast(res.mode === "invited" ? t("users.invited", { name })
          : res.mode === "exists" ? t("users.roleChanged")
          : t("users.added", { name }));
      form.reset();
      role = "employee";
      await load(main);
    } catch (e2) {
      showErr(e2.message);
      btn.classList.remove("is-busy"); btn.disabled = false;
    }
  };
}

function wireRowActions(main) {
  main.querySelectorAll(".user-role [data-role]").forEach((btn) => btn.onclick = async () => {
    if (btn.getAttribute("aria-pressed") === "true") return;
    const group = btn.closest(".user-role");
    group.querySelectorAll("[data-role]").forEach((b) => b.disabled = true);
    try {
      await db.setUserRole({ id: btn.dataset.id, pending: btn.dataset.id.startsWith("pending:"), email: btn.dataset.id.replace(/^pending:/, "") }, btn.dataset.role);
      toast(t("users.roleChanged"));
      await load(main);
    } catch (err) {
      toast(err.message, "err");
      group.querySelectorAll("[data-role]").forEach((b) => b.disabled = false);
    }
  });

  main.querySelectorAll("[data-remove]").forEach((btn) => btn.onclick = async () => {
    const id = btn.dataset.remove;
    const ok = await confirmSheet({ title: t("users.removeQ", { name: btn.dataset.name }), body: t("users.removeBody"), confirmLabel: t("users.remove"), danger: true });
    if (!ok) return;
    try {
      await db.removeUser({ id, pending: id.startsWith("pending:"), email: id.replace(/^pending:/, "") });
      toast(t("users.removed", { name: btn.dataset.name }));
      await load(main);
    } catch (err) {
      toast(err.message, "err");
    }
  });
}
