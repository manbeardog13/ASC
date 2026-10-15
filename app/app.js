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

// ---- Live staging gate: every app/ page requires a real Supabase session -----
// (The mock preview/ demo has no gate.) Hide the page until the check resolves so
// no mock data flashes before we know who's here; on no session → the login page.
(() => {
  if (/\/(login|dashboard|warehouse)\.html$/.test(location.pathname)) return;
  document.documentElement.style.visibility = 'hidden';
  // Prag splash interplay: pages that carry the boot script expose window.ASCSplash;
  // on all other gated pages this stub keeps today's behavior byte-for-byte.
  const S = window.ASCSplash || { mode: null, done(){}, bloom(cb){ cb && cb(); }, handoff(u){ location.replace(u); } };
  const dbReady = import('../js/db.js');
  dbReady
    .then((m) => m.getSession())
    .then((session) => {
      if (session) {
        // Mark the tab warm on EVERY gated page (not just splashed ones) so a
        // deep-link → dock-nav never plays a cold splash mid-session.
        try { sessionStorage.setItem('asc.splash.warm', '1'); } catch (e) {}
        // Restore visibility UNDER the (opaque) splash so the lift can never
        // reveal an unpainted page; then let first live data land before the
        // reveal choreography plays (capped so a slow fetch never stalls it).
        document.documentElement.style.visibility = '';
        Promise.race([window.ascLiveFirst || Promise.resolve(), new Promise((r) => setTimeout(r, 1200))])
          .then(() => S.done());
      } else S.bloom(() => S.handoff('login.html'));   // re-cover first: even a watchdog-spent splash bounces under the surface
    })
    .catch(() => { document.documentElement.style.visibility = ''; S.done(); });  // never hard-lock on a load error
  // Sign-out: the menu drawer's "Odjava" ends the REAL Supabase session, then → login
  // through the same covered doorway (the MPA white-flash exists in both directions).
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-logout],[data-signout]')) return;
    e.preventDefault(); e.stopPropagation();
    dbReady.then((m) => m.signOut()).catch(() => {}).finally(() => S.bloom(() => S.handoff('login.html')));
  }, true);
})();

const root = document.documentElement;
// Personal workspace width (layout-edit): applied on EVERY page, per device profile.
try {
  const lk = (() => { const p = navigator.platform || '';
    const os = /Win/i.test(p) ? 'win' : /Mac/i.test(p) ? 'mac' : /iP(hone|ad)/i.test(p) ? 'ios' : 'other';
    const br = /Edg/i.test(navigator.userAgent) ? 'edge' : /Chrome/i.test(navigator.userAgent) ? 'chrome' : /Safari/i.test(navigator.userAgent) ? 'safari' : 'browser';
    return os + '-' + br + '-' + (innerWidth >= 1021 ? 'desktop' : 'mobile'); })();
  const w = JSON.parse(localStorage.getItem('asc.layout.width.' + lk));
  if (w) root.style.setProperty('--shell-max', w + 'px');
} catch (e) {}
const meta = document.querySelector('meta[name="theme-color"]');
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
try { if (localStorage.getItem('asc.theme') === 'dark') root.classList.add('dark'); } catch(e){}
const paintTheme = () => meta.setAttribute('content', root.classList.contains('dark') ? '#0a0c11' : '#edf0f5');
paintTheme();
document.getElementById('mode').addEventListener('click', () => {
  const dark = root.classList.toggle('dark');
  try { localStorage.setItem('asc.theme', dark ? 'dark' : 'light'); } catch(e){}
  paintTheme();
});

// The logo is always a way home — click (or Enter/Space) → dashboard, from any page.
(() => {
  const logo = document.querySelector('.logo');
  if (!logo) return;
  logo.style.cursor = 'pointer'; logo.setAttribute('role', 'link'); logo.setAttribute('tabindex', '0'); logo.setAttribute('aria-label', 'ASC — početna');
  const go = () => { location.href = 'dashboard.html'; };
  logo.addEventListener('click', go);
  logo.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
})();

// Device tier — capability-based (touch + width via matchMedia), NOT UA sniffing.
// Sets html[data-device] = desktop | tablet | mobile so CSS can adapt each tier
// (e.g. the agent window lays out statically on touch, where there is no hover to
// reveal it). Re-evaluated on resize/rotate.
(() => {
  const setDevice = () => {
    const touch = !matchMedia('(any-pointer:fine)').matches;
    const device = touch ? (innerWidth <= 640 ? 'mobile' : 'tablet') : 'desktop';
    if (root.getAttribute('data-device') !== device) root.setAttribute('data-device', device);
  };
  setDevice();
  addEventListener('resize', setDevice, { passive: true });
})();

