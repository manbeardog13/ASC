// First sign-in walkthrough. The flag is profiles.onboarded_at, never localStorage.
import { loadMyProfile, markOnboarded, listLocationSeats } from "../js/db.js";
import { t } from "./flow-ui.js";
import { tourSteps, tourTarget } from "../js/firstRun.js";

const STYLE = `
.asc-onboard{position:fixed;inset:0;z-index:10050;display:flex;align-items:flex-end;justify-content:center;
  padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px));
  background:rgba(14,11,28,.72);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.asc-onboard-card{width:min(440px,100%);border-radius:22px;padding:22px 20px 18px;color:#f4f0ff;
  background:linear-gradient(165deg,#1a1433,#120e22 58%,#0e0b1c);
  border:1px solid rgba(183,163,255,.38);
  box-shadow:0 24px 60px -20px rgba(139,92,246,.75)}
.asc-onboard-kicker{margin:0;font:600 10.5px Inter,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#b7a3ff}
.asc-onboard-progress{margin:8px 0 0;font:600 12px Inter,sans-serif;color:#d9d0f2}
.asc-onboard-dots{display:flex;gap:6px;margin:12px 0 14px}
.asc-onboard-dots i{width:22px;height:4px;border-radius:99px;background:rgba(244,240,255,.18)}
.asc-onboard-dots i.on{background:linear-gradient(90deg,#8b5cf6,#e040d0)}
.asc-onboard-card h2{margin:0 0 8px;font:600 22px Sora,sans-serif;letter-spacing:-.02em;
  background:linear-gradient(96deg,#fff 0%,#e7dcff 46%,#b7a3ff 78%,#8ee6ff 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent}
.asc-onboard-card p{margin:0;font:500 14.5px/1.45 Inter,sans-serif;color:#e4dcf8}
.asc-onboard-note{min-height:1.2em;margin-top:8px;color:#ffb4c8;font-size:13px}
.asc-onboard-actions{display:flex;gap:8px;margin-top:16px}
.asc-onboard-actions button{flex:1;min-height:46px;border-radius:23px;border:0;cursor:pointer;
  font:600 14px Inter,sans-serif}
.asc-onboard-back{background:rgba(244,240,255,.08);color:#f4f0ff}
.asc-onboard-next{background:linear-gradient(135deg,#8b5cf6,#e040d0);color:#fff;
  box-shadow:0 10px 24px -12px rgba(224,64,208,.9)}
`;

function ensureStyle() {
  if (document.getElementById("asc-onboard-style")) return;
  const style = document.createElement("style");
  style.id = "asc-onboard-style";
  style.textContent = STYLE;
  document.head.appendChild(style);
}

function mount(steps) {
  ensureStyle();
  const root = document.createElement("div");
  root.id = "asc-onboard";
  root.className = "asc-onboard";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  document.body.appendChild(root);
  let step = 0;

  const finish = async () => {
    const note = root.querySelector(".asc-onboard-note");
    try {
      await markOnboarded();
      root.remove();
    } catch (error) {
      if (note) note.textContent = (error && error.message) || t("common.actionFailed");
    }
  };

  const render = () => {
    root.replaceChildren();
    const card = document.createElement("div");
    card.className = "asc-onboard-card";
    const kicker = document.createElement("p");
    kicker.className = "asc-onboard-kicker";
    kicker.textContent = t("tour.kicker");
    const progress = document.createElement("p");
    progress.className = "asc-onboard-progress";
    progress.textContent = t("tour.progress", { n: String(step + 1), total: String(steps.length) });
    const dots = document.createElement("div");
    dots.className = "asc-onboard-dots";
    steps.forEach((_, index) => {
      const dot = document.createElement("i");
      if (index <= step) dot.className = "on";
      dots.append(dot);
    });
    const item = steps[step];
    const title = document.createElement("h2");
    title.id = "asc-onboard-title";
    title.textContent = t(item.title, item.vars);
    const body = document.createElement("p");
    body.textContent = t(item.body, item.vars);
    const note = document.createElement("p");
    note.className = "asc-onboard-note";
    const actions = document.createElement("div");
    actions.className = "asc-onboard-actions";
    const last = step === steps.length - 1;
    if (step > 0) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "asc-onboard-back";
      back.textContent = t("common.back");
      back.addEventListener("click", () => { step -= 1; render(); });
      actions.append(back);
    }
    if (last) {
      const skip = document.createElement("button");
      skip.type = "button";
      skip.dataset.skip = "1";
      skip.className = "asc-onboard-back";
      skip.textContent = t("tour.skip");
      skip.addEventListener("click", () => { finish(); });
      actions.append(skip);
    }
    const next = document.createElement("button");
    next.type = "button";
    next.dataset.next = "1";
    next.className = "asc-onboard-next";
    next.textContent = last ? t("tour.done") : t("tour.next");
    next.addEventListener("click", () => {
      if (last) finish();
      else { step += 1; render(); }
    });
    actions.append(next);
    card.append(kicker, progress, dots, title, body, note, actions);
    root.append(card);
    root.setAttribute("aria-labelledby", "asc-onboard-title");
    next.focus();
  };

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !document.getElementById("asc-onboard")) return;
    event.preventDefault();
    if (step === steps.length - 1) finish();
  });
  render();
}

export async function bootOnboarding() {
  if (document.getElementById("asc-onboard")) return;
  let profile = null;
  try { profile = await loadMyProfile(); }
  catch { return; }
  if (!profile || profile.onboarded_at || profile.onboarding_unavailable) return;
  let target = { mode: "create", zone: "" };
  try { target = tourTarget(await listLocationSeats()); }
  catch { target = { mode: "create", zone: "" }; }
  mount(tourSteps(target));
}
