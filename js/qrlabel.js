// ============================================================================
// qrlabel.js — QR sticker generation + printing.
// Uses the global `qrcode` (qrcode-generator, loaded in index.html) to render
// an SVG QR of the versioned deep link from qr.js. The printed label leads with
// the code and a STRUCTURED location (Zone / Rack / Shelf / Slot).
// ============================================================================
import { deepLinkFor } from "./qr.js";

const SEASON_LABEL = { winter: "Winter", summer: "Summer", all_season: "All-season" };

export function qrSvg(code, cellSize = 6) {
  const qr = window.qrcode(0, "M"); // auto type, medium error correction
  qr.addData(deepLinkFor(code));
  qr.make();
  return qr.createSvgTag({ cellSize, margin: 2, scalable: true });
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

function locationCells(set) {
  const parts = [
    ["Zone", set.zone], ["Rack", set.rack], ["Shelf", set.shelf], ["Slot", set.slot],
  ];
  if (!parts.some(([, value]) => value)) return `<div class="noloc">No location assigned</div>`;
  return `<div class="loc">${parts.map(([label, value]) => `
    <div class="cell"><span class="l">${label}</span><span class="v">${esc(value || "—")}</span></div>`
  ).join("")}</div>`;
}

// Opens a clean print window with just the sticker and triggers the dialog.
export function printLabel(set) {
  const vehicle = set.vehicle || {};
  const customer = vehicle.customer || {};
  const firstTire = (set.tires || [])[0] || {};
  const spec = [firstTire.size, firstTire.brand].filter(Boolean).join("  ");
  const season = SEASON_LABEL[set.season] || set.season;

  const win = window.open("", "_blank", "width=460,height=680");
  if (!win) return; // pop-up blocked — caller shows a toast
  win.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>${esc(set.public_code)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;padding:16px;color:#14181d}
  .label{width:3.5in;border:1.5px solid #14181d;border-radius:14px;padding:16px;overflow:hidden}
  .head{display:flex;justify-content:space-between;align-items:baseline}
  .brand{font-weight:800;letter-spacing:.5px;color:#c2410c;font-size:13px}
  .season{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7480}
  .code{font-size:26px;font-weight:800;letter-spacing:.5px;margin:6px 0 12px;font-variant-numeric:tabular-nums}
  .row{display:flex;gap:14px;align-items:flex-start}
  .qr{width:1.6in;height:1.6in;flex:none}.qr svg{width:100%;height:100%}
  .meta{font-size:12.5px;line-height:1.5}.meta b{font-size:13.5px}
  .loc{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:14px}
  .cell{border:1px solid #e3e6ea;border-radius:8px;padding:6px 8px}
  .cell .l{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#6b7480}
  .cell .v{font-size:16px;font-weight:800;font-variant-numeric:tabular-nums}
  .noloc{margin-top:14px;font-size:12px;color:#6b7480}
  .foot{margin-top:12px;font-size:9.5px;color:#98a1ab}
  @media print{body{padding:0}.noprint{display:none}}
</style></head><body>
  <div class="label">
    <div class="head"><span class="brand">ASC · TIRE HOTEL</span><span class="season">${esc(season)}${set.on_rims ? " · on rims" : ""}</span></div>
    <div class="code">${esc(set.public_code)}</div>
    <div class="row">
      <div class="qr">${qrSvg(set.public_code)}</div>
      <div class="meta">
        <b>${esc(customer.name || "—")}</b><br>
        ${esc([vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" "))}<br>
        ${vehicle.plate ? "Plate <b>" + esc(vehicle.plate) + "</b><br>" : ""}
        ${spec ? esc(spec) + "<br>" : ""}${set.quantity} tires
      </div>
    </div>
    ${locationCells(set)}
    <div class="foot">Scan with any phone camera to open this record.</div>
  </div>
  <div class="noprint" style="margin-top:16px">
    <button onclick="window.print()" style="padding:9px 18px;font-size:14px;border-radius:8px;border:1px solid #14181d;background:#c2410c;color:#fff;font-weight:700;cursor:pointer">Print label</button>
  </div>
  <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script>
</body></html>`);
  win.document.close();
}
