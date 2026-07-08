/* =========================================================================
   ASC design system · v6 "Hanssen" — shared behaviour
   Extracted VERBATIM from dashboard.html.

   NOTE — blocking head script: each page ALSO carries a tiny blocking
   <script> in <head>, BEFORE this file and before the stylesheet, that reads
   localStorage('asc.theme') and (if 'dark') adds html.dark + repaints the
   theme-color meta synchronously. That must stay inline in <head> to apply the
   theme before first paint and avoid a light/dark flash; do NOT move it here.
   This file re-reads the same key and wires the interactive toggle + animations.
   ========================================================================= */

const root = document.documentElement;
const meta = document.querySelector('meta[name="theme-color"]');
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
try { if (localStorage.getItem('asc.theme') === 'dark') root.classList.add('dark'); } catch(e){}
const paintTheme = () => meta.setAttribute('content', root.classList.contains('dark') ? '#020305' : '#edf0f5');
paintTheme();
document.getElementById('mode').addEventListener('click', () => {
  const dark = root.classList.toggle('dark');
  try { localStorage.setItem('asc.theme', dark ? 'dark' : 'light'); } catch(e){}
  paintTheme();
});

// Device tier — capability-based (touch + width via matchMedia), NOT UA sniffing.
// Sets html[data-device] = desktop | tablet | mobile so CSS can adapt each tier
// (e.g. the agent window lays out statically on touch, where there is no hover to
// reveal it). Re-evaluated on resize/rotate.
(() => {
  const setDevice = () => {
    const touch = matchMedia('(hover: none)').matches || matchMedia('(pointer: coarse)').matches;
    const device = touch ? (innerWidth <= 640 ? 'mobile' : 'tablet') : 'desktop';
    if (root.getAttribute('data-device') !== device) root.setAttribute('data-device', device);
  };
  setDevice();
  addEventListener('resize', setDevice, { passive: true });
})();

// Preview navigation: wire the shared header pills + iOS dock to the real pages,
// so every screen links to every other. Dashboard-only cards/lists are wired too
// (gated on #agentCard); selectors that match nothing on a page are just no-ops.
(() => {
  const NAV = { 'Ploča': 'dashboard.html', 'Zaprimi': 'checkin.html', 'Skladište': 'warehouse.html',
                'Kupci': 'customers.html', 'Skeniraj': 'scan.html', 'Više': 'reminders.html' };
  document.querySelectorAll('.pill-links a, .dock a').forEach(a => {
    const k = (a.getAttribute('aria-label') || a.textContent || '').trim();
    if (NAV[k]) a.setAttribute('href', NAV[k]);
  });
  if (document.getElementById('agentCard')) {   // the dashboard
    const link = (sel, href) => document.querySelectorAll(sel).forEach(a => { if (a.tagName === 'A') a.setAttribute('href', href); });
    link('.act.green', 'checkin.html');
    link('.act.red', 'reminders.html');
    link('.stream .slide', 'set-detail.html');
    link('.card.dark .mini', 'reminders.html');
  }
})();

