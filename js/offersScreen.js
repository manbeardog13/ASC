// ============================================================================
// offersScreen.js — list, draft editor, detail, buyer print, and the
// internal-access panel. Shared by the hash router and the app page.
// The customer copy is offerPrint.js, a different document.
// ============================================================================
import * as db from "./db.js";
import { t, lang } from "./i18n.js";
import { esc } from "./ui.js";
import { buyerOfferDocument, buyerOfferText } from "./offerPrint.js";

const STATUSES = ["all", "draft", "approved", "sent", "rejected"];

function linksFor(mode) {
  if (mode === "hash") {
    return {
      list: "#/offers",
      detail: (id) => `#/offer/${encodeURIComponent(id)}`,
      create: (setCode) => `#/offers/new${setCode ? `?set=${encodeURIComponent(setCode)}` : ""}`,
      edit: (id) => `#/offer/${encodeURIComponent(id)}/edit`,
      set: (code) => `#/set/${encodeURIComponent(code)}`,
      locate: (code) => `#/warehouse`,
    };
  }
  return {
    list: "offers.html",
    detail: (id) => `offers.html?id=${encodeURIComponent(id)}`,
    create: (setCode) => `offers.html?new=1${setCode ? `&set=${encodeURIComponent(setCode)}` : ""}`,
    edit: (id) => `offers.html?id=${encodeURIComponent(id)}&edit=1`,
    set: (code) => `set-detail.html?code=${encodeURIComponent(code)}`,
    locate: (code) => `locate.html?q=${encodeURIComponent(code)}`,
  };
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(String(value).length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return esc(value);
  return d.toLocaleDateString(lang() === "hr" ? "hr-HR" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function money(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString(lang() === "hr" ? "hr-HR" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || "EUR"}`;
}

function confirmBox(title, body, okLabel) {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "offer-dlg";
    dlg.innerHTML = `<form method="dialog">
      <h2>${esc(title)}</h2>
      <p>${esc(body)}</p>
      <div class="offer-dlg-actions">
        <button type="submit" value="no">${esc(t("common.cancel"))}</button>
        <button type="submit" value="yes">${esc(okLabel)}</button>
      </div>
    </form>`;
    document.body.appendChild(dlg);
    const finish = (yes) => { dlg.remove(); resolve(yes); };
    dlg.addEventListener("close", () => finish(dlg.returnValue === "yes"));
    dlg.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });
    dlg.showModal();
  });
}

function field(label, control) {
  return `<label class="field"><span class="label">${esc(label)}</span>${control}</label>`;
}

function lineEditor(lines) {
  const rows = (lines && lines.length ? lines : [{ description: "", qty: 1, unit_price: "" }]);
  return rows.map((line, i) => `
    <div class="offer-line" data-line>
      ${field(t("offer.desc"), `<input class="input" data-k="description" value="${esc(line.description || "")}">`)}
      ${field(t("offer.qty"), `<input class="input" data-k="qty" inputmode="decimal" value="${esc(line.qty ?? 1)}">`)}
      ${field(t("offer.price"), `<input class="input" data-k="unit_price" inputmode="decimal" value="${esc(line.unit_price ?? "")}">`)}
      ${field(t("offer.image"), `<input class="input" data-k="file" type="file" accept="image/*">`)}
      ${line.image_path ? `<input type="hidden" data-k="image_path" value="${esc(line.image_path)}">` : ""}
      ${line.signed_url || line.image_url ? `<img alt="" src="${esc(line.signed_url || line.image_url)}">` : ""}
      <button type="button" class="btn" data-drop-line>${esc(t("offer.removeLine"))}</button>
    </div>`).join("");
}

function readLines(root) {
  return [...root.querySelectorAll("[data-line]")].map((row) => ({
    description: row.querySelector('[data-k="description"]').value.trim(),
    qty: row.querySelector('[data-k="qty"]').value,
    unit_price: row.querySelector('[data-k="unit_price"]').value,
    image_path: row.querySelector('[data-k="image_path"]')?.value || "",
    file: row.querySelector('[data-k="file"]')?.files?.[0] || null,
  })).filter((line) => line.description || line.unit_price || line.file || line.image_path);
}

function readInternal(root) {
  const box = root.querySelector("#offerInternal");
  if (!box) return {};
  const val = (name) => box.querySelector(`[name="${name}"]`)?.value ?? "";
  return {
    entry_price: val("entry_price"),
    internal_cost: val("internal_cost"),
    margin: val("margin"),
    internal_notes: val("internal_notes"),
    source_name: val("source_name"),
    source_contact: val("source_contact"),
    source_ref: val("source_ref"),
    source_notes: val("source_notes"),
  };
}

function internalSection(internal, open, readOnly) {
  if (!open) return "";
  const row = internal || {};
  const show = (label, value) => `<div class="offer-kv"><span>${esc(label)}</span><b>${esc(value === 0 || value ? value : "—")}</b></div>`;
  if (readOnly) {
    return `<section id="offerInternal" class="card offer-internal">
      <h2>${esc(t("offer.internalTitle"))}</h2>
      <p class="hint">${esc(t("offer.internalHint"))}</p>
      ${show(t("offer.entry"), row.entry_price)}
      ${show(t("offer.cost"), row.internal_cost)}
      ${show(t("offer.margin"), row.margin)}
      ${show(t("offer.source"), row.source_name)}
      ${show(t("offer.sourceContact"), row.source_contact)}
      ${show(t("offer.sourceRef"), row.source_ref)}
      ${show(t("offer.notes"), row.internal_notes)}
      ${show(t("offer.sourceNotes"), row.source_notes)}
    </section>`;
  }
  return `<section id="offerInternal" class="card offer-internal">
    <h2>${esc(t("offer.internalTitle"))}</h2>
    <p class="hint">${esc(t("offer.internalHint"))}</p>
    <div class="offer-grid">
      ${field(t("offer.entry"), `<input class="input" name="entry_price" inputmode="decimal" value="${esc(row.entry_price ?? "")}">`)}
      ${field(t("offer.cost"), `<input class="input" name="internal_cost" inputmode="decimal" value="${esc(row.internal_cost ?? "")}">`)}
      ${field(t("offer.margin"), `<input class="input" name="margin" inputmode="decimal" value="${esc(row.margin ?? "")}">`)}
      ${field(t("offer.source"), `<input class="input" name="source_name" value="${esc(row.source_name || "")}">`)}
      ${field(t("offer.sourceContact"), `<input class="input" name="source_contact" value="${esc(row.source_contact || "")}">`)}
      ${field(t("offer.sourceRef"), `<input class="input" name="source_ref" value="${esc(row.source_ref || "")}">`)}
    </div>
    ${field(t("offer.notes"), `<textarea class="input" name="internal_notes">${esc(row.internal_notes || "")}</textarea>`)}
    ${field(t("offer.sourceNotes"), `<textarea class="input" name="source_notes">${esc(row.source_notes || "")}</textarea>`)}
  </section>`;
}

function snapshotBlock(offer) {
  const snap = offer.customer_snapshot || {};
  const car = [snap.year, snap.make, snap.model].filter(Boolean).join(" ");
  const row = (label, value) => `<div class="offer-kv"><span>${esc(label)}</span><b>${esc(value || "—")}</b></div>`;
  return `<section class="card">
    <h2>${esc(t("offer.customer"))}</h2>
    ${row(t("offer.customer"), snap.name || offer.customer_name)}
    ${row(t("ci.phone"), snap.phone || offer.phone)}
    ${row(t("ci.email"), snap.email || offer.email)}
    ${row(t("ci.plate"), snap.plate)}
    ${row(t("offer.vehicle"), car)}
    ${snap.notes ? row(t("offer.profileNotes"), snap.notes) : ""}
  </section>`;
}

function setsBlock(offer, hrefs) {
  const rows = offer.offer_related_sets || [];
  if (!rows.length) return `<section class="card"><h2>${esc(t("offer.sets"))}</h2><p class="hint">${esc(t("offer.noSets"))}</p></section>`;
  return `<section class="card">
    <h2>${esc(t("offer.sets"))}</h2>
    <div class="set-list">${rows.map((row) => {
      const where = [row.zone, row.rack, row.shelf, row.slot].filter(Boolean).join(" · ") || "—";
      const code = row.public_code || "—";
      return `<article class="offer-set">
        <div><a href="${esc(hrefs.set(code))}">${esc(code)}</a> · ${esc(row.season || "—")} · ${esc([row.tire_size, row.tire_brand].filter(Boolean).join(" · ") || "—")}</div>
        <div><a href="${esc(hrefs.locate(code))}">${esc(where)}</a> · ${esc(row.status || "—")}</div>
        <div class="hint">${esc(t("offer.checkIn"))} ${fmtDate(row.check_in_date)} · ${esc(t("offer.swap"))} ${fmtDate(row.swap_at)} · ${esc(t("offer.due"))} ${fmtDate(row.expected_out_date)} · ${esc(row.keep_plan || "—")}</div>
        ${row.plate || row.vehicle_label ? `<div class="hint">${esc([row.vehicle_label, row.plate].filter(Boolean).join(" · "))}</div>` : ""}
      </article>`;
    }).join("")}</div>
  </section>`;
}

function buyerPreview(offer, hrefs) {
  const lines = offer.lines || [];
  return `<section class="card" id="offerBuyer">
    <h2>${esc(t("offer.buyerTitle"))}</h2>
    ${(lines).map((line) => `<div class="offer-buyer-line">
      ${line.signed_url || line.image_url ? `<img alt="${esc(line.description || "")}" src="${esc(line.signed_url || line.image_url)}">` : ""}
      <div><b>${esc(line.description || "—")}</b><span>${esc(line.qty)} × ${money(line.unit_price, offer.currency)}</span></div>
    </div>`).join("")}
    <p class="offer-total">${esc(t("offer.total"))}: ${money(offer.total, offer.currency)}</p>
    ${offer.terms ? `<p>${esc(t("offer.terms"))}: ${esc(offer.terms)}</p>` : ""}
    ${offer.valid_until ? `<p>${esc(t("offer.valid"))}: ${fmtDate(offer.valid_until)}</p>` : ""}
  </section>
  ${snapshotBlock(offer)}
  ${setsBlock(offer, hrefs)}`;
}

async function paintAccess(root, hrefs) {
  const host = root.querySelector("#offerAccess");
  if (!host) return;
  let people = [];
  let log = [];
  try {
    [people, log] = await Promise.all([db.listOfferInternalAccess(), db.listOfferInternalAccessLog()]);
  } catch (err) {
    host.innerHTML = `<p class="hint">${esc(err.message)}</p>`;
    return;
  }
  const me = await db.loadMyProfile();
  const admin = db.isAdminRole(me?.role);
  host.innerHTML = `
    <h2>${esc(t("offer.accessTitle"))}</h2>
    <p class="hint">${esc(t("offer.accessHint"))}</p>
    <div class="offer-access">${people.map((person) => {
      const locked = person.role === "admin" || person.role === "manager";
      return `<div class="offer-access-row">
        <div><b>${esc(person.full_name || person.role)}</b><span class="hint">${esc(person.role)}</span></div>
        <label><input type="checkbox" data-grant="${esc(person.user_id)}" ${person.granted ? "checked" : ""} ${locked ? "disabled" : ""}> ${esc(t("offer.canSee"))}</label>
        ${admin ? `<label><input type="checkbox" data-grant-power="${esc(person.user_id)}" ${person.can_grant ? "checked" : ""} ${locked ? "disabled" : ""}> ${esc(t("offer.canGrant"))}</label>` : ""}
      </div>`;
    }).join("")}</div>
    <h3>${esc(t("offer.log"))}</h3>
    <ul class="offer-log">${log.map((row) => `<li>${fmtDate(row.at)} · ${esc(row.action)} · ${esc(row.detail || "")}</li>`).join("")}</ul>`;
  host.querySelectorAll("[data-grant]").forEach((box) => {
    box.addEventListener("change", async () => {
      const id = box.getAttribute("data-grant");
      const power = host.querySelector(`[data-grant-power="${id}"]`);
      try {
        if (box.checked) await db.grantOfferInternalAccess(id, Boolean(power?.checked));
        else await db.revokeOfferInternalAccess(id);
      } catch (err) {
        box.checked = !box.checked;
        window.alert(err.message);
      }
    });
  });
  host.querySelectorAll("[data-grant-power]").forEach((box) => {
    box.addEventListener("change", async () => {
      const id = box.getAttribute("data-grant-power");
      const see = host.querySelector(`[data-grant="${id}"]`);
      try {
        if (box.checked) {
          if (see) see.checked = true;
          await db.grantOfferInternalAccess(id, true);
        } else if (see?.checked) {
          await db.grantOfferInternalAccess(id, false);
        }
      } catch (err) {
        box.checked = !box.checked;
        window.alert(err.message);
      }
    });
  });
}

function formHtml(offer, opts) {
  const snap = offer?.customer_snapshot || {};
  const showInternal = Boolean(opts.canSee);
  return `<a class="btn" href="${esc(opts.hrefs.list)}">${esc(t("common.back"))}</a>
    <form id="offerForm" class="card">
      <h2>${esc(offer?.id ? t("offer.edit") : t("offer.new"))}</h2>
      ${field(t("offer.customer"), `<input class="input" name="customer_name" required value="${esc(offer?.customer_name || snap.name || "")}">`)}
      ${field(t("ci.phone"), `<input class="input" name="phone" value="${esc(offer?.phone || snap.phone || "")}">`)}
      ${field(t("ci.email"), `<input class="input" name="email" value="${esc(offer?.email || snap.email || "")}">`)}
      ${opts.setCode ? `<p class="hint">${esc(t("offer.forSet", { code: opts.setCode }))}</p><input type="hidden" name="set_code" value="${esc(opts.setCode)}">` : ""}
      <div id="offerLines">${lineEditor(offer?.lines)}</div>
      <button type="button" class="btn" id="addLine">${esc(t("offer.addLine"))}</button>
      ${field(t("offer.terms"), `<textarea class="input" name="terms">${esc(offer?.terms || "")}</textarea>`)}
      ${field(t("offer.valid"), `<input class="input" name="valid_until" type="date" value="${esc(offer?.valid_until || "")}">`)}
      ${internalSection(offer?.internal, showInternal)}
      <button class="btn" type="submit">${esc(t("offer.save"))}</button>
      <p id="offerErr" class="hint"></p>
    </form>`;
}

async function saveForm(root, existingId) {
  const form = root.querySelector("#offerForm");
  const data = Object.fromEntries(new FormData(form).entries());
  const lines = readLines(form);
  const payload = { ...data, ...readInternal(form), lines: lines.map(({ file, ...line }) => line) };
  let id = existingId;
  if (!id) {
    const created = await db.createOfferDraft(payload, { via: "manual" });
    id = created.id;
  } else {
    await db.updateOfferDraft(id, payload);
  }
  for (const line of lines) {
    if (!line.file) continue;
    const path = await db.uploadOfferImage(id, line.file);
    line.image_path = path;
    delete line.file;
  }
  if (lines.some((line) => line.image_path)) {
    await db.updateOfferDraft(id, { ...payload, lines });
  }
  return id;
}

export async function renderOffers(root, opts = {}) {
  const hrefs = linksFor(opts.linkMode || "app");
  const filter = root.dataset.filter || "all";
  root.__offerStop?.();
  const refresh = () => {
    if (root.querySelector("input:focus, textarea:focus, select:focus")) return;
    renderOffers(root, opts);
  };
  const channel = db.subscribeToChanges(() => {
    clearTimeout(root.__offerTimer);
    root.__offerTimer = setTimeout(refresh, 250);
  });
  const onTear = () => root.__offerStop?.();
  window.addEventListener("asc:teardown", onTear);
  root.__offerStop = () => {
    clearTimeout(root.__offerTimer);
    window.removeEventListener("asc:teardown", onTear);
    db.unsubscribe(channel);
  };
  if (!root.__offerChromeBound) {
    root.__offerChromeBound = true;
    let pulled = [];
    window.addEventListener("beforeprint", () => {
      pulled = [];
      for (const id of ["offerInternal", "offerAccess"]) {
        const node = root.querySelector("#" + id);
        if (!node?.parentNode) continue;
        pulled.push({ node, parent: node.parentNode, next: node.nextSibling });
        node.remove();
      }
    });
    window.addEventListener("afterprint", () => {
      for (const item of pulled) {
        if (item.parent?.isConnected && !item.node.isConnected) item.parent.insertBefore(item.node, item.next);
      }
      pulled = [];
    });
    root.addEventListener("click", (event) => {
      const drop = event.target.closest?.("[data-drop-line]");
      if (!drop || !root.contains(drop)) return;
      drop.closest("[data-line]")?.remove();
    });
  }

  const me = await db.loadMyProfile().catch(() => null);
  const admin = db.isAdminRole(me?.role);
  const canSee = await db.canSeeOfferInternal();
  let canGrant = admin;
  if (!canGrant && canSee) {
    try {
      const people = await db.listOfferInternalAccess();
      canGrant = people.some((person) => person.user_id === me?.id && person.can_grant);
    } catch { canGrant = false; }
  }

  if (opts.mode === "new" || opts.mode === "edit") {
    let offer = null;
    if (opts.mode === "edit" && opts.id) offer = await db.loadOffer(opts.id);
    if (offer && offer.status !== "draft") {
      location.href = hrefs.detail(offer.id);
      return;
    }
    root.innerHTML = formHtml(offer, { hrefs, canSee: canSee && (offer ? offer.can_see_internal || canSee : canSee), setCode: opts.setCode });
    root.querySelector("#addLine").onclick = () => {
      root.querySelector("#offerLines").insertAdjacentHTML("beforeend", lineEditor([{}]));
    };
    root.querySelector("#offerForm").onsubmit = async (event) => {
      event.preventDefault();
      const err = root.querySelector("#offerErr");
      err.textContent = "";
      try {
        const id = await saveForm(root, offer?.id);
        location.href = hrefs.detail(id);
      } catch (error) {
        err.textContent = error.message;
      }
    };
    return;
  }

  if (opts.mode === "detail" && opts.id) {
    const offer = await db.loadOffer(opts.id);
    if (!offer) {
      root.innerHTML = `<p>${esc(t("common.notFound"))}</p><a href="${esc(hrefs.list)}">${esc(t("common.back"))}</a>`;
      return;
    }
    root.innerHTML = `
      <a class="btn" href="${esc(hrefs.list)}">${esc(t("common.back"))}</a>
      <header class="vhead"><span class="k">${esc(t("offer.kicker"))}</span><h1>${esc(offer.customer_name)}</h1>
        <p>${esc(t(`offer.status.${offer.status}`))} · ${money(offer.total, offer.currency)}</p></header>
      <div class="offer-actions">
        ${offer.status === "draft" ? `<a class="btn" href="${esc(hrefs.edit(offer.id))}">${esc(t("offer.edit"))}</a>` : ""}
        <button type="button" class="btn" id="printOffer">${esc(t("offer.print"))}</button>
        <button type="button" class="btn" id="copyOffer">${esc(t("offer.copy"))}</button>
        ${admin && (offer.status === "draft" || offer.status === "approved") ? `<button type="button" class="btn" id="approveOffer">${esc(t("offer.approve"))}</button>` : ""}
        ${admin && (offer.status === "draft" || offer.status === "approved") ? `<button type="button" class="btn" id="rejectOffer">${esc(t("offer.reject"))}</button>` : ""}
        ${offer.status === "approved" ? `<button type="button" class="btn" id="sentOffer">${esc(t("offer.markSent"))}</button>` : ""}
      </div>
      ${buyerPreview(offer, hrefs)}
      ${canSee ? internalSection(offer.internal, true, true) : ""}
      <p id="offerErr" class="hint"></p>`;
    const printHref = {
      set: hrefs.set,
      locate: hrefs.locate,
    };
    root.querySelector("#printOffer").onclick = () => {
      const html = buyerOfferDocument(offer, printHref);
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      win.print();
    };
    root.querySelector("#copyOffer").onclick = async () => {
      const text = buyerOfferText(offer, printHref);
      try { await navigator.clipboard.writeText(text); }
      catch { window.prompt(t("offer.copy"), text); }
    };
    const act = async (status, title, body, label) => {
      if (!(await confirmBox(title, body, label))) return;
      try {
        await db.setOfferStatus(offer.id, status);
        renderOffers(root, opts);
      } catch (error) {
        root.querySelector("#offerErr").textContent = error.message;
      }
    };
    root.querySelector("#approveOffer")?.addEventListener("click", () => act("approved", t("offer.approveTitle"), t("offer.approveBody"), t("offer.approve")));
    root.querySelector("#rejectOffer")?.addEventListener("click", () => act("rejected", t("offer.rejectTitle"), t("offer.rejectBody"), t("offer.reject")));
    root.querySelector("#sentOffer")?.addEventListener("click", () => act("sent", t("offer.sentTitle"), t("offer.sentBody"), t("offer.markSent")));
    return;
  }

  let rows = [];
  let error = "";
  try { rows = await db.listOffers(filter === "all" ? null : filter); }
  catch (err) { error = err.message; }
  root.innerHTML = `
    <header class="vhead"><span class="k">${esc(t("offer.kicker"))}</span><h1>${esc(t("offer.title"))}</h1>
      <p>${esc(t("offer.lead"))}</p></header>
    <div class="offer-actions">
      <a class="btn" href="${esc(hrefs.create(opts.setCode || ""))}">${esc(t("offer.new"))}</a>
    </div>
    <div class="offer-filters" role="tablist">${STATUSES.map((status) =>
      `<button type="button" class="btn${filter === status ? " on" : ""}" data-filter="${status}">${esc(t(status === "all" ? "offer.filter.all" : `offer.status.${status}`))}</button>`
    ).join("")}</div>
    ${error ? `<p class="hint">${esc(error)}</p>` : ""}
    ${rows.length ? `<div class="set-list">${rows.map((row) => `
      <a class="offer-row" href="${esc(hrefs.detail(row.id))}">
        <b>${esc(row.customer_name)}</b>
        <span>${esc(t(`offer.status.${row.status}`))}</span>
        <span>${money(row.total, row.currency)}</span>
      </a>`).join("")}</div>` : `<p class="hint">${esc(t("offer.empty"))}</p>`}
    ${canGrant ? `<section class="card" id="offerAccess"></section>` : ""}`;
  root.querySelectorAll("[data-filter]").forEach((button) => {
    button.onclick = () => {
      root.dataset.filter = button.getAttribute("data-filter");
      renderOffers(root, opts);
    };
  });
  if (canGrant) paintAccess(root, hrefs);
}
