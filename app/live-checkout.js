import { loadStorageSet, checkoutSet, locationLabel } from "../js/db.js";
import { t, toast, el, button, field, input, queryParam, scanText, photoFallback, whereText } from "./flow-ui.js";
import { bootOnboarding } from "./onboarding.js";

bootOnboarding();

const root = document.getElementById("flow-root");
const UNDO_SECONDS = 8;
const HOLD_MS = 600;
const SLIDE_THRESHOLD = 0.86;

let setRow = null;
let loadingSet = false;
let releasing = false;
let released = false;
let releaseError = "";
let undoTimerId = 0;
let undoCountdownId = 0;
let undoRemaining = UNDO_SECONDS;

function reduceMotion() {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function onScan(text) {
  const code = window.ASCQR ? (window.ASCQR.extractCode(text) || window.ASCQR.normalize(text, true)) : String(text || "").trim();
  if (!code) { setReleaseError(t("flow.notFound")); return; }
  loadSet(code);
}

function setReleaseError(message) {
  releaseError = message || "";
  render();
}

function clearReleaseError() {
  if (!releaseError) return;
  releaseError = "";
}

async function loadSet(code) {
  loadingSet = true;
  releaseError = "";
  render();
  try {
    setRow = await loadStorageSet(code);
    loadingSet = false;
    render();
  } catch (error) {
    loadingSet = false;
    setReleaseError(error.message || t("flow.notFound"));
  }
}

// The grace window precedes the authoritative mutation. Undo cancels local intent;
// it never resurrects a freed slot that another worker may already have occupied.
function doRelease() {
  if (!setRow || releasing || released) return;
  clearReleaseError();
  released = true;
  startUndoWindow();
  render();
}

async function commitRelease() {
  if (!setRow || !released || releasing) return;
  stopUndoWindow();
  released = false;
  releasing = true;
  render();
  try {
    await checkoutSet({ setId: setRow.id, publicCode: setRow.public_code });
    goToSetDetail();
  } catch (error) {
    releasing = false;
    setReleaseError(error.message || t("checkout.error"));
  }
}

function startUndoWindow() {
  stopUndoWindow();
  undoRemaining = UNDO_SECONDS;
  undoTimerId = window.setTimeout(() => {
    stopUndoWindow();
    void commitRelease();
  }, UNDO_SECONDS * 1000);
  undoCountdownId = window.setInterval(() => {
    undoRemaining = Math.max(0, undoRemaining - 1);
    const button = document.getElementById("release-undo");
    if (button) button.textContent = t("checkout.undoCount", { n: undoRemaining });
  }, 1000);
}

function stopUndoWindow() {
  if (undoTimerId) { clearTimeout(undoTimerId); undoTimerId = 0; }
  if (undoCountdownId) { clearInterval(undoCountdownId); undoCountdownId = 0; }
}

function goToSetDetail() {
  if (!setRow) return;
  location.href = "set-detail.html?code=" + encodeURIComponent(setRow.public_code);
}

function doUndo() {
  if (!released || releasing) return;
  stopUndoWindow();
  released = false;
  releaseError = "";
  toast(t("checkout.undoDone"));
  render();
  document.getElementById("release-control")?.focus();
}
// A departed page must not commit an unconfirmed local intention later.
window.addEventListener("pagehide", () => { stopUndoWindow(); released = false; });
window.addEventListener("pageshow", () => { if (!releasing) render(); });

// --- Inline slide-to-release / press-and-hold control ---------------------
// Pointer drag past SLIDE_THRESHOLD or Enter/Space held for HOLD_MS commits.
// 60px thumb target (above the 44px minimum), brand red, role=slider so screen
// readers announce the control; prefers-reduced-motion gets no transform
// animations.
function buildReleaseControl() {
  const wrap = el("div", {
    id: "release-control",
    class: "release-slider",
    role: "slider",
    tabindex: "0",
    "aria-valuemin": "0",
    "aria-valuemax": "100",
    "aria-valuenow": "0",
    "aria-label": t("checkout.releaseLabel"),
  });
  const track = el("div", { class: "release-slider__track" });
  const fill = el("div", { class: "release-slider__fill" });
  const label = el("span", { class: "release-slider__label" }, releasing ? t("checkout.releasing") : t("checkout.slideHint"));
  const thumb = el("div", { class: "release-slider__thumb", "aria-hidden": "true" });
  track.append(fill, label, thumb);
  wrap.append(track);

  if (releasing) {
    wrap.classList.add("is-disabled");
    wrap.setAttribute("aria-disabled", "true");
    return wrap;
  }

  const reduced = reduceMotion();
  let active = false;
  let startX = 0;
  let maxTravel = 0;
  let progress = 0;
  let keyActive = false;
  let holdStart = 0;
  let holdTimer = 0;
  let holdRaf = 0;

  function measure() {
    const rect = track.getBoundingClientRect();
    const thumbSize = thumb.getBoundingClientRect().width || 60;
    maxTravel = Math.max(1, rect.width - thumbSize - 16);
  }

  function setProgress(value, animate) {
    progress = Math.max(0, Math.min(1, value));
    const px = Math.round(progress * maxTravel);
    const transition = (animate && !reduced) ? "transform 220ms cubic-bezier(.16,1,.3,1), width 220ms cubic-bezier(.16,1,.3,1), opacity 120ms linear" : "none";
    thumb.style.transition = transition;
    fill.style.transition = transition;
    label.style.transition = transition;
    thumb.style.transform = reduced ? "" : "translateX(" + px + "px)";
    fill.style.width = (progress * 100) + "%";
    label.style.opacity = String(Math.max(0, 1 - progress * 1.4));
    wrap.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
  }

  function reset() {
    active = false;
    setProgress(0, true);
  }

  function commit() {
    setProgress(1, false);
    doRelease();
  }

  thumb.addEventListener("pointerdown", (e) => {
    if (wrap.classList.contains("is-disabled")) return;
    active = true;
    try { thumb.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    measure();
    startX = e.clientX - progress * maxTravel;
    setProgress(progress, false);
    e.preventDefault();
  });
  thumb.addEventListener("pointermove", (e) => {
    if (!active) return;
    setProgress((e.clientX - startX) / maxTravel, false);
  });
  function endPointer(e) {
    if (!active) return;
    try { thumb.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (e.type !== "pointercancel" && progress >= SLIDE_THRESHOLD) commit();
    else reset();
  }
  thumb.addEventListener("pointerup", endPointer);
  thumb.addEventListener("pointercancel", endPointer);

  function startHold() {
    if (keyActive || wrap.classList.contains("is-disabled")) return;
    keyActive = true;
    measure();
    holdStart = performance.now();
    thumb.style.transition = fill.style.transition = label.style.transition = "none";
    if (reduced) {
      // No visual travel; still gated by the 600ms hold timer.
      holdTimer = window.setTimeout(() => {
        if (!keyActive) return;
        keyActive = false;
        commit();
      }, HOLD_MS);
      return;
    }
    const step = () => {
      if (!keyActive) return;
      const elapsed = performance.now() - holdStart;
      const p = Math.min(1, elapsed / HOLD_MS);
      setProgress(p, false);
      if (p >= 1) { keyActive = false; commit(); return; }
      holdRaf = requestAnimationFrame(step);
    };
    holdRaf = requestAnimationFrame(step);
  }

  function endHold() {
    if (!keyActive) return;
    keyActive = false;
    if (holdRaf) { cancelAnimationFrame(holdRaf); holdRaf = 0; }
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; }
    reset();
  }

  wrap.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
      e.preventDefault();
      startHold();
    }
  });
  wrap.addEventListener("keyup", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      endHold();
    }
  });
  wrap.addEventListener("blur", endHold);

  return wrap;
}