// Dynamic Island detection — capability probe, no UA sniffing. A web app cannot
// draw INSIDE the island (native ActivityKit territory); in the installed PWA we
// own the pixels around it, so has-island pages can halo it. sat≥59 in portrait
// standalone = island hardware (14 Pro → 16 Pro Max); one parametric --isl-y.
(() => {
  const probe = () => {
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    root.classList.remove('has-island');
    if (!standalone) return;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top,0px);width:1px;pointer-events:none;visibility:hidden';
    document.documentElement.appendChild(d);
    const sat = d.offsetHeight; d.remove();
    if (sat >= 59) { root.classList.add('has-island'); root.style.setProperty('--isl-y', (sat - 48) + 'px'); }
  };
  probe();
  addEventListener('orientationchange', () => setTimeout(probe, 120));
})();

// The Gemini halo: while the agent listens, a violet ring + soft bloom crown the
// island (has-island only). Listens for asc:agent-listen / asc:agent-idle.
(() => {
  let halo = null;
  const ensure = () => {
    if (halo) return halo;
    halo = document.createElement('div');
    halo.id = 'islHalo'; halo.setAttribute('aria-hidden', 'true');
    halo.innerHTML = '<i class="isl-bloom"></i>';
    document.body.appendChild(halo);
    return halo;
  };
  document.addEventListener('asc:agent-listen', () => {
    if (!root.classList.contains('has-island')) return;
    ensure().classList.add('on');
  });
  document.addEventListener('asc:agent-idle', () => { if (halo) halo.classList.remove('on'); });
})();

// Preview navigation: wire the shared header pills + iOS dock to the real pages,
// so every screen links to every other. Dashboard-only cards/lists are wired too
// (gated on #agentCard); selectors that match nothing on a page are just no-ops.
(() => {
  const NAV = { 'Ploča': 'dashboard.html', 'Zaprimi': 'checkin.html', 'Skladište': 'warehouse-preview/index.html',
                'Kupci': 'customers.html', 'Skeniraj': 'scan.html', 'Više': 'reminders.html' };
  document.querySelectorAll('.pill-links a, .dock a').forEach(a => {
    const k = (a.getAttribute('aria-label') || a.textContent || '').trim();
    if (NAV[k]) a.setAttribute('href', NAV[k]);
  });
  if (document.getElementById('agentCard')) {   // the dashboard
    const link = (sel, href) => document.querySelectorAll(sel).forEach(a => { if (a.tagName === 'A') a.setAttribute('href', href); });
    link('.act.green', 'checkin.html');
    link('.act.red', 'checkout.html');
    // each recent-stream slide opens the set it shows (code from the corner number)
    document.querySelectorAll('.stream .slide').forEach(a => {
      const n = ((a.querySelector('.tab-tl') || {}).textContent || '').trim();
      a.setAttribute('href', /^\d{3,4}$/.test(n) ? 'set-detail.html?code=ASC-2026-' + n.padStart(4, '0') : 'set-detail.html');
    });
    // each pickup reminder opens that customer's card
    document.querySelectorAll('.card.dark .mini').forEach(a => {
      const who = ((a.querySelector('b') || {}).textContent || '').trim();
      a.setAttribute('href', who ? 'customers.html?c=' + encodeURIComponent(who) : 'reminders.html');
    });
  }
  // Workshop action grid + reminder set-codes were inert href="#" (audit) — wire them.
  const WSB = { 'Skeniraj': 'scan.html', 'Zaprimi': 'checkin.html', 'Skladište': 'warehouse-preview/index.html', 'Za preuzimanje': 'reminders.html' };
  document.querySelectorAll('.ws-btn').forEach(a => { const s = a.querySelector('span'); const t = s ? s.textContent.trim() : ''; if (WSB[t]) a.setAttribute('href', WSB[t]); });
  document.querySelectorAll('.rr-code').forEach(a => { const c = a.textContent.trim(); if (/^ASC-/.test(c)) a.setAttribute('href', 'set-detail.html?code=' + encodeURIComponent(c)); });
})();

