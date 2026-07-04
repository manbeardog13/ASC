// ============================================================================
// ui.js — shared UI primitives. Rendering helpers only; no business rules
// (those live in domain.js) and no database calls (db.js).
// ============================================================================
import { STATUSES, SEASONS, statusLabel, seasonLabel, locationParts, hasLocation, locationLine } from "./domain.js";

// ---- Navigation ---------------------------------------------------------------
export function go(route) {
  location.hash = route.startsWith("#") ? route : "#" + route;
}

// ---- Escaping -------------------------------------------------------------------
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

// ---- Icons (inline SVG, stroke follows currentColor) ----------------------------
const ICON_PATHS = {
  box:      '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3.3 8.3L12 13l8.7-4.7"/><path d="M12 13v8"/>',
  clock:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check:    '<path d="M20 6L9 17l-5-5"/>',
  alert:    '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4"/><path d="M12 17.5v.5"/>',
  snow:     '<path d="M12 2v20M4 6l16 12M20 6L4 18"/>',
  sun:      '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.5 4.5l2 2M17.5 17.5l2 2M19.5 4.5l-2 2M6.5 17.5l-2 2"/>',
  circle:   '<circle cx="12" cy="12" r="8.5"/>',
  scan:     '<path d="M3 8V5a2 2 0 012-2h3M16 3h3a2 2 0 012 2v3M21 16v3a2 2 0 01-2 2h-3M8 21H5a2 2 0 01-2-2v-3"/><path d="M7 12h10"/>',
  plus:     '<path d="M12 5v14M5 12h14"/>',
  search:   '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/>',
  home:     '<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  printer:  '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 14h10v7H7z"/>',
  camera:   '<path d="M3 8a2 2 0 012-2h2l2-3h6l2 3h2a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/><circle cx="12" cy="13" r="4"/>',
  pencil:   '<path d="M17 3l4 4L8 20l-5 1 1-5L17 3z"/>',
  trash:    '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  back:     '<path d="M15 5l-7 7 7 7"/>',
  move:     '<path d="M12 3v18M12 3l-4 4M12 3l4 4M12 21l-4-4M12 21l4-4"/>',
  map:      '<path d="M12 21s-7-5.6-7-11a7 7 0 0114 0c0 5.4-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  people:   '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 5a3.5 3.5 0 010 7M15.5 14.5a6.5 6.5 0 016 5.5"/>',
  car:      '<path d="M4 15l1.5-6A2 2 0 017.4 7h9.2a2 2 0 011.9 2L20 15"/><rect x="3" y="15" width="18" height="4" rx="1.5"/><circle cx="7.5" cy="19" r="1"/><circle cx="16.5" cy="19" r="1"/>',
  phone:    '<path d="M5 3h4l2 5-2.5 1.5a12 12 0 006 6L16 13l5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z"/>',
  download: '<path d="M12 3v12M12 15l-4-4M12 15l4-4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>',
  list:     '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.5M3.5 12h.5M3.5 18h.5"/>',
  wifiOff:  '<path d="M2 2l20 20"/><path d="M5 10a12 12 0 016.5-3M16.5 8.5A12 12 0 0119 10M8.5 13.5a7 7 0 013-1.5M15.5 13.5l.5.5"/><path d="M12 18h.01"/>',
  logout:   '<path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4"/><path d="M10 17l5-5-5-5M15 12H3"/>',
  qr:       '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14h1M14 20h1M18 18h3v3h-3z"/>',
};

