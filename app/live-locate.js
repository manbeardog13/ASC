import { listStorageSets } from "../js/db.js";
import { searchSets } from "./agent-search.js";
import { t, toast, el, button, field, input, queryParam } from "./flow-ui.js";
import { bootOnboarding } from "./onboarding.js";
import { setWorkflowContext, registerWorkflowAction } from './workflow.js';

bootOnboarding();

const root = document.getElementById("flow-root");
let rows = [];

function where(row) {
  return [row.zone, row.rack, row.shelf, row.slot].filter((part) => part != null && part !== "").join(" · ") || "—";
}

function renderHits(hits, query) {
  const list = el("div", { class: "flow-list" });
  if (!hits.length) {
    list.append(el("p", { class: "lead" }, t("flow.locateEmpty")));
    return list;
  }
  for (const row of hits.slice(0, 30)) {
    const link = el("a", { class: "flow-hit", href: "set-detail.html?code=" + encodeURIComponent(row.public_code) });
    const who = [row.vehicle?.customer?.name, row.vehicle?.plate].filter(Boolean).join(" · ");
    link.append(el("b", null, [row.public_code, who].filter(Boolean).join(" · ")));
    const size = (row.tires || []).map((tire) => tire.size).filter(Boolean)[0] || "";
    link.append(el("small", null, [where(row), size].filter(Boolean).join(" · ")));
    list.append(link);
  }
  if (hits.length > 30) list.append(el("p", { class: "lead" }, String(hits.length)));
  list.dataset.query = query;
  return list;
}

function run(query) {
  const q = String(query || "").trim();
  const old = root.querySelector(".flow-list");
  if (old) old.remove();
  const waiting = queryParam('filter') === 'unplaced';
  const source = waiting ? rows.filter(row => row.status !== 'checked_out' && !row.deleted_at && !row.location_id && !row.slot) : rows;
  const hits = q ? searchSets(source, q) : waiting ? source : [];
  setWorkflowContext({ query:q || (waiting ? 'Čekaju smještaj' : ''), resultCount:hits.length, resultCode:hits.length === 1 ? hits[0].public_code : null });
  if (q || waiting) root.append(renderHits(hits, q));
}

async function boot() {
  const box = input({ id:'workflow-search', placeholder: t("flow.locatePh"), autocomplete: "off", value: queryParam("q") });
  registerWorkflowAction('search', () => box.focus());
  root.append(el("p", { class: "lead" }, t("flow.locatePh")));
  root.append(field(t("flow.lookup"), box));
  const actions = el("div", { class: "flow-actions" });
  actions.append(button(t("flow.lookup"), "btn btn-primary", () => run(box.value)));
  root.append(actions);
  box.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); run(box.value); }
  });
  try {
    rows = await listStorageSets();
    run(box.value);
  } catch (error) {
    toast(error.message || t("flow.notFound"));
  }
}

boot();
