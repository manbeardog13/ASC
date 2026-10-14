// A bare purple number in the corner of registration.
// Pressing it asks the next plain question, one at a time, in the purple form.
// The text window types on the left four sevenths. The right three sevenths,
// held past a third of a second, is the walkie-talkie and commits on release.
// Once there is text, that corner becomes a send arrow and the whole window edits.
import {
  inputZone, freeSlots, encodePlan, decodePlan, needsBooking,
  formatWhen, isoDate, busyKeys,
} from '../js/seasonPlan.js';

const HOLD_MS = 300;
const MIC = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3" width="6" height="10" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3"/></svg>';
const ARROW = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';

const STEPS = [
  { key: 'plate', ask: 'Koja je registracija?', field: 'v_plate', norm: 'plate' },
  { key: 'name', ask: 'Kako se zove?', field: 'c_name', norm: 'name' },
  { key: 'phone', ask: 'Koji je telefon?', field: 'c_phone', norm: 'phone', optional: true },
  { key: 'email', ask: 'Koja je e-pošta?', field: 'c_email', norm: 'text', optional: true },
  { key: 'address', ask: 'Gdje stanuje?', field: 'c_address', norm: 'text', optional: true },
  { key: 'plan', ask: 'Dolaze li opet za šest mjeseci?', plan: true },
];

const CHOICES = [
  ['seasonal', 'Da, za šest mjeseci'],
  ['season_keep', 'Ostaju do zamjene sezone'],
  ['indefinite', 'Ostaju kod nas'],
  ['discard', 'Za bacanje'],
];

function injectStyle() {
  if (document.getElementById('neroPlanStyle')) return;
  const style = document.createElement('style');
  style.id = 'neroPlanStyle';
  style.textContent = `
.plan-mark{flex:none;align-self:center;margin:0;padding:14px 12px;border:0;background:none;box-shadow:none;appearance:none;cursor:pointer;
  color:#6d28d9;-webkit-text-fill-color:#6d28d9;font:700 28px/1 Inter,system-ui,sans-serif;font-variant-numeric:tabular-nums;
  -webkit-tap-highlight-color:transparent}
.plan-mark.is-due{animation:planShimmer 1.5s ease-in-out infinite}
@keyframes planShimmer{
  0%,100%{color:#6d28d9;-webkit-text-fill-color:#6d28d9;text-shadow:0 0 10px rgba(109,40,217,.95),0 0 2px #6d28d9}
  50%{color:#d946ef;-webkit-text-fill-color:#d946ef;text-shadow:0 0 18px rgba(217,70,239,1),0 0 3px #c026d3}
}
.plan-mark:focus-visible{outline:none;text-shadow:0 0 12px rgba(217,70,239,.95)}
.nero-plan{position:fixed;inset:0;z-index:80;display:flex;align-items:flex-end;justify-content:flex-end;padding:18px 16px 22px;background:rgba(8,6,16,.18)}
.nero-plan[hidden]{display:none}
.nero-plan-card{position:relative;width:min(420px,100%);overflow:hidden;border-radius:18px;color:#f4f5f7;
  background:linear-gradient(138deg,#171040 0%,#241659 42%,#33207a 100%);
  border:1px solid rgba(150,100,255,.28);
  box-shadow:0 22px 50px -22px rgba(76,42,168,.65);padding:22px 18px 16px}
.nero-plan-card::before{content:"";position:absolute;inset:-35%;z-index:0;pointer-events:none;opacity:.5;
  background:radial-gradient(38% 46% at 22% 32%,rgba(130,70,255,.55),transparent 60%),
    radial-gradient(40% 48% at 78% 38%,rgba(232,64,208,.42),transparent 60%);
  filter:blur(34px)}
.nero-plan-card > *{position:relative;z-index:1}
.nero-ask{margin:0 0 12px;text-align:right;font:500 20px/1.3 Sora,Inter;color:#f4effc}
.nero-window{position:relative;margin:0 14% 0 0}
.nero-window input{width:100%;box-sizing:border-box;min-height:50px;padding:12px 46px 12px 14px;border-radius:15px;border:1px solid rgba(150,110,255,.3);
  background:rgba(12,10,24,.55);color:#f3efff;font:500 16px Inter;outline:none}
.nero-window input::placeholder{color:rgba(233,224,255,.46)}
.nero-glyph,.nero-send{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:28px;height:28px;display:grid;place-items:center;color:#f3e9ff}
.nero-glyph{pointer-events:none}
.nero-send{border:0;background:none;padding:0;cursor:pointer;color:#fff}
.nero-window.listening .nero-glyph{color:#e7b6ff}
.nero-choices{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.nero-choice,.nero-slot{border:0;cursor:pointer;text-align:right;color:#f4f5f7;font:600 15px Inter;
  background:rgba(12,10,24,.35);border-radius:14px;padding:10px 14px}
.nero-skip{display:block;margin:12px 0 0 auto;border:0;background:none;color:rgba(233,224,255,.7);font:500 13px Inter;cursor:pointer}
@media(prefers-reduced-motion:reduce){.plan-mark.is-due{animation:none;color:#6d28d9;-webkit-text-fill-color:#6d28d9;text-shadow:0 0 10px rgba(109,40,217,.9)}}
`;
  document.head.appendChild(style);
}

