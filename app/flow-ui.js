import { t } from "../js/i18n.js";

export { t };

export function toast(msg) {
  if (typeof window.ascToast === "function") { window.ascToast(msg); return; }
  const el = document.getElementById("toast");
  const span = document.getElementById("toastMsg");
  if (!el || !span) return;
  span.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove("show"), 3400);
}

export function el(tag, attrs, text) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "class") node.className = value;
      else if (value != null) node.setAttribute(key, value);
    }
  }
  if (text != null) node.textContent = text;
  return node;
}

export function button(label, className, onClick) {
  const node = el("button", { class: className || "btn", type: "button" }, label);
  node.addEventListener("click", onClick);
  return node;
}

export function field(label, input) {
  const wrap = el("label", { class: "field" });
  wrap.append(el("span", { class: "label" }, label), input);
  return wrap;
}

export function input(attrs) {
  return el("input", attrs);
}

export function queryParam(name) {
  return new URLSearchParams(location.search).get(name) || "";
}

export function slotFromHash() {
  const match = location.hash.match(/#\/slot\/([^/?#]+)/i);
  if (!match) return queryParam("slot").toUpperCase();
  try { return decodeURIComponent(match[1]).toUpperCase(); }
  catch { return match[1].toUpperCase(); }
}

export function whereText(loc) {
  if (!loc) return "";
  const parts = [loc.zone, loc.rack, loc.shelf, loc.slot].filter((part) => part != null && part !== "");
  const place = parts.join(" · ");
  return loc.qr_code ? (place ? `${place} · ${loc.qr_code}` : loc.qr_code) : place;
}

export function scanText(hostId, onText) {
  const host = document.getElementById(hostId);
  if (!host || !window.ASCQR) {
    toast(t("flow.camera"));
    return;
  }
  window.ASCQR.scanInto(hostId, (_code, text) => onText(String(text || "")), () => toast(t("flow.camera")));
}

export function photoFallback(onText) {
  const file = el("input", { type: "file", accept: "image/*", capture: "environment" });
  file.hidden = true;
  document.body.appendChild(file);
  const trigger = button(t("scan.takePhoto"), "btn ghost", () => file.click());
  file.addEventListener("change", () => {
    const picked = file.files && file.files[0];
    file.value = "";
    if (!picked || !window.ASCQR) return;
    window.ASCQR.scanFile(picked).then(() => {
      const text = window.ASCQR.lastScan || "";
      onText(text);
    }, () => toast(t("flow.camera")));
  });
  return trigger;
}
