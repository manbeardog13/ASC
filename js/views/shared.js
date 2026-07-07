// ============================================================================
// views/shared.js — view-level building blocks reused across screens.
// ============================================================================
import { esc, statusChip, seasonChip, locationMini, icon } from "../ui.js";
import { TIRE_POSITIONS, COMMON_TIRE_SIZES } from "../domain.js";
import { t, lang } from "../i18n.js";

const locale = () => (lang() === "hr" ? "hr-HR" : "en-GB");

// A tappable storage-set row (dashboard, customer, recycle, search results).
export function setRow(set) {
  const vehicle = set.vehicle || {};
  const customer = vehicle.customer || {};
  const firstTire = (set.tires || [])[0] || {};
  const spec = [firstTire.size, firstTire.brand].filter(Boolean).join(" · ");
  const vehicleLine = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
  return `
    <a class="set-row" href="#/set/${esc(set.public_code)}">
      <div class="body">
        <div class="toprow">
          <span class="code tnum">${esc(set.public_code)}</span>
          ${statusChip(set.status)}${seasonChip(set.season)}
        </div>
        <div class="who">${esc(customer.name || "—")}${vehicle.plate ? ` <span class="plate">· ${esc(vehicle.plate)}</span>` : ""}</div>
        <div class="spec">${esc([vehicleLine, spec].filter(Boolean).join("  ·  ") || "—")}</div>
      </div>
      <div class="loc">${locationMini(set)}</div>
    </a>`;
}

// Editable tire rows for check-in / edit. `existing` prefills; `n` controls count.
export function tireRowsHtml(quantity, existing = []) {
  const n = Math.max(1, Number(quantity) || 4);
  let rows = "";
  for (let i = 0; i < n; i++) {
    const tire = existing[i] || {};
    const pos = tire.position || TIRE_POSITIONS[i] || "";
    rows += `
      <div class="tire-edit-row">
        <div class="tire-grid">
          <select data-t="position" aria-label="${esc(t("tire.pos"))}">
            ${TIRE_POSITIONS.map((p) => `<option value="${p}" ${p === pos ? "selected" : ""}>${p}</option>`).join("")}
          </select>
          <input data-t="size" list="commonSizes" placeholder="225/45R17" value="${esc(tire.size)}" aria-label="${esc(t("tire.size"))}">
          <input data-t="tread_mm" type="number" inputmode="decimal" step="0.1" min="0" placeholder="${esc(t("tire.tread"))}" value="${esc(tire.tread_mm)}" aria-label="${esc(t("tire.tread"))}">
          <input data-t="dot_code" placeholder="DOT 2524" value="${esc(tire.dot_code)}" aria-label="${esc(t("tire.dot"))}">
          <input data-t="brand" placeholder="${esc(t("tire.brand"))}" value="${esc(tire.brand)}" aria-label="${esc(t("tire.brand"))}">
          <label class="switch tire-stud"><input data-t="studded" type="checkbox" ${tire.studded ? "checked" : ""}> ${t("tire.stud")}</label>
        </div>
      </div>`;
  }
  return `<datalist id="commonSizes">${COMMON_TIRE_SIZES.map((s) => `<option value="${s}">`).join("")}</datalist><div class="tire-edit">${rows}</div>`;
}

export function collectTires(container) {
  return [...container.querySelectorAll(".tire-edit-row")].map((row) => {
    const get = (k) => row.querySelector(`[data-t="${k}"]`);
    return {
      position: get("position").value,
      size: get("size").value.trim(),
      brand: get("brand").value.trim(),
      model: "",
      tread_mm: get("tread_mm").value ? Number(get("tread_mm").value) : null,
      dot_code: get("dot_code").value.trim(),
      studded: get("studded").checked,
      condition_notes: "",
    };
  });
}

// Fill the first empty tire row (used by sidewall OCR). Returns the 1-based row #.
export function fillNextTireRow(container, size, dot) {
  const rows = [...container.querySelectorAll(".tire-edit-row")];
  if (!rows.length) return null;
  const target = rows.find((r) => !r.querySelector('[data-t="size"]').value.trim()) || rows[rows.length - 1];
  if (size) target.querySelector('[data-t="size"]').value = size;
  if (dot) target.querySelector('[data-t="dot_code"]').value = dot;
  target.animate?.([{ background: "rgba(255,78,27,.16)" }, { background: "transparent" }], { duration: 1200, easing: "ease" });
  return rows.indexOf(target) + 1;
}

export function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? value + "T00:00:00" : value);
  if (isNaN(d)) return esc(value);
  return d.toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
}

export function timeAgo(value) {
  const d = new Date(value);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return t("time.now");
  if (mins < 60) return t("time.min", { n: mins });
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return t("time.hour", { n: hrs });
  return d.toLocaleDateString(locale(), { day: "numeric", month: "short" });
}

export const iconEl = icon;
