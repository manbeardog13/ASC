// ============================================================================
// views/scan.js — "Find a tire set." Scan first: live camera, then a native
// photo, then a typed code. Every workflow can start here.
// ============================================================================
import * as scanner from "../scanner.js";
import { icon, esc, toast, go } from "../ui.js";
import { t } from "../i18n.js";

export async function render(main) {
  main.innerHTML = `
    <div class="card center-narrow" style="text-align:center">
      <h1>${t("scan.title")}</h1>
      <p class="muted" style="margin-top:6px">${t("scan.point")}</p>
      <div id="reader" style="max-width:320px;margin:16px auto;border-radius:14px;overflow:hidden"></div>
      <p id="scanErr" class="inline-err hidden" style="justify-content:center"></p>

      <div style="margin:8px 0 4px">
        <label class="btn" for="photo" style="min-height:44px">${icon("camera", 18)} ${t("scan.takePhoto")}</label>
        <input id="photo" type="file" accept="image/*" capture="environment" hidden>
      </div>

      <div class="search-wrap" style="margin-top:14px">
        ${icon("qr", 20)}
        <input id="manual" placeholder="${esc(t("scan.orType"))}" autocomplete="off" style="padding-left:42px">
      </div>
      <button id="openManual" class="btn btn-block" style="margin-top:10px">${t("scan.open")}</button>
      <p class="muted" style="font-size:12.5px;margin-top:14px">${t("scan.tip")}</p>
    </div>`;

  const showErr = (msg) => { const p = main.querySelector("#scanErr"); p.textContent = msg; p.classList.remove("hidden"); };
  const handle = (parsed) => {
    if (!parsed?.code) return showErr(t("scan.cantRead"));
    if (parsed.checksumOk === false) toast(t("scan.checksum"), "err");
    go(`/set/${encodeURIComponent(parsed.code)}`);
  };

  scanner.start("reader", handle, (err) => showErr(t("scan.cameraUnavail", { err: err.message || err })));

  main.querySelector("#photo").onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { handle(await scanner.scanFile(file)); }
    catch (err) { showErr(t("scan.photoFail", { err: err.message || err })); }
  };
  main.querySelector("#openManual").onclick = () => {
    const raw = main.querySelector("#manual").value.trim();
    if (raw) handle(scanner.parseScan(raw));
  };

  const cleanup = () => { scanner.stop(); window.removeEventListener("hashchange", cleanup); };
  window.addEventListener("hashchange", cleanup);
}
