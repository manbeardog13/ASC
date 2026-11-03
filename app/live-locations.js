import { createLocations } from "../js/db.js";
import { expandLocations } from "../js/locationGrid.js";
import { safeAppReturn } from "../js/firstRun.js";
import { t, el, button, field, input } from "./flow-ui.js";
import { bootOnboarding } from "./onboarding.js";

const root = document.getElementById("flow-root");
const query = new URLSearchParams(location.search);
const backHref = safeAppReturn(query.get("return"));
bootOnboarding();

const form = el("form", { class: "stack" });
const fields = el("fieldset", { class: "location-fields" });
form.append(fields);
const controls = {};
function addField(key, id, value, placeholder, required) {
  const box = input({ id: "loc-" + id, value, placeholder, autocomplete: "off" });
  box.required = required;
  controls[id] = box;
  fields.append(field(t(key), box));
}
addField("flow.warehouse", "wh", "main", "main", true);
addField("flow.zone", "zone", query.get("zone") || "", "A", true);
addField("flow.racks", "racks", "", "01-04", true);
addField("flow.shelves", "shelves", "", "1-3", false);
addField("flow.slots", "slots", "", "01-08", false);
const preview = el("p", { class: "flow-note", role: "status" });
const submit = el("button", { type: "submit", class: "btn btn-primary" }, t("flow.bulk"));
const actions = el("div", { class: "flow-actions" });
actions.append(submit);
form.append(preview, actions);
const status = el("p", { class: "flow-note", role: "status" });
const next = el("div", { class: "flow-actions" });
let busy = false, savedRows = [];

function draft() {
  return expandLocations({
    warehouse: controls.wh.value, zone: controls.zone.value, racks: controls.racks.value,
    shelves: controls.shelves.value, slots: controls.slots.value,
  });
}
function updatePreview() {
  savedRows = [];
  next.replaceChildren();
  status.textContent = "";
  submit.disabled = true;
  if (!controls.wh.value.trim() || !controls.zone.value.trim() || !controls.racks.value.trim()) {
    preview.textContent = t("flow.requireRack");
    return;
  }
  try {
    const rows = draft();
    if (rows.some(row => !row.rack.trim())) { preview.textContent = t("flow.requireRack"); return; }
    const count = new Set(rows.map(row => JSON.stringify([row.rack, row.shelf, row.slot]))).size;
    preview.textContent = t("flow.labelsPreview", { n: count });
    submit.disabled = false;
  } catch (error) {
    preview.textContent = t("flow.tooMany", { n: error.cap });
  }
}
function openLabels() {
  try {
    if (window.ASCQR?.printSlotLabels(savedRows)) {
      status.textContent = t("flow.created", { n: savedRows.length });
      return;
    }
  } catch { /* A failed encoder cannot produce printable QR labels. */ }
  status.textContent = t("flow.labelsFailed");
}

form.addEventListener("input", updatePreview);
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || submit.disabled) return;
  const rows = draft();
  busy = true;
  fields.disabled = submit.disabled = true;
  status.textContent = t("common.loading");
  next.replaceChildren();
  try {
    savedRows = await createLocations(rows);
    if (!savedRows.length) { status.textContent = t("flow.locationsFailed"); return; }
    next.append(button(t("flow.printSlots"), "btn", openLabels));
    const zones = new Set(savedRows.map(row => String(row?.zone || "").trim()).filter(Boolean));
    for (const zone of zones) {
      next.append(el("a", { class: "btn", "data-open-on-map": zone,
        href: "warehouse-preview/index.html?zone=" + encodeURIComponent(zone) }, t("flow.openOnMap", { zone })));
    }
    openLabels();
  } catch {
    status.textContent = t("flow.locationsFailed");
  } finally {
    busy = false;
    fields.disabled = submit.disabled = false;
  }
});

if (backHref) root.append(el("a", { class: "btn", id: "back-to-intake", href: backHref },
  t(backHref.startsWith("place.html") ? "flow.backToPlace" : "flow.backToIntake")));
root.append(el("p", { class: "lead" }, t("flow.rangeHint")), form, status, next);
updatePreview();
