// ============================================================================
// scanner.js — camera QR scanning (global Html5Qrcode, loaded in index.html).
// Parsing lives in qr.js; this file only drives the camera and the photo
// fallback. Callbacks receive a parsed result { code, version, checksumOk }.
// ============================================================================
import { parseScan } from "./qr.js";

let active = null;

export { parseScan };

// Start scanning into #<elementId>. Calls onResult(parsed) once, then stops.
export async function start(elementId, onResult, onError) {
  await stop();
  const Html5Qrcode = window.Html5Qrcode;
  if (!Html5Qrcode) {
    onError?.(new Error("Scanner didn't load. Check your connection, then use a photo instead."));
    return;
  }
  active = new Html5Qrcode(elementId, { verbose: false });
  try {
    await active.start(
      { facingMode: "environment" },
      { fps: 12, qrbox: { width: 240, height: 240 } },
      (decodedText) => {
        const parsed = parseScan(decodedText);
        stop();
        onResult(parsed);
      },
      () => {} // per-frame decode misses are normal; ignore
    );
  } catch (err) {
    onError?.(err);
  }
}

// Decode a QR from a photo (native camera → works even where live camera is blocked).
export async function scanFile(file) {
  const Html5Qrcode = window.Html5Qrcode;
  if (!Html5Qrcode) throw new Error("Scanner didn't load.");
  const tmp = document.createElement("div");
  tmp.id = "filescan-" + Date.now();
  tmp.style.display = "none";
  document.body.appendChild(tmp);
  const instance = new Html5Qrcode(tmp.id);
  try {
    const decoded = await instance.scanFile(file, false);
    return parseScan(decoded);
  } finally {
    try { await instance.clear(); } catch { /* already gone */ }
    tmp.remove();
  }
}

export async function stop() {
  if (!active) return;
  try {
    await active.stop();
    await active.clear();
  } catch { /* already stopped */ }
  active = null;
}