// Animated count-up + bar/meter fill (instant when reduced motion).
function animate(){
  document.querySelectorAll('[data-count]').forEach(el => {
    const target = +el.dataset.count;
    if (reduce || target === 0){ el.textContent = target; return; }
    const dur = 900, t0 = performance.now();
    // Abort if live data claims the element mid-count (setNum strips/changes
    // data-count) — otherwise the stale loop overwrites the real number.
    const step = (t) => { if (+el.dataset.count !== target) return; const p = Math.min(1,(t-t0)/dur); el.textContent = Math.round(target*(1-Math.pow(1-p,3))); if(p<1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  requestAnimationFrame(() => document.querySelectorAll('[data-w]').forEach(i => { i.style.width = i.dataset.w + '%'; }));
}

// Dock: iOS tab bar. Real hrefs navigate; placeholder ("#") tabs just move the
// tint (so the preview stays interactive without dead-ending the real links).
// ---- v7 "Okvir" sidebar — THE navigation (desktop panel / mobile overlay) ----
// Injected chrome (zero HTML edits): a floating sidebar one step darker than
// the canvas, one expandable parent (Skladište), per-module accent inks, a
// pinned user card with hover-logout + a floating account menu, a frame lip on
// desktop, and a hamburger + scrim overlay on phones. Active page detection by
// filename; html[data-module] is stamped for page-level accent tinting.
(async () => {
  if (/\/login\.html$/.test(location.pathname)) return;
  const doc = document, root = doc.documentElement;
  const {navigationIcons:I,renderAppNavigation,installWarehouseMenuReturn}=await import('./navigation.js');
  const here = location.pathname.split('/').pop() || 'dashboard.html';
  const whPages = ['recycle.html', 'locate.html', 'locations.html', 'place.html', 'checkout.html'];
  const whOpen = whPages.includes(here) ||
    (localStorage.getItem('asc.side.wh') !== '0' && here === 'set-detail.html');
  const aside = doc.createElement('aside');
  aside.className = 'side';
  aside.setAttribute('aria-label', 'Glavna navigacija');
  aside.innerHTML =
    '<div class="sb-head"><span class="sb-eyebrow">ASC sustav</span>' +
      '<button class="sb-collapse" type="button" aria-label="Suzi izbornik"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6l-6 6 6 6"/></svg></button></div>' +
    '<form class="sb-search" role="search"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>' +
      '<input type="search" placeholder="Traži…" aria-label="Pretraga" autocomplete="off"></form>' +
    '<nav class="sb-nav" aria-label="Glavna navigacija">' + renderAppNavigation({warehouseOpen:whOpen}) + '</nav>' +
    '<div class="sb-foot"><button class="sb-user" type="button" aria-haspopup="menu">' +
      '<span class="sb-ava" id="sbAva">…<span class="dot"></span></span>' +
      '<span class="sb-uid"><b id="sbName">—</b><span id="sbRole">—</span></span>' +
      '<span class="sb-logout" role="button" tabindex="0" aria-label="Odjava" data-logout>' + I.out + '</span>' +
    '</button></div>';
  const scrim = doc.createElement('div');
  scrim.className = 'side-scrim';
  doc.body.appendChild(scrim);
  doc.body.appendChild(aside);
  root.classList.add('has-side');

  // module stamp for page-level tinting
  const MOD = { 'dashboard.html': 'dashboard', 'checkin.html': 'checkin', 'scan.html': 'scan',
    'recycle.html': 'warehouse', 'set-detail.html': 'warehouse',
    'locate.html': 'warehouse', 'locations.html': 'warehouse',
    'place.html': 'warehouse', 'checkout.html': 'warehouse',
    'customers.html': 'customers', 'reminders.html': 'reminders', 'workshop.html': 'workshop',
    'users.html': 'users' };
  if (MOD[here]) root.setAttribute('data-module', MOD[here]);

  // rail mode hides group children — surface the active domain on the parent
  if ((MOD[here] || '') === 'warehouse') {
    const p = aside.querySelector('.sb-group > button.sb-item'); if (p) p.classList.add('kid-on');
  }

  // collapse rail (desktop) — persisted
  try { if (localStorage.getItem('asc.side.rail') === '1') root.setAttribute('data-side', 'rail'); } catch (e) {}
  const sbs = aside.querySelector('.sb-search');
  sbs.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = sbs.querySelector('input').value.trim();
    if (!q) return;
    const code = window.ASCQR && ASCQR.normalize ? ASCQR.normalize(q, true) : null;
    location.href = code ? 'set-detail.html?code=' + encodeURIComponent(code)
                         : 'locate.html?q=' + encodeURIComponent(q);
  });
  // rail mode: the search collapses to its icon — clicking expands and focuses
  sbs.addEventListener('click', () => {
    if (root.getAttribute('data-side') !== 'rail') return;
    root.removeAttribute('data-side');
    try { localStorage.setItem('asc.side.rail', '0'); } catch (e) {}
    setTimeout(() => sbs.querySelector('input').focus(), 280);
  });
  aside.querySelector('.sb-collapse').addEventListener('click', () => {
    const rail = root.getAttribute('data-side') === 'rail';
    if (rail) root.removeAttribute('data-side'); else root.setAttribute('data-side', 'rail');
    try { localStorage.setItem('asc.side.rail', rail ? '0' : '1'); } catch (e) {}
  });

  // expandable parent
  const group = aside.querySelector('.sb-group');
  group.querySelector('button.sb-item').addEventListener('click', () => {
    const open = group.classList.toggle('open');
    group.querySelector('button').setAttribute('aria-expanded', String(open));
    group.querySelector('.sb-group-kids').inert=!open;
    try { localStorage.setItem('asc.side.wh', open ? '1' : '0'); } catch (e) {}
  });

  // mobile: hamburger in the header + scrim close
  const top = doc.querySelector('.top');
  let burger=null;
  const setMenuOpen=(open)=>{root.classList.toggle('side-open',open);burger?.setAttribute('aria-expanded',String(open));};
  if (top) {
    burger = doc.createElement('button');
    burger.className = 'sb-burger'; burger.type = 'button'; burger.setAttribute('aria-label', 'Izbornik');
    burger.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    top.insertBefore(burger, top.firstChild);
    burger.setAttribute('aria-expanded','false');
    burger.addEventListener('click', () => setMenuOpen(true));
  }
  scrim.addEventListener('click', () => setMenuOpen(false));
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenuOpen(false); });
  aside.addEventListener('click', (e) => { if (e.target.closest('a.sb-item')) setMenuOpen(false); });
  installWarehouseMenuReturn(()=>{
    group.classList.add('open');
    group.querySelector('button').setAttribute('aria-expanded','true');
    group.querySelector('.sb-group-kids').inert=false;
    setMenuOpen(true);
    aside.querySelector('a[href$="warehouse-preview/index.html"]')?.focus({preventScroll:true});
  });

  // user card: real profile (name, role, avatar) — degrades to initials
  const ROLE = { admin: 'Administrator', manager: 'Voditelj', employee: 'Djelatnik', reception: 'Recepcija', readonly: 'Pregled' };
  import('../js/db.js').then((m) => m.loadMyProfile()).then((p) => {
    if (!p) return;
    const name = (p.full_name || '').trim() || 'ASC korisnik';
    doc.getElementById('sbName').textContent = name;
    doc.getElementById('sbRole').textContent = ROLE[p.role] || p.role || '';
    const ava = doc.getElementById('sbAva');
    const initials = name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'A';
    ava.firstChild.textContent = initials;
    if (p.avatar_url) { const img = new Image(); img.onload = () => ava.insertBefore(img, ava.querySelector('.dot')); img.src = p.avatar_url; }
  }).catch(() => {});

  // account menu — floats up from the card
  let pop = null;
  const closePop = () => { if (pop) { pop.remove(); pop = null; } };
  aside.querySelector('.sb-user').addEventListener('click', (e) => {
    if (e.target.closest('[data-logout]')) return;   // the ghost logout does its own thing
    if (pop) { closePop(); return; }
    pop = doc.createElement('div');
    pop.className = 'acct-pop'; pop.setAttribute('role', 'menu');
    pop.innerHTML =
      '<button class="acct-item" data-act="profile"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5 20a7 7 0 0114 0"/></svg>Profil</button>' +
      '<button class="acct-item" data-act="theme"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"/></svg>Tema</button>' +
      '<button class="acct-item" data-act="settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.5 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2L10 21h4l.5-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/></svg>Postavke</button>' +
      (document.querySelector('.hero') && innerWidth >= 1021 ? '<button class="acct-item" data-act="layout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></svg>Uredi raspored</button>' : '') +
      '<div class="acct-div"></div>' +
      '<button class="acct-item danger" data-logout><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3M15 8l4 4-4 4M19 12H9"/></svg>Odjava</button>';
    doc.body.appendChild(pop);
    const r = aside.querySelector('.sb-user').getBoundingClientRect();
    pop.style.left = Math.max(12, r.left) + 'px';
    pop.style.bottom = (innerHeight - r.top + 8) + 'px';
    pop.addEventListener('click', (ev) => {
      const act = ev.target.closest('[data-act]');
      if (!act) return;   // data-logout bubbles to the global gate listener
      const a = act.getAttribute('data-act');
      if (a === 'theme') { const mode = doc.getElementById('mode'); if (mode) mode.click(); }
      else if (a === 'layout') document.dispatchEvent(new CustomEvent('asc:edit-layout'));
      else document.dispatchEvent(new CustomEvent('asc:open-menu', { detail: a === 'profile' ? 'profile' : 'menu' }));
      closePop();
    });
    setTimeout(() => doc.addEventListener('click', function away(ev) {
      if (pop && !pop.contains(ev.target) && !ev.target.closest('.sb-user')) { closePop(); doc.removeEventListener('click', away); }
    }), 0);
  });
})();


