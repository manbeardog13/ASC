import { loadStorageSet, checkoutSet, locationLabel } from "../js/db.js";
import { t, toast, el, button, field, input, queryParam, scanText, photoFallback, whereText } from "./flow-ui.js";
import { bootOnboarding } from "./onboarding.js";
import { setWorkflowContext, registerWorkflowAction } from './workflow.js';

bootOnboarding();

const root = document.getElementById("flow-root");
let setRow = null;
let saving = false;
registerWorkflowAction('confirm-checkout', confirmOut);
registerWorkflowAction('type-code', () => document.getElementById('typed-code')?.focus());

function onScan(text) {
  const code = window.ASCQR ? (window.ASCQR.extractCode(text) || window.ASCQR.normalize(text, true)) : String(text || "").trim();
  if (!code) { toast(t("flow.notFound")); return; }
  loadSet(code);
}

async function loadSet(code) {
  try {
    setRow = await loadStorageSet(code);
    render();
  } catch (error) {
    toast(error.message || t("flow.notFound"));
    if (!root.childElementCount) render();
  }
}

async function confirmOut() {
  if (!setRow || saving || setRow.status === 'checked_out') return;
  const where = whereText(setRow) || locationLabel(setRow);
  const question = t("flow.confirmOut", { code: setRow.public_code });
  if (!window.confirm(where ? `${question}\n${where}` : question)) return;
  saving = true;
  render();
  try {
    await checkoutSet({ setId: setRow.id, publicCode: setRow.public_code });
    setRow.status = 'checked_out';
    toast(t("flow.checkedOut", { code: setRow.public_code }));
    location.href = "set-detail.html?code=" + encodeURIComponent(setRow.public_code);
  } catch (error) {
    toast(error.message || t("flow.migration"));
  } finally { saving = false; render(); }
}

function render() {
  setWorkflowContext({ set:setRow });
  root.replaceChildren();
  const who = setRow ? [setRow.public_code, setRow.vehicle?.customer?.name, setRow.vehicle?.plate, whereText(setRow)].filter(Boolean).join(" · ") : t("flow.scanSet");
  root.append(el("p", { class: "lead" }, who));
  if (!setRow) {
    const reader = el("div", { id: "flow-reader", class: "flow-reader" });
    root.append(reader);
    const typed = input({ id:'typed-code', placeholder: t("flow.typeCode"), autocomplete: "off" });
    root.append(field(t("flow.typeCode"), typed));
    const actions = el("div", { class: "flow-actions" });
    actions.append(button(t("flow.lookup"), "btn btn-primary", () => onScan(typed.value)));
    actions.append(photoFallback(onScan));
    root.append(actions);
    scanText("flow-reader", onScan);
    return;
  }
  const actions = el("div", { class: "flow-actions" });
  if (setRow.status === 'checked_out') { root.append(el('p', {class:'flow-note'}, 'Ovaj je komplet već preuzet.')); return; }
  const go = button(saving ? 'Spremanje…' : t("flow.checkoutTitle"), "btn btn-primary", confirmOut);
  go.disabled = saving;
  actions.append(go);
  root.append(actions);
}

const initial = queryParam("set");
if (initial) loadSet(initial);
else render();
