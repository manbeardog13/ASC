// ============================================================================
// voice.js — Croatian-first speech-to-text (Web Speech API).
// Two things live here:
//   1. listenOnce() — one tap-to-talk utterance with live interim feedback.
//   2. voiceFillForm() — a guided form filler: for each field it listens,
//      normalizes what was said (numbers, plates, tire sizes…), writes it into
//      the input, and auto-advances to the next field via a big overlay UI.
// Chrome/Edge/Android use Google's recognizer (hr-HR is supported; needs
// network); iOS/macOS Safari 14.5+ uses Siri's. No engine → callers hide the
// mic buttons (voiceSupported()).
// ============================================================================
import { icon } from "./ui.js";
import { t, lang } from "./i18n.js";

const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

export function voiceSupported() {
  return Boolean(SR);
}

function speechLang() {
  return lang() === "hr" ? "hr-HR" : "en-US";
}

// ---- One utterance ------------------------------------------------------------
// Resolves with the final transcript ("" on silence). Rejects only on hard
// errors (mic denied / no engine). `onInterim` streams live partial text.
export function listenOnce({ onInterim } = {}) {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error(t("voice.unsupported")));
    const rec = new SR();
    rec.lang = speechLang();
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    let finalText = "";
    let settled = false;
    const settle = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += txt;
        else interim += txt;
      }
      if (onInterim) onInterim(finalText + interim);
    };
    rec.onerror = (e) => {
      // Silence and user-stops are "no result", not failures.
      if (e.error === "no-speech" || e.error === "aborted") return settle(resolve, "");
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        return settle(reject, new Error(t("voice.micDenied")));
      }
      settle(reject, new Error(t("voice.error")));
    };
    rec.onend = () => settle(resolve, finalText.trim());

    try { rec.start(); } catch { settle(reject, new Error(t("voice.error"))); }
    // Expose a stopper so the overlay's buttons can cut a listen short.
    listenOnce._active = rec;
  });
}
export function stopListening() {
  try { listenOnce._active?.stop(); } catch { /* already stopped */ }
}

// ---- Normalizers ----------------------------------------------------------------
// Recognizers usually emit digits for spoken numbers, but not always — map
// Croatian/English number words as a rescue before stripping.
const NUM_WORDS = {
  nula: "0", jedan: "1", jedna: "1", jedno: "1", dva: "2", dvije: "2", tri: "3",
  cetiri: "4", četiri: "4", pet: "5", sest: "6", šest: "6", sedam: "7", osam: "8", devet: "9",
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", oh: "0",
};
function wordsToDigits(text) {
  return (text || "").toLowerCase().split(/\s+/)
    .map((w) => NUM_WORDS[w] ?? w).join(" ");
}

export const normalizers = {
  text: (s) => (s || "").trim(),
  name: (s) => (s || "").trim().replace(/\p{L}+/gu, (w) => w[0].toUpperCase() + w.slice(1)),
  phone: (s) => {
    const d = wordsToDigits(s).replace(/[^\d+]/g, "");
    return d.startsWith("+") ? "+" + d.slice(1).replace(/\+/g, "") : d;
  },
  digits: (s) => wordsToDigits(s).replace(/\D/g, ""),
  plate: (s) => wordsToDigits(s).toUpperCase().replace(/[^A-ZČĆĐŠŽ0-9]/g, ""),
  size: (s) => {
    const d = wordsToDigits(s).replace(/\D+/g, " ").trim();
    const m = d.match(/(\d{3})\s*(\d{2})\s*(\d{2})/) || d.replace(/\s/g, "").match(/(\d{3})(\d{2})(\d{2})/);
    if (m && +m[1] >= 125 && +m[1] <= 355 && +m[2] >= 25 && +m[2] <= 85 && +m[3] >= 12 && +m[3] <= 24) {
      return `${m[1]}/${m[2]}R${m[3]}`;
    }
    return (s || "").trim();
  },
};

// ---- Guided form filling --------------------------------------------------------
// fields: [{ el, label, norm?, apply? }] — `el` is the input to fill, `norm` a
// normalizers key (default "text"), `apply` an optional custom setter.
// The overlay shows the current field BIG, streams what it hears, and moves on
// by itself. Buttons: redo, skip, finish. Returns when done/cancelled.
export async function voiceFillForm(fields, { onDone } = {}) {
  if (!SR || !fields.length) return;
  const overlay = document.createElement("div");
  overlay.className = "voice-sheet";
  overlay.innerHTML = `
    <div class="voice-card">
      <div class="voice-top">
        <span class="voice-step tnum" id="vStep"></span>
        <span class="voice-live" id="vLive">${icon("phone", 15)} ${t("voice.listening")}</span>
      </div>
      <div class="voice-label" id="vLabel"></div>
      <div class="voice-heard" id="vHeard">…</div>
      <div class="voice-actions">
        <button class="btn" id="vRedo">${icon("back", 18)} ${t("voice.repeat")}</button>
        <button class="btn" id="vSkip">${t("voice.skip")} ${icon("move", 18)}</button>
        <button class="btn btn-primary" id="vDone">${icon("check", 18)} ${t("voice.finish")}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (id) => overlay.querySelector("#" + id);

  let idx = 0;
  let cancelled = false;
  let redo = false;
  const finish = () => { cancelled = true; stopListening(); };
  $("vDone").onclick = finish;
  $("vSkip").onclick = () => stopListening();                  // "" result → advance
  $("vRedo").onclick = () => { redo = true; stopListening(); };
  const onHash = () => finish();
  window.addEventListener("hashchange", onHash);

  try {
    while (!cancelled && idx < fields.length) {
      const f = fields[idx];
      $("vStep").textContent = `${idx + 1}/${fields.length}`;
      $("vLabel").textContent = f.label;
      $("vHeard").textContent = "…";
      $("vLive").classList.add("is-on");
      f.el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      f.el?.classList.add("voice-target");

      let text = "";
      try {
        text = await listenOnce({ onInterim: (s) => { $("vHeard").textContent = s || "…"; } });
      } catch (err) {
        f.el?.classList.remove("voice-target");
        $("vHeard").textContent = err.message;
        await new Promise((r) => setTimeout(r, 1800));
        break;                                                  // mic denied etc. — stop the flow
      }
      $("vLive").classList.remove("is-on");
      f.el?.classList.remove("voice-target");
      if (cancelled) break;
      if (redo) { redo = false; continue; }                     // same field again

      if (text) {
        const norm = normalizers[f.norm || "text"] || normalizers.text;
        const value = norm(text);
        $("vHeard").textContent = value;
        if (f.apply) f.apply(value);
        else if (f.el) {
          f.el.value = value;
          f.el.dispatchEvent(new Event("input", { bubbles: true }));
          f.el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        f.el?.animate?.([{ background: "var(--brand-tint)" }, { background: "transparent" }], { duration: 900, easing: "ease" });
        await new Promise((r) => setTimeout(r, 350));           // let the user see it landed
      }
      idx++;                                                    // silence/skip also advances
    }
  } finally {
    window.removeEventListener("hashchange", onHash);
    overlay.remove();
    stopListening();
    if (onDone) onDone();
  }
}