// Count-ups start at the moment of reveal — under the Prag splash they'd burn
// out invisibly; asc:reveal fires in the same frame the surface lifts.
const startAnimate = () => {
  if (document.documentElement.classList.contains('splashing'))
    document.addEventListener('asc:reveal', () => animate(), { once: true });
  else animate();
};
if (document.readyState !== 'loading') startAnimate(); else addEventListener('DOMContentLoaded', startAnimate);

// Fluid disclosures (.disc) — tap a header to reveal its content; the height
// springs open (CSS grid). Delegated, so it also drives lists built after load.
function syncDisc(){ document.querySelectorAll('.disc > .disc-head').forEach(h => h.setAttribute('aria-expanded', h.parentElement.dataset.open === 'true' ? 'true' : 'false')); }
document.addEventListener('click', (e) => {
  const head = e.target.closest('.disc-head');
  if (!head) return;
  const d = head.closest('.disc');
  if (!d) return;
  const open = d.dataset.open !== 'true';
  d.dataset.open = open ? 'true' : 'false';
  head.setAttribute('aria-expanded', open ? 'true' : 'false');
});
if (document.readyState !== 'loading') syncDisc(); else addEventListener('DOMContentLoaded', syncDisc);

// The purple card on the dashboard is Nero. Load its brain here so that card
// can ask. Task pages keep their own copy of the same form. No second launcher.
(() => {
  ['agent-config.js', 'qr.js', 'agent-gemini.js'].forEach((src) => {
    if ([...document.scripts].some(sc => sc.src && new URL(sc.src).pathname.endsWith('/' + src))) return;
    const script = document.createElement('script');
    script.src = src; script.async = false; document.head.appendChild(script);
  });
})();

