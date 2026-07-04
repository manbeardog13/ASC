// ============================================================================
// Camera QR scanning, using the global Html5Qrcode (loaded in index.html).
// Extracts the set code from whatever the QR contains (a deep-link URL or a
// raw code) and hands it back to the caller.
// ============================================================================

let active = null;

// Pull "ASC-2026-0042" out of a scanned string, whether it's a full URL
// (…#/set/ASC-2026-0042) or just the bare code.
export function extractCode(text) {
  if (!text) return null;
  const marker = "#/set/";
  const i = text.indexOf(marker);
  if (i !== -1) return decodeURIComponent(text.slice(i + marker.length).split(/[?#]/)[0]).trim();
  const m = text.match(/ASC-\d{4}-\d+/i);
  if (m) return m[0].toUpperCase();
  return text.trim();
}

// Start scanning into element #<elementId>. Calls onCode(code) once, then stops.
export async function start(elementId, onCode, onError) {
  await stop();
  const Html5Qrcode = window.Html5Qrcode;
  if (!Html5Qrcode) {
    onError?.(new Error("Scanner library failed to load. Check your connection."));
    return;
  }
  active = new Html5Qrcode(elementId, { verbose: false });
  const config = { fps: 10, qrbox: { width: 240, height: 240 } };
  try {
    await active.start(
      { facingMode: "environment" },
      config,
      (decodedText) => {
        const code = extractCode(decodedText);
        stop();
        onCode(code);
      },
      () => {} // per-frame decode failures are normal; ignore
    );
  } catch (err) {
    onError?.(err);
  }
}

// Decode a QR from a photo/image the user just took or picked. This is the
// universal fallback: it uses the phone's NATIVE camera (via a file input),
// so it works even where live getUserMedia is blocked (iOS Chrome, some iOS
// standalone cases). Returns the extracted code, or throws if none is found.
export async function scanFile(file) {
  const Html5Qrcode = window.Html5Qrcode;
  if (!Html5Qrcode) throw new Error("Scanner library not loaded.");
  const tmp = document.createElement("div");
  tmp.id = "filescan-" + Date.now();
  tmp.style.display = "none";
  document.body.appendChild(tmp);
  const inst = new Html5Qrcode(tmp.id);
  try {
    const decoded = await inst.scanFile(file, false);
    return extractCode(decoded);
  } finally {
    try {
      await inst.clear();
    } catch (_) {
      /* ignore */
    }
    tmp.remove();
  }
}

export async function stop() {
  if (!active) return;
  try {
    await active.stop();
    await active.clear();
  } catch (_) {
    /* already stopped */
  }
  active = null;
}
