// ============================================================================
// live-customers.js — fills the "Kupci" database with REAL customers from
// Supabase (via ../js/db.js). Same contract as live-dashboard.js: the auth
// gate in app.js guarantees a session before this paints; a failed fetch
// keeps the page's existing markup (the calm empty-state skeleton) instead
// of blanking; every interpolated string passes through esc().
//
// Renders the nested customer → cars → sets drop-downs (shared .disc styles
// and the delegated open/close live in app.css + app.js), wires the search
// box, the per-set QR-sticker action, and the ?id= / ?c= deep link that
// set-detail's owner link and the warehouse peek use.
// ============================================================================
import { getSession, listCustomers } from '../js/db.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const q = (s, r = document) => r.querySelector(s);

const SEASON = { winter: { l: 'Zimske', c: 'chip win' }, summer: { l: 'Ljetne', c: 'chip' }, all_season: { l: 'Cjelogodišnje', c: 'chip all' } };
const STATUS = { in_storage: { l: 'Spremljeno', c: 'store' }, reserved: { l: 'Rezervirano', c: 'res' }, checked_out: { l: 'Preuzeto', c: 'out' }, missing: { l: 'Nedostaje', c: 'res' } };

// Croatian plurals (mirror of i18n.js slavicIndex)
function slavic(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 0;
  if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return 1;
  return 2;
}
const setsNoun = (n) => ['komplet', 'kompleta', 'kompleta'][slavic(n)];
const kupacNoun = (n) => ['kupac', 'kupca', 'kupaca'][slavic(n)];
const pluralV = (n) => (n === 1 ? 'vozilo' : 'vozila');
const initials = (name) => (String(name || '').trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('') || 'K').toUpperCase();

const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
const CAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16.5V13l1.7-4.2A2 2 0 018.6 7.5h6.8a2 2 0 011.9 1.3L19 13v3.5"/><path d="M4 13h16"/><circle cx="7.5" cy="16.5" r="1.4"/><circle cx="16.5" cy="16.5" r="1.4"/></svg>';
const QRI = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h7v7H3V3zm2 2v3h3V5H5zm9-2h7v7h-7V3zm2 2v3h3V5h-3zM3 14h7v7H3v-7zm2 2v3h3v-3H5zm9-2h3v3h-3v-3zm3 3h4v2h-2v2h-2v-4zm-3 3h3v2h-3v-2zm4 2h2v2h-2v-2z"/></svg>';
const PEOPLE = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 19v-1.6a3.6 3.6 0 00-3.6-3.6H7.1a3.6 3.6 0 00-3.6 3.6V19"/><circle cx="9.8" cy="7.4" r="3.4"/><path d="M20.5 19v-1.6a3.6 3.6 0 00-2.7-3.5M14.9 4.1a3.4 3.4 0 010 6.6"/></svg>';
const LOUPE = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';

const MUTED_LINE = 'style="padding:9px 2px;font:500 12.5px Inter;color:var(--muted)"';

function statusChip(kind) { const m = STATUS[kind]; return m ? '<span class="stt ' + m.c + '">' + m.l + '</span>' : ''; }
function seasonChip(kind) { const m = SEASON[kind]; return m ? '<span class="' + m.c + '">' + m.l + '</span>' : ''; }

// ---- Shape the listCustomers() rows for rendering --------------------------
// { id, name, phone, email, vehicles:[{ id, make, model, year, plate,
//   storage_sets:[{ public_code, status, season, deleted_at }] }] }
function normalize(rows) {
  return (rows || []).map((c) => {
    const vehicles = (c.vehicles || []).map((v) => ({
      label: [v.make, v.model].filter(Boolean).join(' ') || v.plate || 'Vozilo',
      plate: v.plate || '',
      sets: (v.storage_sets || [])
        .filter((s) => !s.deleted_at)
        .sort((a, b) => String(b.public_code).localeCompare(String(a.public_code))),
    }));
    return {
      id: c.id,
      name: String(c.name || '').trim() || 'Kupac',
      phone: c.phone || '',
      email: c.email || '',
      vehicles,
      setCount: vehicles.reduce((a, v) => a + v.sets.length, 0),
    };
  });
}