// ============================================================================
// Menu drawer — user profile + options. Injected on every page: a round avatar
// joins the header pill; tapping it slides a right-hand sheet with two tabs.
//   • Profil    — name / role / email / language + preference switches (theme,
//                 notifications, agent voice). Persists to localStorage 'asc.profile'.
//   • Postavke  — sticker SHAPE + which rows print (owner / location). Persists to
//                 'asc.stickerShape' / 'asc.stickerOwner' / 'asc.stickerLoc', which
//                 qr.js printSticker() reads. The theme switch mirrors the header
//                 #mode button (single source of truth: asc.theme + html.dark).
// ============================================================================
(() => {
  const pill = document.querySelector('.top .pill');
  if (!pill || document.querySelector('.menu-btn')) return;      // no header, or already built

  const mesc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const DEFAULT = { name: 'Operater ASC', role: 'Voditelj skladišta', email: '', lang: 'hr', notify: true, voice: true };
  const readProfile = () => { try { return Object.assign({}, DEFAULT, JSON.parse(localStorage.getItem('asc.profile') || '{}')); } catch(e){ return Object.assign({}, DEFAULT); } };
  const writeProfile = (p) => { try { localStorage.setItem('asc.profile', JSON.stringify(p)); } catch(e){} };
  const getPref = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch(e){ return d; } };
  const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch(e){} };
  const initials = (name) => (String(name || '').trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('') || 'A').toUpperCase();
  const isDark = () => root.classList.contains('dark');
  const row = (t, d, key, on) =>
    '<div class="md-row"><div class="md-rt"><div class="t">' + mesc(t) + '</div><div class="d">' + mesc(d) + '</div></div>' +
    '<button class="md-sw" type="button" role="switch" data-sw="' + key + '" aria-checked="' + (on ? 'true' : 'false') + '" aria-label="' + mesc(t) + '"></button></div>';

  let profile = readProfile();
  const SHAPES = [['rounded', 'Zaobljeni'], ['soft', 'Meki'], ['sharp', 'Oštri'], ['notch', 'Zarezani']];
  const shape = getPref('asc.stickerShape', 'rounded');
  const showOwner = getPref('asc.stickerOwner', '1') !== '0';
  const showLoc = getPref('asc.stickerLoc', '1') !== '0';

  // avatar launcher in the header pill
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'menu-btn'; btn.setAttribute('aria-label', 'Izbornik i profil');
  btn.textContent = initials(profile.name);
  pill.appendChild(btn);

  const scrim = document.createElement('div'); scrim.className = 'menu-scrim';
  const drawer = document.createElement('aside');
  drawer.className = 'menu-drawer'; drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-modal', 'true'); drawer.setAttribute('aria-label', 'Izbornik'); drawer.setAttribute('aria-hidden', 'true');
  drawer.innerHTML =
    '<header class="md-head">' +
      '<div class="md-avatar" data-avatar>' + mesc(initials(profile.name)) + '</div>' +
      '<div class="md-id"><b data-name>' + mesc(profile.name) + '</b><span data-role>' + mesc(profile.role) + '</span></div>' +
      '<button class="md-close" type="button" aria-label="Zatvori"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
    '</header>' +
    '<nav class="md-tabs"><button class="md-tab on" type="button" data-tab="menu">Izbornik</button><button class="md-tab" type="button" data-tab="profile">Profil</button><button class="md-tab" type="button" data-tab="options">Postavke</button></nav>' +
    '<div class="md-body">' +
      '<section class="md-panel" data-panel="menu">' +
        '<nav class="md-links">' + [['customers.html','Kupci'],['workshop.html','Radionica'],['reminders.html','Podsjetnici'],['users.html','Korisnici'],['recycle.html','Koš za smeće']].map(l => '<a class="md-link" href="' + l[0] + '"><span>' + l[1] + '</span><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></a>').join('') + '</nav>' +
      '</section>' +
      '<section class="md-panel" data-panel="profile" hidden>' +
        '<div class="md-field"><label for="mp-name">Ime</label><input id="mp-name" type="text" data-f="name" value="' + mesc(profile.name) + '" autocomplete="name"></div>' +
        '<div class="md-field"><label>Profilna slika</label>' +
        '<div class="md-ava-row"><span class="md-avatar sm" data-avatar2>' + mesc(initials(profile.name)) + '</span>' +
        '<button class="md-ava-btn" type="button" data-pickavatar>Promijeni</button>' +
        '<input type="file" accept="image/*" data-avafile hidden></div></div>' +
        '<div class="md-field"><label for="mp-role">Uloga</label><input id="mp-role" type="text" data-f="role" value="' + mesc(profile.role) + '"></div>' +
        '<div class="md-field"><label for="mp-email">Email</label><input id="mp-email" type="email" data-f="email" value="' + mesc(profile.email) + '" placeholder="ime@asc.hr" autocomplete="email"></div>' +
        '<div class="md-field"><label for="mp-lang">Jezik</label><select id="mp-lang" data-f="lang"><option value="hr">Hrvatski</option><option value="en">English</option></select></div>' +
        '<div class="md-section-t">Preferencije</div>' +
        row('Tamna tema', 'Prebaci svijetli / tamni izgled', 'theme', isDark()) +
        row('Obavijesti', 'Podsjetnici za preuzimanje', 'notify', profile.notify) +
        row('Glasovni odgovori', 'ASC Agent odgovara naglas', 'voice', profile.voice) +
        '<button class="md-logout" type="button" data-logout>Odjava</button>' +
        '<div class="md-saved" data-saved aria-live="polite">Spremljeno ✓</div>' +
      '</section>' +
      '<section class="md-panel" data-panel="options" hidden>' +
        '<div class="md-section-t">Oblik naljepnice</div>' +
        '<div class="md-shapes">' + SHAPES.map(([k, lb]) => '<button class="md-shape" type="button" data-shape="' + k + '" aria-pressed="' + (k === shape ? 'true' : 'false') + '"><span class="sw ' + k + '"></span><span class="lb">' + lb + '</span></button>').join('') + '</div>' +
        '<div class="md-hint">Primjenjuje se na sve nove naljepnice koje generiraš.</div>' +
        '<div class="md-section-t">Sadržaj naljepnice</div>' +
        row('Prikaži vlasnika', 'Ime, vozilo i registracija', 'o-owner', showOwner) +
        row('Prikaži lokaciju', 'Zona · regal · polica', 'o-loc', showLoc) +
      '</section>' +
    '</div>';
  document.body.appendChild(scrim);
  document.body.appendChild(drawer);

  const q = (s) => drawer.querySelector(s);
  const savedEl = q('[data-saved]'); let savedT;
  const flashSaved = () => { if (!savedEl) return; savedEl.classList.add('on'); clearTimeout(savedT); savedT = setTimeout(() => savedEl.classList.remove('on'), 1400); };
  const syncTheme = () => { const sw = drawer.querySelector('[data-sw="theme"]'); if (sw) sw.setAttribute('aria-checked', isDark() ? 'true' : 'false'); };
  const setDark = (on) => { root.classList.toggle('dark', on); try { localStorage.setItem('asc.theme', on ? 'dark' : 'light'); } catch(e){} if (typeof paintTheme === 'function') paintTheme(); };
  const applyIdentity = () => { const ini = initials(profile.name); btn.textContent = ini; q('[data-avatar]').textContent = ini; q('[data-name]').textContent = profile.name || '—'; q('[data-role]').textContent = profile.role || ''; };

  // Modal focus management (mirrors the agent dock): the closed drawer is inert so
  // its controls are never phantom tab-stops; open → background inert + focus moves
  // into the sheet; close → focus returns to the avatar launcher.
  const mbg = [...document.body.children].filter(el => el !== drawer && el !== scrim);
  drawer.inert = true;
  const activate = (name) => {
    drawer.querySelectorAll('.md-tab').forEach(x => x.classList.toggle('on', x.getAttribute('data-tab') === name));
    drawer.querySelectorAll('.md-panel').forEach(p => { p.hidden = p.getAttribute('data-panel') !== name; });
  };
  const open = (tab) => {
    if (typeof tab === 'string') activate(tab);
    document.body.classList.add('menu-open');
    drawer.setAttribute('aria-hidden', 'false'); drawer.inert = false;
    mbg.forEach(el => { el.inert = true; });
    syncTheme();
    setTimeout(() => { try { q('.md-close').focus({ preventScroll: true }); } catch(e){} }, 60);
  };
  const close = () => {
    document.body.classList.remove('menu-open');
    mbg.forEach(el => { el.inert = false; });                       // restore reachability BEFORE focusing the launcher
    try { btn.focus({ preventScroll: true }); } catch(e){}
    drawer.setAttribute('aria-hidden', 'true'); drawer.inert = true;
    document.dispatchEvent(new CustomEvent('asc:menu-closed'));     // the dock puck glides home
  };
  // Profilna slika: pick → downscale to a 256px cover JPEG → avatars bucket →
  // repaint every avatar surface (drawer, sidebar card, dashboard smjena).
  (() => {
    const pick = drawer.querySelector('[data-pickavatar]'), file = drawer.querySelector('[data-avafile]');
    if (!pick || !file) return;
    const paint = (url) => {
      drawer.querySelectorAll('[data-avatar],[data-avatar2]').forEach(a => {
        a.innerHTML = '<img src="' + url + '" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%">';
        a.style.position = 'relative'; a.style.overflow = 'hidden';
      });
      const sb = document.getElementById('sbAva');
      if (sb) { const old = sb.querySelector('img'); if (old) old.remove();
        const img = new Image(); img.src = url; sb.insertBefore(img, sb.querySelector('.dot')); }
      const pv = document.querySelector('.profile .pavatar');
      if (pv) { pv.innerHTML = '<img src="' + url + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'; }
    };
    pick.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0]; if (!f) return;
      pick.disabled = true; pick.textContent = 'Spremam…';
      try {
        const bmp = await createImageBitmap(f);
        const c = document.createElement('canvas'); c.width = c.height = 256;
        const x = c.getContext('2d');
        const s0 = Math.min(bmp.width, bmp.height);
        x.drawImage(bmp, (bmp.width - s0) / 2, (bmp.height - s0) / 2, s0, s0, 0, 0, 256, 256);
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
        const m = await import('../js/db.js');
        const url = await m.setMyAvatar(blob);
        paint(url);
        pick.textContent = 'Promijeni';
      } catch (err) {
        console.warn('[avatar]', err);
        pick.textContent = 'Pokušaj opet';
      } finally { pick.disabled = false; file.value = ''; }
    });
  })();
  btn.addEventListener('click', () => open('profile'));
  // The dock's Više tab settles its puck, then asks for the drawer (bubble controller).
  document.addEventListener('asc:open-menu', (e) => open(e.detail || 'menu'));
  q('.md-close').addEventListener('click', close);
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) close(); });

  drawer.querySelectorAll('.md-tab').forEach(tb => tb.addEventListener('click', () => activate(tb.getAttribute('data-tab'))));

  drawer.querySelectorAll('[data-f]').forEach(inp => {
    if (inp.tagName === 'SELECT') inp.value = profile[inp.getAttribute('data-f')] || 'hr';
    const onChange = () => { profile[inp.getAttribute('data-f')] = inp.value; writeProfile(profile); applyIdentity(); flashSaved(); };
    inp.addEventListener('input', onChange); inp.addEventListener('change', onChange);
  });

  drawer.querySelectorAll('.md-sw').forEach(sw => sw.addEventListener('click', () => {
    const key = sw.getAttribute('data-sw'); const on = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
    if (key === 'theme') setDark(on);
    else if (key === 'notify') { profile.notify = on; writeProfile(profile); }
    else if (key === 'voice') { profile.voice = on; writeProfile(profile); setPref('asc.speak', on ? '1' : '0'); }
    else if (key === 'o-owner') setPref('asc.stickerOwner', on ? '1' : '0');
    else if (key === 'o-loc') setPref('asc.stickerLoc', on ? '1' : '0');
    flashSaved();
  }));

  drawer.querySelectorAll('.md-shape').forEach(sh => sh.addEventListener('click', () => {
    drawer.querySelectorAll('.md-shape').forEach(x => x.setAttribute('aria-pressed', x === sh ? 'true' : 'false'));
    setPref('asc.stickerShape', sh.getAttribute('data-shape')); flashSaved();
  }));

  q('[data-logout]').addEventListener('click', () => {
    try { localStorage.removeItem('asc.profile'); } catch(e){}
    profile = readProfile();
    drawer.querySelectorAll('[data-f]').forEach(inp => { inp.value = profile[inp.getAttribute('data-f')] || (inp.tagName === 'SELECT' ? 'hr' : ''); });
    setPref('asc.speak', profile.voice ? '1' : '0');                 // keep the mute-flag in sync with the reset profile
    const setSw = (key, on) => { const s = drawer.querySelector('.md-sw[data-sw="' + key + '"]'); if (s) s.setAttribute('aria-checked', on ? 'true' : 'false'); };
    setSw('notify', profile.notify); setSw('voice', profile.voice); syncTheme();
    applyIdentity(); flashSaved();
  });

  const modeBtn = document.getElementById('mode');       // keep the switch honest if the header toggle is used
  if (modeBtn) modeBtn.addEventListener('click', () => setTimeout(syncTheme, 0));
})();

