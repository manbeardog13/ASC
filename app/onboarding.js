// First sign-in walkthrough. The flag is profiles.onboarded_at, never localStorage.
import { loadMyProfile, markOnboarded, listLocationSeats } from "../js/db.js";
import { t } from "./flow-ui.js";
import { tourSteps, tourTarget, locationsHref } from "../js/firstRun.js";

function mount(steps) {
  if (!document.querySelector('link[data-guide-style]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("guide.css", import.meta.url).href;
    link.dataset.guideStyle = "";
    document.head.append(link);
  }

  const root = document.createElement("div");
  root.id = "asc-onboard";
  root.className = "asc-onboard";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  const previousFocus = document.activeElement;
  document.body.appendChild(root);
  const background = new Map();
  const holdBackground = () => [...document.body.children].forEach((element) => {
    if (element === root || background.has(element)) return;
    background.set(element, element.inert);
    element.inert = true;
  });
  holdBackground();
  const observer = new MutationObserver(holdBackground);
  observer.observe(document.body, { childList: true });
  const dismiss = () => {
    observer.disconnect();
    background.forEach((inert, element) => { if (element.isConnected) element.inert = inert; });
    document.removeEventListener("keydown", onKeydown);
    root.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent("asc:onboarding-closed"));
  };
  let step = 0;

  const finish = async () => {
    const note = root.querySelector(".asc-onboard-note");
    try {
      await markOnboarded();
      dismiss();
    } catch (error) {
      if (note) note.textContent = (error && error.message) || t("common.actionFailed");
    }
  };

  const render = () => {
    root.replaceChildren();
    const card = document.createElement("div");
    card.className = "asc-onboard-card";
    const kicker = document.createElement("p");
    kicker.className = "asc-onboard-kicker";
    kicker.textContent = t("tour.kicker");
    const progress = document.createElement("p");
    progress.className = "asc-onboard-progress";
    progress.textContent = t("tour.progress", { n: String(step + 1), total: String(steps.length) });
    const dots = document.createElement("div");
    dots.className = "asc-onboard-dots";
    steps.forEach((_, index) => {
      const dot = document.createElement("i");
      if (index <= step) dot.className = "on";
      dots.append(dot);
    });
    const item = steps[step];
    const title = document.createElement("h2");
    title.id = "asc-onboard-title";
    title.textContent = t(item.title, item.vars);
    const body = document.createElement("p");
    body.textContent = t(item.body, item.vars);
    const note = document.createElement("p");
    note.className = "asc-onboard-note";
    const actions = document.createElement("div");
    actions.className = "asc-onboard-actions";
    const last = step === steps.length - 1;
    const createSlot = step === 0 && item.title === "tour.s1.title";
    if (createSlot) {
      const go = document.createElement("button");
      go.type = "button";
      go.className = "asc-onboard-next";
      go.dataset.createSlot = "1";
      go.textContent = t("flow.createSlot");
      go.addEventListener("click", () => {
        dismiss();
        const returnTo = location.pathname.split("/").pop() + location.search + location.hash;
        const destination = new URL(locationsHref(returnTo), location.href);
        destination.searchParams.set("intro", "slot");
        location.href = destination.href;
      });
      actions.append(go);
    }
    if (step > 0) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "asc-onboard-back";
      back.textContent = t("common.back");
      back.addEventListener("click", () => { step -= 1; render(); });
      actions.append(back);
    }
    if (last) {
      const skip = document.createElement("button");
      skip.type = "button";
      skip.dataset.skip = "1";
      skip.className = "asc-onboard-back";
      skip.textContent = t("tour.skip");
      skip.addEventListener("click", () => { finish(); });
      actions.append(skip);
    }
    const next = document.createElement("button");
    next.type = "button";
    next.dataset.next = "1";
    next.className = createSlot ? "asc-onboard-back" : "asc-onboard-next";
    next.textContent = last ? t("tour.done") : t("tour.next");
    next.addEventListener("click", () => {
      if (last) finish();
      else { step += 1; render(); }
    });
    actions.append(next);
    const guide = document.createElement("a");
    guide.href = "guide.html";
    guide.className = "asc-onboard-guide";
    guide.textContent = "Otvori vodič za skladište";
    card.append(kicker, progress, dots, title, body, note, actions, guide);
    root.append(card);
    root.setAttribute("aria-labelledby", "asc-onboard-title");
    (actions.querySelector("[data-create-slot]") || next).focus();
  };

  function onKeydown(event) {
    if (!root.isConnected) return;
    if (event.key === "Escape") { event.preventDefault(); dismiss(); return; }
    if (event.key !== "Tab") return;
    const controls = [...root.querySelectorAll("button, a[href], input, select, textarea, [tabindex]")]
      .filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (!controls.includes(document.activeElement) || document.activeElement === first)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (!controls.includes(document.activeElement) || document.activeElement === last)) {
      event.preventDefault(); first.focus();
    }
  }
  document.addEventListener("keydown", onKeydown);
  render();
}

export async function bootOnboarding() {
  if (new URLSearchParams(location.search).has("vodic")) return;

  if (location.pathname.endsWith("/locations.html") && new URLSearchParams(location.search).get("intro") === "slot") {
    setTimeout(() => document.getElementById("loc-zone")?.focus(), 0);
    return;
  }
  if (document.getElementById("asc-onboard")) return;
  let profile = null;
  try { profile = await loadMyProfile(); }
  catch { return; }
  if (!profile || profile.onboarded_at || profile.onboarding_unavailable) return;
  let target = { mode: "create", zone: "" };
  try { target = tourTarget(await listLocationSeats()); }
  catch { target = { mode: "create", zone: "" }; }
  mount(tourSteps(target));
}