// ---- Row builders (same DOM the page has always drawn) ----------------------
function setRow(s) {
  return '<div class="set-row">'
    + '<a class="set-open" href="set-detail.html?code=' + encodeURIComponent(s.public_code) + '"><span class="code">' + esc(s.public_code) + '</span>'
    + '<span class="set-tags">' + statusChip(s.status) + seasonChip(s.season) + '</span></a>'
    + '<button class="set-sticker" type="button" data-sticker="' + esc(s.public_code) + '" title="Generiraj naljepnicu" aria-label="Generiraj naljepnicu za ' + esc(s.public_code) + '">' + QRI + '</button>'
    + '</div>';
}
function carDisc(v) {
  const n = v.sets.length;
  const body = n ? v.sets.map(setRow).join('') : '<div ' + MUTED_LINE + '>Nema kompleta</div>';
  return '<div class="disc disc-car" data-open="false">'
    + '<button class="disc-head" type="button" aria-expanded="false"><span class="disc-ico" aria-hidden="true">' + CAR + '</span>'
    + '<span class="disc-titles"><span>' + esc(v.label) + '</span>' + (v.plate ? '<small>' + esc(v.plate) + '</small>' : '') + '</span>'
    + '<span class="disc-sub"><b>' + n + '</b> ' + setsNoun(n) + '</span><span class="disc-chev">' + CHEV + '</span></button>'
    + '<div class="disc-panel"><div class="disc-inner"><div class="disc-body">' + body + '</div></div></div></div>';
}
function contactRow(c) {
  let out = '';
  if (c.phone) out += '<a href="tel:' + esc(String(c.phone).replace(/[^+\d]/g, '')) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H8l1.6 4L7.8 9.6a12 12 0 006.6 6.6L16 14.4 20 16v2.5c0 .8-.7 1.5-1.5 1.5A15.5 15.5 0 014 5.5z"/></svg>' + esc(c.phone) + '</a>';
  if (c.email) out += '<a href="mailto:' + esc(c.email) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.4"/><path d="M3.6 6.5L12 12l8.4-5.5"/></svg>E-pošta</a>';
  return out ? '<div class="cust-contact">' + out + '</div>' : '';
}
function custDisc(c) {
  const nV = c.vehicles.length, nS = c.setCount;
  const cars = nV ? c.vehicles.map(carDisc).join('') : '<div ' + MUTED_LINE + '>Nema vozila</div>';
  return '<div class="disc disc-cust" data-open="false" data-id="' + esc(c.id) + '" data-name="' + esc(c.name.toLowerCase()) + '">'
    + '<button class="disc-head" type="button" aria-expanded="false"><span class="disc-ico" aria-hidden="true">' + esc(initials(c.name)) + '</span>'
    + '<span class="disc-titles"><span>' + esc(c.name) + '</span><small>' + nV + ' ' + pluralV(nV) + ' · ' + nS + ' ' + setsNoun(nS) + '</small></span>'
    + '<span class="disc-chev">' + CHEV + '</span></button>'
    + '<div class="disc-panel"><div class="disc-inner"><div class="disc-body">' + contactRow(c) + cars + '</div></div></div></div>';
}

// ---- Empty / no-match states (visual silence, Croatian) ---------------------
function emptyState() {
  return '<div class="cempty"><div class="ei">' + PEOPLE + '</div>'
    + '<h4>Još nema kupaca</h4>'
    + '<p>Kupci se pojavljuju nakon prvog zaprimanja.</p>'
    + '<a class="go" href="checkin.html">Zaprimi prvi set</a></div>';
}
function noMatch(query) {
  return '<div class="cempty"><div class="ei">' + LOUPE + '</div>'
    + '<h4>Nema rezultata</h4>'
    + '<p>Ništa ne odgovara upitu „' + esc(query) + '”.</p></div>';
}