// ---- Degraded-save alarm ----------------------------------------------------
// db.js dispatches asc:save-degraded when a write had to drop a column the
// database doesn't know yet (schema drift). The save succeeded minus that field
// — the employee must hear about it, on every page, without a page-local toast.
(() => {
  const NAMES = {
    hubcaps_location: 'poklopci kotača', bolts_location: 'vijci kotača',
    expected_out_date: 'datum preuzimanja', fee: 'cijena', notes: 'napomene',
  };
  let el = null, t = null;
  window.addEventListener('asc:save-degraded', (e) => {
    const col = e.detail && e.detail.column;
    const msg = 'Spremljeno bez polja „' + (NAMES[col] || col) + '” — baza čeka nadogradnju.';
    if (typeof window.ascToast === 'function') { window.ascToast(msg); return; }
    if (!el) {
      el = document.createElement('div');
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);' +
        'z-index:200;max-width:min(92vw,480px);padding:12px 18px;border-radius:14px;background:#1c1e24;color:#f4f5f7;' +
        'font:500 13.5px/1.45 Inter,system-ui,sans-serif;box-shadow:0 18px 40px -18px rgba(0,0,0,.55);opacity:0;' +
        'transition:opacity .25s ease;pointer-events:none';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(t);
    t = setTimeout(() => { el.style.opacity = '0'; }, 4200);
  });
})();
