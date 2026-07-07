// ============================================================================
// ui.js — shared UI primitives. Rendering helpers only; no business rules
// (those live in domain.js) and no database calls (db.js).
// ============================================================================
import { STATUSES, SEASONS, statusLabel, seasonLabel, locationParts, hasLocation, locationLine } from "./domain.js";
import { t } from "./i18n.js";

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
// One drawing language across the set: rounded geometric silhouettes, generous
// corner radii, deliberate stroke gaps, and tiny "node" dots (status LEDs, scan
// endpoints, list bullets) for a quiet futuristic feel. Dots are drawn as
// zero-length paths — round linecaps render them as perfect points.
const ICON_PATHS = {
  box:      '<path d="M12 2.8l8.6 4.7v9L12 21.2l-8.6-4.7v-9L12 2.8z"/><path d="M3.7 7.8L12 12.3l8.3-4.5"/><path d="M12 12.3V21"/>',
  clock:    '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.2V12l3.2 2"/>',
  check:    '<path d="M4.5 12.8l5 5L19.5 6.6"/>',
  alert:    '<path d="M10.3 4.2L2.9 17a2 2 0 001.7 3h14.8a2 2 0 001.7-3L13.7 4.2a2 2 0 00-3.4 0z"/><path d="M12 9.5v4.2"/><path d="M12 17.1v.01"/>',
  snow:     '<path d="M12 2.8v18.4M4 7.4l16 9.2M20 7.4L4 16.6"/>',
  sun:      '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/>',
  circle:   '<circle cx="12" cy="12" r="8.6"/>',
  scan:     '<path d="M4 8.2V6.4A2.4 2.4 0 016.4 4h1.8M15.8 4h1.8A2.4 2.4 0 0120 6.4v1.8M20 15.8v1.8a2.4 2.4 0 01-2.4 2.4h-1.8M8.2 20H6.4A2.4 2.4 0 014 17.6v-1.8"/><path d="M7.2 12h6.6"/><path d="M16.8 12h.01"/>',
  plus:     '<path d="M12 5.4v13.2M5.4 12h13.2"/>',
  search:   '<circle cx="11" cy="11" r="6.8"/><path d="M20.6 20.6L16 16"/><path d="M8.2 11a2.8 2.8 0 012.8-2.8"/>',
  home:     '<path d="M4.2 10.6L12 4l7.8 6.6"/><path d="M5.8 9.4V19a2 2 0 002 2h8.4a2 2 0 002-2V9.4"/><path d="M12 21v-4.2"/>',
  printer:  '<path d="M7.4 8V4.4h9.2V8"/><rect x="3.4" y="8" width="17.2" height="8.6" rx="2.2"/><path d="M7.4 14h9.2v6.6H7.4z"/><path d="M17.2 11.2h.01"/>',
  camera:   '<path d="M3.4 8.6a2.2 2.2 0 012.2-2.2h2l1.8-2.6h5.2l1.8 2.6h2a2.2 2.2 0 012.2 2.2V18a2.2 2.2 0 01-2.2 2.2H5.6A2.2 2.2 0 013.4 18V8.6z"/><circle cx="12" cy="13" r="3.6"/><path d="M17.8 9.2h.01"/>',
  pencil:   '<path d="M16.8 3.6l3.6 3.6L8.6 19 4 20l1-4.6L16.8 3.6z"/><path d="M14.6 5.8l3.6 3.6"/>',
  trash:    '<path d="M4 7h16"/><path d="M9.4 7V4.6h5.2V7"/><path d="M6 7l.8 12a2 2 0 002 1.9h6.4a2 2 0 002-1.9L18 7"/><path d="M10 11v6M14 11v6"/>',
  back:     '<path d="M14.6 5.4L8 12l6.6 6.6"/>',
  move:     '<path d="M12 3.4v17.2M8.6 6.4L12 3.4l3.4 3M8.6 17.6l3.4 3 3.4-3"/>',
  map:      '<path d="M12 21.2s-7-5.5-7-11a7 7 0 0114 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.4"/>',
  people:   '<circle cx="9" cy="7.8" r="3.6"/><path d="M2.8 20.2a6.6 6.6 0 0112.4 0"/><path d="M15.8 4.6a3.6 3.6 0 010 6.6M16.4 14.4a6.6 6.6 0 014.8 5.8"/>',
  car:      '<path d="M4.6 14.6l1.4-5.2a2 2 0 011.9-1.5h8.2a2 2 0 011.9 1.5l1.4 5.2"/><rect x="3.4" y="14.6" width="17.2" height="4.2" rx="1.8"/><path d="M7.4 18.8v1.4M16.6 18.8v1.4"/><path d="M7.6 16.7h.01M16.4 16.7h.01"/>',
  phone:    '<path d="M5.2 3.4h3.4l1.8 4.6-2.3 1.5a11.8 11.8 0 005.4 5.4l1.5-2.3 4.6 1.8v3.4a2 2 0 01-2.2 2A15.8 15.8 0 013.2 5.6a2 2 0 012-2.2z"/>',
  download: '<path d="M12 3.4v11.2M7.8 10.6l4.2 4 4.2-4"/><path d="M4 17v1.6A2.4 2.4 0 006.4 21h11.2a2.4 2.4 0 002.4-2.4V17"/>',
  list:     '<path d="M8.6 6.4H21M8.6 12H21M8.6 17.6H21"/><path d="M3.6 6.4h.01M3.6 12h.01M3.6 17.6h.01"/>',
  wifiOff:  '<path d="M3 3l18 18"/><path d="M5.4 9.8a12 12 0 016-2.8M16.2 8.4a12 12 0 012.4 1.4M8.6 13.2a7.4 7.4 0 013-1.4M14.8 13l.6.4"/><path d="M12 17.8h.01"/>',
  logout:   '<path d="M14.6 4.4h3a2 2 0 012 2v11.2a2 2 0 01-2 2h-3"/><path d="M10.2 16.4L5.8 12l4.4-4.4M5.8 12h9.6"/>',
  qr:       '<rect x="3.4" y="3.4" width="6.6" height="6.6" rx="1.6"/><rect x="14" y="3.4" width="6.6" height="6.6" rx="1.6"/><rect x="3.4" y="14" width="6.6" height="6.6" rx="1.6"/><path d="M14 14h2.8v2.8H14zM20.6 14.2v.01M14.2 20.6v.01M17.8 17.8h2.8v2.8h-2.8z"/>',
  // The ASC Agent — the AI sparkle, with a companion node.
  agent:    '<path d="M12 3.4Q13.4 9.6 20.6 12 13.4 14.4 12 20.6 10.6 14.4 3.4 12 10.6 9.6 12 3.4Z"/><path d="M19 4.4v.01"/>',
  mic:      '<rect x="8.8" y="3.2" width="6.4" height="11" rx="3.2"/><path d="M5.4 11.6a6.6 6.6 0 0013.2 0"/><path d="M12 18.2v2.6"/>',
  sound:    '<path d="M11.6 5.6L7.4 9.2H5a1 1 0 00-1 1v3.6a1 1 0 001 1h2.4l4.2 3.6V5.6z"/><path d="M15.4 9.2a4 4 0 010 5.6"/><path d="M18.2 6.6a8 8 0 010 10.8"/>',
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
export function confirmSheet({ title, body = "", confirmLabel = t("common.confirm"), danger = false }) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "sheet-backdrop";
    wrap.innerHTML = `
      <div class="sheet" role="alertdialog" aria-modal="true" aria-label="${esc(title)}">
        <h2>${esc(title)}</h2>
        ${body ? `<p>${esc(body)}</p>` : ""}
        <div class="sheet-actions">
          <button type="button" class="btn btn-lg ${danger ? "btn-danger" : "btn-primary"}" data-act="yes">${esc(confirmLabel)}</button>
          <button type="button" class="btn btn-lg" data-act="no">${esc(t("common.cancel"))}</button>
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

// iOS paints the status-bar / Dynamic-Island surround with <meta name="theme-color">.
// It's static HTML, so the app must retint it whenever the manual theme flips.
export function setThemeColor(dark) {
  let m = document.querySelector('meta[name="theme-color"]');
  if (!m) { m = document.createElement("meta"); m.name = "theme-color"; document.head.appendChild(m); }
  m.setAttribute("content", dark ? "#020305" : "#edf0f5");
}
