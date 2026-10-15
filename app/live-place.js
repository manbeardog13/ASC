import { loadStorageSet, placeSet, moveSet, suggestFreeSlot, locationLabel, findLocationByQr, countLocations } from "../js/db.js";
import { t, toast, el, button, field, input, queryParam, slotFromHash, whereText, scanText, photoFallback } from "./flow-ui.js";
import { placeReturn, placementNeedsSlots, unknownSlotScan, suggestionNote } from "../js/firstRun.js";
import { slotBlock } from "./slot-block.js";
import { bootOnboarding } from "./onboarding.js";
import { setWorkflowContext, registerWorkflowAction } from './workflow.js';

const root = document.getElementById("flow-root");
let setRow = null;
let slotQr = slotFromHash();
let unknown = false;
let noSlots = false;
let nearLabel = "";
let saving = false;
let committed = false;
registerWorkflowAction('confirm-place', confirmPlace);
registerWorkflowAction('suggest-place', suggest);
registerWorkflowAction('type-code', () => document.getElementById('typed-code')?.focus());

bootOnboarding();

function setCodeFromText(text) {
  return window.ASCQR ? window.ASCQR.extractCode(text) : null;
}
function slotFromText(text) {
  return window.ASCQR && window.ASCQR.extractSlot ? window.ASCQR.extractSlot(text) : null;
}

function summary(row) {
  const who = row?.vehicle?.customer?.name || "";
  const plate = row?.vehicle?.plate || "";
  const where = whereText(row);
  return [row?.public_code, who, plate, where].filter(Boolean).join(" · ");
}

async function loadSet(code) {
  const normalized = window.ASCQR ? window.ASCQR.normalize(code, true) || window.ASCQR.extractCode(code) : code;
  if (!normalized) { toast(t("flow.notFound")); return; }
  try {
    setRow = await loadStorageSet(normalized);
    render();
  } catch (error) {
    toast(error.message || t("flow.notFound"));
    if (!root.childElementCount) render();
  }
}

async function acceptSlot(qr) {
  const known = await findLocationByQr(qr);
  if (unknownSlotScan(qr, known)) {
    unknown = true;
    slotQr = "";
    return;
  }
  unknown = false;
  slotQr = known.qr_code || qr;
}

async function confirmPlace() {
  if (!setRow || !slotQr || saving || setRow.status === 'checked_out') return;
  saving = true;
  const moving = Boolean(setRow.location_id);
  try {
    await acceptSlot(slotQr);
    if (unknown || !slotQr) return;
    const args = { setId: setRow.id, publicCode: setRow.public_code, qrCode: slotQr };
    render();
    const data = moving ? await moveSet(args) : await placeSet(args);
    committed = true;
    const where = locationLabel(data?.location) || slotQr;
    toast(t(moving ? "flow.moved" : "flow.placed", { code: setRow.public_code, where }));
    location.href = "set-detail.html?code=" + encodeURIComponent(setRow.public_code);
  } catch (error) {
    toast(error.message || t("flow.migration"));
  } finally { if (!committed) { saving = false; render(); } }
}

function customerOf(row) {
  const customer = row?.vehicle?.customer || {};
  return {
    customerId: customer.id || "",
    phone: customer.phone || "",
    plate: row?.vehicle?.plate || "",
  };
}

async function suggest() {
  if (saving) return;
  try {
    const slot = await suggestFreeSlot("main", customerOf(setRow));
    if (!slot) { toast(t("flow.noSlot")); return; }
    unknown = false;
    slotQr = slot.qr_code || "";
    nearLabel = slot.near_label || "";
    const copy = suggestionNote(slot, locationLabel(slot));
    toast(t(copy.key, copy.vars));
    render();
  } catch (error) {
    toast(error.message || t("flow.migration"));
  }
}

async function onScan(text) {
  if (saving) return;
  try {
    const slot = slotFromText(text);
    const code = setCodeFromText(text);
    if (!setRow && code) { loadSet(code); return; }
    if (slot) { await acceptSlot(slot); render(); return; }
    if (code) { loadSet(code); return; }
    toast(t("flow.notFound"));
  } catch (error) {
    toast(error.message || t("flow.migration"));
  }
}

function render() {
  setWorkflowContext({ set:setRow, slotQr, noSlots });
  root.replaceChildren();
  root.append(el("p", { class: "lead" }, setRow ? summary(setRow) : t("flow.scanSet")));
  const reader = el("div", { id: "flow-reader", class: "flow-reader" });
  root.append(reader);
  const typed = input({ id: "typed-code", placeholder: t("flow.typeCode"), autocomplete: "off" });
  root.append(field(t("flow.typeCode"), typed));
  const actions = el("div", { class: "flow-actions" });
  actions.append(button(t("flow.lookup"), "btn", () => onScan(typed.value)));
  actions.append(photoFallback(onScan));
  if (!setRow) actions.append(button(t("flow.suggest"), "btn ghost", suggest));
  root.append(actions);
  if (setRow && (noSlots || unknown)) {
    root.append(slotBlock(unknown && !noSlots ? "unknown" : "empty", placeReturn(setRow.public_code)));
    return;
  }
  if (setRow) {
    const note = el("p", { class: "flow-note", id: "place-suggest" }, slotQr
      ? (nearLabel ? t("flow.suggestedNear", { where: nearLabel }) : `${t("flow.where")}: ${slotQr}`)
      : t("flow.scanSlot"));
    root.append(note);
    const placeActions = el("div", { class: "flow-actions" });
    placeActions.append(button(t("flow.suggest"), "btn ghost", suggest));
    const label = setRow.location_id ? t("flow.confirmMove") : t("flow.confirmPlace");
    const go = button(label, "btn btn-primary", confirmPlace);
    go.disabled = !slotQr || saving;
    placeActions.append(go);
    root.append(placeActions);
  }
  scanText("flow-reader", onScan);
}

async function boot() {
  try {
    noSlots = placementNeedsSlots(await countLocations());
  } catch (error) {
    noSlots = false;
    toast(error.message || t("flow.migration"));
  }
  if (slotQr && !noSlots) {
    try { await acceptSlot(slotQr); }
    catch (error) { toast(error.message || t("flow.migration")); }
  }
  if (initial) await loadSet(initial);
  else render();
}

const initial = queryParam("set");
boot();