function val(id) {
  const node = document.getElementById(id);
  return node ? String(node.value || '').trim() : '';
}

function write(id, value) {
  const node = document.getElementById(id);
  if (!node) return;
  node.value = value;
  node.dispatchEvent(new Event('input', { bubbles: true }));
}

export function installPlanMark() {
  const bar = document.querySelector('#ci .action-bar');
  const form = document.getElementById('ci');
  if (!bar || !form || document.getElementById('planMark')) return;
  injectStyle();

  const marker = document.createElement('input');
  marker.type = 'hidden';
  marker.id = 'plan_marker';
  form.appendChild(marker);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'plan-mark';
  button.id = 'planMark';
  bar.appendChild(button);

  const sheet = document.createElement('div');
  sheet.className = 'nero-plan';
  sheet.hidden = true;
  sheet.innerHTML = '<div class="nero-plan-card" role="dialog" aria-modal="true" aria-labelledby="neroAsk">'
    + '<p class="nero-ask" id="neroAsk"></p>'
    + '<div class="nero-window" id="neroWindow">'
    + '<input id="neroInput" type="text" autocomplete="off" enterkeyhint="done">'
    + '<span class="nero-glyph" aria-hidden="true"></span>'
    + '<button type="button" class="nero-send" id="neroSend" hidden aria-label="Pošalji"></button>'
    + '</div>'
    + '<div class="nero-choices" id="neroChoices" hidden></div>'
    + '<button type="button" class="nero-skip" id="neroSkip" hidden>Nije bitno</button>'
    + '</div>';
  document.body.appendChild(sheet);

  const ask = sheet.querySelector('#neroAsk');
  const windowEl = sheet.querySelector('#neroWindow');
  const input = sheet.querySelector('#neroInput');
  const glyph = sheet.querySelector('.nero-glyph');
  const send = sheet.querySelector('#neroSend');
  const choices = sheet.querySelector('#neroChoices');
  const skip = sheet.querySelector('#neroSkip');

  const skipped = new Set();
  let index = 0;
  let mode = 'mic';
  let arm = 0;
  let session = null;
  let stopWanted = false;
  let slots = [];

  function done(step) {
    if (skipped.has(step.key)) return true;
    if (step.plan) return Boolean(decodePlan(marker.value)?.kind);
    return Boolean(val(step.field));
  }

  function remaining() {
    return STEPS.filter((step) => !done(step)).length;
  }

  function paintCount() {
    const n = remaining();
    button.textContent = n ? String(n) : '✓';
    button.classList.toggle('is-due', n > 0);
    button.setAttribute('aria-label', n
      ? 'Još ' + n + '. Pritisni i Nero pita redom.'
      : 'Sva pitanja su odgovorena.');
  }

  function paintGlyph() {
    const text = input.value.trim().length > 0;
    if (text) mode = 'send';
    glyph.innerHTML = mode === 'send' ? ARROW : MIC;
    send.hidden = mode !== 'send';
    send.innerHTML = ARROW;
    glyph.hidden = mode === 'send';
  }

  function showStep(step) {
    ask.textContent = step.ask;
    const isPlan = Boolean(step.plan);
    windowEl.hidden = isPlan;
    choices.hidden = !isPlan;
    skip.hidden = !step.optional && !isPlan;
    input.value = step.field ? val(step.field) : '';
    mode = input.value.trim() ? 'send' : 'mic';
    paintGlyph();
    if (isPlan) {
      choices.innerHTML = CHOICES.map(([id, label]) =>
        '<button type="button" class="nero-choice" data-plan="' + id + '">' + label + '</button>'
      ).join('');
    }
  }

  function openNext() {
    index = STEPS.findIndex((step) => !done(step));
    if (index < 0) { sheet.hidden = true; paintCount(); return; }
    showStep(STEPS[index]);
    sheet.hidden = false;
    if (!STEPS[index].plan) input.focus();
  }

  async function norms() {
    try { return (await import('../js/voice.js')).normalizers; }
    catch { return null; }
  }

  async function applyText(step, text) {
    const bag = await norms();
    const fn = bag && bag[step.norm];
    write(step.field, fn ? fn(text) : text.trim());
  }

  async function commit() {
    const step = STEPS[index];
    if (!step || step.plan) return;
    const text = input.value.trim();
    if (!text) {
      if (!step.optional) return;
      skipped.add(step.key);
    } else {
      await applyText(step, text);
      skipped.delete(step.key);
    }
    mode = 'mic';
    openNext();
    paintCount();
  }

  function outside(event) {
    if (windowEl.hidden || windowEl.contains(event.target)) return;
    if (!input.value.trim()) {
      mode = 'mic';
      paintGlyph();
    }
  }

  button.addEventListener('click', () => {
    if (sheet.hidden) openNext();
    else openNext();
  });

  skip.addEventListener('click', () => {
    const step = STEPS[index];
    if (!step) return;
    skipped.add(step.key);
    input.value = '';
    mode = 'mic';
    openNext();
    paintCount();
  });

  input.addEventListener('input', paintGlyph);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void commit();
  });

  send.addEventListener('click', () => { void commit(); });

  windowEl.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest('.nero-send')) return;
    const rect = windowEl.getBoundingClientRect();
    const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0;
    const zone = inputZone(ratio, input.value.trim().length > 0);
    if (zone !== 'voice') {
      input.focus();
      return;
    }
    event.preventDefault();
    windowEl.setPointerCapture?.(event.pointerId);
    arm = window.setTimeout(() => {
      arm = 0;
      void startVoice();
    }, HOLD_MS);
  });

  windowEl.addEventListener('pointerup', () => endHold(true));
  windowEl.addEventListener('pointercancel', () => endHold(false));

  async function startVoice() {
    stopWanted = false;
    windowEl.classList.add('listening');
    let voice;
    try { voice = await import('../js/voice.js'); }
    catch { return; }
    if (stopWanted || !voice.voiceSupported || !voice.voiceSupported()) { input.focus(); return; }
    session = voice.listenHold({
      onInterim: (text) => { if (text) { input.value = text; paintGlyph(); } },
    });
    if (stopWanted && session) session.release();
  }

  async function endHold(commitOnRelease) {
    if (arm) { window.clearTimeout(arm); arm = 0; input.focus(); return; }
    stopWanted = true;
    windowEl.classList.remove('listening');
    const live = session;
    session = null;
    if (!live) return;
    live.release();
    let heard = '';
    try { heard = await live.done; } catch { heard = input.value; }
    if (heard) input.value = heard;
    paintGlyph();
    if (commitOnRelease && input.value.trim()) void commit();
  }

  choices.addEventListener('click', async (event) => {
    const choice = event.target.closest('[data-plan]');
    const slotBtn = event.target.closest('[data-slot]');
    if (slotBtn) {
      const slot = slots[Number(slotBtn.dataset.slot)];
      const kind = slotBtn.dataset.kind;
      marker.value = encodePlan(kind, slot);
      const out = document.getElementById('s_out');
      if (out && slot) out.value = isoDate(slot);
      openNext();
      paintCount();
      return;
    }
    if (!choice) return;
    const kind = choice.dataset.plan;
    if (!needsBooking(kind)) {
      marker.value = encodePlan(kind);
      openNext();
      paintCount();
      return;
    }
    let sets = [];
    try { sets = await (await import('../js/db.js')).listStorageSets(); } catch { sets = []; }
    slots = freeSlots(busyKeys(sets), new Date(), 3, 6);
    ask.textContent = 'Prvi slobodan termin';
    windowEl.hidden = true;
    skip.hidden = true;
    choices.hidden = false;
    choices.innerHTML = slots.map((slot, i) =>
      '<button type="button" class="nero-slot" data-slot="' + i + '" data-kind="' + kind + '">' + formatWhen(slot) + '</button>'
    ).join('');
  });

  document.addEventListener('pointerdown', (event) => {
    if (sheet.hidden) return;
    if (event.target.closest('.nero-plan-card') || event.target.closest('#planMark')) return;
    if (input.value.trim()) return;
    mode = 'mic';
    paintGlyph();
    sheet.hidden = true;
  });

  ['v_plate', 'c_name', 'c_phone', 'c_email', 'c_address'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', paintCount);
  });
  paintCount();
}
