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
  if (/\/login\.html$/.test(location.pathname)) return;
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
const paintTheme = () => meta.setAttribute('content', root.classList.contains('dark') ? '#020305' : '#edf0f5');
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
  const WSB = { 'Skeniraj': 'scan.html', 'Zaprimi': 'checkin.html', 'Skladište': 'warehouse.html', 'ASC Agent': 'assistant.html', 'Za preuzimanje': 'reminders.html' };
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
(() => {
  if (/\/login\.html$/.test(location.pathname)) return;
  const doc = document, root = doc.documentElement;
  const I = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 10.6L12 4l7.8 6.6"/><path d="M5.8 9.4V19a2 2 0 002 2h8.4a2 2 0 002-2V9.4"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5.4v13.2M5.4 12h13.2"/></svg>',
    scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.2V6.4A2.4 2.4 0 016.4 4h1.8M15.8 4h1.8A2.4 2.4 0 0120 6.4v1.8M20 15.8v1.8a2.4 2.4 0 01-2.4 2.4h-1.8M8.2 20H6.4A2.4 2.4 0 014 17.6v-1.8"/><path d="M7.2 12h9.6"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.2s-7-5.5-7-11a7 7 0 0114 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>',
    people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0111 0M15.5 5.6a3.2 3.2 0 010 4.8M17.5 13.8a5.5 5.5 0 013 5"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5a6 6 0 0112 0c0 4.2 1.6 5.6 2.2 6.2H3.8C4.4 15.1 6 13.7 6 9.5z"/><path d="M9.8 19a2.4 2.4 0 004.4 0"/></svg>',
    wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.2 6.3a4 4 0 015.3 5.3l-8.4 8.4a2.1 2.1 0 01-3-3l8.4-8.4z"/><path d="M14.2 6.3L17.7 3M6 21l-3-3"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l1.8 4.9 4.9 1.8-4.9 1.8L12 17l-1.8-5-4.9-1.8 4.9-1.8L12 3.5z"/><path d="M18.8 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7.6" r="3.4"/><path d="M5 20a7 7 0 0114 0"/></svg>',
    bin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V7M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12"/></svg>',
    map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4.5L4 6.5v13l5-2 6 2 5-2v-13l-5 2-6-2z"/><path d="M9 4.5v13M15 6.5v13"/></svg>',
    chev: '<svg class="sb-chev" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5l6 6 6-6"/></svg>',
    out: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3M15 8l4 4-4 4M19 12H9"/></svg>',
  };
  const here = location.pathname.split('/').pop() || 'dashboard.html';
  const item = (m, href, icon, label, kid) =>
    '<a class="sb-item' + (kid ? ' sb-kid' : '') + (here === href ? ' on' : '') + '" data-m="' + m + '" href="' + href + '">' + icon + '<span class="t">' + label + '</span></a>';

  const whOpen = here === 'warehouse.html' || here === 'recycle.html' ||
    (localStorage.getItem('asc.side.wh') !== '0' && here === 'set-detail.html');
  const aside = doc.createElement('aside');
  aside.className = 'side';
  aside.setAttribute('aria-label', 'Glavna navigacija');
  aside.innerHTML =
    '<div class="sb-head"><span class="sb-eyebrow">ASC sustav</span>' +
      '<button class="sb-collapse" type="button" aria-label="Suzi izbornik"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6l-6 6 6 6"/></svg></button></div>' +
    '<nav class="sb-nav">' +
      item('dashboard', 'dashboard.html', I.home, 'Ploča') +
      item('checkin', 'checkin.html', I.plus, 'Zaprimi') +
      item('scan', 'scan.html', I.scan, 'Skeniraj') +
      '<div class="sb-group' + (whOpen ? ' open' : '') + '">' +
        '<button class="sb-item" type="button" data-m="warehouse" aria-expanded="' + whOpen + '">' + I.pin + '<span class="t">Skladište</span>' + I.chev + '</button>' +
        '<div class="sb-group-kids"><div>' +
          item('warehouse', 'warehouse.html', I.map, 'Karta skladišta', true) +
          item('warehouse', 'recycle.html', I.bin, 'Košarica', true) +
        '</div></div></div>' +
      item('customers', 'customers.html', I.people, 'Kupci') +
      item('reminders', 'reminders.html', I.bell, 'Podsjetnici') +
      item('workshop', 'workshop.html', I.wrench, 'Radionica') +
      item('assistant', 'assistant.html', I.spark, 'ASC Agent') +
      '<div class="sb-div"></div><div class="sb-eyebrow2">Upravljanje</div>' +
      item('users', 'users.html', I.users, 'Korisnici') +
    '</nav>' +
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
  if (matchMedia('(min-width:1021px)').matches) {
    const lip = doc.createElement('div');
    lip.className = 'frame-lip'; lip.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(lip);
  }

  // module stamp for page-level tinting
  const MOD = { 'dashboard.html': 'dashboard', 'checkin.html': 'checkin', 'scan.html': 'scan',
    'warehouse.html': 'warehouse', 'recycle.html': 'warehouse', 'set-detail.html': 'warehouse',
    'customers.html': 'customers', 'reminders.html': 'reminders', 'workshop.html': 'workshop',
    'assistant.html': 'assistant', 'users.html': 'users' };
  if (MOD[here]) root.setAttribute('data-module', MOD[here]);

  // set-detail highlights its parent domain
  if (here === 'set-detail.html') {
    const w = aside.querySelector('.sb-item[href="warehouse.html"]'); if (w) w.classList.add('on');
  }

  // collapse rail (desktop) — persisted
  try { if (localStorage.getItem('asc.side.rail') === '1') root.setAttribute('data-side', 'rail'); } catch (e) {}
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
    try { localStorage.setItem('asc.side.wh', open ? '1' : '0'); } catch (e) {}
  });

  // mobile: hamburger in the header + scrim close
  const top = doc.querySelector('.top');
  if (top) {
    const burger = doc.createElement('button');
    burger.className = 'sb-burger'; burger.type = 'button'; burger.setAttribute('aria-label', 'Izbornik');
    burger.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    top.insertBefore(burger, top.firstChild);
    burger.addEventListener('click', () => root.classList.add('side-open'));
  }
  scrim.addEventListener('click', () => root.classList.remove('side-open'));
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') root.classList.remove('side-open'); });
  aside.addEventListener('click', (e) => { if (e.target.closest('a.sb-item')) root.classList.remove('side-open'); });

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
      (document.querySelector('.hero') ? '<button class="acct-item" data-act="layout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></svg>Uredi raspored</button>' : '') +
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
  // Load the Gemini brain + endpoint config + data (order-preserved). The panel
  // uses Gemini when ASC_AGENT_URL is set; otherwise it falls back to the local
  // rule-based router below. Loaded once, from the current /preview/ dir.
  ['agent-config.js', 'qr.js', 'agent-gemini.js'].forEach((src) => {
    if (![].some.call(document.scripts, (sc) => sc.src && sc.src.indexOf('/' + src) !== -1)) {
      const el = document.createElement('script'); el.src = src; el.async = false; document.head.appendChild(el);
    }
  });
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const ICON = {
    tab:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 3v18M8 6.5v11M16 6.5v11M4 10v4M20 10v4"/></svg>',
    mic:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="8.6" y="2.8" width="6.8" height="11.4" rx="3.4"/><path d="M5.2 11.4a6.8 6.8 0 0013.6 0"/><path d="M12 18.2v3"/></svg>',
    close:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M12 5l7 7-7 7"/></svg>'
  };

  // Gemini lives ONLY inside #asc-agent (the check-in page) now — integrated,
  // press-and-hold. No floating side dock anywhere. (The brain — agent-gemini.js
  // etc. — is loaded above on every page, so the dashboard card + sticker still work.)
  const inlineMount = document.getElementById('asc-agent');
  if (!inlineMount) return;
  const dock = document.createElement('div');
  dock.className = 'ai-dock';
  dock.dataset.open = 'false';
  dock.innerHTML =
    '<button class="ai-tab" aria-label="ASC Agent — glasovni pomoćnik" aria-expanded="false">' + ICON.tab + '</button>' +
    '<div class="ai-scrim"></div>' +
    '<section class="ai-panel" role="dialog" aria-modal="false" aria-label="ASC Agent" aria-hidden="true">' +
      '<div class="ai-head"><span class="ai-title"><span class="dot"></span> ASC Agent</span>' +
        '<button class="ai-close" aria-label="Zatvori">' + ICON.close + '</button></div>' +
      '<div class="ai-stage">' +
        '<button class="ai-mic" aria-label="Drži i govori">' + ICON.mic + '<span class="ai-mic-orb">' + ICON.mic + '</span></button>' +
        '<p class="ai-hint" aria-live="polite"></p>' +
        '<div class="ai-heard"></div>' +
        '<div class="ai-result" role="status" aria-live="polite"></div>' +
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
  inlineMount.appendChild(dock); dock.classList.add('ai-inline');

  // Skin the agent as a random studio-tire CUTOUT (background-removed PNGs of the
  // recent-sets photos) with a random brake-caliper under-glow (yellow / orange /
  // green / red). Re-rolled every load. Transparent PNG → just the tire, no disc.
  const TIRES = ['tire-1.png','tire-2.png','tire-4.png'];   // only full circular side-portraits (3/5/6 were cropped or angled)
  const GLOWS = ['#ffcf33','#ff8a1a','#3ddc84','#ff4d4d'];
  dock.style.setProperty('--tire', "url('assets/" + TIRES[Math.floor(Math.random() * TIRES.length)] + "')");
  dock.style.setProperty('--glow', GLOWS[Math.floor(Math.random() * GLOWS.length)]);

  const $ = (s) => dock.querySelector(s);
  const tab = $('.ai-tab'), panel = $('.ai-panel'), scrim = $('.ai-scrim'),
        mic = $('.ai-mic'), hint = $('.ai-hint'), heard = $('.ai-heard'),
        result = $('.ai-result'), form = $('.ai-type'), input = form.querySelector('input');

  const idleHint = SR ? 'Drži i govori' : 'Upiši što trebaš';
  hint.textContent = idleHint;
  if (!SR) mic.classList.add('is-off');

  // ---- open / close ---------------------------------------------------------
  // NON-MODAL by design: the page BENEATH stays live + visible while Gemini is open
  // (no inert, no blocking scrim) so you can watch actions land and edit beneath it
  // without dismissing. The closed panel is inert so its controls are never phantom
  // tab-stops. Dismiss = short-tap the tire, the panel ×, or Escape.
  let openState = false, actTimer = null, closeT = null;
  panel.inert = !inlineMount;                                       // inline agent is always shown → never inert (the tab that clears it is hidden)
  const open = () => {
    if (openState) return;
    openState = true;
    clearTimeout(closeT); dock.classList.remove('ai-closing');      // cancel any in-flight roll-out
    dock.dataset.open = 'true';
    heard.textContent = '';                                         // fresh session — no stale transcript bubble
    tab.setAttribute('aria-expanded','true'); tab.setAttribute('tabindex','-1');
    panel.setAttribute('aria-hidden','false'); panel.inert = false;
    setTimeout(() => { try { (SR ? mic : input).focus({ preventScroll:true }); } catch(e){} }, 380);
  };
  const close = () => {
    if (!openState) return;
    openState = false; endVoice(true);
    try { if (window.ASCAgent && ASCAgent.cancel) ASCAgent.cancel(); } catch(e){}   // dismissing cancels a pending Gemini navigation
    tab.removeAttribute('tabindex'); tab.setAttribute('aria-expanded','false');
    panel.setAttribute('aria-hidden','true'); panel.inert = true;
    // play the roll-OUT (entrance reversed), THEN drop the open flag so the tire
    // tucks back behind the shell edge and the tab reappears.
    dock.classList.add('ai-closing');
    clearTimeout(closeT);
    closeT = setTimeout(() => {
      dock.classList.remove('ai-closing'); dock.dataset.open = 'false';
      try { tab.focus({ preventScroll:true }); } catch(e){}
    }, reduce ? 0 : 560);
  };
  tab.addEventListener('click', open);
  $('.ai-close').addEventListener('click', close);
  scrim.addEventListener('click', close);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && openState) { e.stopPropagation(); close(); } });

  // ---- press-and-hold voice (walkie-talkie) --------------------------------
  // Robust across engines: iOS Safari ignores `continuous` and ends mid-hold, so
  // a SPONTANEOUS end while still held RESTARTS (keep-alive). A session `token`
  // guards every async callback, so a fast re-press can't replay a stale command
  // or clobber a newer session. RELEASE submits (like Enter); an interrupted press
  // (pointercancel) DISCARDS. Permission/no-speech hints survive finger-up.
  let rec = null, finalText = '', interimText = '', holding = false, userStopping = false, lastError = false, token = 0, pointerUsed = false, pressT = 0;

  function startRec(my){
    if (!SR || rec || my !== token) return;
    const r = new SR();
    r.lang = 'hr-HR'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = (e) => {
      if (my !== token) return;
      interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += txt + ' '; else interimText += txt;
      }
      heard.textContent = (finalText + interimText).trim() || '…';
    };
    r.onerror = (e) => {
      if (my !== token) return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { lastError = true; hint.textContent = 'Dopusti mikrofon u pregledniku'; }
      else if (e.error === 'no-speech') { lastError = true; hint.textContent = 'Nisam čula — pokušaj ponovno'; }
    };
    r.onend = () => {
      if (rec === r) rec = null;
      if (my !== token) return;                                       // superseded by a newer press
      if (holding && !userStopping && !lastError) { startRec(my); return; }  // engine ended mid-hold → keep listening
      mic.classList.remove('is-live');
      finalize(my);
    };
    rec = r;
    try { r.start(); mic.classList.add('is-live'); if (!lastError) hint.textContent = 'Slušam…'; }
    catch(e){ if (rec === r) rec = null; }
  }
  function press(){
    if (!SR) { input.focus(); return; }
    holding = true; userStopping = false; lastError = false;
    finalText = ''; interimText = '';
    heard.textContent = '…'; result.textContent = ''; result.classList.remove('pop');
    const my = ++token;
    if (rec) { try { rec.abort(); } catch(e){} rec = null; }         // discard any draining recognizer
    startRec(my);
  }
  function release(submit){
    if (!holding) return;
    holding = false; userStopping = true;
    mic.classList.remove('is-live');                                 // stop the pulse immediately (both paths)
    if (!lastError) hint.textContent = idleHint;
    if (!submit) { ++token; if (rec) { try { rec.abort(); } catch(e){} } return; }  // interrupted → discard, never Enter
    if (rec) { try { rec.stop(); } catch(e){ finalize(token); } }    // stop → onend → finalize
    else finalize(token);
  }
  function finalize(my){
    if (my !== token) return;
    mic.classList.remove('is-live');
    if (!lastError) hint.textContent = idleHint;
    const text = (finalText || interimText || '').trim();
    finalText = ''; interimText = '';                                // consume — never replay
    if (text && text !== '…') { heard.textContent = text; submitToAgent(text); }   // release = Enter
  }
  function endVoice(silent){
    if (holding) return release(false);                              // closing mid-hold discards, never submits
    ++token;                                                         // invalidate a released-but-still-draining session
    if (rec) { try { rec.abort(); } catch(e){} }                    // kill the pending onend → can't navigate after close
    clearTimeout(actTimer);                                          // and cancel a queued navigation
    if (silent) { mic.classList.remove('is-live'); if (!lastError) hint.textContent = idleHint; }
  }

  mic.addEventListener('contextmenu', (e) => e.preventDefault());
  mic.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    pointerUsed = true; pressT = performance.now();
    if (!SR) { input.focus(); return; }
    e.preventDefault();
    try { mic.setPointerCapture(e.pointerId); } catch(err){}
    press();
  });
  const clearPointer = () => setTimeout(() => { pointerUsed = false; }, 0);
  mic.addEventListener('pointerup', () => {
    if (!SR) { clearPointer(); return; }                           // no speech engine → the orb tap just focuses the input (pointerdown did that)
    const spoke = (finalText + interimText).trim();
    release(spoke || lastError ? true : false);                    // spoke / mic-error → submit-finalize; else just discard (inline agent stays put)
    clearPointer();
  });
  mic.addEventListener('pointercancel', () => { release(false); clearPointer(); });  // OS interruption → abort, not Enter
  mic.addEventListener('lostpointercapture', () => { if (holding) release(true); clearPointer(); });
  // keyboard / switch users can't press-and-hold — route activation to the field.
  // A real touch's synthetic click fires BEFORE the macrotask above clears the
  // flag (so it's suppressed); a bare keyboard/AT click sees it already cleared.
  mic.addEventListener('click', () => { if (pointerUsed) return; input.focus(); });

  // ---- typed + chip fallbacks ----------------------------------------------
  form.addEventListener('submit', (e) => { e.preventDefault(); const t = input.value.trim(); if (t) { heard.textContent = t; input.value = ''; submitToAgent(t); } });
  dock.querySelectorAll('.ai-chip').forEach(c => c.addEventListener('click', () => { const cmd = c.dataset.cmd; heard.textContent = c.textContent; submitToAgent(cmd); }));

  // Route input to Gemini when configured (agent-gemini.js), else the local
  // rule-based router. Gemini's reply shows in the result line and is spoken.
  function speak(text){
    try {
      if (!('speechSynthesis' in window) || !text) return;
      try { if (localStorage.getItem('asc.speak') === '0') return; } catch(e){}  // muted in Postavke → stay silent
      const v = (speechSynthesis.getVoices() || []).filter(x => (x.lang || '').toLowerCase().indexOf('hr') === 0)[0];
      if (!v) return;                                   // no Croatian voice → stay silent, don't mangle it
      const u = new SpeechSynthesisUtterance(text); u.voice = v; u.lang = 'hr-HR'; u.rate = 1.05;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch(e){}
  }
  function submitToAgent(text){
    if (window.ASCAgent && ASCAgent.configured()) {
      hint.textContent = 'Razmišljam…'; result.classList.remove('pop'); result.textContent = '…';
      ASCAgent.ask(text, (ev) => {
        if (ev.type === 'text') { result.innerHTML = esc(ev.text); result.classList.remove('pop'); void result.offsetWidth; result.classList.add('pop'); }
        else if (ev.type === 'error') { result.textContent = ev.message; }
        else if (ev.type === 'tool') { hint.textContent = 'Radim…'; }
      }).then((txt) => { hint.textContent = idleHint; if (txt) speak(txt); }).catch(() => { hint.textContent = idleHint; handle(text); });   // Gemini down / not deployed yet → local fallback
    } else {
      handle(text);                                     // $0 rule-based fallback
    }
  }

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
  function act(html, fn){ result.innerHTML = html; result.classList.remove('pop'); void result.offsetWidth; result.classList.add('pop'); clearTimeout(actTimer); actTimer = setTimeout(fn, reduce ? 120 : 620); }
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
        '<nav class="md-links">' + [['customers.html','Kupci'],['workshop.html','Radionica'],['reminders.html','Podsjetnici'],['assistant.html','ASC Agent'],['users.html','Korisnici'],['recycle.html','Koš za smeće']].map(l => '<a class="md-link" href="' + l[0] + '"><span>' + l[1] + '</span><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></a>').join('') + '</nav>' +
      '</section>' +
      '<section class="md-panel" data-panel="profile" hidden>' +
        '<div class="md-field"><label for="mp-name">Ime</label><input id="mp-name" type="text" data-f="name" value="' + mesc(profile.name) + '" autocomplete="name"></div>' +
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
