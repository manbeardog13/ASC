// ============================================================================
// QR label generation + printing.
// Uses the global `qrcode` from qrcode-generator (loaded in index.html).
// Each label encodes a deep-link URL so a plain phone-camera scan opens the
// record directly: <APP_BASE_URL>#/set/<code>
// ============================================================================
import { config } from "./config.js";

export function deepLinkFor(code) {
  const base = config.APP_BASE_URL.endsWith("/")
    ? config.APP_BASE_URL
    : config.APP_BASE_URL + "/";
  return `${base}#/set/${code}`;
}

// Returns an <svg> string for the QR of a set's deep link.
export function qrSvg(code, cellSize = 5) {
  const qr = window.qrcode(0, "M"); // type auto, medium error correction
  qr.addData(deepLinkFor(code));
  qr.make();
  return qr.createSvgTag({ cellSize, margin: 2, scalable: true });
}

// Opens a clean print window containing just the sticker(s) and triggers print.
// `set` is a full set record (with vehicle.customer and tires) from getSetByCode.
export function printLabel(set) {
  const v = set.vehicle || {};
  const c = v.customer || {};
  const loc = [set.zone, set.rack, set.shelf, set.slot].filter(Boolean).join("-") || "—";
  const firstTire = (set.tires || [])[0] || {};
  const specLine =
    [firstTire.size, firstTire.brand].filter(Boolean).join("  ") || "";
  const seasonLabel = { winter: "Winter", summer: "Summer", all_season: "All-season" }[set.season] || set.season;

  const win = window.open("", "_blank", "width=460,height=640");
  win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${set.public_code} label</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 16px; }
  .label { width: 3.5in; border: 2px solid #111; border-radius: 10px; padding: 14px 16px; }
  .code { font-size: 22px; font-weight: 800; letter-spacing: 1px; }
  .season { display:inline-block; margin-top:4px; padding:2px 8px; border-radius:6px;
            background:#111; color:#fff; font-size:12px; font-weight:700; text-transform:uppercase; }
  .row { display:flex; gap:14px; align-items:center; margin-top:10px; }
  .qr { width: 1.5in; height: 1.5in; flex: none; }
  .qr svg { width:100%; height:100%; }
  .meta { font-size: 13px; line-height: 1.5; }
  .meta b { font-size: 14px; }
  .loc { margin-top:10px; font-size: 15px; }
  .loc span { font-weight: 800; }
  .foot { margin-top:8px; font-size: 10px; color:#666; }
  @media print { body { padding: 0; } .noprint { display:none; } }
</style></head>
<body>
  <div class="label">
    <div class="code">${set.public_code}</div>
    <div class="season">${seasonLabel}${set.on_rims ? " · on rims" : ""}</div>
    <div class="row">
      <div class="qr">${qrSvg(set.public_code, 6)}</div>
      <div class="meta">
        <b>${escapeHtml(c.name || "—")}</b><br>
        ${escapeHtml([v.make, v.model].filter(Boolean).join(" ") || "")}<br>
        ${v.plate ? "Plate: <b>" + escapeHtml(v.plate) + "</b><br>" : ""}
        ${specLine ? escapeHtml(specLine) + "<br>" : ""}
        Qty: ${set.quantity}
      </div>
    </div>
    <div class="loc">Location: <span>${escapeHtml(loc)}</span></div>
    <div class="foot">Scan with any phone camera to open this record · ASC Tire Hotel</div>
  </div>
  <div class="noprint" style="margin-top:16px">
    <button onclick="window.print()" style="padding:8px 16px;font-size:14px">Print</button>
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 300);<\/script>
</body></html>`);
  win.document.close();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}
