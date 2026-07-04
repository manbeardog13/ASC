// ============================================================================
// views/scan.js — "Find a tire set." Scan first: live camera, then a native
// photo, then a typed code. Every workflow can start here.
// ============================================================================
import * as scanner from "../scanner.js";
import { icon, esc, toast, go } from "../ui.js";

export async function render(main) {
  main.innerHTML = `
    <div class="card center-narrow" style="text-align:center">
      <h1>Scan a label</h1>
      <p class="muted" style="margin-top:6px">Point the camera at a set's QR sticker.</p>
      <div id="reader" style="max-width:320px;margin:16px auto;border-radius:14px;overflow:hidden"></div>
      <p id="scanErr" class="inline-err hidden" style="justify-content:center"></p>

      <div style="margin:8px 0 4px">
        <label class="btn" for="photo" style="min-height:44px">${icon("camera", 18)} Take a photo instead</label>
        <input id="photo" type="file" accept="image/*" capture="environment" hidden>
      </div>

      <div class="search-wrap" style="margin-top:14px">
        ${icon("qr", 20)}
        <input id="manual" placeholder="…or type a code (ASC-2026-0042)" autocomplete="off" style="padding-left:42px">
      </div>
      <button id="openManual" class="btn btn-block" style="margin-top:10px">Open</button>
      <p class="muted" style="font-size:12.5px;margin-top:14px">Tip: a phone's built-in Camera app scans the sticker too — it opens the record automatically.</p>
    </div>`;

  const showErr = (msg) => { const p = main.querySelector("#scanErr"); p.textContent = msg; p.classList.remove("hidden"); };

  const handle = (parsed) => {
    if (!parsed?.code) return showErr("Couldn't read a code. Try a photo or type it in.");
    if (parsed.checksumOk === false) toast("Sticker checksum didn't match — double-check it's the right label.", "err");
    go(`/set/${encodeURIComponent(parsed.code)}`);
  };

  scanner.start("reader", handle, (err) =>
    showErr(`Live camera unavailable: ${err.message || err}. Use “Take a photo” or type the code.`));

  main.querySelector("#photo").onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { handle(await scanner.scanFile(file)); }
    catch (err) { showErr(`Couldn't read that photo: ${err.message || err}`); }
  };
  main.querySelector("#openManual").onclick = () => {
    const raw = main.querySelector("#manual").value.trim();
    if (raw) handle(scanner.parseScan(raw));
  };

  // Stop the camera when leaving this screen.
  const cleanup = () => { scanner.stop(); window.removeEventListener("hashchange", cleanup); };
  window.addEventListener("hashchange", cleanup);
}
