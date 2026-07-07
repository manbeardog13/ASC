// ============================================================================
// views/scan.js — "Find a tire set." Scan first: live camera, then a native
// photo, then a typed code. Every workflow can start here.
// ============================================================================
import * as scanner from "../scanner.js";
import { icon, esc, toast, go } from "../ui.js";
import { t } from "../i18n.js";

export async function render(main) {
  main.innerHTML = `
    <a class="btn btn-ghost scan-back" href="#/" style="margin-bottom:12px;min-height:44px">${icon("back", 18)} ${t("common.menu")}</a>
    <header class="view-stage"><div><span class="vs-k">${t("view.ctx")}</span><h1>${t("scan.title")}</h1></div></header>
    <div class="card center-narrow" style="text-align:center">
      <p class="muted">${t("scan.point")}</p>
      <div class="scan-view">
        <div id="reader"></div>
        <p class="scan-hint">${t("scan.tip")}</p>
      </div>
      <p id="scanErr" class="inline-err hidden" role="alert" style="justify-content:center"></p>

      <div style="margin:12px 0 4px">
        <button type="button" id="photoBtn" class="btn" style="min-height:44px">${icon("camera", 18)} ${t("scan.takePhoto")}</button>
        <input id="photo" type="file" accept="image/*" capture="environment" hidden>
      </div>

      <div class="search-wrap dash-search" style="margin:14px 0 0">
        ${icon("qr", 20)}
        <input id="manual" placeholder="${esc(t("scan.orType"))}" aria-label="${esc(t("scan.orType"))}" autocomplete="off" style="padding-left:42px">
      </div>
      <button id="openManual" class="btn btn-block" style="margin-top:10px">${t("scan.open")}</button>
    </div>`;

  const showErr = (msg) => { const p = main.querySelector("#scanErr"); p.textContent = msg; p.classList.remove("hidden"); };
  const clearErr = () => main.querySelector("#scanErr")?.classList.add("hidden");
  let navigated = false;   // one scan → one navigation, whatever the source
  const handle = (parsed) => {
    if (navigated) return;
    if (!parsed?.valid || !parsed?.code) return showErr(t("scan.notAsc"));
    if (parsed.checksumOk === false) toast(t("scan.checksum"), "err");
    navigated = true;
    go(`/set/${encodeURIComponent(parsed.code)}`);
  };

  scanner.start("reader", handle, (err) => showErr(t("scan.cameraUnavail", { err: err.message || err })));

  main.querySelector("#photoBtn").onclick = () => main.querySelector("#photo").click();
  main.querySelector("#photo").onchange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try { handle(await scanner.scanFile(file)); }
    catch (err) { showErr(t("scan.photoFail", { err: err.message || err })); }
  };
  const openManual = () => {
    clearErr();
    const raw = main.querySelector("#manual").value.trim();
    if (raw) handle(scanner.parseScan(raw, { typed: true }));   // accept partials
  };
  main.querySelector("#openManual").onclick = openManual;
  main.querySelector("#manual").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); openManual(); }
  });

  // Stop the camera on ANY exit path — nav (hashchange) but also sign-out,
  // access gate and language change, which swap the view without a hashchange.
  const cleanup = () => {
    scanner.stop();
    window.removeEventListener("hashchange", cleanup);
    window.removeEventListener("asc:teardown", cleanup);
  };
  window.addEventListener("hashchange", cleanup);
  window.addEventListener("asc:teardown", cleanup);
}
