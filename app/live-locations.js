import { createLocations } from "../js/db.js";
import { expandLocations } from "../js/locationGrid.js";
import { safeAppReturn } from "../js/firstRun.js";
import { t, toast, el, button, field, input } from "./flow-ui.js";
import { bootOnboarding } from "./onboarding.js";

const root = document.getElementById("flow-root");
const backHref = safeAppReturn(new URLSearchParams(location.search).get("return"));

bootOnboarding();

function returnLink() {
  if (!backHref) return null;
  return el("a", { class: "btn btn-primary", id: "back-to-intake", href: backHref }, t("flow.backToIntake"));
}

function labeled(key, id, value, placeholder) {
  const box = input({ id, value: value || "", placeholder: placeholder || "", autocomplete: "off" });
  return field(t(key), box);
}

async function create() {
  const read = (id) => document.getElementById(id)?.value || "";
  let rows;
  try {
    rows = expandLocations({
      warehouse: read("loc-wh") || "main",
      zone: read("loc-zone"),
      racks: read("loc-racks"),
      shelves: read("loc-shelves"),
      slots: read("loc-slots"),
    });
  } catch (error) {
    toast(error.code === "location_cap" ? t("flow.tooMany", { n: error.cap }) : error.message);
    return;
  }
  try {
    const saved = await createLocations(rows);
    toast(t("flow.created", { n: saved.length }));
    if (window.ASCQR && saved.length) window.ASCQR.printSlotLabels(saved);
    const back = returnLink();
    if (back && !document.getElementById("back-to-intake")) actions.append(back);
  } catch (error) {
    toast(error.message || t("flow.migration"));
  }
}

const back = returnLink();
if (back) root.append(back);
root.append(el("p", { class: "lead" }, t("flow.rangeHint")));
root.append(labeled("flow.warehouse", "loc-wh", "main", "main"));
root.append(labeled("flow.zone", "loc-zone", "", "A"));
root.append(labeled("flow.racks", "loc-racks", "", "01-04"));
root.append(labeled("flow.shelves", "loc-shelves", "", "1-3"));
root.append(labeled("flow.slots", "loc-slots", "", "01-08"));
const actions = el("div", { class: "flow-actions" });
actions.append(button(t("flow.bulk"), "btn btn-primary", create));
root.append(actions);