// ---- Page wiring ------------------------------------------------------------
const listEl = document.getElementById('clist');
const countEl = document.getElementById('listCount');
const searchEl = document.getElementById('search');

let ALL = [];        // normalized customers
let loaded = false;  // never re-render mock/skeleton once true
let query = '';

function fillHero(nCustomers, nSets) {
  const num = q('.chero .hero-num span');
  if (num) { num.removeAttribute('data-count'); num.textContent = String(nCustomers); }
  const em = q('.chero .hero-num em');
  if (em) em.textContent = kupacNoun(nCustomers);
  const cap = q('.chero .cap');
  if (cap) cap.textContent = 'aktivnih kupaca · ' + nSets + ' ' + setsNoun(nSets) + ' u kartonu';
}

function render() {
  if (!loaded || !listEl) return;
  if (!ALL.length) {
    if (countEl) countEl.textContent = '0';
    listEl.innerHTML = emptyState();
    return;
  }
  const ql = query.toLowerCase().trim();
  const rows = ALL
    .filter((c) => !ql || (c.name + ' ' + c.phone).toLowerCase().indexOf(ql) !== -1)
    .slice().sort((a, b) => a.name.localeCompare(b.name, 'hr'));
  if (countEl) countEl.textContent = ql ? rows.length + ' od ' + ALL.length : String(ALL.length);
  listEl.innerHTML = rows.length ? rows.map(custDisc).join('') : noMatch(query);
}

// Deep link: ?id=<customer id> (set-detail's owner link) or ?c=<name>
// (warehouse peek / dashboard reminders) — expand that customer and scroll.
function openDeepLink() {
  if (!listEl) return;
  let target = null;
  try {
    const qp = new URLSearchParams(location.search);
    const byId = qp.get('id');
    const byName = (qp.get('c') || '').toLowerCase().trim();
    if (byId) target = listEl.querySelector('.disc-cust[data-id="' + (window.CSS && CSS.escape ? CSS.escape(byId) : byId) + '"]');
    if (!target && byName) {
      const all = [...listEl.querySelectorAll('.disc-cust')];
      target = all.find((d) => d.getAttribute('data-name') === byName)
        || all.find((d) => (d.getAttribute('data-name') || '').indexOf(byName) !== -1);
    }
  } catch (e) { /* deep link is best-effort */ }
  if (!target) return;
  target.dataset.open = 'true';
  const head = target.querySelector('.disc-head');
  if (head) head.setAttribute('aria-expanded', 'true');
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  setTimeout(() => { try { target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); } catch (e) {} }, 140);
}

if (searchEl) searchEl.addEventListener('input', (e) => { query = e.target.value; render(); });

// QR sticker straight from any set row inside the drop-downs (qr.js).
if (listEl) listEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-sticker]');
  if (!btn) return;
  e.preventDefault(); e.stopPropagation();
  const code = btn.getAttribute('data-sticker');
  if (window.ASCQR && !window.ASCQR.printSticker(code)) alert('Dopustite skočne prozore za ispis naljepnice.');
});

// The gate in app.js races this against a 1200ms cap before revealing the page,
// so the list usually appears with live data (or the real empty state) in place.
let liveFirstDone;
window.ascLiveFirst = new Promise((r) => { liveFirstDone = r; });

(async () => {
  const session = await getSession().catch(() => null);
  if (!session || !listEl) { liveFirstDone(); return; }  // app.js handles the redirect

  let rows;
  try {
    rows = await listCustomers();
  } catch (e) {
    console.warn('[live] customers data failed — keeping the empty-state skeleton:', e);
    liveFirstDone();
    return;
  }

  ALL = normalize(rows);
  loaded = true;
  fillHero(ALL.length, ALL.reduce((a, c) => a + c.setCount, 0));
  render();
  openDeepLink();
  liveFirstDone();
})();