export function icon(name, size = 20) {
  const paths = ICON_PATHS[name] ?? ICON_PATHS.circle;
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${paths}</svg>`;
}

// ---- Chips ---------------------------------------------------------------------
export function statusChip(status) {
  const meta = STATUSES[status] ?? { tone: "neutral", icon: "circle" };
  return `<span class="chip tone-${meta.tone}">${icon(meta.icon, 14)}${esc(statusLabel(status))}</span>`;
}

export function seasonChip(season) {
  const meta = SEASONS[season] ?? { icon: "circle" };
  return `<span class="chip season-${esc(season)}">${icon(meta.icon, 14)}${esc(seasonLabel(season))}</span>`;
}

export function paymentChip(set) {
  if (set?.fee == null) return "";
  return set.paid
    ? `<span class="chip tone-ok">${icon("check", 14)}Paid</span>`
    : `<span class="chip tone-warn">${icon("alert", 14)}Unpaid</span>`;
}

// ---- Warehouse location -----------------------------------------------------------
// Full structured block: four labeled cells. Used on detail / move / labels.
export function locationBlock(set) {
  if (!hasLocation(set)) {
    return `<div class="loc-block loc-empty">${icon("map", 18)}<span>No location yet</span></div>`;
  }
  return `<div class="loc-block" role="group" aria-label="Warehouse location: ${esc(locationLine(set))}">
    ${locationParts(set).map(({ label, value }) => `
      <div class="loc-cell${value ? "" : " loc-cell-empty"}">
        <span class="loc-label">${label}</span>
        <span class="loc-value">${esc(value || "—")}</span>
      </div>`).join("")}
  </div>`;
}

// Compact two-line variant for list rows: structure preserved, space respected.
export function locationMini(set) {
  if (!hasLocation(set)) return `<div class="loc-mini loc-empty-mini">No location</div>`;
  const parts = locationParts(set).filter((p) => p.value);
  const [first, ...rest] = parts;
  return `<div class="loc-mini" aria-label="${esc(locationLine(set))}">
    <b>${esc(first.label)} ${esc(first.value)}</b>
    ${rest.length ? `<span>${rest.map((p) => `${p.label} ${esc(p.value)}`).join(" · ")}</span>` : ""}
  </div>`;
}

// ---- Toasts (every action gets obvious confirmation) -------------------------------
let toastRoot = null;
function ensureToastRoot() {
  if (!toastRoot) {
    toastRoot = document.createElement("div");
    toastRoot.id = "toasts";
    toastRoot.setAttribute("aria-live", "polite");
    document.body.appendChild(toastRoot);
  }
  return toastRoot;
}

export function toast(message, options = {}) {
  if (typeof options === "string") options = { kind: options }; // legacy call style
  const { kind = "ok", actionLabel, onAction, duration } = options;
  const root = ensureToastRoot();
  while (root.children.length >= 3) root.firstChild.remove();

  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.innerHTML = `
    <span class="toast-ic">${icon(kind === "err" ? "alert" : "check", 16)}</span>
    <span class="toast-msg">${esc(message)}</span>
    ${actionLabel ? `<button class="toast-action" type="button">${esc(actionLabel)}</button>` : ""}`;
  root.appendChild(el);

  const lifetime = duration ?? (actionLabel ? 8000 : 3600);
  const timer = setTimeout(dismiss, lifetime);
  function dismiss() {
    clearTimeout(timer);
    el.classList.add("toast-out");
    setTimeout(() => el.remove(), 200);
  }
  if (actionLabel) {
    el.querySelector(".toast-action").onclick = async () => {
      dismiss();
      try { await onAction?.(); } catch (err) { toast(err.message || "Action failed", "err"); }
    };
  }
  requestAnimationFrame(() => el.classList.add("toast-in"));
  return { dismiss };
}

// ---- Confirmation sheet (mistakes should be hard) ------------------------------------
// Bottom sheet with big thumb-reachable buttons. Returns Promise<boolean>.
export function confirmSheet({ title, body = "", confirmLabel = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "sheet-backdrop";
    wrap.innerHTML = `
      <div class="sheet" role="alertdialog" aria-modal="true" aria-label="${esc(title)}">
        <h2>${esc(title)}</h2>
        ${body ? `<p>${esc(body)}</p>` : ""}
        <div class="sheet-actions">
          <button type="button" class="btn btn-lg ${danger ? "btn-danger" : "btn-primary"}" data-act="yes">${esc(confirmLabel)}</button>
          <button type="button" class="btn btn-lg" data-act="no">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const previouslyFocused = document.activeElement;

    function close(answer) {
      wrap.remove();
      document.removeEventListener("keydown", onKey, true);
      previouslyFocused?.focus?.();
      resolve(answer);
    }
    function onKey(e) {
      if (e.key === "Escape") { e.stopPropagation(); close(false); }
    }
    document.addEventListener("keydown", onKey, true);
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(false); });
    wrap.querySelector('[data-act="yes"]').onclick = () => close(true);
    wrap.querySelector('[data-act="no"]').onclick = () => close(false);
    wrap.querySelector('[data-act="no"]').focus();
  });
}

// ---- Busy buttons (instant feedback on every async action) ----------------------------
export function busy(button, isBusy) {
  if (!button) return;
  button.classList.toggle("is-busy", isBusy);
  button.disabled = isBusy;
}

// ---- Skeleton loaders ---------------------------------------------------------------
export function skeletonRows(count = 5) {
  return `<div class="skel-group" aria-hidden="true">${Array.from({ length: count })
    .map(() => `<div class="skel-row"><div class="skel w-30"></div><div class="skel w-55"></div><div class="skel w-20"></div></div>`)
    .join("")}</div>`;
}

export function skeletonDetail() {
  return `<div class="skel-group" aria-hidden="true">
    <div class="skel skel-title w-40"></div>
    <div class="skel w-70"></div><div class="skel w-55"></div><div class="skel w-65"></div>
  </div>`;
}

// ---- Empty states ----------------------------------------------------------------------
export function emptyState({ iconName = "box", title, body = "", actionHtml = "" }) {
  return `<div class="empty">
    <div class="empty-icon">${icon(iconName, 40)}</div>
    <h3>${esc(title)}</h3>
    ${body ? `<p>${esc(body)}</p>` : ""}
    ${actionHtml}
  </div>`;
}
