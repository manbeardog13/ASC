// ============================================================================
// qrlabel.js — QR sticker generation + printing, tuned for tire stickers.
// Uses the global `qrcode` (qrcode-generator, loaded in index.html) to render
// an SVG QR of the versioned deep link from qr.js.
//
// Tire labels live a hard life — curved rubber, grease, dust, scuffing — so the
// design favours SCANNABILITY over information density:
//   • error correction "H" (30% recoverable) so a damaged/dirty code still reads
//   • one big dominant QR with a quiet zone, high contrast (pure black on white)
//   • the code in large tabular type as the human-readable backup
//   • only the essentials below (customer · season · location)
// ============================================================================
import { deepLinkFor } from "./qr.js";

const SEASON_LABEL = { winter: "Winter", summer: "Summer", all_season: "All-season" };

// Error correction "H" (30%): a scuffed, greased, curved tire sticker still
// scans even when a chunk is obscured. cellSize kept generous for print sharpness.
export function qrSvg(code, cellSize = 8) {
  const qr = window.qrcode(0, "H");
  qr.addData(deepLinkFor(code));
  qr.make();
  return qr.createSvgTag({ cellSize, margin: 3, scalable: true });
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

function locationLine(set) {
  const parts = [set.zone, set.rack, set.shelf, set.slot].filter(Boolean);
  return parts.length ? parts.join(" · ") : "";
}

// Opens a clean print window with just the sticker and triggers the dialog.
export function printLabel(set) {
  const vehicle = set.vehicle || {};
  const customer = vehicle.customer || {};
  const firstTire = (set.tires || [])[0] || {};
  const spec = [firstTire.size, firstTire.brand].filter(Boolean).join("  ");
  const season = SEASON_LABEL[set.season] || set.season;
  const loc = locationLine(set);

  const win = window.open("", "_blank", "width=440,height=640");
  if (!win) return; // pop-up blocked — caller shows a toast
  win.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>${esc(set.public_code)}</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0}
  body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:16px;color:#000;background:#fff}
  /* Square, rugged sticker. Pure black QR on white = max contrast for readers. */
  .label{width:2.6in;border:3px solid #000;border-radius:18px;padding:14px 14px 12px;text-align:center;overflow:hidden}
  .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
  .brand{font-weight:900;letter-spacing:1px;font-size:15px}
  .season{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;border:1.5px solid #000;border-radius:999px;padding:3px 9px}
  /* QR dominates the sticker — the whole point on a small curved surface. */
  .qr{width:1.9in;height:1.9in;margin:2px auto 8px}
  .qr svg{width:100%;height:100%;display:block}
  .code{font-size:23px;font-weight:900;letter-spacing:.5px;line-height:1;white-space:nowrap;font-variant-numeric:tabular-nums}
  .who{font-size:14px;font-weight:700;margin-top:8px}
  .sub{font-size:11px;color:#333;margin-top:2px;line-height:1.35}
  .loc{margin-top:8px;font-size:14px;font-weight:800;letter-spacing:.5px;border-top:2px dashed #000;padding-top:7px}
  .loc .lk{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#333;display:block;margin-bottom:1px}
  .foot{margin-top:8px;font-size:8.5px;color:#555;letter-spacing:.2px}
  @media print{body{padding:0}.noprint{display:none}}
</style></head><body>
  <div class="label">
    <div class="top"><span class="brand">ASC</span><span class="season">${esc(season)}${set.on_rims ? " · RIMS" : ""}</span></div>
    <div class="qr">${qrSvg(set.public_code)}</div>
    <div class="code">${esc(set.public_code)}</div>
    <div class="who">${esc(customer.name || "—")}</div>
    <div class="sub">${esc([vehicle.make, vehicle.model].filter(Boolean).join(" "))}${vehicle.plate ? " · " + esc(vehicle.plate) : ""}${spec ? "<br>" + esc(spec) : ""} · ${set.quantity} ${set.quantity === 1 ? "tire" : "tires"}</div>
    ${loc ? `<div class="loc"><span class="lk">Lokacija · Location</span>${esc(loc)}</div>` : ""}
    <div class="foot">Scan with any phone camera · ${esc(set.public_code)}</div>
  </div>
  <div class="noprint" style="margin-top:16px;text-align:center">
    <button onclick="window.print()" style="padding:10px 20px;font-size:14px;border-radius:10px;border:0;background:#ff4e1b;color:#fff;font-weight:800;cursor:pointer">Print label</button>
  </div>
  <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script>
</body></html>`);
  win.document.close();
}
