import { t, el } from "./flow-ui.js";
import { locationsHref } from "../js/firstRun.js";

// Purple prompt used when intake cannot place a set yet.
export function slotBlock(reason, returnTo) {
  const unknown = reason === "unknown";
  const box = el("div", { id: "slotBlock", class: "slot-block" });
  const title = el("h2", null, t(unknown ? "flow.unknownSlotTitle" : "flow.needSlotsTitle"));
  const body = el("p", { class: "lead" }, t(unknown ? "flow.unknownSlotBody" : "flow.needSlotsBody"));
  const link = el("a", {
    class: "btn btn-primary",
    id: "slot-block-go",
    href: locationsHref(returnTo),
  }, t("flow.createSlot"));
  box.append(title, body, link);
  return box;
}