function buildContext() {
  const list = el("dl", { class: "release-context" });
  const row = (keyLabel, valueText, extraClass) => {
    if (!valueText) return;
    list.append(el("dt", null, keyLabel));
    const dd = el("dd", extraClass ? { class: extraClass } : null, valueText);
    list.append(dd);
  };
  row(t("checkout.contextSet"), setRow.public_code, "release-context__code");
  const customerName = setRow.vehicle?.customer?.name || "";
  const plate = setRow.vehicle?.plate || "";
  const who = [customerName, plate].filter(Boolean).join(" · ");
  row(t("checkout.contextCustomer"), who);
  row(t("checkout.contextLocation"), whereText(setRow) || locationLabel(setRow));
  return list;
}

function buildErrorAlert() {
  if (!releaseError) return null;
  const alert = el("div", { class: "release-error", role: "alert", id: "release-error" });
  alert.append(el("span", { class: "release-error__msg" }, releaseError));
  if (setRow && !loadingSet) {
    const retry = button(t("checkout.retry"), "btn ghost release-error__retry", () => {
      clearReleaseError();
      doRelease();
    });
    retry.id = "release-retry";
    alert.append(retry);
  }
  return alert;
}

function buildReleasedPanel() {
  const panel = el("div", { class: "release-done" });
  panel.append(el("h2", null, t("checkout.released", { code: setRow.public_code })));
  const where = whereText(setRow) || locationLabel(setRow);
  if (where) panel.append(el("p", null, where));
  const actions = el("div", { class: "release-done__actions" });
  const undo = button(t("checkout.undoCount", { n: UNDO_SECONDS }), "release-done__undo", doUndo);
  undo.id = "release-undo";
  actions.append(undo);
  panel.append(actions);
  return panel;
}

function render() {
  root.replaceChildren();

  // --- Phase A: no set loaded yet ---
  if (!setRow) {
    if (loadingSet) {
      // Skeleton reserves the same vertical rhythm as the real control.
      root.append(el("p", { class: "lead" }, t("checkout.loading")));
      root.append(el("div", { class: "release-skeleton", "aria-hidden": "true" }));
      return;
    }
    root.append(el("p", { class: "lead" }, t("flow.scanSet")));
    const reader = el("div", { id: "flow-reader", class: "flow-reader" });
    root.append(reader);
    const typed = input({ id: "typed-code", placeholder: t("flow.typeCode"), autocomplete: "off" });
    root.append(field(t("flow.typeCode"), typed));
    const actions = el("div", { class: "flow-actions" });
    actions.append(button(t("flow.lookup"), "btn btn-primary", () => onScan(typed.value)));
    actions.append(photoFallback(onScan));
    root.append(actions);
    const errorAlert = buildErrorAlert();
    if (errorAlert) root.append(errorAlert);
    scanText("flow-reader", onScan);
    return;
  }

  // --- Phase B: set loaded ---
  root.append(buildContext());

  if (released) {
    root.append(buildReleasedPanel());
    return;
  }

  root.append(buildReleaseControl());
  const hint = el("p", { class: "release-slider__kbd" }, t("checkout.holdHint"));
  root.append(hint);

  const errorAlert = buildErrorAlert();
  if (errorAlert) root.append(errorAlert);
}

// Initial render reserves control height before any data lands.
const initial = queryParam("set");
if (initial) { loadingSet = true; render(); loadSet(initial); }
else render();
