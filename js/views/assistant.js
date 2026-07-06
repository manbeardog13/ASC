// ============================================================================
// views/assistant.js — the in-app AI assistant ("Pomoćnik"). Bilingual chat
// over the live database: ask anything (it reads via tools under YOUR session,
// so RLS applies), or dictate a new tire set — the agent fills the fields and
// pops a review card; nothing is written until the user confirms.
// ============================================================================
import * as db from "../db.js";
import { getState } from "../store.js";
import { icon, esc, toast, busy } from "../ui.js";
import { t } from "../i18n.js";
import { seasonLabel } from "../domain.js";
import { voiceSupported, listenOnce, stopListening, ttsSupported, speak, stopSpeaking } from "../voice.js";
import { runTurn, draftToForm } from "../agent.js";

let history = [];        // Anthropic messages[] — survives view remounts in-session
let ttsOn = (() => { try { return localStorage.getItem("asc.agentTts") !== "0"; } catch { return true; } })();

export function allowedAgent(profile) {
  if (!profile) return true;
  return profile.role !== "readonly";
}

export async function render(main) {
  if (!allowedAgent(getState().profile)) { toast(t("ws.denied"), "err"); location.hash = "#/"; return; }
  const mic = voiceSupported();
  main.innerHTML = `
    <div class="ag">
      <div class="ws-head">
        <h1 class="ws-title">${icon("agent", 24)} ${t("ag.title")}</h1>
        <div class="ag-head-actions">
          ${ttsSupported() ? `<button id="agTts" class="btn btn-ghost" aria-pressed="${ttsOn}" title="${esc(t("ag.speakToggle"))}">${icon("sound", 18)} ${ttsOn ? t("ag.speakOn") : t("ag.speakOff")}</button>` : ""}
          <button id="agReset" class="btn btn-ghost" title="${esc(t("ag.newChat"))}">${icon("trash", 18)}</button>
        </div>
      </div>
      <div id="agLog" class="ag-log" aria-live="polite"></div>
      <div id="agChips" class="ag-chips">
        <button class="u-row" data-chip>${esc(t("ag.suggest1"))}</button>
        <button class="u-row" data-chip>${esc(t("ag.suggest2"))}</button>
        <button class="u-row" data-chip>${esc(t("ag.suggest3"))}</button>
      </div>
      <form id="agForm" class="ag-inputrow" autocomplete="off">
        ${mic ? `<button type="button" id="agMic" class="ag-mic" aria-label="${esc(t("ws.voiceFind"))}">${icon("mic", 20)}</button>` : ""}
        <input id="agInput" placeholder="${esc(t("ag.placeholder"))}" autocomplete="off">
        <button type="submit" id="agSend" class="btn btn-primary">${t("ag.send")}</button>
      </form>
    </div>`;

  const log = main.querySelector("#agLog");
  const input = main.querySelector("#agInput");
  const chips = main.querySelector("#agChips");

  const bubble = (who, text, cls = "") => {
    const el = document.createElement("div");
    el.className = `ag-msg is-${who}${cls ? " " + cls : ""}`;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };

  // Replay a conversation that's already in progress; otherwise greet.
  if (!history.length) bubble("bot", t("ag.hello"));
  else for (const m of history) {
    if (m.role === "user" && typeof m.content === "string") bubble("me", m.content);
    if (m.role === "assistant" && Array.isArray(m.content)) {
      const txt = m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      if (txt) bubble("bot", txt);
    }
  }

  let running = false;
  const send = async (text) => {
    const msg = (text || "").trim();
    if (!msg || running) return;
    running = true;
    chips.hidden = true;
    input.value = "";
    stopSpeaking();
    bubble("me", msg);
    const thinking = bubble("bot", t("ag.thinking"), "is-busy");
    history.push({ role: "user", content: msg });
    try {
      const reply = await runTurn(history, {
        onToolUse: (name) => { thinking.textContent = t("ag.working"); },
        onDraftReview: (draft) => reviewDraft(draft),
      });
      thinking.remove();
      bubble("bot", reply || "…");
      if (ttsOn) speak(reply);
    } catch (err) {
      // Drop the failed user turn so a retry doesn't double it.
      while (history.length && history[history.length - 1].role !== "user") history.pop();
      history.pop();
      thinking.remove();
      bubble("bot", err.message, "is-err");
    } finally {
      running = false;
    }
  };

  main.querySelector("#agForm").onsubmit = (e) => { e.preventDefault(); send(input.value); };
  chips.querySelectorAll("[data-chip]").forEach((b) => b.onclick = () => send(b.textContent));
  main.querySelector("#agReset").onclick = () => { history = []; stopSpeaking(); render(main); };

  const ttsBtn = main.querySelector("#agTts");
  if (ttsBtn) ttsBtn.onclick = () => {
    ttsOn = !ttsOn;
    if (!ttsOn) stopSpeaking();
    try { localStorage.setItem("asc.agentTts", ttsOn ? "1" : "0"); } catch { /* private mode */ }
    ttsBtn.setAttribute("aria-pressed", String(ttsOn));
    ttsBtn.innerHTML = `${icon("sound", 18)} ${ttsOn ? t("ag.speakOn") : t("ag.speakOff")}`;
  };

  const micBtn = main.querySelector("#agMic");
  if (micBtn) micBtn.onclick = async () => {
    if (micBtn.classList.contains("is-listening")) { stopListening(); return; }
    micBtn.classList.add("is-listening");
    const old = input.placeholder;
    input.placeholder = t("voice.listening");
    try {
      const heard = await listenOnce({ onInterim: (s) => { input.value = s; } });
      if (heard) send(heard);
    } catch (err) { toast(err.message, "err"); }
    finally { micBtn.classList.remove("is-listening"); input.placeholder = old; }
  };

  // ---- The review card: agent's draft → human confirms → DB write -------------
  function reviewDraft(draft) {
    return new Promise((resolve) => {
      const form = draftToForm(draft);
      const rows = [
        [t("ci.name"), form.customer.name],
        [t("ci.phone"), form.customer.phone],
        [t("ci.plate"), form.vehicle.plate],
        [t("ci.vehicle"), [form.vehicle.year, form.vehicle.make, form.vehicle.model].filter(Boolean).join(" ")],
        [t("ci.season"), seasonLabel(form.set.season)],
        [t("ci.qty"), String(form.set.quantity)],
        [t("tire.size"), form.tires[0]?.size],
        [t("ci.location"), [form.set.zone, form.set.rack, form.set.shelf, form.set.slot].filter(Boolean).join(" · ")],
        [t("ci.expectedPickup"), form.set.expected_out_date],
        [t("ci.fee"), form.set.fee != null ? String(form.set.fee) : ""],
        [t("ci.notes"), form.set.notes],
      ].filter(([, v]) => v);

      const wrap = document.createElement("div");
      wrap.className = "sheet-backdrop";
      wrap.innerHTML = `
        <div class="sheet ag-review" role="dialog" aria-modal="true" aria-label="${esc(t("ag.reviewTitle"))}">
          <h2>${icon("box", 20)} ${t("ag.reviewTitle")}</h2>
          <div class="ag-review-rows">
            ${rows.map(([k, v]) => `<div class="ag-rrow"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}
          </div>
          <div class="sheet-actions">
            <button class="btn btn-primary" id="agOk">${icon("check", 18)} ${t("ag.confirmCreate")}</button>
            <button class="btn" id="agNo">${t("common.cancel")}</button>
          </div>
        </div>`;
      document.body.appendChild(wrap);
      if (ttsOn) speak(`${t("ag.reviewTitle")}. ${rows.map(([k, v]) => `${k}: ${v}`).join(". ")}`);

      const done = (val) => { stopSpeaking(); wrap.remove(); resolve(val); };
      wrap.querySelector("#agNo").onclick = () => done({ confirmed: false });
      wrap.addEventListener("click", (e) => { if (e.target === wrap) done({ confirmed: false }); });
      wrap.querySelector("#agOk").onclick = async (e) => {
        busy(e.currentTarget, true);
        try {
          const code = await db.createStorageSet(form);
          toast(t("ci.stored", { code }));
          done({ confirmed: true, code });
        } catch (err) {
          toast(err.message, "err");
          done({ confirmed: false });
        }
      };
    });
  }

  setTimeout(() => input?.focus({ preventScroll: true }), 60);
}
