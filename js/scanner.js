// ============================================================================
// scanner.js — camera QR scanning (global Html5Qrcode, loaded in index.html).
// Parsing lives in qr.js; this file only drives the camera and the photo
// fallback. Callbacks receive a parsed result { code, version, checksumOk }.
// ============================================================================
import { parseScan } from "./qr.js";

let active = null;
let starting = null;   // camera warm-up in flight — stop() must wait for it

export { parseScan };

// Start scanning into #<elementId>. Calls onResult(parsed) once, then stops.
export async function start(elementId, onResult, onError) {
  await stop();
  const Html5Qrcode = window.Html5Qrcode;
  if (!Html5Qrcode) {
    onError?.(new Error("Scanner didn't load. Check your connection, then use a photo instead."));
    return;
  }
  const inst = new Html5Qrcode(elementId, { verbose: false });
  active = inst;
  let handled = false;   // html5-qrcode can fire the success cb several times in
                         // a row on a held code — accept exactly the first.
  starting = (async () => {
    try {
      await inst.start(
        { facingMode: "environment" },
        { fps: 12, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          if (handled) return;
          handled = true;
          const parsed = parseScan(decodedText);
          stop();
          onResult(parsed);
        },
        () => {} // per-frame decode misses are normal; ignore
      );
    } catch (err) {
      onError?.(err);
    }
  })();
  await starting;
  starting = null;
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
  // A stop issued mid-warm-up used to lose the stream handle and leave the
  // camera light on — wait for the start to finish, THEN tear it down.
  if (starting) { try { await starting; } catch { /* start failed — fine */ } }
  if (!active) return;
  const inst = active;
  active = null;
  try {
    await inst.stop();
    await inst.clear();
  } catch { /* already stopped */ }
}