// Animated count-up + bar/meter fill (instant when reduced motion).
function animate(){
  document.querySelectorAll('[data-count]').forEach(el => {
    const target = +el.dataset.count;
    if (reduce || target === 0){ el.textContent = target; return; }
    const dur = 900, t0 = performance.now();
    const step = (t) => { const p = Math.min(1,(t-t0)/dur); el.textContent = Math.round(target*(1-Math.pow(1-p,3))); if(p<1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  requestAnimationFrame(() => document.querySelectorAll('[data-w]').forEach(i => { i.style.width = i.dataset.w + '%'; }));
}

// Dock: iOS tab bar. Real hrefs navigate; placeholder ("#") tabs just move the
// tint (so the preview stays interactive without dead-ending the real links).
const dtabs = [...document.querySelectorAll('.dock .dtab')];
dtabs.forEach(t => t.addEventListener('click', e => {
  if (t.getAttribute('href') === '#') {
    e.preventDefault();
    dtabs.forEach(x => x.classList.remove('on'));
    t.classList.add('on');
  }
}));

if (document.readyState !== 'loading') animate(); else addEventListener('DOMContentLoaded', animate);

// ============================================================================
// Global ASC Agent — right-edge voice dock (all pages).
// Tucked tab → tap opens the panel (slides out from the edge). The orb is
// press-and-HOLD to talk: Web Speech (hr-HR) streams a live transcript; on
// RELEASE it acts like Enter and routes the intent (navigate / search). Typed
// input is the always-available fallback (and when speech is unsupported).
// Rule-based understanding — no cloud LLM — but real, useful, and $0.
// ============================================================================
(() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const ICON = {
    tab:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 3v18M8 6.5v11M16 6.5v11M4 10v4M20 10v4"/></svg>',
    mic:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="8.6" y="2.8" width="6.8" height="11.4" rx="3.4"/><path d="M5.2 11.4a6.8 6.8 0 0013.6 0"/><path d="M12 18.2v3"/></svg>',
    close:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M12 5l7 7-7 7"/></svg>'
  };

  const dock = document.createElement('div');
  dock.className = 'ai-dock';
  dock.dataset.open = 'false';
  dock.innerHTML =
    '<button class="ai-tab" aria-label="ASC Agent — glasovni pomoćnik" aria-expanded="false">' + ICON.tab + '</button>' +
    '<div class="ai-scrim"></div>' +
    '<section class="ai-panel" role="dialog" aria-label="ASC Agent" aria-hidden="true">' +
      '<div class="ai-head"><span class="ai-title"><span class="dot"></span> ASC Agent</span>' +
        '<button class="ai-close" aria-label="Zatvori">' + ICON.close + '</button></div>' +
      '<div class="ai-stage">' +
        '<button class="ai-mic" aria-label="Drži i govori">' + ICON.mic + '<span class="ai-mic-orb">' + ICON.mic + '</span></button>' +
        '<p class="ai-hint"></p>' +
        '<div class="ai-heard"></div>' +
        '<div class="ai-result"></div>' +
      '</div>' +
      '<div class="ai-chips">' +
        '<button class="ai-chip" data-cmd="skladište">Skladište</button>' +
        '<button class="ai-chip" data-cmd="zaprimi">Zaprimi</button>' +
        '<button class="ai-chip" data-cmd="radionica">Radionica</button>' +
        '<button class="ai-chip" data-cmd="podsjetnici">Podsjetnici</button>' +
      '</div>' +
      '<form class="ai-type"><input type="text" placeholder="…ili upiši što trebaš" autocomplete="off" aria-label="Upiši naredbu">' +
        '<button class="ai-send" type="submit" aria-label="Pošalji">' + ICON.send + '</button></form>' +
    '</section>';
  document.body.appendChild(dock);

  const $ = (s) => dock.querySelector(s);
  const tab = $('.ai-tab'), panel = $('.ai-panel'), scrim = $('.ai-scrim'),
        mic = $('.ai-mic'), hint = $('.ai-hint'), heard = $('.ai-heard'),
        result = $('.ai-result'), form = $('.ai-type'), input = form.querySelector('input');

  const idleHint = SR ? 'Drži i govori' : 'Upiši što trebaš';
  hint.textContent = idleHint;
  if (!SR) mic.classList.add('is-off');

  // ---- open / close ---------------------------------------------------------
  let openState = false;
  const open = () => { openState = true; dock.dataset.open = 'true'; tab.setAttribute('aria-expanded','true'); panel.setAttribute('aria-hidden','false'); setTimeout(() => { try { (SR ? mic : input).focus({ preventScroll:true }); } catch(e){} }, 380); };
  const close = () => { openState = false; dock.dataset.open = 'false'; tab.setAttribute('aria-expanded','false'); panel.setAttribute('aria-hidden','true'); endVoice(true); };
  tab.addEventListener('click', open);
  $('.ai-close').addEventListener('click', close);
  scrim.addEventListener('click', close);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && openState) { e.stopPropagation(); close(); } });

  // ---- press-and-hold voice (walkie-talkie) --------------------------------
  let rec = null, finalText = '', interimText = '', holding = false, pendingFinalize = false;

  function startVoice(){
    if (!SR || rec) return;
    finalText = ''; interimText = ''; heard.textContent = '…'; result.textContent = ''; result.classList.remove('pop');
    rec = new SR();
    rec.lang = 'hr-HR'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += txt + ' '; else interimText += txt;
      }
      heard.textContent = (finalText + interimText).trim() || '…';
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { hint.textContent = 'Dopusti mikrofon u pregledniku'; }
      else if (e.error === 'no-speech') { hint.textContent = 'Nisam čula — pokušaj ponovno'; }
    };
    rec.onend = () => { rec = null; mic.classList.remove('is-live'); if (pendingFinalize) { pendingFinalize = false; doFinalize(); } };
    try { rec.start(); mic.classList.add('is-live'); hint.textContent = 'Slušam…'; }
    catch(e){ rec = null; mic.classList.remove('is-live'); }
  }
  function endVoice(silent){
    holding = false;
    if (rec) { pendingFinalize = !silent; try { rec.stop(); } catch(e){ pendingFinalize = false; } }
    else if (!silent) { doFinalize(); }
    if (silent) { mic.classList.remove('is-live'); hint.textContent = idleHint; }
  }
  function doFinalize(){
    mic.classList.remove('is-live');
    hint.textContent = idleHint;
    const text = (finalText || interimText || '').trim();
    if (text && text !== '…') { heard.textContent = text; handle(text); }   // release = Enter
  }

  mic.addEventListener('contextmenu', (e) => e.preventDefault());
  mic.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    if (!SR) { input.focus(); return; }
    e.preventDefault();
    holding = true;
    try { mic.setPointerCapture(e.pointerId); } catch(err){}
    startVoice();
  });
  const releaseHold = () => { if (holding) endVoice(false); };
  mic.addEventListener('pointerup', releaseHold);
  mic.addEventListener('pointercancel', releaseHold);
  mic.addEventListener('lostpointercapture', releaseHold);

  // ---- typed + chip fallbacks ----------------------------------------------
  form.addEventListener('submit', (e) => { e.preventDefault(); const t = input.value.trim(); if (t) { heard.textContent = t; input.value = ''; handle(t); } });
  dock.querySelectorAll('.ai-chip').forEach(c => c.addEventListener('click', () => { const cmd = c.dataset.cmd; heard.textContent = c.textContent; handle(cmd); }));

  // ---- understand + do ------------------------------------------------------
  const NAV = [
    [/(plo[čc]a|naslovnic|po[čc]etn|dashboard|\bhome\b|glavn)/, 'dashboard.html', 'Ploču'],
    [/(skladi[šs]t|warehouse|regal|zon[aei]|polic|gdje.*(gume|set)|lokacij|slobodn|mjest|kapacit|popunjen)/, 'warehouse.html', 'Skladište'],
    [/(zaprim|primi|check.?in|novi set|dolaz)/, 'checkin.html', 'Zaprimanje'],
    [/(kupc|klijent|customer|vlasnik)/, 'customers.html', 'Kupce'],
    [/(radionic|workshop|majstor|servis)/, 'workshop.html', 'Radionicu'],
    [/(skenir|scan|\bqr\b|kôd|barkod)/, 'scan.html', 'Skener'],
    [/(podsjetnic|preuzim|pickup|reminder|danas.*(preuzet|gotov))/, 'reminders.html', 'Podsjetnike'],
    [/(korisnic|djelatnic|\buser|osoblje|zaposlenic)/, 'users.html', 'Korisnike'],
    [/(reciklir|recikla|otpad|zbrin|recycle)/, 'recycle.html', 'Reciklažu'],
    [/(asistent|assistant|pomo[ćc]nik|razgovor)/, 'assistant.html', 'ASC Agenta'],
  ];
  function act(html, fn){ result.innerHTML = html; result.classList.remove('pop'); void result.offsetWidth; result.classList.add('pop'); setTimeout(fn, reduce ? 120 : 620); }
  function search(term){
    const box = document.getElementById('wsSearch');
    if (box) { box.value = term; box.dispatchEvent(new Event('input', { bubbles:true })); box.scrollIntoView({ behavior:'smooth', block:'center' }); close(); }
    else act('Tražim <b>' + esc(term) + '</b>…', () => { location.href = 'workshop.html?q=' + encodeURIComponent(term); });
  }
  function handle(text){
    const q = ' ' + text.toLowerCase().replace(/[.,!?]/g,' ').replace(/\s+/g,' ').trim() + ' ';
    const plate = text.match(/\b([A-Za-zČĆĐŠŽ]{2})\s?-?\s?(\d{3})\s?-?\s?([A-Za-zČĆĐŠŽ]{1,2})\b/);
    const code  = text.match(/asc[-\s]?\d{3,4}(?:[-\s]?\d{2,4})?/i);
    const findM = q.match(/(?:na[đd]i|tra[žz]i|prona[đd]i|gdje je|poka[žz]i|show|find)\s+(.+?)\s*$/i);
    if (plate) return search(plate[0].toUpperCase().replace(/\s/g,'').replace(/^([A-ZČĆĐŠŽ]{2})(\d{3})/,'$1-$2-').replace(/--/g,'-'));
    if (code)  return search(code[0].toUpperCase().replace(/\s/g,'-'));
    if (findM) return search(findM[1].trim());
    for (const [re, href, label] of NAV) {
      if (re.test(q)) {
        if (location.pathname.split('/').pop() === href) { act('Već si na <b>' + esc(label) + '</b>', () => { close(); }); return; }
        return act('Otvaram <b>' + esc(label) + '</b>…', () => { location.href = href; });
      }
    }
    // didn't map to a screen → treat the whole phrase as a search
    act('Tražim <b>' + esc(text) + '</b>', () => { location.href = 'workshop.html?q=' + encodeURIComponent(text); });
  }
})();
