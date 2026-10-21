import { listWarehouseInventory } from "../js/db.js";
import { searchSets } from "./agent-search.js";
import { t, el, button, field, input, queryParam } from "./flow-ui.js";
import { bootOnboarding } from "./onboarding.js";

bootOnboarding();

const root = document.getElementById("flow-root");
let rows = [];
let state = "loading";

const box = input({ id: "locate-query", type: "search", autocomplete: "off", enterkeyhint: "search", value: queryParam("q"), "aria-describedby": "locate-status" });
const form = el("form", { class: "locate-search", role: "search", "aria-label": t("flow.lookup") });
const label = field(t("flow.locatePh"), box);
label.classList.add("locate-field");
const submit = el("button", { type: "submit", class: "btn btn-primary locate-submit", disabled: "" }, t("flow.lookup"));
form.append(label, submit);
const feedback = el("div", { class: "locate-feedback" });
const status = el("p", { id: "locate-status", class: "locate-status", role: "status", "aria-live": "polite", "aria-atomic": "true" });
const retry = button(t("flow.locateRetry"), "btn locate-retry", load);
retry.hidden = true;
feedback.append(status, retry);
const results = el("div", { class: "locate-results", "aria-busy": "true" });
root.append(form, feedback, results);

function where(row) {
  return [row.zone, row.rack, row.shelf, row.slot].filter((part) => part != null && part !== "").join(" · ") || "—";
}

function say(message, kind = "ready") {
  status.textContent = message;
  status.dataset.state = kind;
  status.hidden = !message;
}

function renderHits(hits, query) {
  const list = el("div", { class: "flow-list" });
  for (const row of hits.slice(0, 30)) {
    const link = el("a", { class: "flow-hit", href: "set-detail.html?code=" + encodeURIComponent(row.public_code) });
    const who = [row.vehicle?.customer?.name, row.vehicle?.plate].filter(Boolean).join(" · ");
    link.append(el("b", null, [row.public_code, who].filter(Boolean).join(" · ")));
    const size = (row.tires || []).map((tire) => tire.size).filter(Boolean)[0] || "";
    link.append(el("small", null, [where(row), size].filter(Boolean).join(" · ")));
    list.append(link);
  }
  list.dataset.query = query;
  return list;
}

function run() {
  if (state !== "ready") return;
  results.replaceChildren();
  const query = box.value.trim();
  if (!query) { say(""); return; }
  const hits = searchSets(rows, query);
  say(hits.length ? t("flow.locateResults", { n: hits.length, shown: Math.min(30, hits.length) }) : t("flow.locateEmpty"));
  if (hits.length) results.append(renderHits(hits, query));
}

form.addEventListener("submit", (event) => { event.preventDefault(); run(); });
box.addEventListener("input", () => {
  // Old results must not appear to belong to the edited query.
  if (state === "ready") { results.replaceChildren(); say(""); }
});

async function load() {
  if (state === "loading" && load.pending) return;
  load.pending = true;
  state = "loading";
  rows = [];
  submit.disabled = true;
  retry.disabled = true;
  retry.hidden = true;
  results.replaceChildren();
  results.setAttribute("aria-busy", "true");
  say(t("common.loading"), "loading");
  try {
    // Uses the complete paginated, authorized inventory. A failed page must
    // never produce a convincing partial list or a false "no matches" result.
    const inventory = await listWarehouseInventory();
    if (!Array.isArray(inventory?.sets)) throw new Error("Incomplete inventory");
    rows = inventory.sets;
    state = "ready";
    submit.disabled = false;
    say("");
    if (box.value.trim()) run();
  } catch (_) {
    state = "error";
    say(t("flow.locateFailed"), "error");
    retry.disabled = false;
    retry.hidden = false;
  } finally {
    load.pending = false;
    results.setAttribute("aria-busy", "false");
  }
}

load();
