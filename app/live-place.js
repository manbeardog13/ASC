import { loadStorageSet, placeSet, moveSet, suggestFreeSlot, locationLabel, findLocationByQr, countLocations } from "../js/db.js";
import { t, toast, el, button, field, input, queryParam, slotFromHash, whereText, scanText, photoFallback } from "./flow-ui.js";
import { placeReturn, placementNeedsSlots, unknownSlotScan, suggestionNote } from "../js/firstRun.js";
import { slotBlock } from "./slot-block.js";
import { bootOnboarding } from "./onboarding.js";

const root = document.getElementById("flow-root");
let setRow = null;
let slotQr = slotFromHash();
let unknown = false;
let noSlots = false;
let nearLabel = "";
let confirming = false;
let setRequest = 0, slotRequest = 0, selectionRevision = 0;
let setLoading = false, slotLoading = false;

function syncConfirm() {
  const control = document.getElementById("place-confirm");
  if (control) control.disabled = confirming || setLoading || slotLoading || !setRow || !slotQr;
}

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
  const request = ++setRequest;
  selectionRevision += 1;
  slotRequest += 1;
  slotLoading = false;
  setLoading = true;
  syncConfirm();
  try {
    const loaded = await loadStorageSet(normalized);
    if (request !== setRequest) return;
    if (setRow && setRow.id !== loaded.id) { slotQr = ""; nearLabel = ""; unknown = false; }
    setRow = loaded;
    render();
  } catch (error) {
    if (request !== setRequest) return;
    toast(error.message || t("flow.notFound"));
    if (!root.childElementCount) render();
  } finally {
    if (request === setRequest) { setLoading = false; syncConfirm(); }
  }
}

async function acceptSlot(qr) {
  const request = ++slotRequest, setVersion = setRequest;
  selectionRevision += 1;
  slotLoading = true;
  syncConfirm();
  try {
    const known = await findLocationByQr(qr);
    if (request !== slotRequest || setVersion !== setRequest) return false;
    nearLabel = "";
    if (unknownSlotScan(qr, known)) {
      unknown = true;
      slotQr = "";
      return true;
    }
    unknown = false;
    slotQr = known.qr_code || qr;
    return true;
  } catch (error) {
    if (request === slotRequest && setVersion === setRequest) throw error;
    return false;
  } finally {
    if (request === slotRequest) { slotLoading = false; syncConfirm(); }
  }
}

async function confirmPlace() {
  if (!setRow || !slotQr || confirming || setLoading || slotLoading) return;
  const selectedSet = setRow, selectedQr = slotQr, revision = selectionRevision;
  confirming = true;
  syncConfirm();
  try {
    const known = await findLocationByQr(selectedQr);
    // A newer scan owns the form, including scans whose lookup is still pending.
    if (selectionRevision !== revision || setRow !== selectedSet || slotQr !== selectedQr) return;
    if (unknownSlotScan(selectedQr, known)) {
      unknown = true;
      slotQr = "";
      nearLabel = "";
      render();
      return;
    }
    const moving = Boolean(selectedSet.location_id);
    const args = { setId: selectedSet.id, publicCode: selectedSet.public_code, qrCode: known.qr_code || selectedQr };
    const data = moving ? await moveSet(args) : await placeSet(args);
    const where = locationLabel(data?.location) || args.qrCode;
    toast(t(moving ? "flow.moved" : "flow.placed", { code: selectedSet.public_code, where }));
    // A submitted RPC belongs to its captured set; do not interrupt a newer scan.
    if (selectionRevision === revision) location.href = "set-detail.html?code=" + encodeURIComponent(selectedSet.public_code);
  } catch (error) {
    if (selectionRevision === revision) toast(error.message || t("flow.migration"));
  } finally {
    confirming = false;
    syncConfirm();
  }
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
  const request = ++slotRequest, setVersion = setRequest;
  selectionRevision += 1;
  slotLoading = true;
  syncConfirm();
  try {
    const slot = await suggestFreeSlot("main", customerOf(setRow));
    if (request !== slotRequest || setVersion !== setRequest) return;
    if (!slot) { toast(t("flow.noSlot")); return; }
    unknown = false;
    slotQr = slot.qr_code || "";
    nearLabel = slot.near_label || "";
    const copy = suggestionNote(slot, locationLabel(slot));
    toast(t(copy.key, copy.vars));
    render();
  } catch (error) {
    if (request === slotRequest && setVersion === setRequest) toast(error.message || t("flow.migration"));
  } finally {
    if (request === slotRequest) { slotLoading = false; syncConfirm(); }
  }
}

async function onScan(text) {
  try {
    const slot = slotFromText(text);
    const code = setCodeFromText(text);
    if (!setRow && code) { loadSet(code); return; }
    if (slot) { if (await acceptSlot(slot)) render(); return; }
    if (code) { loadSet(code); return; }
    toast(t("flow.notFound"));
  } catch (error) {
    toast(error.message || t("flow.migration"));
  }
}

function render() {
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
  if (!noSlots) scanText("flow-reader", onScan);
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
    go.id = "place-confirm";
    go.disabled = confirming || setLoading || slotLoading || !slotQr;
    placeActions.append(go);
    root.append(placeActions);
  }
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
